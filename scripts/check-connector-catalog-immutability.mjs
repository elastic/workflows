import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const keyFor = ({ id, version }) => `${id}@${version}`;

const LICENSE_RANK = {
  gold: 0,
  platinum: 1,
  enterprise: 2,
};

export const assertConnectorCatalogIsImmutable = (published, next) => {
  const nextByVersion = new Map(next.connectors.map((entry) => [keyFor(entry), entry]));

  for (const publishedEntry of published.connectors) {
    const nextEntry = nextByVersion.get(keyFor(publishedEntry));
    if (!nextEntry) {
      throw new Error(`Published connector version ${keyFor(publishedEntry)} cannot be removed`);
    }
    if (
      nextEntry.contentHash !== publishedEntry.contentHash ||
      nextEntry.definitionUrl !== publishedEntry.definitionUrl
    ) {
      throw new Error(`Published connector version ${keyFor(publishedEntry)} cannot be changed`);
    }
  }
};

export const assertSequenceAdvances = (published, next) => {
  if (next.sequence !== published.sequence + 1) {
    throw new Error(`Catalog sequence must be ${published.sequence + 1}, got ${next.sequence}`);
  }
  if (next.previousCatalogVersion !== published.catalogVersion) {
    throw new Error(
      `previousCatalogVersion must equal published catalogVersion ${published.catalogVersion}`
    );
  }
};

export const assertTypeMetadataIsAdditive = (published, next) => {
  const nextMeta = next.typeMetadata ?? {};
  for (const [id, publishedMeta] of Object.entries(published.typeMetadata ?? {})) {
    const candidate = nextMeta[id];
    if (!candidate) {
      throw new Error(`Published type metadata for ${id} cannot be removed`);
    }
    const nextFeatures = new Set(candidate.supportedFeatureIds ?? []);
    for (const feature of publishedMeta.supportedFeatureIds ?? []) {
      if (!nextFeatures.has(feature)) {
        throw new Error(`Type metadata ${id} cannot remove supportedFeatureIds value ${feature}`);
      }
    }
    const publishedRank = LICENSE_RANK[publishedMeta.minimumLicense];
    const nextRank = LICENSE_RANK[candidate.minimumLicense];
    if (publishedRank !== undefined && nextRank !== undefined && nextRank > publishedRank) {
      throw new Error(
        `Type metadata ${id} cannot raise minimumLicense from ${publishedMeta.minimumLicense} to ${candidate.minimumLicense}`
      );
    }
  }
};

export const assertPublishedCatalogCompatible = (published, next) => {
  if (!published) {
    if (next.sequence !== 1) {
      throw new Error(`First publish must use sequence 1, got ${next.sequence}`);
    }
    if (next.previousCatalogVersion !== undefined) {
      throw new Error('First publish must omit previousCatalogVersion');
    }
    return;
  }
  assertConnectorCatalogIsImmutable(published, next);
  assertSequenceAdvances(published, next);
  assertTypeMetadataIsAdditive(published, next);
};

const isMain =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const [publishedPath, nextPath] = process.argv.slice(2);
  if (!publishedPath || !nextPath) {
    throw new Error(
      'Usage: check-connector-catalog-immutability.mjs <published-catalog|none> <next-catalog>'
    );
  }
  const published =
    publishedPath === 'none' ? null : JSON.parse(await readFile(publishedPath, 'utf8'));
  const next = JSON.parse(await readFile(nextPath, 'utf8'));
  assertPublishedCatalogCompatible(published, next);
}
