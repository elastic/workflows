#!/usr/bin/env node
/**
 * validation-report.mjs — Builds the PR comment for failing schema validation.
 *
 * Reads the JSON reports written by `validate-workflows.mjs --json` for each
 * schema (one `validation-<name>/` folder per schema under <reports-dir>, as
 * laid out by actions/download-artifact) and writes a markdown report to
 * <output-file> with one table per schema that has failing files. When no
 * schema has any, nothing is written.
 *
 * Usage:
 *   node scripts/validation-report.mjs <reports-dir> <output-file>
 */

import fs from 'node:fs';
import path from 'node:path';

const UNKNOWN_STEP_TYPE = /unknown step type "([^"]+)"/;
const SCHEMA_VERSION = /\/v1\/([^/]+)\/release/;

const isError = (issue) => issue.severity !== 'warning';

const MAX_ROWS = 100;
const MAX_CELL_LENGTH = 300;

/**
 * The reports come from PR runs, so file names and messages are untrusted:
 * render them as code spans, which keeps markdown and @mentions inert.
 */
const code = (text) =>
  `\`${text
    .replace(/`/g, "'")
    .replace(/\s*\n\s*/g, ' ')
    .slice(0, MAX_CELL_LENGTH)
    .replace(/\|/g, '\\|')}\``;

/** Failing outcomes and schema source of one schema's reports; null without reports. */
const loadSchemaReports = (reportsDir, name) => {
  const dir = path.join(reportsDir, `validation-${name}`);
  if (!fs.existsSync(dir)) {
    return null;
  }
  const reports = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
  return {
    source: reports[0]?.source ?? '',
    failed: reports.flatMap((report) => report.files).filter((outcome) => !outcome.ok),
  };
};

const toRow = (outcome) => {
  const file = path.relative(process.cwd(), outcome.file) || outcome.file;
  const errors = outcome.issues.filter(isError);
  const unknownTypes = [
    ...new Set(errors.map((issue) => issue.message.match(UNKNOWN_STEP_TYPE)?.[1]).filter(Boolean)),
  ];
  const others = errors
    .filter((issue) => !UNKNOWN_STEP_TYPE.test(issue.message))
    .map((issue) => `${issue.path ? `${issue.path}: ` : ''}${issue.message}`);
  const cell = [unknownTypes.map(code).join(', '), ...others.map(code)]
    .filter(Boolean)
    .join('<br>');
  return `| ${code(file)} | ${cell} |`;
};

const toSection = (heading, failed) =>
  [
    `${heading} the following errors have been found:`,
    '',
    '| File | Unknown step type(s) |',
    '| --- | --- |',
    ...[...failed]
      .sort((a, b) => a.file.localeCompare(b.file))
      .slice(0, MAX_ROWS)
      .map(toRow),
    ...(failed.length > MAX_ROWS ? ['', `…and ${failed.length - MAX_ROWS} more file(s).`] : []),
  ].join('\n');

const main = () => {
  const [reportsDir, outputFile] = process.argv.slice(2);
  if (!reportsDir || !outputFile) {
    throw new Error('Usage: validation-report.mjs <reports-dir> <output-file>');
  }

  const release = loadSchemaReports(reportsDir, 'release');
  const serverless = loadSchemaReports(reportsDir, 'serverless');
  const version = release?.source.match(SCHEMA_VERSION)?.[1];
  const sections = [
    release?.failed.length &&
      toSection(version ? `On release ${version}` : 'On release', release.failed),
    serverless?.failed.length && toSection('For serverless deployments', serverless.failed),
  ].filter(Boolean);
  if (sections.length === 0) {
    console.log('No validation errors; no report written.');
    return;
  }

  fs.writeFileSync(outputFile, `${sections.join('\n\n')}\n`);
  console.log(`Wrote validation report to ${outputFile}`);
};

main();
