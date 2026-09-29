#!/usr/bin/env node

import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildConnectorCatalog } from './build-connector-catalog.mjs';
import { assertPublishedCatalogCompatible } from './check-connector-catalog-immutability.mjs';
import {
  fetchPublishedCatalog,
  resolvePublishedCatalogUrl,
} from './fetch-published-connector-catalog.mjs';

const log = (...args) => console.log('[check-published-connector-catalog]', ...args);

const parseCliOptions = (argv) => {
  const options = {
    channel: process.env.CONNECTOR_CATALOG_CHANNEL || 'staging',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--published') {
      options.published = argv[index + 1];
      index += 1;
    } else if (arg === '--channel') {
      options.channel = argv[index + 1];
      index += 1;
    }
  }
  return options;
};

const loadPublished = async (publishedArg) => {
  if (publishedArg === 'none') {
    return { published: null, publishedCatalogPath: undefined, source: 'none' };
  }
  if (publishedArg) {
    return {
      published: JSON.parse(await readFile(publishedArg, 'utf8')),
      publishedCatalogPath: publishedArg,
      source: publishedArg,
    };
  }
  const url = resolvePublishedCatalogUrl();
  if (url === null) {
    log('CONNECTOR_CATALOG_PUBLISHED_URL is empty; skipping published-catalog fetch');
    return { published: null, publishedCatalogPath: undefined, source: 'skip' };
  }
  log(`Fetching published catalog from ${url}`);
  const published = await fetchPublishedCatalog(url);
  if (!published) {
    return { published: null, publishedCatalogPath: undefined, source: 'missing' };
  }
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'published-connector-catalog-'));
  const publishedCatalogPath = path.join(tempDir, 'catalog.json');
  await writeFile(publishedCatalogPath, `${JSON.stringify(published, null, 2)}\n`);
  return { published, publishedCatalogPath, source: url };
};

export const checkPublishedConnectorCatalog = async ({
  repoRoot = process.cwd(),
  published: publishedArg,
  channel = 'staging',
} = {}) => {
  const { published, publishedCatalogPath, source } = await loadPublished(publishedArg);
  const { manifest } = await buildConnectorCatalog({
    repoRoot,
    publishedCatalogPath,
    channel,
  });
  assertPublishedCatalogCompatible(published, manifest);
  if (!published) {
    log(
      source === 'skip'
        ? `Built sequence ${manifest.sequence} without a published baseline`
        : `No published catalog, first publish (sequence ${manifest.sequence})`
    );
  } else {
    log(`Compatible with published catalog; sequence ${manifest.sequence}`);
  }
  log(`catalogVersion ${manifest.catalogVersion}`);
  return { manifest, published };
};

const isMain =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const options = parseCliOptions(process.argv.slice(2));
  checkPublishedConnectorCatalog(options).catch((error) => {
    console.error('[check-published-connector-catalog] FAILED:', error.message);
    process.exit(1);
  });
}
