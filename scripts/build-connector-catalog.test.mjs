import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildConnectorCatalog, computeCatalogVersion } from './build-connector-catalog.mjs';
import {
  assertConnectorCatalogIsImmutable,
  assertPublishedCatalogCompatible,
  assertTypeMetadataIsAdditive,
} from './check-connector-catalog-immutability.mjs';
import { verifyConnectorCatalogAssets } from './verify-connector-catalog-assets.mjs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(currentDir, '../connectors/schema.json');
const metadataSchemaPath = path.resolve(currentDir, '../connectors/metadata.schema.json');
const icon = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z"/></svg>';

const contract = `schemaVersion: 1
id: .test
version: "1.0"
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

const metadata = `displayName: Test
description: Test connector
icon: icon.svg
minimumLicense: gold
supportedFeatureIds: [workflows]
`;

const createFixture = async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'connector-catalog-'));
  const connectorDir = path.join(repoRoot, 'connectors/test');
  await mkdir(connectorDir, { recursive: true });
  await copyFile(schemaPath, path.join(repoRoot, 'connectors/schema.json'));
  await copyFile(metadataSchemaPath, path.join(repoRoot, 'connectors/metadata.schema.json'));
  await writeFile(path.join(connectorDir, '1.0.yaml'), contract);
  await writeFile(path.join(connectorDir, 'metadata.yaml'), metadata);
  await writeFile(path.join(connectorDir, 'icon.svg'), icon);
  return repoRoot;
};

test('builds a deterministic catalog with typeMetadata and content-addressed icons', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const connectorDir = path.join(repoRoot, 'connectors/test');
  await writeFile(
    path.join(connectorDir, '1.1.yaml'),
    contract.replace('version: "1.0"', 'version: "1.1"')
  );

  const first = await buildConnectorCatalog({ repoRoot });
  const catalogPath = path.join(repoRoot, 'dist/connectors/v1/catalog.json');
  const firstBytes = await readFile(catalogPath, 'utf8');
  const catalog = JSON.parse(firstBytes);
  await buildConnectorCatalog({ repoRoot });
  const secondBytes = await readFile(catalogPath, 'utf8');

  assert.deepEqual(Object.keys(catalog), [
    'schemaVersion',
    'catalogVersion',
    'sequence',
    'typeMetadata',
    'connectors',
  ]);
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.sequence, 1);
  assert.equal('previousCatalogVersion' in catalog, false);
  assert.equal(firstBytes, secondBytes);
  assert.equal(catalog.catalogVersion, computeCatalogVersion(catalog));
  assert.equal(first.manifest.catalogVersion, catalog.catalogVersion);

  const iconHash = catalog.typeMetadata['.test'].icon.contentHash;
  const hex = iconHash.replace(/^sha256:/, '');
  const publishedIconPath = `connectors/test/icons/sha256-${hex}.svg`;
  assert.equal(catalog.typeMetadata['.test'].icon.path, publishedIconPath);
  assert.equal(
    await readFile(path.join(repoRoot, 'dist/connectors/v1', publishedIconPath), 'utf8'),
    icon
  );
  assert.deepEqual(
    catalog.connectors.map(({ version }) => version),
    ['1.0', '1.1']
  );
  assert.match(
    await readFile(path.join(repoRoot, 'dist/connectors/v1/connectors/test/1.1.yaml'), 'utf8'),
    /version: "1\.1"/
  );
});

test('rejects an unquoted MAJOR.MINOR version that YAML parses as a number', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(
    path.join(repoRoot, 'connectors/test/1.0.yaml'),
    contract.replace('version: "1.0"', 'version: 1.0')
  );

  await assert.rejects(buildConnectorCatalog({ repoRoot }), /quote/);
});

test('rejects a patch version', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(
    path.join(repoRoot, 'connectors/test/1.0.yaml'),
    contract.replace('version: "1.0"', 'version: "1.0.0"')
  );

  await assert.rejects(buildConnectorCatalog({ repoRoot }), /1\.0\.0|must match/);
});

test('rejects a version with a leading zero', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(
    path.join(repoRoot, 'connectors/test/01.0.yaml'),
    contract.replace('version: "1.0"', 'version: "01.0"')
  );
  await rm(path.join(repoRoot, 'connectors/test/1.0.yaml'));

  await assert.rejects(buildConnectorCatalog({ repoRoot }), /01\.0|must match/);
});

test('rejects a file name that does not match the version', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(
    path.join(repoRoot, 'connectors/test/1.0.yaml'),
    contract.replace('version: "1.0"', 'version: "1.1"')
  );

  await assert.rejects(buildConnectorCatalog({ repoRoot }), /file name must match version 1\.1/);
});

test('rejects a .declarative- connector id', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(
    path.join(repoRoot, 'connectors/test/1.0.yaml'),
    contract.replace('id: .test', 'id: .declarative-test')
  );

  await assert.rejects(buildConnectorCatalog({ repoRoot }), /\.declarative-/);
});

test('rejects a connector directory without metadata.yaml', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await rm(path.join(repoRoot, 'connectors/test/metadata.yaml'));

  await assert.rejects(buildConnectorCatalog({ repoRoot }), /metadata\.yaml/);
});

test('rejects metadata with a basic license', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(
    path.join(repoRoot, 'connectors/test/metadata.yaml'),
    metadata.replace('minimumLicense: gold', 'minimumLicense: basic')
  );

  await assert.rejects(
    buildConnectorCatalog({ repoRoot }),
    /minimumLicense|must be equal to one of the allowed values/
  );
});

test('rejects a contract that still carries a metadata block', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(
    path.join(repoRoot, 'connectors/test/1.0.yaml'),
    contract.replace(
      'version: "1.0"\nconfig:',
      'version: "1.0"\nmetadata:\n  contentHash: sha256:deadbeef\nconfig:'
    )
  );

  await assert.rejects(buildConnectorCatalog({ repoRoot }), /additional properties|metadata/);
});

test('drops 0.x rows and orphaned metadata on the prod channel', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(
    path.join(repoRoot, 'connectors/test/0.1.yaml'),
    contract.replace('version: "1.0"', 'version: "0.1"')
  );
  await rm(path.join(repoRoot, 'connectors/test/1.0.yaml'));

  const staging = await buildConnectorCatalog({ repoRoot, channel: 'staging' });
  assert.equal(staging.manifest.connectors[0].version, '0.1');
  assert.ok(staging.manifest.typeMetadata['.test']);

  const prod = await buildConnectorCatalog({ repoRoot, channel: 'prod' });
  assert.deepEqual(prod.manifest.connectors, []);
  assert.deepEqual(prod.manifest.typeMetadata, {});
});

test('advances sequence from a published catalog input', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const publishedPath = path.join(repoRoot, 'published-catalog.json');
  await writeFile(
    publishedPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        catalogVersion: 'sha256:published',
        sequence: 4,
        typeMetadata: {},
        connectors: [],
      },
      null,
      2
    )}\n`
  );

  const result = await buildConnectorCatalog({
    repoRoot,
    publishedCatalogPath: publishedPath,
  });
  assert.equal(result.manifest.sequence, 5);
  assert.equal(result.manifest.previousCatalogVersion, 'sha256:published');
});

