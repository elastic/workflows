/**
 * LiquidJS engine configured for workflow templates — ported from Kibana's
 * `@kbn/workflows` `createWorkflowLiquidEngine`. Restricts tags to the supported
 * set and registers the custom filters so `engine.parse()` does not throw on
 * known filter/tag names during syntax validation.
 */

import { Liquid } from 'liquidjs';
import { pickObjectFields } from './pick-object-fields.mjs';

/**
 * LiquidJS tags supported in workflow templates. Tags not in this set are
 * removed from the engine, so LiquidJS treats them as unknown (parse error).
 */
export const LIQUID_ALLOWED_TAGS = new Set([
  'assign',
  'for',
  'capture',
  'case',
  'comment',
  'decrement',
  'increment',
  'cycle',
  'if',
  'unless',
  'break',
  'continue',
  'raw',
  'echo',
  'liquid',
  '#',
]);

// A no-op filesystem: workflow templates do not support file operations.
const noopFs = {
  exists: async () => false,
  existsSync: () => false,
  readFile: async (filepath) => {
    throw new Error(
      `File reading is not supported in workflow templates. Attempted to read: ${filepath}`
    );
  },
  readFileSync: (filepath) => {
    throw new Error(
      `File reading is not supported in workflow templates. Attempted to read: ${filepath}`
    );
  },
  resolve: (_dir, file) => file,
  contains: async () => false,
};

const removeDisallowedLiquidTags = (engine) => {
  for (const tagName of Object.keys(engine.tags)) {
    if (!LIQUID_ALLOWED_TAGS.has(tagName)) {
      delete engine.tags[tagName];
    }
  }
};

/**
 * Registers the custom filters required by workflow templates. Registering them
 * centrally keeps every engine instance in step with the runtime.
 */
export const registerWorkflowLiquidFilters = (engine) => {
  engine.registerFilter('json_parse', (value) => {
    if (typeof value !== 'string') {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  });

  engine.registerFilter('entries', (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return value;
    }
    return Object.entries(value).map(([k, v]) => ({ key: k, value: v }));
  });

  engine.registerFilter('pick', (value, ...args) => {
    const paths = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    return pickObjectFields(
      value,
      paths.filter((path) => typeof path === 'string')
    );
  });
};

/**
 * Creates a LiquidJS engine configured for workflow templates. Extra options
 * (e.g. `strictFilters`) are merged with the enforced defaults.
 */
export const createWorkflowLiquidEngine = (options) => {
  const { parseLimit = 150_000, renderLimit = 1_000, memoryLimit = 15_000_000 } = options ?? {};

  const engine = new Liquid({
    ...options,
    ownPropertyOnly: true,
    fs: noopFs,
    relativeReference: false,
    templates: {},
    parseLimit,
    renderLimit,
    memoryLimit,
  });
  removeDisallowedLiquidTags(engine);
  registerWorkflowLiquidFilters(engine);
  return engine;
};

let liquidInstance = null;

/**
 * Returns the shared workflow Liquid engine instance (lazy-initialized).
 * Registers stub filters so `parse()` does not throw on known filter names.
 */
export function getLiquidInstance() {
  if (!liquidInstance) {
    liquidInstance = createWorkflowLiquidEngine({
      strictFilters: true,
      strictVariables: false,
    });
  }
  return liquidInstance;
}

const MAX_PARSE_CACHE_SIZE = 64;
const parseCache = new Map();

/**
 * Parses a Liquid template string with a bounded LRU cache.
 */
export function parseTemplateString(templateString) {
  const cached = parseCache.get(templateString);
  if (cached) {
    parseCache.delete(templateString);
    parseCache.set(templateString, cached);
    return cached;
  }
  const result = getLiquidInstance().parse(templateString);
  parseCache.set(templateString, result);
  if (parseCache.size > MAX_PARSE_CACHE_SIZE) {
    const firstKey = parseCache.keys().next().value;
    if (firstKey !== undefined) {
      parseCache.delete(firstKey);
    }
  }
  return result;
}
