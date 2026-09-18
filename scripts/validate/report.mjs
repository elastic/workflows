/**
 * Human-readable + JSON reporting — ported from Kibana's `report.ts`, with the
 * ToolingLog replaced by a small console logger.
 */

import fs from 'node:fs';
import path from 'node:path';
import { isErrorIssue } from './issues.mjs';

/** Display labels for issue sources whose token differs from what we print. */
const SOURCE_LABELS = {
  'liquidjs-expression': 'liquidjs exp',
};

const sourceLabel = (source) => SOURCE_LABELS[source] ?? source;

const countWarnings = (outcomes) =>
  outcomes.reduce(
    (total, outcome) => total + outcome.issues.filter((issue) => !isErrorIssue(issue)).length,
    0
  );

const pluralize = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

const relativize = (file) => {
  const rel = path.relative(process.cwd(), file);
  return rel === '' || rel.startsWith('..') ? file : rel;
};

const formatIssue = (issue) => {
  if (issue.source === 'liquid') {
    const location = issue.line != null ? `${issue.line}:${issue.column ?? 1}` : '';
    return `[liquid] ${location ? `${location} ` : ''}${issue.message}`;
  }
  const location = issue.path ? `${issue.path}: ` : '';
  return `[${sourceLabel(issue.source)}] ${location}${issue.message}`;
};

/** Print one issue, routing warnings to warn and errors to error. */
const printIssue = (log, issue) => {
  const line = `        ${formatIssue(issue)}`;
  if (isErrorIssue(issue)) {
    log.error(line);
  } else {
    log.warning(line);
  }
};

/** Print a single file's human-readable result (streamed as validation progresses). */
export const printFileResult = (log, outcome) => {
  const label = relativize(outcome.file);
  if (outcome.ok) {
    const warnings = outcome.issues.filter((issue) => !isErrorIssue(issue));
    if (warnings.length === 0) {
      log.success(`PASS  ${label}`);
      return;
    }
    log.warning(`PASS  ${label} (${pluralize(warnings.length, 'warning')})`);
    for (const issue of warnings) {
      printIssue(log, issue);
    }
    return;
  }
  log.error(`FAIL  ${label}`);
  for (const issue of outcome.issues) {
    printIssue(log, issue);
  }
};

/** Print the closing summary line for a completed run. */
export const printSummary = (log, outcomes) => {
  const passed = outcomes.filter((outcome) => outcome.ok).length;
  const failed = outcomes.length - passed;
  const warnings = countWarnings(outcomes);
  const warningNote = warnings > 0 ? ` (${pluralize(warnings, 'warning')})` : '';
  const summary = `Validated ${outcomes.length} file(s): ${passed} passed, ${failed} failed${warningNote}.`;
  if (failed > 0) {
    log.error(summary);
  } else if (warnings > 0) {
    log.warning(summary);
  } else {
    log.success(summary);
  }
};

export const buildJsonReport = (source, outcomes) => {
  const passed = outcomes.filter((outcome) => outcome.ok).length;
  const issues = outcomes.reduce((total, outcome) => total + outcome.issues.length, 0);
  return {
    summary: {
      total: outcomes.length,
      passed,
      failed: outcomes.length - passed,
      warnings: countWarnings(outcomes),
      issues,
    },
    source,
    files: outcomes,
  };
};

/** Write the structured JSON report to disk, creating parent dirs as needed. */
export const writeJsonReport = (outputPath, source, outcomes) => {
  const absolute = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(buildJsonReport(source, outcomes), null, 2)}\n`);
};
