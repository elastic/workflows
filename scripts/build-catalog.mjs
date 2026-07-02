#!/usr/bin/env node
/**
 * build-catalog.mjs — Workflow Template Library catalog generator.
 *
 * Reads:
 *   - kibana-versions.json    (policy: latest channel, oldest supported minor,
 *                              catalogue granularity)
 *   - library/workflows/<slug>/<slug>.yaml  (templates)
 *
 * Writes (under dist/v1/):
 *   - kibana-versions.json                          (resolved, consumer-facing)
 *   - <version-id>/catalogs/templates.json          (one per active Kibana version)
 *   - <version-id>/manifest.json                    (with kibanaVersion)
 *   - templates/<slug>/<version>.yaml               (raw template body, version-keyed)
 *
 * Resolves the list of Kibana versions to catalogue dynamically:
 *   - `main`'s semver is fetched from elastic/kibana@main's package.json
 *     (overridable via KIBANA_MAIN_VERSION env var for local dev / recovery).
 *   - Named minors are discovered from elastic/kibana's branch list via
 *     `git ls-remote` (unauthenticated, not rate-limited — no GitHub token
 *     needed), filtered by `oldest` (semver floor) and `cataloguePer`.
 *
 * This generator does not enforce authoring invariants (slug parity, semver
 * ranges, categories-vocab membership, install-form references); those are
 * delegated to the separate validation step (planned to run in CI). It still
 * fails closed on a malformed template, a missing required field, or an
 * unreachable Kibana main — never falling back to stale data.
 */

import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import yaml from 'js-yaml';
import semver from 'semver';

const execFileAsync = promisify(execFile);

// --- Paths ---------------------------------------------------------------

const REPO_ROOT = process.cwd();
const POLICY_FILE = path.join(REPO_ROOT, 'kibana-versions.json');
const TEMPLATES_DIR = path.join(REPO_ROOT, 'library/workflows');
const OUT = path.join(REPO_ROOT, 'dist/v1');

// --- Helpers -------------------------------------------------------------

const log = (...args) => console.log('[build-catalog]', ...args);
const warn = (...args) => console.warn('[build-catalog]', ...args);

function readJson(file) {
  return readFile(file, 'utf8').then(JSON.parse);
}
function sha256(buf) {
  return 'sha256:' + createHash('sha256').update(buf).digest('hex');
}

// --- Load policy file --------------------------------------------

async function loadPolicy() {
  const policy = await readJson(POLICY_FILE);

  if (!policy.latest) throw new Error('kibana-versions.json: missing `latest`');
  if (!policy.oldest) throw new Error('kibana-versions.json: missing `oldest`');
  if (!policy.cataloguePer) throw new Error('kibana-versions.json: missing `cataloguePer`');

  if (!semver.valid(policy.oldest)) {
    throw new Error(
      `kibana-versions.json: \`oldest\` must be a valid semver, got '${policy.oldest}'`
    );
  }
  if (policy.cataloguePer !== 'minor') {
    throw new Error(
      `kibana-versions.json: \`cataloguePer\` only supports 'minor' for now, got '${policy.cataloguePer}'`
    );
  }

  return policy;
}

// --- Resolve `main`'s semver -------------------------------------

async function resolveMainKibanaSemver() {
  const override = process.env.KIBANA_MAIN_VERSION;
  if (override) {
    if (!semver.valid(override)) {
      throw new Error(`KIBANA_MAIN_VERSION env var is not valid semver: '${override}'`);
    }
    log(`Using KIBANA_MAIN_VERSION override: ${override}`);
    return override;
  }

  const url = 'https://raw.githubusercontent.com/elastic/kibana/main/package.json';
  log(`Resolving main semver from ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch ${url}: HTTP ${res.status}. Cannot resolve main's Kibana version.`
    );
  }
  const pkg = await res.json();
  if (!pkg.version) {
    throw new Error(`Kibana main package.json has no \`version\` field.`);
  }
  // Strip any pre-release suffix (`-snapshot`, `-pre`, etc.) before validating.
  const clean = semver.coerce(pkg.version)?.version;
  if (!clean || !semver.valid(clean)) {
    throw new Error(
      `Kibana main package.json .version='${pkg.version}' did not normalize to a valid semver`
    );
  }
  return clean;
}

// --- Discover supported named minors from Kibana branches --------

