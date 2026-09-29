import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import {
  fetchPublishedCatalog,
  resolvePublishedCatalogUrl,
} from './fetch-published-connector-catalog.mjs';

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });

const close = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

test('fetchPublishedCatalog returns the parsed manifest on 200', async () => {
  const manifest = { schemaVersion: 1, sequence: 3, catalogVersion: 'sha256:abc' };
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(manifest));
  });
  const port = await listen(server);
  try {
    assert.deepEqual(
      await fetchPublishedCatalog(`http://127.0.0.1:${port}/catalog.json`),
      manifest
    );
  } finally {
    await close(server);
  }
});

test('fetchPublishedCatalog returns null on 404', async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(404);
    response.end('NoSuchKey');
  });
  const port = await listen(server);
  try {
    assert.equal(await fetchPublishedCatalog(`http://127.0.0.1:${port}/catalog.json`), null);
  } finally {
    await close(server);
  }
});

test('fetchPublishedCatalog throws on a non-2xx status other than 404', async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(500);
    response.end('error');
  });
  const port = await listen(server);
  try {
    await assert.rejects(fetchPublishedCatalog(`http://127.0.0.1:${port}/catalog.json`), /500/);
  } finally {
    await close(server);
  }
});

test('resolvePublishedCatalogUrl treats an empty env value as skip', () => {
  assert.equal(resolvePublishedCatalogUrl({ CONNECTOR_CATALOG_PUBLISHED_URL: '' }), null);
  assert.equal(
    resolvePublishedCatalogUrl({}),
    'https://workflows.elastic.co/connectors/v1/catalog.json'
  );
});
