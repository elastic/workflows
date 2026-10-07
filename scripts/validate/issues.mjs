/**
 * Issue/outcome shapes shared across the validation layers — ported from
 * Kibana's `types.ts` (types stripped for plain JS; kept as JSDoc for clarity).
 *
 * An issue's `source` is one of:
 *   'yaml-syntax' | 'schema' | 'metadata' | 'step-name' | 'graph' |
 *   'liquid' | 'liquidjs-expression'
 *
 * `liquidjs-expression` is distinct from `liquid`: the latter is a LiquidJS
 * *syntax* error, while the former marks a schema constraint intentionally
 * skipped because the value is a whole-value LiquidJS expression.
 *
 * `severity` is 'error' | 'warning'; an absent severity is treated as an error.
 *
 * @typedef {Object} ValidationIssue
 * @property {string} source
 * @property {string} message
 * @property {('error'|'warning')} [severity]
 * @property {string} [path]   Dotted instance path (schema/metadata/step-name/graph).
 * @property {number} [line]   1-based source line (liquid issues).
 * @property {number} [column] 1-based source column (liquid issues).
 *
 * @typedef {Object} ValidationOutcome
 * @property {string} file
 * @property {boolean} ok  True when there are no error-severity issues.
 * @property {boolean} isTemplate
 * @property {(string|null)} variant
 * @property {ValidationIssue[]} issues
 */

/** An issue fails the run unless it is explicitly a warning. */
export const isErrorIssue = (issue) => issue.severity !== 'warning';
