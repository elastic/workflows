/**
 * pickObjectFields — returns a new object containing only the given dotted-path
 * fields from `source`, preserving the original nested structure and value types.
 *
 * Ported from Kibana's `@kbn/workflows` `pickObjectFields`. Only used by the
 * `pick` Liquid filter (see engine.mjs); template validation parses but never
 * renders, so this never actually runs — it exists so the filter is registered.
 */

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// A segment addresses an array element when it is a run of digits (e.g. `9`).
const isArrayIndex = (segment) => /^\d+$/.test(segment);

// Keys that would let a crafted path walk into the prototype chain.
const UNSAFE_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

const getChild = (container, key) =>
  Array.isArray(container) ? container[Number(key)] : container[key];

const setChild = (container, key, value) => {
  if (Array.isArray(container)) {
    container[Number(key)] = value;
  } else {
    container[key] = value;
  }
};

// Deep clone limited to JSON-serializable values.
const cloneValue = (value) => {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }
  const clone = {};
  for (const [key, val] of Object.entries(value)) {
    clone[key] = cloneValue(val);
  }
  return clone;
};

const copyPath = (source, result, path) => {
  if (path.length === 0) {
    return;
  }

  const segments = path.split('.');
  if (segments.some((segment) => UNSAFE_SEGMENTS.has(segment))) {
    return;
  }

  let cursor = source;
  for (const segment of segments) {
    if (isPlainObject(cursor) && Object.prototype.hasOwnProperty.call(cursor, segment)) {
      cursor = cursor[segment];
    } else if (
      Array.isArray(cursor) &&
      isArrayIndex(segment) &&
      Object.prototype.hasOwnProperty.call(cursor, segment)
    ) {
      cursor = cursor[Number(segment)];
    } else {
      return;
    }
  }

  if (cursor === undefined) {
    return;
  }

  let target = result;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const childShouldBeArray = isArrayIndex(segments[i + 1]);
    const existing = getChild(target, segment);
    const existingIsRightType = childShouldBeArray
      ? Array.isArray(existing)
      : isPlainObject(existing);
    if (!existingIsRightType) {
      setChild(target, segment, childShouldBeArray ? [] : {});
    }
    target = getChild(target, segment);
  }
  setChild(target, segments[segments.length - 1], cloneValue(cursor));
};

export const pickObjectFields = (source, paths) => {
  if (!isPlainObject(source)) {
    return source;
  }

  const result = {};
  for (const path of paths) {
    if (typeof path === 'string') {
      copyPath(source, result, path);
    }
  }

  return result;
};
