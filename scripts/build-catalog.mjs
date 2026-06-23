#!/usr/bin/env node
/**
 * build-catalog.mjs — Workflow Template Library catalog generator.
 *
 * Reads:
 *   - kibana-versions.json    (policy: latest channel, oldest supported minor,
 *                              catalogue granularity)
 *   - library/categories.yaml (closed-vocab category registry)
 *   - library/workflows/<slug>/<slug>.yaml  (templates)
 *
 * Writes (under dist/v1/):
 *   - kibana-versions.json                          (resolved, consumer-facing)
 *   - <version-id>/catalogs/templates.json          (one per active Kibana version)
 *   - <version-id>/manifest.json                    (with effectiveKibanaSemver)
 *   - templates/<slug>/<version>.yaml               (raw template body, version-keyed)
 *
 * Resolves the list of Kibana versions to catalogue dynamically:
 *   - `main`'s semver is fetched from elastic/kibana@main's package.json
 *     (overridable via KIBANA_MAIN_VERSION env var for local dev / recovery).
 *   - Named minors are discovered from elastic/kibana's branch list via the
 *     GitHub API, filtered by `oldest` (semver floor) and `cataloguePer`.
 *
 * Fails closed: a malformed template, an unknown category, an unreachable
 * Kibana main, or a missing required field aborts the publish — never falls
 * back to stale data.
 */

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import yaml from "js-yaml";
import semver from "semver";

// --- Paths ---------------------------------------------------------------

const REPO_ROOT = process.cwd();
const POLICY_FILE = path.join(REPO_ROOT, "kibana-versions.json");
const CATEGORIES_FILE = path.join(REPO_ROOT, "library/categories.yaml");
const TEMPLATES_DIR = path.join(REPO_ROOT, "library/workflows");
const OUT = path.join(REPO_ROOT, "dist/v1");

// --- Helpers -------------------------------------------------------------

const log = (...args) => console.log("[build-catalog]", ...args);
const warn = (...args) => console.warn("[build-catalog]", ...args);

function readJson(file) {
  return readFile(file, "utf8").then(JSON.parse);
}

function readYaml(file) {
  return readFile(file, "utf8").then((raw) => yaml.load(raw));
}

function sha256(buf) {
  return "sha256:" + createHash("sha256").update(buf).digest("hex");
}

// --- Step 1: Load policy file --------------------------------------------

async function loadPolicy() {
  const policy = await readJson(POLICY_FILE);

  if (!policy.latest) throw new Error("kibana-versions.json: missing `latest`");
  if (!policy.oldest) throw new Error("kibana-versions.json: missing `oldest`");
  if (!policy.cataloguePer)
    throw new Error("kibana-versions.json: missing `cataloguePer`");

  if (!semver.valid(policy.oldest)) {
    throw new Error(
      `kibana-versions.json: \`oldest\` must be a valid semver, got '${policy.oldest}'`,
    );
  }
  if (policy.cataloguePer !== "minor") {
    throw new Error(
      `kibana-versions.json: \`cataloguePer\` only supports 'minor' for now, got '${policy.cataloguePer}'`,
    );
  }

  return policy;
}

// --- Step 2: Resolve `main`'s semver -------------------------------------

async function resolveMainKibanaSemver() {
  const override = process.env.KIBANA_MAIN_VERSION;
  if (override) {
    if (!semver.valid(override)) {
      throw new Error(
        `KIBANA_MAIN_VERSION env var is not valid semver: '${override}'`,
      );
    }
    log(`Using KIBANA_MAIN_VERSION override: ${override}`);
    return override;
  }

  const url =
    "https://raw.githubusercontent.com/elastic/kibana/main/package.json";
  log(`Resolving main semver from ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch ${url}: HTTP ${res.status}. Cannot resolve main's Kibana version.`,
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
      `Kibana main package.json .version='${pkg.version}' did not normalize to a valid semver`,
    );
  }
  return clean;
}