async function discoverNamedMinors(oldest) {
  // Local-dev / recovery escape hatch: skip the git lookup entirely.
  //   KIBANA_NAMED_MINORS=""           → treat as zero named minors
  //   KIBANA_NAMED_MINORS="9.5,9.6"    → use those exact minors
  const override = process.env.KIBANA_NAMED_MINORS;
  if (override !== undefined) {
    const items = override
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((id) => {
        if (!/^\d+\.\d+$/.test(id)) {
          throw new Error(
            `KIBANA_NAMED_MINORS contains non-minor id '${id}' (expected '<major>.<minor>')`
          );
        }
        return { id, kibana: `${id}.0`, active: true };
      });
    log(`Using KIBANA_NAMED_MINORS override: [${items.map((i) => i.id).join(', ') || '(empty)'}]`);
    return items;
  }

  // Discover release branches over the git protocol. Unlike the GitHub REST
  // API, `git ls-remote` is unauthenticated and not rate-limited, so CI needs
  // no GITHUB_TOKEN and there is nothing to rotate.
  const repo = 'https://github.com/elastic/kibana';
  log(`Discovering named minors from ${repo} via git ls-remote`);

  let stdout;
  try {
    ({ stdout } = await execFileAsync('git', ['ls-remote', '--heads', repo], {
      maxBuffer: 16 * 1024 * 1024,
    }));
  } catch (err) {
    throw new Error(
      `Failed to list elastic/kibana branches via 'git ls-remote ${repo}': ${err.message}\n` +
        `For local iteration you can skip the lookup with KIBANA_NAMED_MINORS ` +
        `(e.g. KIBANA_NAMED_MINORS="9.5,9.6" or KIBANA_NAMED_MINORS="").`
    );
  }

  // Each line is "<sha>\trefs/heads/<branch>". Keep only branches whose name is
  // exactly `<major>.<minor>`, then filter by `oldest`.
  const oldestParsed = semver.parse(oldest);
  const minors = stdout
    .split('\n')
    .map((line) => line.split('\t')[1])
    .filter(Boolean)
    .map((ref) => ref.replace(/^refs\/heads\//, ''))
    .map((name) => {
      const m = /^(\d+)\.(\d+)$/.exec(name);
      if (!m) return null;
      const major = Number(m[1]);
      const minor = Number(m[2]);
      return { id: name, kibana: `${major}.${minor}.0` };
    })
    .filter(Boolean)
    .filter((b) => semver.gte(b.kibana, `${oldestParsed.major}.${oldestParsed.minor}.0`))
    // Highest first, deterministic order.
    .sort((a, b) => semver.rcompare(a.kibana, b.kibana))
    .map(({ id, kibana }) => ({ id, kibana, active: true }));

  log(
    `Discovered ${minors.length} named minor(s): ${minors.map((m) => m.id).join(', ') || '(none)'}`
  );
  return minors;
}

// --- Discover every template ------------------------

async function loadTemplates() {
  const slugs = await readdir(TEMPLATES_DIR);
  const templates = [];

  for (const slug of slugs.sort()) {
    const file = path.join(TEMPLATES_DIR, slug, `${slug}.yaml`);
    if (!existsSync(file)) {
      warn(`${file}: not found`);
      continue;
    }
    const raw = await readFile(file, 'utf8');
    const parsed = yaml.load(raw);
    const meta = parsed?.['template-metadata'];

    if (!meta) {
      throw new Error(`${file}: missing \`template-metadata\` block`);
    }
    for (const required of [
      'slug',
      'version',
      'availability',
      'name',
      'description',
      'categories',
    ]) {
      if (meta[required] === undefined) {
        throw new Error(`${file}: missing required field \`template-metadata.${required}\``);
      }
    }

    templates.push({
      slug: meta.slug,
      version: meta.version,
      availability: meta.availability,
      metadata: meta,
      body: raw,
      contentHash: sha256(raw),
      stepTypes: deriveStepTypes(parsed),
      triggerTypes: deriveTriggerTypes(parsed),
    });
  }

  if (!templates.length) {
    throw new Error(`No templates discovered under ${TEMPLATES_DIR}`);
  }
  log(`Loaded ${templates.length} template(s)`);
  return templates;
}

// Returns the child-step arrays nested inside a step, mirroring the workflow
// grammar's nesting constructs (foreach/while `steps`, if `steps`+`else`,
// switch `cases[].steps`+`default`, parallel `branches[].steps`, merge `steps`).
// Kept in sync with @kbn/workflows `getChildStepArrays` / `collectAllSteps` in
// Kibana — if a new nesting construct is added there, mirror it here.
function getChildStepArrays(step) {
  const arrays = [];
  if (Array.isArray(step?.steps)) arrays.push(step.steps);
  if (Array.isArray(step?.else)) arrays.push(step.else);
  if (Array.isArray(step?.default)) arrays.push(step.default);
  if (Array.isArray(step?.cases)) {
    for (const c of step.cases) if (Array.isArray(c?.steps)) arrays.push(c.steps);
  }
  if (Array.isArray(step?.branches)) {
    for (const b of step.branches) if (Array.isArray(b?.steps)) arrays.push(b.steps);
  }
  return arrays;
}

// Flattens every step in the template, recursing into nested steps.
function collectAllSteps(steps) {
  const result = [];
  for (const step of steps ?? []) {
    if (!step || typeof step !== 'object') continue;
    result.push(step);
    for (const childSteps of getChildStepArrays(step)) {
      result.push(...collectAllSteps(childSteps));
    }
  }
  return result;
}

// Unique, document-order list of every `step.type` in the template (including
// nested steps). Full type strings — the Library UI maps them to icons.
function deriveStepTypes(parsed) {
  const seen = new Set();
  const result = [];
  for (const step of collectAllSteps(parsed?.steps)) {
    const type = step.type;
    if (typeof type === 'string' && type && !seen.has(type)) {
      seen.add(type);
      result.push(type);
    }
  }
  return result;
}

// Unique, document-order list of every `trigger.type` in the template.
function deriveTriggerTypes(parsed) {
  const seen = new Set();
  const result = [];
  for (const trigger of parsed?.triggers ?? []) {
    const type = trigger?.type;
    if (typeof type === 'string' && type && !seen.has(type)) {
      seen.add(type);
      result.push(type);
    }
  }
  return result;
}

// --- Build the catalog -------------------------------------------

function pickTemplatesFor(kibanaSemver, allTemplates) {
  const bySlug = new Map();
  for (const t of allTemplates) {
    if (!semver.satisfies(kibanaSemver, t.availability)) continue;
    const prev = bySlug.get(t.slug);
    if (!prev || semver.gt(t.version, prev.version)) bySlug.set(t.slug, t);
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function templateRow(t) {
  return {
    slug: t.slug,
    version: t.version,
    availability: t.availability,
    name: t.metadata.name,
    description: t.metadata.description,
    solutions: t.metadata.solutions,
    categories: t.metadata.categories,
    definitionUrl: `templates/${t.slug}/${t.version}.yaml`,
    contentHash: t.contentHash,
    stepTypes: t.stepTypes,
    triggerTypes: t.triggerTypes,
  };
}

// --- Main ----------------------------------------------------------------

async function main() {
  const policy = await loadPolicy();
  const mainSemver = await resolveMainKibanaSemver();
  const namedMinors = await discoverNamedMinors(policy.oldest);
  const allTemplates = await loadTemplates();

  // Compose the resolved Kibana-versions list: every named minor + `main` sentinel.
  const resolvedVersions = [...namedMinors, { id: 'main', kibana: mainSemver, active: true }];
  log(`Resolved main → Kibana ${mainSemver}`);

  // Wipe + recreate dist/v1.
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  // Emit the resolved kibana-versions.json (consumer-facing shape).
  await writeFile(
    path.join(OUT, 'kibana-versions.json'),
    JSON.stringify({ versions: resolvedVersions, latest: policy.latest }, null, 2) + '\n'
  );

  // Emit per-version templates.json + manifest.json.
  const generatedAt = new Date().toISOString();
  for (const v of resolvedVersions) {
    if (v.active === false) continue;

    const rows = pickTemplatesFor(v.kibana, allTemplates).map(templateRow);
    const catalogsDir = path.join(OUT, v.id, 'catalogs');
    await mkdir(catalogsDir, { recursive: true });

    const templatesJsonBody =
      JSON.stringify(
        {
          version: 'v1',
          kibanaVersion: v.kibana,
          generatedAt,
          templates: rows,
        },
        null,
        2
      ) + '\n';
    await writeFile(path.join(catalogsDir, 'templates.json'), templatesJsonBody);

    const manifest = {
      version: 'v1',
      // Resolved Kibana semver for this catalog (e.g. "9.5.0"; for the `main`
      // channel this is whatever main currently builds, e.g. "9.7.0"). Matches
      // templates.json's `kibanaVersion`. The channel id lives in the URL path
      // (/v1/<id>/) and in kibana-versions.json, so it is not duplicated here.
      kibanaVersion: v.kibana,
      generatedAt,
      hashes: { 'catalogs/templates.json': sha256(templatesJsonBody) },
    };
    await writeFile(
      path.join(OUT, v.id, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n'
    );

    log(
      `  → v1/${v.id}/  (kibana ${v.kibana}, ${rows.length} template${rows.length === 1 ? '' : 's'})`
    );
  }

  // Emit each template body once at its version-keyed URL.
  for (const t of allTemplates) {
    const dir = path.join(OUT, 'templates', t.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${t.version}.yaml`), t.body);
  }
  log(`  → v1/templates/  (${allTemplates.length} version-keyed YAML bodies)`);

  log('Done.');
}

main().catch((err) => {
  console.error('[build-catalog] FAILED:', err.message);
  process.exit(1);
});
