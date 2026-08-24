import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
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
  spawnSync(
    'bash',
    ['-c', 'source "$1"; is_gcloud_not_found "$2"', 'bash', helperPath, message],
    { encoding: 'utf8' }
  ).status;

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
});