test('rejects SVG styles that can load external resources', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const unsafeIcon =
    '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://example.com/x.css)</style></svg>';
  await writeFile(path.join(repoRoot, 'connectors/test/icon.svg'), unsafeIcon);

  await assert.rejects(
    buildConnectorCatalog({ repoRoot }),
    /icon contains unsupported active or external content/
  );
});

test('rejects schemas that Kibana cannot materialize', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(
    path.join(repoRoot, 'connectors/test/1.0.yaml'),
    contract.replace('config:\n  type: object', 'config:\n  type: string')
  );

  await assert.rejects(
    buildConnectorCatalog({ repoRoot }),
    /\/config\/type must be equal to constant/
  );
});

test('rejects required schema fields that have no property definition', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(
    path.join(repoRoot, 'connectors/test/1.0.yaml'),
    contract.replace(
      'config:\n  type: object\n  additionalProperties: false',
      'config:\n  type: object\n  additionalProperties: false\n  required: [missing]'
    )
  );

  await assert.rejects(
    buildConnectorCatalog({ repoRoot }),
    /config\.required references unknown property missing/
  );
});

test('rejects defaults that do not match their schema type', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(
    path.join(repoRoot, 'connectors/test/1.0.yaml'),
    contract.replace(
      'config:\n  type: object\n  additionalProperties: false',
      'config:\n  type: object\n  additionalProperties: false\n  properties:\n    retries:\n      type: integer\n      default: wrong'
    )
  );

  await assert.rejects(
    buildConnectorCatalog({ repoRoot }),
    /config\.properties\.retries\.default must match type integer/
  );
});

