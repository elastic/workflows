import { readFile } from 'node:fs/promises';
import semver from 'semver';

const keyFor = ({ id, version }) => `${id}@${version}`;

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

  for (const [id, publishedVersion] of Object.entries(published.activeVersions)) {
    const nextVersion = next.activeVersions[id];
    if (!nextVersion) {
      throw new Error(`Published connector ${id} cannot be removed from activeVersions`);
    }
    if (semver.lt(nextVersion, publishedVersion)) {
      throw new Error(
        `Active connector ${id} cannot move backward from ${publishedVersion} to ${nextVersion}`
      );
    }
  }
};

if (process.argv[1]?.endsWith('check-connector-catalog-immutability.mjs')) {
  const [publishedPath, nextPath] = process.argv.slice(2);
  if (!publishedPath || !nextPath) {
    throw new Error(
      'Usage: check-connector-catalog-immutability.mjs <published-catalog> <next-catalog>'
    );
  }
  const [published, next] = await Promise.all(
    [publishedPath, nextPath].map(async (filePath) => JSON.parse(await readFile(filePath, 'utf8')))
  );
  assertConnectorCatalogIsImmutable(published, next);
}
