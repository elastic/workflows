import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
