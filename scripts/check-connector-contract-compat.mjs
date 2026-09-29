import { readFile } from 'node:fs/promises';
import path from 'node:path';

const compareVersions = (left, right) => {
  const [leftMajor, leftMinor] = left.split('.').map(Number);
  const [rightMajor, rightMinor] = right.split('.').map(Number);
  return leftMajor - rightMajor || leftMinor - rightMinor;
};

const violation = (fieldPath, rule, message) => ({ path: fieldPath, rule, message });

export const diffAdditiveSchema = (previous, next, fieldPath) => {
  const violations = [];
  if (previous == null || next == null) {
    if (previous != null && next == null) {
      violations.push(violation(fieldPath, 'removed-property', `${fieldPath} was removed`));
    }
    return violations;
  }
  if (previous.type !== next.type) {
    violations.push(
      violation(
        fieldPath,
        'type',
        `${fieldPath}: type changed from ${previous.type} to ${next.type}`
      )
    );
  }
  if (previous.format !== undefined && previous.format !== next.format) {
    violations.push(
      violation(
        fieldPath,
        'format',
        `${fieldPath}: format changed from ${previous.format} to ${next.format}`
      )
    );
  }
  if (previous.items?.type !== undefined && next.items?.type !== undefined) {
    if (previous.items.type !== next.items.type) {
      violations.push(
        violation(
          `${fieldPath}.items`,
          'type',
          `${fieldPath}.items: type changed from ${previous.items.type} to ${next.items.type}`
        )
      );
    }
  }
  if (Array.isArray(previous.enum) && Array.isArray(next.enum)) {
    const missing = previous.enum.filter(
      (value) => !next.enum.some((candidate) => Object.is(candidate, value))
    );
    if (missing.length > 0) {
      violations.push(
        violation(fieldPath, 'enum', `${fieldPath}: enum removed values ${missing.join(', ')}`)
      );
    }
  }
  if (
    previous.minimum !== undefined &&
    next.minimum !== undefined &&
    next.minimum > previous.minimum
  ) {
    violations.push(
      violation(
        fieldPath,
        'minimum',
        `${fieldPath}: minimum raised from ${previous.minimum} to ${next.minimum}`
      )
    );
  }
  if (
    previous.maximum !== undefined &&
    next.maximum !== undefined &&
    next.maximum < previous.maximum
  ) {
    violations.push(
      violation(
        fieldPath,
        'maximum',
        `${fieldPath}: maximum lowered from ${previous.maximum} to ${next.maximum}`
      )
    );
  }
  if (
    previous.minLength !== undefined &&
    next.minLength !== undefined &&
    next.minLength > previous.minLength
  ) {
    violations.push(
      violation(
        fieldPath,
        'minLength',
        `${fieldPath}: minLength raised from ${previous.minLength} to ${next.minLength}`
      )
    );
  }
  if (
    previous.maxLength !== undefined &&
    next.maxLength !== undefined &&
    next.maxLength < previous.maxLength
  ) {
    violations.push(
      violation(
        fieldPath,
        'maxLength',
        `${fieldPath}: maxLength lowered from ${previous.maxLength} to ${next.maxLength}`
      )
    );
  }
  if (previous.additionalProperties === true && next.additionalProperties === false) {
    violations.push(
      violation(
        fieldPath,
        'additionalProperties',
        `${fieldPath}: additionalProperties changed from true to false`
      )
    );
  }

  const previousRequired = new Set(previous.required ?? []);
  for (const name of next.required ?? []) {
    if (previousRequired.has(name)) {
      continue;
    }
    if (next.properties?.[name]?.default === undefined) {
      violations.push(
        violation(
          `${fieldPath}.required`,
          'required',
          `${fieldPath}: required property ${name} was added without a default`
        )
      );
    }
  }

  for (const [name, property] of Object.entries(previous.properties ?? {})) {
    const nextProperty = next.properties?.[name];
    if (!nextProperty) {
      violations.push(
        violation(
          `${fieldPath}.properties.${name}`,
          'removed-property',
          `${fieldPath}.properties.${name} was removed`
        )
      );
      continue;
    }
    violations.push(
      ...diffAdditiveSchema(property, nextProperty, `${fieldPath}.properties.${name}`)
    );
  }
  if (previous.items && next.items) {
    violations.push(...diffAdditiveSchema(previous.items, next.items, `${fieldPath}.items`));
  }
  return violations;
};

