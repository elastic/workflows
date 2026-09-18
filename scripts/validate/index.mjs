/**
 * Per-file orchestration — ported from Kibana's `validate.ts`.
 *
 * Runs the three validation layers for one file and merges their issues:
 *   1. JSON Schema (+ template detection/strip) — always.
 *   2. Semantic (step-name uniqueness) — only when the schema layer passed.
 *   3. LiquidJS syntax — always.
 */

import { validateFile } from './validate-file.mjs';
import { validateSemantics } from './validate-semantics.mjs';
import { validateLiquid } from './validate-liquid.mjs';
import { isErrorIssue } from './issues.mjs';

export const validateWorkflowYaml = async ({ file, yaml, validateSchema, variantMode }) => {
  const schemaResult = await validateFile({ yaml, validateSchema, variantMode });
  const issues = [...schemaResult.issues];

  if (schemaResult.schemaPassed && schemaResult.body) {
    issues.push(...validateSemantics(schemaResult.body));
  }

  issues.push(...validateLiquid(yaml, schemaResult.document));

  return {
    file,
    // Warnings (e.g. skipped LiquidJS positions) never fail the run.
    ok: !issues.some(isErrorIssue),
    isTemplate: schemaResult.isTemplate,
    variant: schemaResult.variant,
    issues,
  };
};
