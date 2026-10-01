/**
 * Schema artifact loading — adapted from Kibana's `load_schema.ts`.
 *
 * Resolves the schema bundle (the directory/URL containing `index.json`) from,
 * in order: an explicit `--schema <path|url>`, then a `--schema-cdn-url` (or
 * `WORKFLOWS_SCHEMA_CDN_URL` env) fallback. Each variant's `schema.json` is
 * integrity-checked against the `sha256` recorded in `index.json` before use.
 *
 * Unlike the Kibana CLI, there is no `target/<version>/<channel>` local lookup:
 * this repo has no Kibana build tree, so the source is always an explicit path
 * or URL.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { VARIANTS } from './variants.mjs';

const INDEX_FILE = 'index.json';

const isUrl = (value) => /^https?:\/\//i.test(value);

const sha256Hex = (input) => createHash('sha256').update(input, 'utf8').digest('hex');

const createFsReader = (baseDir) => ({
  source: baseDir,
  readText: async (relativePath) => fs.promises.readFile(path.join(baseDir, relativePath), 'utf8'),
});

const createHttpReader = (baseUrl) => {
  let end = baseUrl.length;
  while (end > 0 && baseUrl.charCodeAt(end - 1) === 47 /* '/' */) {
    end--;
  }
  const normalizedBase = baseUrl.slice(0, end);
  return {
    source: normalizedBase,
    readText: async (relativePath) => {
      const url = `${normalizedBase}/${relativePath}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
      }
      return response.text();
    },
  };
};

/**
 * Resolve the bundle reader in priority order: explicit `--schema` (path or
 * URL), then the configured CDN. Throws a descriptive error when nothing
 * resolves.
 */
const resolveReader = ({ schema, cdnUrl }) => {
  if (schema) {
    if (isUrl(schema)) {
      return createHttpReader(schema);
    }
    const absolute = path.resolve(schema);
    if (!fs.existsSync(path.join(absolute, INDEX_FILE))) {
      throw new Error(`No ${INDEX_FILE} found in --schema directory: ${absolute}`);
    }
    return createFsReader(absolute);
  }

  if (cdnUrl) {
    return createHttpReader(cdnUrl);
  }

  throw new Error(
    `Could not resolve a schema artifact. Provide one with --schema <path|url>, ` +
      `or set --schema-cdn-url / the WORKFLOWS_SCHEMA_CDN_URL env var.`
  );
};

const readAndVerifyVariant = async (reader, manifest, variant) => {
  const entry = manifest.variants?.[variant];
  if (!entry) {
    throw new Error(`Manifest is missing the "${variant}" variant`);
  }

  const bytes = await reader.readText(entry.path);
  const actualSha = sha256Hex(bytes);
  if (actualSha !== entry.sha256) {
    throw new Error(
      `Integrity check failed for ${variant} (${entry.path}): expected ${entry.sha256}, got ${actualSha}`
    );
  }

  return JSON.parse(bytes);
};

/**
 * Resolve the schema source, read + integrity-verify the manifest and each
 * variant, and JSON-parse them.
 */
export const loadSchemaDocuments = async (options = {}) => {
  const reader = resolveReader(options);

  const indexText = await reader.readText(INDEX_FILE);
  const manifest = JSON.parse(indexText);

  const schemas = {};
  for (const variant of VARIANTS) {
    schemas[variant] = await readAndVerifyVariant(reader, manifest, variant);
  }

  return { manifest, schemas, source: reader.source };
};
