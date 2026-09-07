import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as yaml from 'js-yaml';

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

const resolveCatalogPath = (assetRoot, relativePath) => {
  const resolved = path.resolve(assetRoot, relativePath);
  const relative = path.relative(assetRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Catalog asset path escapes its root: ${relativePath}`);
  }
  return resolved;
};

export const verifyConnectorCatalogAssets = async ({ catalog, assetRoot }) => {
  for (const entry of catalog.connectors) {
    const definitionPath = resolveCatalogPath(assetRoot, entry.definitionUrl);
    const definitionRaw = await readFile(definitionPath, 'utf8');
    if (sha256(definitionRaw) !== entry.contentHash) {
      throw new Error(
        `Published connector definition ${entry.id}@${entry.version} has wrong bytes`
      );
    }

    const definition = yaml.load(definitionRaw);
    if (definition.id !== entry.id || definition.version !== entry.version) {
      throw new Error(
        `Published connector definition ${entry.id}@${entry.version} has wrong identity`
      );
    }

    if (definition.metadata.icon) {
      const iconPath = resolveCatalogPath(
        path.dirname(definitionPath),
        definition.metadata.icon.path
      );
      const iconRaw = await readFile(iconPath);
      if (sha256(iconRaw) !== definition.metadata.icon.contentHash) {
        throw new Error(`Published connector icon ${entry.id}@${entry.version} has wrong bytes`);
      }
    }
  }
};

if (process.argv[1]?.endsWith('verify-connector-catalog-assets.mjs')) {
  const [catalogPath, assetRoot] = process.argv.slice(2);
  if (!catalogPath || !assetRoot) {
    throw new Error(
      'Usage: verify-connector-catalog-assets.mjs <candidate-catalog> <remote-asset-root>'
    );
  }
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  await verifyConnectorCatalogAssets({ catalog, assetRoot });
}
