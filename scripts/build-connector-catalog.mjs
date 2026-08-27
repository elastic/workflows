#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import * as yaml from 'js-yaml';
import semver from 'semver';

const MAX_ICON_BYTES = 64 * 1024;
const log = (...args) => console.log('[build-connector-catalog]', ...args);

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

const assertSafeIcon = (raw, sourcePath) => {
  if (!/<svg[\s>]/i.test(raw)) {
    throw new Error(`${sourcePath}: icon is not an SVG document`);
  }
  const unsafeMarkup =
    /<script[\s>]|<style[\s>]|<foreignObject[\s>]|\son[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["']\s*(?!#)|url\(\s*["']?(?!#)/i;
  if (unsafeMarkup.test(raw)) {
    throw new Error(`${sourcePath}: icon contains unsupported active or external content`);
  }
};

const formatSchemaErrors = (errors) =>
  errors
    .map(({ instancePath, message, params }) => {
      const location = instancePath || '(root)';
      const detail = params?.additionalProperty ? `: ${params.additionalProperty}` : '';
      return `${location} ${message}${detail}`;
    })
    .join(', ');

const resolveAssetPath = (definitionDir, relativePath) => {
  const resolved = path.resolve(definitionDir, relativePath);
  const relative = path.relative(definitionDir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Icon path must remain within ${definitionDir}`);
  }
  return resolved;
};

const matchesSchemaType = (value, type) => {
  switch (type) {
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    default:
      return false;
  }
};

const assertValueMatchesSchema = (value, definition, fieldPath, sourcePath) => {
  if (!matchesSchemaType(value, definition.type)) {
    throw new Error(`${sourcePath}: ${fieldPath} must match type ${definition.type}`);
  }
  if (definition.enum && !definition.enum.some((candidate) => Object.is(candidate, value))) {
    throw new Error(`${sourcePath}: ${fieldPath} must match its enum`);
  }
  if (definition.type === 'string') {
    if (definition.minLength !== undefined && value.length < definition.minLength) {
      throw new Error(`${sourcePath}: ${fieldPath} is shorter than minLength`);
    }
    if (definition.maxLength !== undefined && value.length > definition.maxLength) {
      throw new Error(`${sourcePath}: ${fieldPath} is longer than maxLength`);
    }
    if (definition.format === 'uri' && !URL.canParse(value)) {
      throw new Error(`${sourcePath}: ${fieldPath} must be a valid URI`);
    }
    if (definition.format === 'ipv4' && isIP(value) !== 4) {
      throw new Error(`${sourcePath}: ${fieldPath} must be a valid IPv4 address`);
    }
    if (definition.format === 'date-time' && Number.isNaN(Date.parse(value))) {
      throw new Error(`${sourcePath}: ${fieldPath} must be a valid date-time`);
    }
  }
  if (definition.type === 'number' || definition.type === 'integer') {
    if (definition.minimum !== undefined && value < definition.minimum) {
      throw new Error(`${sourcePath}: ${fieldPath} is less than minimum`);
    }
    if (definition.maximum !== undefined && value > definition.maximum) {
      throw new Error(`${sourcePath}: ${fieldPath} is greater than maximum`);
    }
  }
  if (definition.type === 'object') {
    for (const name of definition.required ?? []) {
      if (!(name in value)) {
        throw new Error(`${sourcePath}: ${fieldPath} is missing required property ${name}`);
      }
    }
    for (const [name, nestedValue] of Object.entries(value)) {
      const property = definition.properties?.[name];
      if (property) {
        assertValueMatchesSchema(nestedValue, property, `${fieldPath}.${name}`, sourcePath);
      } else if (definition.additionalProperties !== true) {
        throw new Error(`${sourcePath}: ${fieldPath} contains unknown property ${name}`);
      }
    }
  }
  if (definition.type === 'array') {
    value.forEach((item, index) =>
      assertValueMatchesSchema(item, definition.items, `${fieldPath}[${index}]`, sourcePath)
    );
  }
};

const assertRuntimeCompatibleSchema = (definition, fieldPath, sourcePath) => {
  const assertFieldsApplyToType = (fields, types) => {
    for (const field of fields) {
      if (definition[field] !== undefined && !types.includes(definition.type)) {
        throw new Error(
          `${sourcePath}: ${fieldPath}.${field} is only supported for ${types.join(' or ')} schemas`
        );
      }
    }
  };
  if (definition.type === 'array' && !definition.items) {
    throw new Error(`${sourcePath}: ${fieldPath} arrays require items`);
  }
  if (definition.type === 'object') {
    const properties = definition.properties ?? {};
    for (const name of definition.required ?? []) {
      if (!(name in properties)) {
        throw new Error(`${sourcePath}: ${fieldPath}.required references unknown property ${name}`);
      }
    }
    for (const [name, property] of Object.entries(properties)) {
      assertRuntimeCompatibleSchema(property, `${fieldPath}.properties.${name}`, sourcePath);
    }
  }
  assertFieldsApplyToType(['properties', 'required', 'additionalProperties'], ['object']);
  assertFieldsApplyToType(['items'], ['array']);
  assertFieldsApplyToType(['format', 'minLength', 'maxLength'], ['string']);
  assertFieldsApplyToType(['minimum', 'maximum'], ['number', 'integer']);
  if (definition.default !== undefined) {
    assertValueMatchesSchema(definition.default, definition, `${fieldPath}.default`, sourcePath);
  }
  for (const value of definition.enum ?? []) {
    if (!matchesSchemaType(value, definition.type)) {
      throw new Error(`${sourcePath}: ${fieldPath}.enum values must match type ${definition.type}`);
    }
  }
  if (definition.items) {
    assertRuntimeCompatibleSchema(definition.items, `${fieldPath}.items`, sourcePath);
  }
};

const assertRuntimeCompatibleDefinition = (definition, sourcePath) => {
  if (definition.config.type !== 'object') {
    throw new Error(`${sourcePath}: config must be an object schema`);
  }
  assertRuntimeCompatibleSchema(definition.config, 'config', sourcePath);
  for (const [name, action] of Object.entries(definition.actions)) {
    if (action.input.type !== 'object') {
      throw new Error(`${sourcePath}: actions.${name}.input must be an object schema`);
    }
    assertRuntimeCompatibleSchema(action.input, `actions.${name}.input`, sourcePath);
  }
};

const loadDefinitions = async ({ sourceDir, schemaPath }) => {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const validate = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
  }).compile(schema);
  const connectorDirs = (await readdir(sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const definitions = [];
  const seenVersions = new Set();

  for (const connectorDir of connectorDirs) {
    const definitionDir = path.join(sourceDir, connectorDir.name);
    const definitionFiles = (await readdir(definitionDir))
      .filter((fileName) => fileName.endsWith('.yaml'))
      .sort();

    for (const fileName of definitionFiles) {
      const definitionPath = path.join(definitionDir, fileName);
      const raw = await readFile(definitionPath, 'utf8');
      const parsed = yaml.load(raw);
      if (!validate(parsed)) {
        throw new Error(`${definitionPath}: ${formatSchemaErrors(validate.errors ?? [])}`);
      }
      assertRuntimeCompatibleDefinition(parsed, definitionPath);
      if (!semver.valid(parsed.version)) {
        throw new Error(`${definitionPath}: version must be valid semantic versioning`);
      }
      if (fileName !== `${parsed.version}.yaml`) {
        throw new Error(`${definitionPath}: file name must match version ${parsed.version}`);
      }

      const versionKey = `${parsed.id}@${parsed.version}`;
      if (seenVersions.has(versionKey)) {
        throw new Error(`${definitionPath}: duplicate connector version ${versionKey}`);
      }
      seenVersions.add(versionKey);

      const iconDefinition = parsed.metadata.icon;
      let icon;
      if (iconDefinition) {
        const iconPath = resolveAssetPath(definitionDir, iconDefinition.path);
        const iconRaw = await readFile(iconPath);
        if (iconRaw.byteLength > MAX_ICON_BYTES) {
          throw new Error(`${iconPath}: icon exceeds ${MAX_ICON_BYTES} bytes`);
        }
        if (sha256(iconRaw) !== iconDefinition.contentHash) {
          throw new Error(`${iconPath}: icon content does not match metadata.icon.contentHash`);
        }
        assertSafeIcon(iconRaw.toString('utf8'), iconPath);
        icon = {
          sourcePath: iconPath,
          fileName: iconDefinition.path,
        };
      }

      definitions.push({
        id: parsed.id,
        version: parsed.version,
        slug: connectorDir.name,
        sourcePath: definitionPath,
        raw,
        contentHash: sha256(raw),
        icon,
      });
    }
  }

  if (definitions.length === 0) {
    throw new Error(`No connector definitions found under ${sourceDir}`);
  }
  return { definitions, schema };
};

const selectActiveDefinitions = (definitions) => {
  const byId = new Map();
  for (const definition of definitions) {
    const current = byId.get(definition.id);
    if (!current || semver.gt(definition.version, current.version)) {
      byId.set(definition.id, definition);
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
};

export const buildConnectorCatalog = async ({
  repoRoot = process.cwd(),
  outDir = path.join(repoRoot, 'dist/connectors/v1'),
} = {}) => {
  const sourceDir = path.join(repoRoot, 'connectors');
  const schemaPath = path.join(sourceDir, 'schema.json');
  const { definitions, schema } = await loadDefinitions({ sourceDir, schemaPath });
  const activeDefinitions = selectActiveDefinitions(definitions);

  const rows = [...definitions]
    .sort(
      (left, right) =>
        left.id.localeCompare(right.id) || semver.rcompare(left.version, right.version)
    )
    .map((definition) => ({
      id: definition.id,
      version: definition.version,
      definitionUrl: `connectors/${definition.slug}/${definition.version}.yaml`,
      contentHash: definition.contentHash,
    }));
  const activeVersions = Object.fromEntries(
    activeDefinitions.map(({ id, version }) => [id, version])
  );
  const catalogVersion = sha256(JSON.stringify({ schema, activeVersions, connectors: rows }));
  const catalogBody = `${JSON.stringify(
    {
      schemaVersion: 1,
      catalogVersion,
      activeVersions,
      connectors: rows,
    },
    null,
    2
  )}\n`;
  const schemaBody = `${JSON.stringify(schema, null, 2)}\n`;

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'catalog.json'), catalogBody);
  await writeFile(path.join(outDir, 'schema.json'), schemaBody);

  for (const definition of definitions) {
    const destinationDir = path.join(outDir, 'connectors', definition.slug);
    await mkdir(destinationDir, { recursive: true });
    await writeFile(path.join(destinationDir, `${definition.version}.yaml`), definition.raw);
    if (definition.icon) {
      await copyFile(
        definition.icon.sourcePath,
        path.join(destinationDir, definition.icon.fileName)
      );
    }
  }

  log(
    `Built ${activeDefinitions.length} active connector(s) from ${definitions.length} versioned definition(s)`
  );
  log(`Output: ${outDir}`);
  return { catalogVersion, definitions, rows };
};

const isMain =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  buildConnectorCatalog().catch((error) => {
    console.error('[build-connector-catalog] FAILED:', error.message);
    process.exit(1);
  });
}
