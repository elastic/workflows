/**
 * The JSON-Schema validation layer — ported from Kibana's `validate_file.ts`.
 *
 * Parses the YAML, detects installable templates (by the `template-metadata`
 * root key), strips that block for templates, and validates the document/body
 * against the selected ajv variant. ajv's raw errors are de-noised and the
 * tolerant `anyOf`/`oneOf` template-value wrappers are pruned; positions whose
 * value is a LiquidJS expression are downgraded from errors to warnings.
 *
 * Unlike the Kibana CLI, the `template-metadata` block is detected + stripped
 * but not validated against a strict zod schema — the source repo's catalog
 * generator (scripts/build-catalog.mjs) already enforces its required fields.
 */

import { parseYamlToJSONWithoutValidation } from './yaml-parse.mjs';
import { isVariableValue, isDynamicValue, isLiquidTagValue } from './liquid/regex.mjs';
import { isErrorIssue } from './issues.mjs';

/** Root key that marks a file as an installable library template. */
export const METADATA_KEY = 'template-metadata';

/**
 * Even with the native discriminator anchoring each step to its own branch, a
 * single step can still yield a handful of intra-branch errors. Dedupe by
 * path+message and cap so the report stays readable.
 */
const MAX_SCHEMA_ISSUES = 20;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** ajv `instancePath` (e.g. `/steps/0/type`) -> dotted path (`steps.0.type`). */
const formatInstancePath = (instancePath) =>
  instancePath === '' ? '<root>' : instancePath.replace(/^\//, '').replace(/\//g, '.');

/** Undo JSON Pointer escaping (`~1` -> `/`, `~0` -> `~`) for one path segment. */
const decodePointerSegment = (segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~');

/** Resolve the value the parsed document holds at an ajv JSON-Pointer `instancePath`. */
const resolveInstanceValue = (target, instancePath) => {
  if (instancePath === '') {
    return target;
  }
  let value = target;
  for (const segment of instancePath.split('/').slice(1).map(decodePointerSegment)) {
    if (value == null || typeof value !== 'object') {
      return undefined;
    }
    value = value[segment];
  }
  return value;
};

/**
 * A value is a LiquidJS expression when it is a whole-value `{{ }}` / `${{ }}`,
 * or contains a `{% %}` tag — the exact predicates the runtime uses to suppress
 * schema errors.
 */
const isLiquidjsValue = (value) =>
  isVariableValue(value) || isDynamicValue(value) || isLiquidTagValue(value);

/**
 * Instance paths whose *own* value is a LiquidJS expression. Scalar-only: a
 * structural error anchored on a parent object resolves to an object, not a
 * template, so it stays a failing error.
 */
const collectLiquidPaths = (errors, target) => {
  const paths = new Set();
  for (const error of errors) {
    if (isLiquidjsValue(resolveInstanceValue(target, error.instancePath))) {
      paths.add(error.instancePath);
    }
  }
  return paths;
};

/** Turn an ajv error into a readable issue, special-casing discriminator/additionalProperties. */
const toIssue = (error) => {
  if (error.keyword === 'discriminator') {
    const { error: kind, tag = 'type', tagValue } = error.params ?? {};
    const base = formatInstancePath(error.instancePath);
    if (kind === 'mapping') {
      // The `type` value did not match any branch of the discriminated union.
      return {
        source: 'schema',
        message: `unknown step type "${tagValue}"`,
        path: base === '<root>' ? tag : `${base}.${tag}`,
      };
    }
    // Missing/non-string discriminator tag.
    return { source: 'schema', message: `must have a string "${tag}"`, path: base };
  }

  if (error.keyword === 'additionalProperties') {
    const extra = error.params?.additionalProperty;
    if (extra) {
      return {
        source: 'schema',
        message: `must NOT have additional property '${extra}'`,
        path: formatInstancePath(error.instancePath),
      };
    }
  }

  return {
    source: 'schema',
    message: error.message ?? 'Invalid value',
    path: formatInstancePath(error.instancePath),
  };
};

/** Keywords that pinpoint the real problem (as opposed to branch-selection noise). */
const SPECIFIC_KEYWORDS = new Set([
  'additionalProperties',
  'required',
  'const',
  'enum',
  'discriminator',
]);
/** The `anyOf`/`oneOf` wrappers only say "no branch matched" — never actionable alone. */
const isBranchWrapper = (error) => error.keyword === 'anyOf' || error.keyword === 'oneOf';
/** Noise from the Liquid-template-value alternative that shadows most fields. */
const isTemplateValueNoise = (error) =>
  error.keyword === 'pattern' || (error.keyword === 'type' && error.message === 'must be string');
/** Wrapper/template noise that is only meaningful when nothing deeper explains the failure. */
const isNoise = (error) => isBranchWrapper(error) || isTemplateValueNoise(error);

/**
 * Within a single location, a property is often `anyOf: [<real schema>, <template
 * value>]`, so a real violation is buried under "must be string" + "must match a
 * schema in anyOf". Group by location and, when a specific error exists there,
 * drop the branch/template noise for that location.
 */
const pruneBranchNoise = (errors) => {
  const byPath = new Map();
  for (const error of errors) {
    const group = byPath.get(error.instancePath);
    if (group) {
      group.push(error);
    } else {
      byPath.set(error.instancePath, [error]);
    }
  }

  const kept = [];
  for (const group of byPath.values()) {
    const specific = group.filter((error) => SPECIFIC_KEYWORDS.has(error.keyword));
    if (specific.length > 0) {
      kept.push(...specific);
      continue;
    }
    const meaningful = group.filter((error) => !isNoise(error));
    if (meaningful.length > 0) {
      kept.push(...meaningful);
      continue;
    }
    // Only wrapper/template noise here: keep one readable representative.
    const representative = group.find((error) => !isBranchWrapper(error)) ?? group[0];
    if (representative) {
      kept.push(representative);
    }
  }
  return kept;
};

/**
 * Drop a wrapper/template-noise error at a path that is a strict ancestor of a
 * kept error. When a deep step fails, the tolerant `steps`/`with` `anyOf`
 * wrappers also fire one level up; the deeper, specific error already explains it.
 */
const pruneAncestorNoise = (errors, extraAnchors = new Set()) => {
  const paths = [...errors.map((error) => error.instancePath), ...extraAnchors];
  const isStrictAncestorOfAny = (p) =>
    paths.some((other) => other !== p && other.startsWith(`${p}/`));
  return errors.filter((error) => !(isNoise(error) && isStrictAncestorOfAny(error.instancePath)));
};

/** Dedupe issues by path+message and cap the count for readability. */
const dedupeAndCap = (issues) => {
  const seen = new Set();
  const deduped = [];
  for (const issue of issues) {
    const key = `${issue.path ?? ''}|${issue.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(issue);
  }

  if (deduped.length <= MAX_SCHEMA_ISSUES) {
    return deduped;
  }
  const capped = deduped.slice(0, MAX_SCHEMA_ISSUES);
  capped.push({
    source: 'schema',
    message: `... and ${deduped.length - MAX_SCHEMA_ISSUES} more schema error(s)`,
  });
  return capped;
};

/** One non-failing warning per LiquidJS-valued path (collapses the oneOf/anyOf noise there). */
const toLiquidjsWarnings = (liquidPaths) =>
  [...liquidPaths].map((path) => ({
    source: 'liquidjs-expression',
    severity: 'warning',
    message: 'strict validation skipped (liquidjs expression)',
    path: formatInstancePath(path),
  }));

/**
 * Turn ajv's raw errors into readable, de-noised issues. Errors whose value is a
 * LiquidJS expression are reclassified as a single non-failing warning per path;
 * the rest are pruned of tolerant template-value noise, then mapped, deduped,
 * and capped as failing errors.
 */
const toSchemaIssues = (errors, target) => {
  const liquidPaths = collectLiquidPaths(errors, target);

  const realErrors = errors.filter((error) => !liquidPaths.has(error.instancePath));
  const denoised = pruneAncestorNoise(pruneBranchNoise(realErrors), liquidPaths);
  const errorIssues = dedupeAndCap(denoised.map(toIssue));

  return [...errorIssues, ...toLiquidjsWarnings(liquidPaths)];
};

/**
 * Run the JSON-Schema layer for one file.
 *
 * @param {Object} input
 * @param {string} input.yaml
 * @param {(variant: string, target: unknown) => ({errors: object[], overflowed: boolean}|Promise<...>)} input.validateSchema
 * @param {('auto'|'strict'|'template')} input.variantMode
 */
export const validateFile = async ({ yaml, validateSchema, variantMode }) => {
  const parsed = parseYamlToJSONWithoutValidation(yaml);
  const { document } = parsed;

  // `parseDocument` is error-tolerant: syntax errors land on `document.errors`
  // rather than throwing, so check both signals before trusting the JSON.
  const yamlErrors = document.errors ?? [];
  if (!parsed.success || yamlErrors.length > 0) {
    const issues = yamlErrors.length
      ? yamlErrors.map((error) => {
          const pos = error.linePos?.[0];
          return {
            source: 'yaml-syntax',
            message: error.message,
            line: pos?.line,
            column: pos?.col,
          };
        })
      : [
          {
            source: 'yaml-syntax',
            message: parsed.success ? 'Invalid YAML' : parsed.error.message,
          },
        ];

    return { isTemplate: false, variant: null, issues, schemaPassed: false, body: null, document };
  }

  const { json } = parsed;
  const isTemplate = isRecord(json) && METADATA_KEY in json;
  const variant = variantMode === 'auto' ? (isTemplate ? 'template' : 'strict') : variantMode;

  const issues = [];
  let body = isRecord(json) ? json : null;

  if (isTemplate && isRecord(json)) {
    // Strip the `template-metadata` block so the body validates against the
    // `template` variant. Strict metadata validation is intentionally left to
    // the catalog generator (scripts/build-catalog.mjs).
    const rest = { ...json };
    delete rest[METADATA_KEY];
    body = rest;
  }

  const target = isTemplate ? body : json;

  // Full-document validation. The artifact's step/trigger unions carry a
  // `discriminator`, so ajv validates each step only against its `type`'s branch.
  const { errors: schemaErrors, overflowed } = await validateSchema(variant, target);

  if (overflowed) {
    issues.push({
      source: 'schema',
      message: 'Schema validation could not complete (document too deeply nested for the schema)',
      path: '<root>',
    });
  } else if (schemaErrors.length > 0) {
    const schemaIssues = toSchemaIssues(schemaErrors, target);
    // Safety net: never drop a failure to zero issues.
    issues.push(
      ...(schemaIssues.length > 0
        ? schemaIssues
        : [{ source: 'schema', message: 'Invalid workflow', path: '<root>' }])
    );
  }

  return {
    isTemplate,
    variant,
    issues,
    // Warnings (e.g. skipped LiquidJS positions) do not gate the semantic layer.
    schemaPassed: !issues.some(isErrorIssue),
    body,
    document,
  };
};