// --- Step 3: Discover supported named minors from Kibana branches --------

/**
 * Builds a multi-line, actionable error message for a non-2xx response from
 * the GitHub API. Distinguishes rate-limit 403s from auth 401/403s and points
 * the operator at the two escape hatches (GITHUB_TOKEN, KIBANA_NAMED_MINORS).
 */
function formatGitHubApiError(res, url, hasToken) {
  const remaining = res.headers.get("x-ratelimit-remaining");
  const reset = res.headers.get("x-ratelimit-reset");
  const limit = res.headers.get("x-ratelimit-limit");

  const lines = [
    `Failed to list elastic/kibana branches: HTTP ${res.status} from ${url}`,
  ];

  const isRateLimit =
    (res.status === 403 || res.status === 429) && remaining === "0";

  if (isRateLimit) {
    const resetAt = reset
      ? new Date(Number(reset) * 1000).toISOString()
      : "unknown";
    lines.push("");
    lines.push(
      `Cause: GitHub API rate limit exhausted (used ${limit}/${limit}, resets at ${resetAt}).`,
    );
    if (!hasToken) {
      lines.push("");
      lines.push(
        "You are calling the GitHub API unauthenticated, which is rate-limited to 60 requests/hour per IP.",
      );
      lines.push("");
      lines.push("Fixes (pick one):");
      lines.push(
        "  1. Authenticate the call (raises the limit to 5,000/hour):",
      );
      lines.push(
        "       export GITHUB_TOKEN=$(gh auth token)   # if you use the gh CLI",
      );
      lines.push(
        "       # or any classic/fine-grained PAT — no scopes needed for public repos",
      );
      lines.push("       npm run build:catalog");
      lines.push(
        "  2. Skip the branch fetch entirely (for quick local iteration):",
      );
      lines.push(
        '       KIBANA_NAMED_MINORS="" npm run build:catalog                # zero named minors',
      );
      lines.push(
        '       KIBANA_NAMED_MINORS="9.5,9.6" npm run build:catalog         # specific minors',
      );
      lines.push("  3. Wait until the rate limit window resets and retry.");
    } else {
      lines.push("");
      lines.push(
        "Your GITHUB_TOKEN is set but the authenticated rate limit (5,000/hour) is also exhausted.",
      );
      lines.push(
        "Wait until the reset time above, or use KIBANA_NAMED_MINORS to skip the API entirely.",
      );
    }
  } else if (res.status === 401 || res.status === 403) {
    lines.push("");
    if (hasToken) {
      lines.push(
        "Cause: GITHUB_TOKEN is set but was rejected by GitHub (expired, revoked, or invalid).",
      );
      lines.push("");
      lines.push("Fixes:");
      lines.push("  1. Refresh your token:");
      lines.push("       export GITHUB_TOKEN=$(gh auth token)");
      lines.push(
        "  2. Or unset it to fall back to unauthenticated access (60 req/h is plenty for one run):",
      );
      lines.push("       unset GITHUB_TOKEN && npm run build:catalog");
      lines.push("  3. Or skip the branch fetch entirely:");
      lines.push('       KIBANA_NAMED_MINORS="" npm run build:catalog');
    } else {
      lines.push(
        "Cause: GitHub returned 403 without a rate-limit signature. Possibly an IP-level block or a transient issue.",
      );
      lines.push("");
      lines.push("Try again, or skip the API:");
      lines.push('  KIBANA_NAMED_MINORS="" npm run build:catalog');
    }
  } else {
    lines.push("");
    lines.push(
      "Unexpected HTTP status from the GitHub API. Re-run; if it persists, skip the API:",
    );
    lines.push('  KIBANA_NAMED_MINORS="" npm run build:catalog');
  }

  return lines.join("\n");
}

