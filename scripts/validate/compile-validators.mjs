/**
 * ajv compilation of the schema variants — ported from Kibana's
 * `compile_validators.ts`. Relies on ajv's native `discriminator` support so a
 * step is validated only against its `type`'s branch (precise errors, no
 * cross-branch explosion).
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { VARIANTS } from './variants.mjs';

/** ajv options for the full-document validator. */
export const AJV_OPTIONS = {
  // The artifact is already generated as valid draft-07, so skip meta-schema
  // self-validation (also avoids runtime meta-schema codegen).
  validateSchema: false,
  // The workflow schema is deeply recursive (nested steps); inlining recursive
  // refs blows the call stack on real workflows.
  inlineRefs: false,
  // With the discriminator anchoring each step to its branch, we can safely
  // collect all real issues at once.
  allErrors: true,
  // Enable native `discriminator` support (the artifact's step/trigger unions).
  discriminator: true,
  strict: false,
};

/**
 * Compile a variant document into a validator. A fresh Ajv per variant keeps
 * their (identically-named) internal refs isolated.
 */
export const compileVariant = (doc, variant) => {
  const ajv = new Ajv(AJV_OPTIONS);
  addFormats(ajv);
  try {
    return { validate: ajv.compile(doc) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to compile the "${variant}" workflow schema. The artifact may be stale or ` +
        `predate native discriminator support. Underlying ajv error: ${message}`
    );
  }
};

/** Compile both schema variants into ajv validators. */
export const compileValidators = (schemas) => {
  const validators = {};
  for (const variant of VARIANTS) {
    validators[variant] = compileVariant(schemas[variant], variant);
  }
  return validators;
};
