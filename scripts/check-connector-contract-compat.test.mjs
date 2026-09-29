import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertAdditiveMinor,
  assertMajorJustified,
  assertVersionOrdering,
  diffAdditiveSchema,
  listAuthTypeIds,
  selectBaseline,
} from './check-connector-contract-compat.mjs';

const schema = ({ extra = {}, required = [], additionalProperties = false } = {}) => ({
  type: 'object',
  additionalProperties,
  required,
  properties: {
    name: { type: 'string' },
    ...extra,
  },
});

const contract = ({ version = '1.0', config, auth, actions } = {}) => ({
  id: '.test',
  version,
  parsed: {
    config: config ?? schema(),
    auth: auth ?? { types: ['api_key_query'] },
    actions: actions ?? {
      ping: { input: schema() },
    },
  },
});

test('diffAdditiveSchema allows additive optional properties and widened constraints', () => {
  assert.deepEqual(
    diffAdditiveSchema(schema(), schema({ extra: { note: { type: 'string' } } }), 'config'),
    []
  );
  assert.deepEqual(
    diffAdditiveSchema(
      { type: 'string', enum: ['a'] },
      { type: 'string', enum: ['a', 'b'] },
      'config.properties.kind'
    ),
    []
  );
  assert.deepEqual(
    diffAdditiveSchema(
      { type: 'integer', minimum: 5, maximum: 10 },
      { type: 'integer', minimum: 1, maximum: 10 },
      'config.properties.retries'
    ),
    []
  );
  assert.deepEqual(
    diffAdditiveSchema(
      schema({ required: ['name'] }),
      schema({ extra: { token: { type: 'string', default: 'x' } }, required: ['name', 'token'] }),
      'config'
    ),
    []
  );
});

test('diffAdditiveSchema reports breaking schema changes', () => {
  const removed = diffAdditiveSchema(
    schema({ extra: { token: { type: 'string' } } }),
    schema(),
    'config'
  );
  assert.match(removed[0].message, /config\.properties\.token/);
  assert.equal(removed[0].rule, 'removed-property');

  const typeChange = diffAdditiveSchema(
    { type: 'string' },
    { type: 'integer' },
    'config.properties.name'
  );
  assert.equal(typeChange[0].rule, 'type');

  const required = diffAdditiveSchema(
    schema(),
    schema({ extra: { token: { type: 'string' } }, required: ['name', 'token'] }),
    'config'
  );
  assert.equal(required[0].rule, 'required');

  const narrowed = diffAdditiveSchema(
    { type: 'string', enum: ['a', 'b'] },
    { type: 'string', enum: ['a'] },
    'config.properties.kind'
  );
  assert.equal(narrowed[0].rule, 'enum');

  const raisedMin = diffAdditiveSchema(
    { type: 'integer', minimum: 1 },
    { type: 'integer', minimum: 5 },
    'config.properties.retries'
  );
  assert.equal(raisedMin[0].rule, 'minimum');

  const loweredMax = diffAdditiveSchema(
    { type: 'integer', maximum: 10 },
    { type: 'integer', maximum: 5 },
    'config.properties.retries'
  );
  assert.equal(loweredMax[0].rule, 'maximum');

  const additional = diffAdditiveSchema(
    schema({ additionalProperties: true }),
    schema({ additionalProperties: false }),
    'config'
  );
  assert.equal(additional[0].rule, 'additionalProperties');
});

test('assertAdditiveMinor allows added actions and auth types', () => {
  const previous = contract();
  const next = contract({
    version: '1.1',
    auth: { types: ['api_key_query', 'basic'] },
    actions: {
      ping: { input: schema() },
      pong: { input: schema() },
    },
  });
  assert.doesNotThrow(() => assertAdditiveMinor(previous, next));
});

test('assertAdditiveMinor treats legacy auth.type as the same id set as auth.types', () => {
  const previous = contract({ auth: { type: 'api_key_header' } });
  const next = contract({
    version: '1.1',
    auth: { types: [{ type: 'api_key_header', defaults: {} }] },
  });
  assert.doesNotThrow(() => assertAdditiveMinor(previous, next));
});

test('assertAdditiveMinor fails when a property, action, or auth type is removed', () => {
  const previous = contract({
    config: schema({ extra: { token: { type: 'string' } } }),
    auth: { types: ['api_key_query', 'basic'] },
    actions: {
      ping: { input: schema() },
      pong: { input: schema() },
    },
  });
  const next = contract({ version: '1.1' });
  assert.throws(() => assertAdditiveMinor(previous, next), /token/);
  assert.throws(() => assertAdditiveMinor(previous, next), /actions\.pong/);
  assert.throws(() => assertAdditiveMinor(previous, next), /basic/);
  assert.throws(() => assertAdditiveMinor(previous, next), /\.test@1\.1/);
});

test('listAuthTypeIds reads legacy and types-array forms', () => {
  assert.deepEqual(listAuthTypeIds({ type: 'api_key_header' }), ['api_key_header']);
  assert.deepEqual(listAuthTypeIds({ types: ['api_key_query', { type: 'basic' }] }), [
    'api_key_query',
    'basic',
  ]);
});

test('selectBaseline picks the highest lower version of the same major', () => {
  const contracts = [
    { major: 1, version: '1.0' },
    { major: 1, version: '1.1' },
    { major: 2, version: '2.0' },
  ];
  assert.equal(selectBaseline(contracts, { major: 1, version: '1.2' }).version, '1.1');
  assert.equal(selectBaseline(contracts, { major: 2, version: '2.0' }), undefined);
});

test('assertVersionOrdering rejects gapped majors', () => {
  assert.doesNotThrow(() =>
    assertVersionOrdering(
      [
        { major: 1, version: '1.0' },
        { major: 2, version: '2.0' },
      ],
      'connectors/test'
    )
  );
  assert.throws(
    () =>
      assertVersionOrdering(
        [
          { major: 1, version: '1.0' },
          { major: 3, version: '3.0' },
        ],
        'connectors/test'
      ),
    /contiguous/
  );
});

test('assertMajorJustified requires a Breaking section for majors >= 2', async (context) => {
  const connectorDir = await mkdtemp(path.join(os.tmpdir(), 'connector-compat-'));
  context.after(() => rm(connectorDir, { recursive: true, force: true }));
  await mkdir(connectorDir, { recursive: true });

  await assert.rejects(
    assertMajorJustified({ slug: 'test', connectorDir, majors: [1, 2] }),
    /CHANGELOG\.md/
  );

  await writeFile(path.join(connectorDir, 'CHANGELOG.md'), '## 2.0\n\nRenamed a field.\n');
  await assert.rejects(
    assertMajorJustified({ slug: 'test', connectorDir, majors: [2] }),
    /Breaking/
  );

  await writeFile(path.join(connectorDir, 'CHANGELOG.md'), '## 2.0\n\nBreaking: removed token.\n');
  await assert.doesNotReject(assertMajorJustified({ slug: 'test', connectorDir, majors: [1, 2] }));
});