test('rejects defaults that violate schema constraints', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(
    path.join(repoRoot, 'connectors/test/1.0.yaml'),
    contract.replace(
      'config:\n  type: object\n  additionalProperties: false',
      'config:\n  type: object\n  additionalProperties: false\n  properties:\n    endpoint:\n      type: string\n      format: uri\n      default: not-a-valid-url'
    )
  );

  await assert.rejects(
    buildConnectorCatalog({ repoRoot }),
    /config\.properties\.endpoint\.default must be a valid URI/
  );
});

test('rejects type-specific fields on other schema types', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(
    path.join(repoRoot, 'connectors/test/1.0.yaml'),
    contract.replace(
      'config:\n  type: object\n  additionalProperties: false',
      'config:\n  type: object\n  additionalProperties: false\n  properties:\n    retries:\n      type: integer\n      minLength: 1'
    )
  );

  await assert.rejects(
    buildConnectorCatalog({ repoRoot }),
    /config\.properties\.retries\.minLength is only supported for string schemas/
  );
});

const withVerboseConfig = contract.replace(
  'config:\n  type: object\n  additionalProperties: false',
  'config:\n  type: object\n  additionalProperties: false\n  properties:\n    verbose:\n      type: boolean'
);

test('rejects a non-additive minor that removes a config property', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(path.join(repoRoot, 'connectors/test/1.0.yaml'), withVerboseConfig);
  await writeFile(
    path.join(repoRoot, 'connectors/test/1.1.yaml'),
    contract.replace('version: "1.0"', 'version: "1.1"')
  );

  await assert.rejects(buildConnectorCatalog({ repoRoot }), /config\.properties\.verbose/);
});

test('allows a justified major that is not additive over the previous major', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(path.join(repoRoot, 'connectors/test/1.0.yaml'), withVerboseConfig);
  await writeFile(
    path.join(repoRoot, 'connectors/test/2.0.yaml'),
    contract.replace('version: "1.0"', 'version: "2.0"')
  );
  await writeFile(
    path.join(repoRoot, 'connectors/test/CHANGELOG.md'),
    '## 2.0\n\nBreaking: removed verbose.\n'
  );

  const result = await buildConnectorCatalog({ repoRoot });
  assert.deepEqual(
    result.manifest.connectors.map(({ version }) => version),
    ['1.0', '2.0']
  );
});

test('rejects a new major without CHANGELOG.md', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(
    path.join(repoRoot, 'connectors/test/2.0.yaml'),
    contract.replace('version: "1.0"', 'version: "2.0"')
  );

  await assert.rejects(buildConnectorCatalog({ repoRoot }), /CHANGELOG\.md/);
});

test('rejects a new major whose changelog section lacks Breaking', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await writeFile(
    path.join(repoRoot, 'connectors/test/2.0.yaml'),
    contract.replace('version: "1.0"', 'version: "2.0"')
  );
  await writeFile(
    path.join(repoRoot, 'connectors/test/CHANGELOG.md'),
    '## 2.0\n\nRenamed a field.\n'
  );

  await assert.rejects(buildConnectorCatalog({ repoRoot }), /Breaking/);
});

