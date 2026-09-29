import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const helperPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../.buildkite/scripts/publish_common.sh'
);
const connectorPublisherPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../.buildkite/scripts/publish_connector_catalog.sh'
);

const classify = (message) =>
  spawnSync('bash', ['-c', 'source "$1"; is_gcloud_not_found "$2"', 'bash', helperPath, message], {
    encoding: 'utf8',
  }).status;

const publishImmutableAsset = ({ mode, source, remote, workspace }) =>
  spawnSync(
    'bash',
    [
      '-c',
      `source "$1"
gcloud() {
  if [[ "$GCLOUD_MODE" == "create" ]]; then
    return 0
  fi
  if [[ "$*" == *"--if-generation-match=0"* ]]; then
    if [[ "$GCLOUD_MODE" == "error" ]]; then
      echo "ERROR: 503 Service unavailable" >&2
    else
      echo "ERROR: HTTPError 412: conditionNotMet" >&2
    fi
    return 1
  fi
  command cp "$REMOTE_ASSET" "$4"
}
publish_immutable_asset "$2" "gs://bucket/asset" "public, max-age=60" "$3"`,
      'bash',
      helperPath,
      source,
      workspace,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, GCLOUD_MODE: mode, REMOTE_ASSET: remote },
    }
  );

test('only treats explicit object-not-found responses as an initial publication', () => {
  assert.equal(classify('ERROR: HTTPError 404: No such object'), 0);
  assert.equal(classify('The following URLs matched no objects or files:'), 0);
  assert.notEqual(classify('credential helper not found'), 0);
  assert.notEqual(classify('metadata endpoint returned 404'), 0);
  assert.notEqual(classify('ERROR: 403 Permission denied'), 0);
  assert.notEqual(classify('ERROR: 503 Service unavailable'), 0);
});

test('guards catalog reads and activation with the same object generation', async () => {
  const publisher = await readFile(connectorPublisherPath, 'utf8');
  assert.match(publisher, /objects describe/);
  assert.equal(publisher.match(/--if-generation-match=/g)?.length, 2);
  assert.match(publisher, /publish_immutable_asset/);
  assert.ok(
    publisher.indexOf('echo "--- Publish authoring schema"') >
      publisher.indexOf('echo "--- Activate catalog"')
  );
});

test('creates immutable assets once and verifies existing bytes', async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'connector-publisher-'));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const source = path.join(workspace, 'source');
  const remote = path.join(workspace, 'remote');
  await writeFile(source, 'same bytes');
  await writeFile(remote, 'same bytes');

  assert.equal(publishImmutableAsset({ mode: 'create', source, remote, workspace }).status, 0);
  assert.equal(publishImmutableAsset({ mode: 'exists', source, remote, workspace }).status, 0);

  await writeFile(remote, 'different bytes');
  const conflict = publishImmutableAsset({ mode: 'exists', source, remote, workspace });
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /already exists with different content/);

  const transientError = publishImmutableAsset({ mode: 'error', source, remote, workspace });
  assert.notEqual(transientError.status, 0);
  assert.match(transientError.stderr, /503 Service unavailable/);
});

const writeExecutable = async (filePath, body) => {
  await writeFile(filePath, body);
  await chmod(filePath, 0o755);
};

test('fetch_signing_key_to_file writes the key with mode 600', async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'connector-signing-key-'));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const bin = path.join(workspace, 'bin');
  await mkdir(bin);
  await writeExecutable(
    path.join(bin, 'vault'),
    `#!/bin/bash
echo "-----BEGIN PRIVATE KEY-----"
echo "test-key"
echo "-----END PRIVATE KEY-----"
`
  );
  const dest = path.join(workspace, 'key.pem');
  const result = spawnSync(
    'bash',
    ['-c', 'source "$1"; fetch_signing_key_to_file "$2"', 'bash', helperPath, dest],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(dest, 'utf8'), /test-key/);
  assert.equal((await stat(dest)).mode & 0o777, 0o600);
});

test('fetch_signing_key_to_file fails when Vault returns an empty key', async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'connector-signing-empty-'));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const bin = path.join(workspace, 'bin');
  await mkdir(bin);
  await writeExecutable(path.join(bin, 'vault'), '#!/bin/bash\nexit 0\n');
  const dest = path.join(workspace, 'key.pem');
  const result = spawnSync(
    'bash',
    ['-c', 'source "$1"; fetch_signing_key_to_file "$2"', 'bash', helperPath, dest],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /empty signing key/);
});

test('uploads connector assets, then the signature, then the manifest, then schemas', async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'connector-publish-order-'));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const bin = path.join(workspace, 'bin');
  const repo = path.join(workspace, 'repo');
  await mkdir(bin);
  await mkdir(path.join(repo, 'dist/connectors/v1/connectors/test/icons'), { recursive: true });
  await writeFile(path.join(repo, 'dist/connectors/v1/connectors/test/1.0.yaml'), 'id: .test\n');
  await writeFile(
    path.join(repo, 'dist/connectors/v1/connectors/test/icons/sha256-abc.svg'),
    '<svg/>'
  );
  await writeFile(
    path.join(repo, 'dist/connectors/v1/catalog.json'),
    '{"sequence":1,"catalogVersion":"sha256:x"}\n'
  );
  await writeFile(path.join(repo, 'dist/connectors/v1/catalog.json.sig'), 'sig\n');
  await writeFile(path.join(repo, 'dist/connectors/v1/schema.json'), '{}\n');
  await writeFile(path.join(repo, 'dist/connectors/v1/metadata.schema.json'), '{}\n');
  await writeExecutable(path.join(bin, 'npm'), '#!/bin/sh\nexit 0\n');
  await writeExecutable(path.join(bin, 'node'), '#!/bin/sh\nexit 0\n');
  await writeExecutable(path.join(bin, 'buildkite-agent'), '#!/bin/sh\nexit 0\n');

  const result = spawnSync('bash', [connectorPublisherPath, 'staging'], {
    encoding: 'utf8',
    cwd: repo,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PUBLISH_DRY_RUN: '1' },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const uploads = result.stdout
    .split('\n')
    .filter((line) => line.includes('gcloud storage cp '))
    .map((line) => line.replace(/^gcloud storage cp /, '').split(/\s+/)[0]);
  const indexOf = (suffix) => uploads.findIndex((filePath) => filePath.endsWith(suffix));
  const assetIndex = indexOf('connectors/test/1.0.yaml');
  const sigIndex = indexOf('catalog.json.sig');
  const catalogIndex = uploads.findIndex(
    (filePath) => filePath.endsWith('catalog.json') && !filePath.endsWith('catalog.json.sig')
  );
  const schemaIndex = indexOf('/schema.json');
  const metadataSchemaIndex = indexOf('metadata.schema.json');
  assert.ok(assetIndex >= 0 && sigIndex >= 0 && catalogIndex >= 0);
  assert.ok(assetIndex < sigIndex, `assets before sig: ${uploads.join(' | ')}`);
  assert.ok(sigIndex < catalogIndex, `sig before catalog: ${uploads.join(' | ')}`);
  assert.ok(catalogIndex < schemaIndex, `catalog before schema: ${uploads.join(' | ')}`);
  assert.ok(
    schemaIndex < metadataSchemaIndex,
    `schema before metadata schema: ${uploads.join(' | ')}`
  );
});