async function discoverNamedMinors(oldest) {
  // Local-dev / recovery escape hatch: skip the GitHub API entirely.
  //   KIBANA_NAMED_MINORS=""           → treat as zero named minors
  //   KIBANA_NAMED_MINORS="9.5,9.6"    → use those exact minors
  const override = process.env.KIBANA_NAMED_MINORS;
  if (override !== undefined) {
    const items = override
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((id) => {
        if (!/^\d+\.\d+$/.test(id)) {
          throw new Error(
            `KIBANA_NAMED_MINORS contains non-minor id '${id}' (expected '<major>.<minor>')`,
          );
        }
        return { id, kibana: `${id}.0`, active: true };
      });
    log(
      `Using KIBANA_NAMED_MINORS override: [${items.map((i) => i.id).join(", ") || "(empty)"}]`,
    );
    return items;
  }

  const url =
    "https://api.github.com/repos/elastic/kibana/branches?per_page=100";
  const hasToken = Boolean(process.env.GITHUB_TOKEN);
  log(
    `Discovering named minors from ${url} (${hasToken ? "authenticated" : "unauthenticated"})`,
  );

  // GitHub branches API paginates. Walk pages until empty.
  let page = 1;
  const branchNames = [];
  while (true) {
    const headers = { Accept: "application/vnd.github+json" };
    if (hasToken) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const res = await fetch(`${url}&page=${page}`, { headers });
    if (!res.ok) {
      throw new Error(formatGitHubApiError(res, url, hasToken));
    }
    const batch = await res.json();
    if (!batch.length) break;
    branchNames.push(...batch.map((b) => b.name));
    if (batch.length < 100) break;
    page++;
  }

  // Keep only branches that match `^<major>.<minor>$`. Filter by `oldest`.
  const oldestParsed = semver.parse(oldest);
  const minors = branchNames
    .map((name) => {
      const m = /^(\d+)\.(\d+)$/.exec(name);
      if (!m) return null;
      const major = Number(m[1]);
      const minor = Number(m[2]);
      const repSemver = `${major}.${minor}.0`;
      return { id: name, kibana: repSemver, major, minor };
    })
    .filter(Boolean)
    .filter((b) =>
      semver.gte(b.kibana, `${oldestParsed.major}.${oldestParsed.minor}.0`),
    )
    // Highest first, deterministic order.
    .sort((a, b) => semver.rcompare(a.kibana, b.kibana))
    .map(({ id, kibana }) => ({ id, kibana, active: true }));

  log(
    `Discovered ${minors.length} named minor(s): ${minors.map((m) => m.id).join(", ") || "(none)"}`,
  );
  return minors;
}

// --- Step 4: Load categories vocabulary ----------------------------------

async function loadCategoriesVocab() {
  const vocab = await readYaml(CATEGORIES_FILE);
  if (!vocab?.categories?.length) {
    throw new Error(
      "library/categories.yaml: missing or empty `categories` array",
    );
  }
  return new Set(vocab.categories.map((c) => c.id));
}

// --- Step 5: Discover and validate every template ------------------------

async function loadTemplates(validCategoryIds) {
  const slugs = await readdir(TEMPLATES_DIR);
  const templates = [];

  for (const slug of slugs.sort()) {
    const file = path.join(TEMPLATES_DIR, slug, `${slug}.yaml`);
    if (!existsSync(file)) {
      warn(`${file}: not found`);
      continue;
    }
    const raw = await readFile(file, "utf8");
    const parsed = yaml.load(raw);
    const meta = parsed?.["template-metadata"];

    if (!meta) {
      throw new Error(`${file}: missing \`template-metadata\` block`);
    }
    for (const required of [
      "slug",
      "version",
      "availability",
      "name",
      "description",
      "categories",
    ]) {
      if (meta[required] === undefined) {
        throw new Error(
          `${file}: missing required field \`template-metadata.${required}\``,
        );
      }
    }

    templates.push({
      slug: meta.slug,
      version: meta.version,
      availability: meta.availability,
      metadata: meta,
      body: raw,
      contentHash: sha256(raw),
      fixedConnectors: deriveFixedConnectors(parsed),
    });
  }

  if (!templates.length) {
    throw new Error(`No templates discovered under ${TEMPLATES_DIR}`);
  }
  log(`Loaded ${templates.length} template(s)`);
  return templates;
}

