#!/usr/bin/env node
/**
 * validate-workflows.mjs — Workflow YAML validator.
 *
 * Validates workflow YAML (files or folders) against the generated workflow
 * step JSON Schema artifact, then layers step-name uniqueness and LiquidJS
 * syntax checks. JSON-schema constraints on values that hold a LiquidJS
 * expression are downgraded to non-failing warnings.
 *
 * This is the plain-JS port of Kibana's `@kbn/workflow-yaml-validate-cli`
 * (elastic/kibana#281827), trimmed for this repo: no strict zod metadata
 * validation and no DAG check (see scripts/validate/README.md).
 *
 * Usage:
 *   node scripts/validate-workflows.mjs <file-or-dir...> [flags]
 *
 * Flags:
 *   --recursive, -r          Descend into subdirectories (default: top-level only)
 *   --summary-only           Suppress per-file streaming; print only failures + summary
 *   --variant <mode>         Schema variant: auto | strict | template (default: auto)
 *   --schema <path|url>      Explicit schema source: a bundle directory or http(s):// base URL
 *   --schema-cdn-url <url>   CDN base URL fallback (or set WORKFLOWS_SCHEMA_CDN_URL)
 *   --json <path>            Write a structured JSON report to this path
 */

import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { discoverFiles } from './validate/discover-files.mjs';
import { loadSchemaDocuments } from './validate/load-schema.mjs';
import { createSchemaValidator } from './validate/validate-schema.mjs';
import { validateWorkflowYaml } from './validate/index.mjs';
import { printFileResult, printSummary, writeJsonReport } from './validate/report.mjs';
import { VARIANTS } from './validate/variants.mjs';

// Minimal console logger mirroring the ToolingLog surface the report uses.
const log = {
  info: (...args) => console.log('[validate]', ...args),
  success: (...args) => console.log(...args),
  warning: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

const VARIANT_MODES = ['auto', ...VARIANTS];

const parseVariantMode = (value) => {
  const variant = value && value.length > 0 ? value : 'auto';
  if (!VARIANT_MODES.includes(variant)) {
    throw new Error(
      `Invalid --variant "${variant}". Expected one of: ${VARIANT_MODES.join(', ')}.`
    );
  }
  return variant;
};

const emptyToUndefined = (value) =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      recursive: { type: 'boolean', short: 'r', default: false },
      'summary-only': { type: 'boolean', default: false },
      variant: { type: 'string' },
      schema: { type: 'string' },
      'schema-cdn-url': { type: 'string' },
      json: { type: 'string' },
    },
  });

  const targets = positionals.length > 0 ? positionals : ['.'];
  const recursive = Boolean(values.recursive);
  const summaryOnly = Boolean(values['summary-only']);
  const variantMode = parseVariantMode(values.variant);
  const schema = emptyToUndefined(values.schema);
  const cdnUrl =
    emptyToUndefined(values['schema-cdn-url']) ??
    emptyToUndefined(process.env.WORKFLOWS_SCHEMA_CDN_URL);
  const jsonOutput = emptyToUndefined(values.json);

  // Discover files across every target, de-duped and sorted for determinism.
  const files = [
    ...new Set(targets.flatMap((target) => discoverFiles(target, { recursive }))),
  ].sort();
  if (files.length === 0) {
    log.warning(`No workflow YAML files found in ${targets.join(', ')}. Nothing to validate.`);
    return;
  }

  const { schemas, source } = await loadSchemaDocuments({ schema, cdnUrl });
  log.info(`Validating ${files.length} file(s) against schema from ${source}`);

  // The workflow schema is deeply recursive, so compile + validate in a worker
  // thread with an enlarged stack (see validate-schema.mjs).
  const { validateSchema, close } = createSchemaValidator(schemas);
  const outcomes = [];

  try {
    // Stream each file's result as it completes.
    for (const file of files) {
      const yaml = await fs.promises.readFile(file, 'utf8');
      const outcome = await validateWorkflowYaml({ file, yaml, validateSchema, variantMode });
      outcomes.push(outcome);
      if (!summaryOnly) {
        printFileResult(log, outcome);
      }
    }
  } finally {
    await close();
  }

  if (summaryOnly) {
    // Surface failures and pass-with-warnings files so skipped LiquidJS
    // positions are not silently hidden in summary-only mode.
    for (const outcome of outcomes) {
      if (!outcome.ok || outcome.issues.length > 0) {
        printFileResult(log, outcome);
      }
    }
  }
  printSummary(log, outcomes);

  if (jsonOutput) {
    writeJsonReport(jsonOutput, source, outcomes);
    log.info(`Wrote JSON report to ${jsonOutput}`);
  }

  if (outcomes.some((outcome) => !outcome.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  log.error(`[validate] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