export const listAuthTypeIds = (auth) => {
  if (!auth || typeof auth !== 'object') {
    return [];
  }
  if (typeof auth.type === 'string') {
    return [auth.type];
  }
  if (!Array.isArray(auth.types)) {
    return [];
  }
  return auth.types
    .map((entry) => (typeof entry === 'string' ? entry : entry?.type))
    .filter((value) => typeof value === 'string');
};

export const assertAdditiveMinor = (previous, next) => {
  const violations = [...diffAdditiveSchema(previous.parsed.config, next.parsed.config, 'config')];
  const previousActions = previous.parsed.actions ?? {};
  const nextActions = next.parsed.actions ?? {};
  for (const name of Object.keys(previousActions)) {
    if (!(name in nextActions)) {
      violations.push(
        violation(`actions.${name}`, 'removed-action', `actions.${name} was removed`)
      );
      continue;
    }
    violations.push(
      ...diffAdditiveSchema(
        previousActions[name].input,
        nextActions[name].input,
        `actions.${name}.input`
      )
    );
  }
  const previousAuth = new Set(listAuthTypeIds(previous.parsed.auth));
  const nextAuth = new Set(listAuthTypeIds(next.parsed.auth));
  for (const authType of previousAuth) {
    if (!nextAuth.has(authType)) {
      violations.push(violation('auth', 'removed-auth', `auth type ${authType} was removed`));
    }
  }
  if (violations.length > 0) {
    throw new Error(
      [
        `${next.id}@${next.version} is not additive over ${previous.id}@${previous.version}`,
        ...violations.map((entry) => entry.message),
      ].join('\n')
    );
  }
};

export const selectBaseline = (contracts, candidate) => {
  const lower = contracts.filter(
    (contract) =>
      contract.major === candidate.major && compareVersions(contract.version, candidate.version) < 0
  );
  if (lower.length === 0) {
    return undefined;
  }
  return [...lower].sort((left, right) => compareVersions(left.version, right.version)).at(-1);
};

export const assertVersionOrdering = (contracts, sourceDirLabel) => {
  const majors = [...new Set(contracts.map((contract) => contract.major))].sort(
    (left, right) => left - right
  );
  if (majors.length === 0) {
    return;
  }
  if (majors[0] !== 0 && majors[0] !== 1) {
    throw new Error(`${sourceDirLabel}: major versions must start at 0 or 1, found ${majors[0]}`);
  }
  for (let index = 1; index < majors.length; index += 1) {
    if (majors[index] !== majors[index - 1] + 1) {
      throw new Error(`${sourceDirLabel}: major versions are not contiguous: ${majors.join(', ')}`);
    }
  }
};

export const assertMajorJustified = async ({ connectorDir, majors }) => {
  const required = [...new Set(majors)]
    .filter((major) => major >= 2)
    .sort((left, right) => left - right);
  if (required.length === 0) {
    return;
  }
  const changelogPath = path.join(connectorDir, 'CHANGELOG.md');
  let text;
  try {
    text = await readFile(changelogPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `${connectorDir}: CHANGELOG.md must justify major ${required.join(', ')} with a Breaking section`
      );
    }
    throw error;
  }
  for (const major of required) {
    const heading = `## ${major}.0`;
    const start = text.indexOf(heading);
    if (start === -1) {
      throw new Error(`${changelogPath}: missing ${heading} heading`);
    }
    const rest = text.slice(start + heading.length);
    const nextHeading = rest.search(/\n## /);
    const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
    if (!/\bBreaking\b/.test(section)) {
      throw new Error(`${changelogPath}: ${heading} section must contain the word Breaking`);
    }
  }
};