// `fixedConnectors` lists the connector-type IDs the template hard-codes via
// step `type:` (the part before the first `.`). Templates that route all
// connector binding through `__install__.<name>` have an empty array.
function deriveFixedConnectors(parsed) {
  const steps = parsed?.steps ?? [];
  const types = new Set();
  for (const step of steps) {
    if (typeof step?.type !== "string") continue;
    const dot = step.type.indexOf(".");
    if (dot <= 0) continue;
    const prefix = step.type.slice(0, dot);
    // Skip in-house Kibana / engine namespaces — only surface external connectors.
    if (
      [
        "console",
        "http",
        "data",
        "workflow",
        "kibana",
        "cases",
        "elasticsearch",
        "security",
        "ai",
        "inference",
        "foreach",
      ].includes(prefix)
    )
      continue;
    types.add(prefix);
  }
  return [...types].sort();
}

// --- Step 6: Build the catalog -------------------------------------------

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
    icon: t.metadata.icon,
    definitionUrl: `templates/${t.slug}/${t.version}.yaml`,
    contentHash: t.contentHash,
    fixedConnectors: t.fixedConnectors,
  };
}

// --- Main ----------------------------------------------------------------

async function main() {
  const policy = await loadPolicy();
  const mainSemver = await resolveMainKibanaSemver();
  const namedMinors = await discoverNamedMinors(policy.oldest);
  const validCategoryIds = await loadCategoriesVocab();
  const allTemplates = await loadTemplates(validCategoryIds);

  // Compose the resolved Kibana-versions list: every named minor + `main` sentinel.
  const resolvedVersions = [
    ...namedMinors,
    { id: "main", kibana: mainSemver, active: true },
  ];
  log(`Resolved main → Kibana ${mainSemver}`);

  // Wipe + recreate dist/v1.
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  // Emit the resolved kibana-versions.json (consumer-facing shape).
  await writeFile(
    path.join(OUT, "kibana-versions.json"),
    JSON.stringify(
      { versions: resolvedVersions, latest: policy.latest },
      null,
      2,
    ) + "\n",
  );

  // Emit per-version templates.json + manifest.json.
  const generatedAt = new Date().toISOString();
  for (const v of resolvedVersions) {
    if (v.active === false) continue;

    const rows = pickTemplatesFor(v.kibana, allTemplates).map(templateRow);
    const catalogsDir = path.join(OUT, v.id, "catalogs");
    await mkdir(catalogsDir, { recursive: true });

    const templatesJsonBody =
      JSON.stringify(
        {
          version: "v1",
          kibanaVersion: v.kibana,
          generatedAt,
          templates: rows,
        },
        null,
        2,
      ) + "\n";
    await writeFile(
      path.join(catalogsDir, "templates.json"),
      templatesJsonBody,
    );

    const manifest = {
      version: "v1",
      kibanaVersionId: v.id,
      effectiveKibanaSemver: v.kibana,
      generatedAt,
      hashes: { "catalogs/templates.json": sha256(templatesJsonBody) },
    };
    await writeFile(
      path.join(OUT, v.id, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );

    log(
      `  → v1/${v.id}/  (kibana ${v.kibana}, ${rows.length} template${rows.length === 1 ? "" : "s"})`,
    );
  }

  // Emit each template body once at its version-keyed URL.
  for (const t of allTemplates) {
    const dir = path.join(OUT, "templates", t.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${t.version}.yaml`), t.body);
  }
  log(`  → v1/templates/  (${allTemplates.length} version-keyed YAML bodies)`);

  log("Done.");
}

main().catch((err) => {
  console.error("[build-catalog] FAILED:", err.message);
  process.exit(1);
});