test('rejects incompatible published catalog updates', () => {
  const row = {
    id: '.test',
    version: '1.0',
    definitionUrl: 'connectors/test/1.0.yaml',
    contentHash: 'sha256:old',
  };
  const typeMetadata = {
    '.test': {
      displayName: 'Test',
      description: 'desc',
      minimumLicense: 'gold',
      supportedFeatureIds: ['workflows'],
    },
  };
  const published = {
    schemaVersion: 1,
    catalogVersion: 'sha256:published',
    sequence: 4,
    typeMetadata,
    connectors: [row],
  };
  const compatibleNext = {
    schemaVersion: 1,
    catalogVersion: 'sha256:next',
    sequence: 5,
    previousCatalogVersion: 'sha256:published',
    typeMetadata,
    connectors: [row],
  };

  assert.throws(
    () =>
      assertConnectorCatalogIsImmutable(published, {
        ...compatibleNext,
        connectors: [],
      }),
    /cannot be removed/
  );
  assert.throws(
    () =>
      assertConnectorCatalogIsImmutable(published, {
        ...compatibleNext,
        connectors: [{ ...row, contentHash: 'sha256:new' }],
      }),
    /cannot be changed/
  );
  assert.throws(
    () =>
      assertConnectorCatalogIsImmutable(published, {
        ...compatibleNext,
        connectors: [{ ...row, definitionUrl: 'connectors/renamed/1.0.yaml' }],
      }),
    /cannot be changed/
  );
  assert.throws(
    () => assertPublishedCatalogCompatible(published, { ...compatibleNext, sequence: 6 }),
    /sequence must be 5/
  );
  assert.throws(
    () =>
      assertPublishedCatalogCompatible(published, {
        ...compatibleNext,
        previousCatalogVersion: 'sha256:wrong',
      }),
    /previousCatalogVersion/
  );
  assert.doesNotThrow(() =>
    assertPublishedCatalogCompatible(null, {
      schemaVersion: 1,
      catalogVersion: 'sha256:next',
      sequence: 1,
      typeMetadata,
      connectors: [row],
    })
  );
  assert.throws(() => assertPublishedCatalogCompatible(null, compatibleNext), /sequence 1/);
});

test('rejects non-additive type metadata changes against a published catalog', () => {
  const publishedMeta = {
    displayName: 'Test',
    description: 'desc',
    minimumLicense: 'enterprise',
    supportedFeatureIds: ['workflows'],
  };
  const published = {
    typeMetadata: { '.test': publishedMeta },
    connectors: [],
  };

  assert.doesNotThrow(() =>
    assertTypeMetadataIsAdditive(published, {
      typeMetadata: {
        '.test': {
          ...publishedMeta,
          supportedFeatureIds: ['workflows', 'agentBuilder'],
        },
      },
    })
  );
  assert.throws(
    () =>
      assertTypeMetadataIsAdditive(published, {
        typeMetadata: {
          '.test': { ...publishedMeta, supportedFeatureIds: [] },
        },
      }),
    /supportedFeatureIds/
  );
  assert.doesNotThrow(() =>
    assertTypeMetadataIsAdditive(published, {
      typeMetadata: { '.test': { ...publishedMeta, minimumLicense: 'gold' } },
    })
  );
  assert.throws(
    () =>
      assertTypeMetadataIsAdditive(
        { typeMetadata: { '.test': { ...publishedMeta, minimumLicense: 'gold' } } },
        { typeMetadata: { '.test': { ...publishedMeta, minimumLicense: 'platinum' } } }
      ),
    /minimumLicense/
  );
  assert.throws(
    () => assertTypeMetadataIsAdditive(published, { typeMetadata: {} }),
    /cannot be removed/
  );
  assert.doesNotThrow(() =>
    assertTypeMetadataIsAdditive(published, {
      typeMetadata: { '.test': { ...publishedMeta, displayName: 'Renamed' } },
    })
  );
});

test('rejects remote assets that do not match the candidate catalog', async (context) => {
  const repoRoot = await createFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await buildConnectorCatalog({ repoRoot });
  const assetRoot = path.join(repoRoot, 'dist/connectors/v1');
  const catalog = JSON.parse(await readFile(path.join(assetRoot, 'catalog.json'), 'utf8'));
  const iconPath = path.join(assetRoot, catalog.typeMetadata['.test'].icon.path);
  await writeFile(iconPath, '<svg/>');

  await assert.rejects(
    verifyConnectorCatalogAssets({ catalog, assetRoot }),
    /Published connector icon .* has wrong bytes/
  );

  await buildConnectorCatalog({ repoRoot });
  const restored = JSON.parse(await readFile(path.join(assetRoot, 'catalog.json'), 'utf8'));
  await writeFile(path.join(assetRoot, restored.connectors[0].definitionUrl), 'corrupted: true\n');
  await assert.rejects(
    verifyConnectorCatalogAssets({ catalog: restored, assetRoot }),
    /Published connector definition .* has wrong bytes/
  );
});
