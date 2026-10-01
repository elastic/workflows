/**
 * LiquidJS value predicates — ported from Kibana's `@kbn/workflows-yaml`
 * `common/regex.ts`. Kept in lock-step with the runtime so the CLI, runtime, and
 * weaver share one notion of "this value is a dynamic/template expression".
 */

export const DYNAMIC_VALUE_REGEX = /^\$\{\{\s*\S[\s\S]*\}\}$/;

/**
 * Whole-value dynamic/templated value: `${{ ... }}`.
 * Examples: `${{env.USER}}`, `${{ref:myVar}}`, `${{someVariable}}`.
 */
export function isDynamicValue(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return DYNAMIC_VALUE_REGEX.test(value);
}

export const VARIABLE_VALUE_REGEX = /^\{\{\s*\S[\s\S]*\}\}$/;

/**
 * Whole-value variable expression: `{{ ... }}`.
 * Examples: `{{ variable }}`, `{{ variable | filter }}`.
 */
export function isVariableValue(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return VARIABLE_VALUE_REGEX.test(value);
}

// Matches Liquid tags: `{% ... %}` or `{%- ... -%}`. The `s` flag lets `.`
// match newlines so multi-line tag blocks are matched too.
export const LIQUID_TAG_VALUE_REGEX = /\{%-?\s*[^%]*?\s*-?%\}/s;

/**
 * Contains a Liquid tag: `{% ... %}` / `{%- ... -%}` (single- or multi-line).
 */
export function isLiquidTagValue(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return LIQUID_TAG_VALUE_REGEX.test(value);
}
