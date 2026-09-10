/**
 * Resolve the set of workflow YAML files to validate — ported from Kibana's
 * `discover_files.ts`.
 *
 * The target may be a single `.yml`/`.yaml` file (returned as-is) or a
 * directory. Directories are scanned for `*.yml`/`*.yaml`, skipping dotfiles and
 * dot-directories; `recursive` controls whether subdirectories are descended.
 * The result is sorted for deterministic output.
 */

import fs from 'node:fs';
import path from 'node:path';

const YAML_EXT = /\.ya?ml$/i;

const walk = (dir, recursive, out) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    // Skip dotfiles and dot-directories (e.g. `.git`, `.DS_Store`).
    if (entry.name.startsWith('.')) {
      continue;
    }
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        walk(absolute, recursive, out);
      }
      continue;
    }
    if (entry.isFile() && YAML_EXT.test(entry.name)) {
      out.push(absolute);
    }
  }
};

export const discoverFiles = (target, { recursive = false } = {}) => {
  const absolute = path.resolve(target);

  let stat;
  try {
    stat = fs.statSync(absolute);
  } catch {
    throw new Error(`Path does not exist: ${absolute}`);
  }

  if (stat.isFile()) {
    if (!YAML_EXT.test(absolute)) {
      throw new Error(`Not a YAML file (expected .yml/.yaml): ${absolute}`);
    }
    return [absolute];
  }

  if (!stat.isDirectory()) {
    throw new Error(`Path is neither a file nor a directory: ${absolute}`);
  }

  const found = [];
  walk(absolute, recursive, found);
  return found.sort();
};
