# Workflow YAML validator

Validates workflow YAML (a single file or folders of files) against the
generated workflow step JSON Schema, layering step-name uniqueness and LiquidJS
syntax checks on top. It is the plain-JS (ESM) port of Kibana's
`@kbn/workflow-yaml-validate-cli` ([elastic/kibana#281827](https://github.com/elastic/kibana/pull/281827)),
trimmed for this repo.

## Usage

```bash
node scripts/validate-workflows.mjs <file-or-dir...> [flags]

# validate both trees against a local schema bundle
node scripts/validate-workflows.mjs examples library/workflows --recursive \
  --schema /path/to/workflow_step_schemas/9.6.0/release

# or against a CDN base URL (equivalently: WORKFLOWS_SCHEMA_CDN_URL env var)
node scripts/validate-workflows.mjs examples library/workflows -r \
  --schema-cdn-url https://<cdn-base>/
```

The npm scripts `npm run validate` (bare) and `npm run validate:all`
(`examples library/workflows --recursive`) wrap this entry point.

| Flag | Description | Default |
| --- | --- | --- |
| `--recursive`, `-r` | Descend into subdirectories | off (top-level only) |
| `--summary-only` | Suppress per-file streaming; print only failures + the summary | off |
| `--variant <mode>` | Force a schema variant: `strict` or `template` | `auto` (per file) |
| `--schema <path\|url>` | Explicit schema source: a bundle directory or an `http(s)://` base URL | — |
| `--schema-cdn-url <url>` | CDN base URL fallback (or set `WORKFLOWS_SCHEMA_CDN_URL`) | — |
| `--json <path>` | Write a structured JSON report to this path | — |

## Schema source resolution

The schema bundle (the directory/URL containing `index.json`) is resolved from,
in order: `--schema`, then `--schema-cdn-url` / `WORKFLOWS_SCHEMA_CDN_URL`. There
is no built-in default and no local `target/` lookup (this repo has no Kibana
build tree). Each variant's `schema.json` is integrity-checked against the
`sha256` recorded in `index.json` before use.

## What it checks

Three layers run per file:

1. **JSON Schema** — the document is validated with `ajv` (draft-07) against the
   `strict` or `template` variant. Plain workflows (`examples/`) use `strict`;
   templates (files with a `template-metadata` block) have that block stripped
   and the remaining body validated against `template`. The step/trigger unions
   carry a `discriminator`, so each step is validated only against its `type`'s
   branch — precise errors, no cross-branch explosion. Constraints on values
   that hold a whole-value LiquidJS expression (`{{ … }}`, `${{ … }}`, or a
   `{% … %}` tag) are downgraded to non-failing warnings.
2. **Step-name uniqueness** — duplicate step names (including nested steps) are
   reported. Runs only when the schema layer passed for that file.
3. **LiquidJS syntax** — every `{{ }}` / `{% %}` scalar is parsed with the real
   LiquidJS engine. Runs unconditionally. Scope is syntax only.

The process exits non-zero if any file has an error-severity issue. Warnings
alone do not fail the run. An empty target logs a warning and exits 0.

## Intentional differences from the Kibana CLI

- **No DAG check.** Execution-graph (cycle) validation depends on Kibana's
  ~1355-line execution-graph builder + its zod spec schema + `@dagrejs/dagre`,
  which would drag a large, fast-churning slice of Kibana into this repo. The
  hook is documented in `validate-semantics.mjs`.
- **No strict metadata schema.** `template-metadata` is detected and stripped,
  but not validated against a zod schema — `scripts/build-catalog.mjs` already
  enforces its required fields.
