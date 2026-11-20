/**
 * The semantic validation layer. Runs on a schema-validated body, so it should
 * only be invoked when the JSON-Schema layer passed. Never throws.
 *
 * Currently performs step-name uniqueness (ported from Kibana's
 * `@kbn/workflows` `validateStepNameUniqueness`).
 *
 * DAG (execution-graph cycle) validation is intentionally NOT ported here. In
 * Kibana it depends on `WorkflowGraph` -> `convertToWorkflowGraph` (a ~1355-line
 * execution-graph builder tightly coupled to the zod workflow spec schema) plus
 * `@dagrejs/dagre`; vendoring it would drag in a large slice of Kibana that
 * churns as step types evolve. To add it later, build the graph from `body` and
 * force cycle detection (topological sort), then push a `{ source: 'graph' }`
 * issue on failure — see the `validateSemantics` return site below.
 */

// --- Step-name uniqueness (ported from validate_step_names.ts) -----------

/** Extracts the fallback steps array from an on-failure block, if present. */
function getOnFailureFallbackSteps(obj) {
  const fallback = obj?.['on-failure']?.fallback;
  return Array.isArray(fallback) ? fallback : undefined;
}

/** Collects step names from nested structures (steps/else/branches/on-failure). */
function collectNestedStepNames(step) {
  const stepNames = [];
  const s = step ?? {};

  if (Array.isArray(s.steps)) {
    stepNames.push(...collectAllStepNames(s.steps));
  }
  if (Array.isArray(s.else)) {
    stepNames.push(...collectAllStepNames(s.else));
  }
  if (Array.isArray(s.branches)) {
    for (const branch of s.branches) {
      if (Array.isArray(branch?.steps)) {
        stepNames.push(...collectAllStepNames(branch.steps));
      }
    }
  }

  const fallbackSteps = getOnFailureFallbackSteps(s);
  if (fallbackSteps) {
    stepNames.push(...collectAllStepNames(fallbackSteps));
  }

  return stepNames;
}

/** Collects all step names from a workflow definition recursively. */
function collectAllStepNames(steps) {
  const stepNames = [];
  if (!Array.isArray(steps)) {
    return stepNames;
  }
  for (const step of steps) {
    if (step?.name) {
      stepNames.push(step.name);
    }
    stepNames.push(...collectNestedStepNames(step));
  }
  return stepNames;
}

/** Validates that all step names in a workflow are unique. */
export function validateStepNameUniqueness(workflow) {
  const stepNames = collectAllStepNames(workflow?.steps);

  const workflowLevelFallback = getOnFailureFallbackSteps(workflow?.settings);
  if (workflowLevelFallback) {
    stepNames.push(...collectAllStepNames(workflowLevelFallback));
  }

  const stepNameCounts = new Map();
  const errors = [];

  for (const stepName of stepNames) {
    stepNameCounts.set(stepName, (stepNameCounts.get(stepName) || 0) + 1);
  }

  for (const [stepName, count] of stepNameCounts) {
    if (count > 1) {
      errors.push({
        stepName,
        occurrences: count,
        message: `Step name "${stepName}" is not unique. Found ${count} steps with this name.`,
      });
    }
  }

  return { isValid: errors.length === 0, errors };
}

// --- Semantic layer entry point ------------------------------------------

export const validateSemantics = (body) => {
  const issues = [];

  try {
    const { errors } = validateStepNameUniqueness(body);
    for (const error of errors) {
      issues.push({ source: 'step-name', message: error.message, path: `steps.${error.stepName}` });
    }
  } catch (error) {
    issues.push({
      source: 'step-name',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // DAG cycle detection would slot in here (see file header).

  return issues;
};
