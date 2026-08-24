import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildConnectorCatalog } from './build-connector-catalog.mjs';
import { assertConnectorCatalogIsImmutable } from './check-connector-catalog-immutability.mjs';
import { verifyConnectorCatalogAssets } from './verify-connector-catalog-assets.mjs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(currentDir, '../connectors/schema.json');
const icon = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z"/></svg>';
const iconHash = `sha256:${createHash('sha256').update(icon).digest('hex')}`;

const definition = `schemaVersion: 1
id: .declarative-test
version: 1.0.0
metadata:
  displayName: Test
  description: Test connector
  icon:
    path: 1.0.0.svg
    contentHash: ${iconHash}
  minimumLicense: basic
  supportedFeatureIds: [workflows]
config:
  type: object
  additionalProperties: false
auth:
  types:
    - api_key_query
actions:
  ping:
    scope: read
    input:
      type: object
      additionalProperties: false
    request:
      method: GET
      url: https://example.com/ping
test:
  request:
    method: GET
    url: https://example.com/ping
`;

const createFixture = async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'connector-catalog-'));
  const connectorDir = path.join(repoRoot, 'connectors/test');
  await mkdir(connectorDir, { recursive: true });
  await copyFile(schemaPath, path.join(repoRoot, 'connectors/schema.json'));
  await writeFile(path.join(connectorDir, '1.0.0.yaml'), definition);
  await writeFile(path.join(connectorDir, '1.0.0.svg'), icon);
  return repoRoot;
};

test('builds a deterministic catalog with versioned definitions and icons', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const connectorDir = path.join(repoRoot, 'connectors/test');
  await writeFile(
    path.join(connectorDir, '1.1.0.yaml'),
    definition
      .replace('version: 1.0.0', 'version: 1.1.0')
      .replace('path: 1.0.0.svg', 'path: 1.1.0.svg')
  );
  await writeFile(path.join(connectorDir, '1.1.0.svg'), icon);

  const first = await buildConnectorCatalog({ repoRoot });
  const second = await buildConnectorCatalog({ repoRoot });
  const catalog = JSON.parse(
    await readFile(path.join(repoRoot, 'dist/connectors/v1/catalog.json'), 'utf8')
  );

  assert.equal(first.catalogVersion, second.catalogVersion);
  assert.deepEqual(catalog.activeVersions, {
    '.declarative-test': '1.1.0',
  });
  assert.deepEqual(catalog.connectors, [
    {
      id: '.declarative-test',
      version: '1.1.0',
      definitionUrl: 'connectors/test/1.1.0.yaml',
      contentHash: first.rows[0].contentHash,
    },
    {
      id: '.declarative-test',
      version: '1.0.0',
      definitionUrl: 'connectors/test/1.0.0.yaml',
      contentHash: first.rows[1].contentHash,
    },
  ]);
  assert.equal(
    await readFile(path.join(repoRoot, 'dist/connectors/v1/connectors/test/1.0.0.svg'), 'utf8'),
    icon
  );
  assert.match(
    await readFile(path.join(repoRoot, 'dist/connectors/v1/connectors/test/1.1.0.yaml'), 'utf8'),
    /version: 1\.1\.0/
  );
  await verifyConnectorCatalogAssets({
    catalog,
    assetRoot: path.join(repoRoot, 'dist/connectors/v1'),
  });
});

test('rejects an icon whose bytes do not match the definition hash', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(path.join(repoRoot, 'connectors/test/1.0.0.svg'), '<svg/>');

  await assert.rejects(
    buildConnectorCatalog({ repoRoot }),
    /icon content does not match metadata\.icon\.contentHash/
  );
});

test('rejects SVG styles that can load external resources', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const unsafeIcon =
    '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://example.com/x.css)</style></svg>';
  const unsafeHash = `sha256:${createHash('sha256').update(unsafeIcon).digest('hex')}`;
  await writeFile(path.join(repoRoot, 'connectors/test/1.0.0.svg'), unsafeIcon);
  await writeFile(
    path.join(repoRoot, 'connectors/test/1.0.0.yaml'),
    definition.replace(iconHash, unsafeHash)
  );

  await assert.rejects(
    buildConnectorCatalog({ repoRoot }),
    /icon contains unsupported active or external content/
  );
});

test('rejects schemas that Kibana cannot materialize', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(
    path.join(repoRoot, 'connectors/test/1.0.0.yaml'),
    definition.replace('config:\n  type: object', 'config:\n  type: string')
  );

  await assert.rejects(
    buildConnectorCatalog({ repoRoot }),
    /\/config\/type must be equal to constant/
  );
});

test('rejects changes to an already published connector version', () => {
  const published = {
    activeVersions: { '.declarative-test': '1.0.0' },
    connectors: [{ id: '.declarative-test', version: '1.0.0', contentHash: 'sha256:old' }],
  };

  assert.throws(
    () =>
      assertConnectorCatalogIsImmutable(published, {
        activeVersions: { '.declarative-test': '1.0.0' },
        connectors: [{ id: '.declarative-test', version: '1.0.0', contentHash: 'sha256:new' }],
      }),
    /cannot be changed/
  );
  assert.doesNotThrow(() =>
    assertConnectorCatalogIsImmutable(published, {
      activeVersions: { '.declarative-test': '1.1.0' },
      connectors: [
        { id: '.declarative-test', version: '1.1.0', contentHash: 'sha256:new' },
        { id: '.declarative-test', version: '1.0.0', contentHash: 'sha256:old' },
      ],
    })
  );
});

test('rejects remote assets that do not match the candidate catalog', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await buildConnectorCatalog({ repoRoot });
  const assetRoot = path.join(repoRoot, 'dist/connectors/v1');
  const catalog = JSON.parse(await readFile(path.join(assetRoot, 'catalog.json'), 'utf8'));
  await writeFile(path.join(assetRoot, 'connectors/test/1.0.0.svg'), '<svg/>');

  await assert.rejects(
    verifyConnectorCatalogAssets({ catalog, assetRoot }),
    /Published connector icon .* has wrong bytes/
  );
});
