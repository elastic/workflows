#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import * as yaml from 'js-yaml';
import {
  assertAdditiveMinor,
  assertMajorJustified,
  assertVersionOrdering,
  selectBaseline,
} from './check-connector-contract-compat.mjs';

const MAX_ICON_BYTES = 64 * 1024;
const SPEC_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const CONNECTOR_ID_PATTERN = /^\.[a-z0-9_-]+$/;
const log = (...args) => console.log('[build-connector-catalog]', ...args);

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

const createValidator = (schema) =>
  new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    formats: {
      uri: (value) => typeof value === 'string' && URL.canParse(value),
    },
  }).compile(schema);

export const parseSpecVersion = (version, sourcePath) => {
  if (typeof version !== 'string') {
    throw new Error(
      `${sourcePath}: version must be a quoted MAJOR.MINOR string (unquoted 1.0 is parsed as a number)`
    );
  }
  const match = SPEC_VERSION_PATTERN.exec(version);
  if (!match) {
    throw new Error(
      `${sourcePath}: version '${version}' must match ${SPEC_VERSION_PATTERN.source}`
    );
  }
  return { major: Number(match[1]), minor: Number(match[2]) };
};

export const compareSpecVersions = (left, right) => {
  const parsedLeft = parseSpecVersion(left, left);
  const parsedRight = parseSpecVersion(right, right);
  return parsedLeft.major - parsedRight.major || parsedLeft.minor - parsedRight.minor;
};

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

const loadIcon = async ({ sourceDir, iconFileName }) => {
  const sourcePath = resolveAssetPath(sourceDir, iconFileName);
  const raw = await readFile(sourcePath);
  if (raw.byteLength > MAX_ICON_BYTES) {
    throw new Error(`${sourcePath}: icon exceeds ${MAX_ICON_BYTES} bytes`);
  }
  assertSafeIcon(raw.toString('utf8'), sourcePath);
  const contentHash = sha256(raw);
  const hex = contentHash.slice('sha256:'.length);
  return {
    sourcePath,
    raw,
    contentHash,
    publishedPath: `connectors/${path.basename(sourceDir)}/icons/sha256-${hex}.svg`,
  };
};

const loadConnector = async ({
  sourceDir,
  slug,
  contractValidate,
  metadataValidate,
  seenIds,
  seenVersions,
}) => {
  const files = await readdir(sourceDir);
  const contractFiles = files.filter(
    (fileName) => fileName.endsWith('.yaml') && fileName !== 'metadata.yaml'
  );
  if (contractFiles.length === 0) {
    if (files.includes('metadata.yaml')) {
      throw new Error(`${sourceDir}: metadata.yaml is present but no contract versions were found`);
    }
    return null;
  }

  const metadataPath = path.join(sourceDir, 'metadata.yaml');
  if (!files.includes('metadata.yaml')) {
    throw new Error(`${sourceDir}: missing metadata.yaml`);
  }
  const metadataParsed = yaml.load(await readFile(metadataPath, 'utf8'));
  if (!metadataValidate(metadataParsed)) {
    throw new Error(`${metadataPath}: ${formatSchemaErrors(metadataValidate.errors ?? [])}`);
  }
  const icon = await loadIcon({ sourceDir, iconFileName: metadataParsed.icon });

  const contracts = [];
  let connectorId;
  for (const fileName of contractFiles.sort()) {
    const sourcePath = path.join(sourceDir, fileName);
    const raw = await readFile(sourcePath, 'utf8');
    const parsed = yaml.load(raw);
    const { major, minor } = parseSpecVersion(parsed?.version, sourcePath);
    if (!contractValidate(parsed)) {
      throw new Error(`${sourcePath}: ${formatSchemaErrors(contractValidate.errors ?? [])}`);
    }
    assertRuntimeCompatibleDefinition(parsed, sourcePath);
    if (fileName !== `${parsed.version}.yaml`) {
      throw new Error(`${sourcePath}: file name must match version ${parsed.version}`);
    }
    if (!CONNECTOR_ID_PATTERN.test(parsed.id) || parsed.id.startsWith('.declarative-')) {
      throw new Error(
        `${sourcePath}: id '${parsed.id}' must match ${CONNECTOR_ID_PATTERN.source} and must not start with .declarative-`
      );
    }
    if (connectorId === undefined) {
      connectorId = parsed.id;
      if (seenIds.has(connectorId)) {
        throw new Error(`${sourcePath}: duplicate connector id ${connectorId}`);
      }
      seenIds.add(connectorId);
    } else if (parsed.id !== connectorId) {
      throw new Error(
        `${sourcePath}: id '${parsed.id}' does not match ${connectorId} from other versions in ${slug}`
      );
    }
    const versionKey = `${parsed.id}@${parsed.version}`;
    if (seenVersions.has(versionKey)) {
      throw new Error(`${sourcePath}: duplicate connector version ${versionKey}`);
    }
    seenVersions.add(versionKey);
    contracts.push({
      id: parsed.id,
      version: parsed.version,
      major,
      minor,
      slug,
      sourcePath,
      raw,
      parsed,
      contentHash: sha256(raw),
    });
  }

  assertVersionOrdering(contracts, sourceDir);
  await assertMajorJustified({
    slug,
    connectorDir: sourceDir,
    majors: contracts.map((contract) => contract.major),
  });
  for (const contract of contracts) {
    const baseline = selectBaseline(contracts, contract);
    if (baseline) {
      assertAdditiveMinor(baseline, contract);
    }
  }

  return {
    slug,
    id: connectorId,
    metadata: metadataParsed,
    icon,
    contracts,
  };
};

const loadConnectors = async ({ sourceDir, schemaPath, metadataSchemaPath }) => {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const metadataSchema = JSON.parse(await readFile(metadataSchemaPath, 'utf8'));
  const contractValidate = createValidator(schema);
  const metadataValidate = createValidator(metadataSchema);
  const connectorDirs = (await readdir(sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const connectors = [];
  const seenIds = new Set();
  const seenVersions = new Set();

  for (const connectorDir of connectorDirs) {
    const loaded = await loadConnector({
      sourceDir: path.join(sourceDir, connectorDir.name),
      slug: connectorDir.name,
      contractValidate,
      metadataValidate,
      seenIds,
      seenVersions,
    });
    if (loaded) {
      connectors.push(loaded);
    }
  }

  if (connectors.length === 0) {
    throw new Error(`No connector definitions found under ${sourceDir}`);
  }
  return { connectors, schema, metadataSchema };
};

const buildTypeMetadataEntry = (connector) => {
  const entry = {
    displayName: connector.metadata.displayName,
    description: connector.metadata.description,
  };
  if (connector.metadata.docsUrl !== undefined) {
    entry.docsUrl = connector.metadata.docsUrl;
  }
  entry.icon = {
    path: connector.icon.publishedPath,
    contentHash: connector.icon.contentHash,
  };
  entry.minimumLicense = connector.metadata.minimumLicense;
  if (connector.metadata.isTechnicalPreview !== undefined) {
    entry.isTechnicalPreview = connector.metadata.isTechnicalPreview;
  }
  entry.supportedFeatureIds = connector.metadata.supportedFeatureIds;
  return entry;
};

export const computeCatalogVersion = (manifest) => {
  const forHash = {
    schemaVersion: manifest.schemaVersion,
    catalogVersion: '',
    sequence: manifest.sequence,
  };
  if (manifest.previousCatalogVersion !== undefined) {
    forHash.previousCatalogVersion = manifest.previousCatalogVersion;
  }
  forHash.typeMetadata = manifest.typeMetadata;
  forHash.connectors = manifest.connectors;
  return sha256(JSON.stringify(forHash));
};

export const serializeManifest = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;

export const buildManifest = ({ connectors, published, channel }) => {
  const keepPrerelease = channel !== 'prod';
  const typeMetadata = {};
  const rows = [];

  for (const connector of [...connectors].sort((left, right) => left.id.localeCompare(right.id))) {
    const visible = keepPrerelease
      ? connector.contracts
      : connector.contracts.filter((contract) => contract.major !== 0);
    if (visible.length === 0) {
      continue;
    }
    typeMetadata[connector.id] = buildTypeMetadataEntry(connector);
    for (const contract of [...visible].sort((left, right) =>
      compareSpecVersions(left.version, right.version)
    )) {
      rows.push({
        id: contract.id,
        version: contract.version,
        definitionUrl: `connectors/${contract.slug}/${contract.version}.yaml`,
        contentHash: contract.contentHash,
      });
    }
  }

  rows.sort(
    (left, right) =>
      left.id.localeCompare(right.id) || compareSpecVersions(left.version, right.version)
  );

  const manifest = {
    schemaVersion: 1,
    catalogVersion: '',
    sequence: (published?.sequence ?? 0) + 1,
  };
  if (published) {
    manifest.previousCatalogVersion = published.catalogVersion;
  }
  manifest.typeMetadata = typeMetadata;
  manifest.connectors = rows;
  manifest.catalogVersion = computeCatalogVersion(manifest);
  return manifest;
};

const parseCliOptions = (argv) => {
  const options = {
    publishedCatalogPath: process.env.CONNECTOR_CATALOG_PUBLISHED_FILE || undefined,
    channel: process.env.CONNECTOR_CATALOG_CHANNEL || 'staging',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--published') {
      options.publishedCatalogPath = argv[index + 1];
      index += 1;
    } else if (arg === '--channel') {
      options.channel = argv[index + 1];
      index += 1;
    }
  }
  if (options.channel !== 'prod' && options.channel !== 'staging') {
    throw new Error(`channel must be prod or staging, got '${options.channel}'`);
  }
  return options;
};

export const buildConnectorCatalog = async ({
  repoRoot = process.cwd(),
  outDir = path.join(repoRoot, 'dist/connectors/v1'),
  publishedCatalogPath,
  channel = 'staging',
} = {}) => {
  const sourceDir = path.join(repoRoot, 'connectors');
  const schemaPath = path.join(sourceDir, 'schema.json');
  const metadataSchemaPath = path.join(sourceDir, 'metadata.schema.json');
  const { connectors, schema, metadataSchema } = await loadConnectors({
    sourceDir,
    schemaPath,
    metadataSchemaPath,
  });
  const published = publishedCatalogPath
    ? JSON.parse(await readFile(publishedCatalogPath, 'utf8'))
    : null;
  const manifest = buildManifest({ connectors, published, channel });

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'catalog.json'), serializeManifest(manifest));
  await writeFile(path.join(outDir, 'schema.json'), `${JSON.stringify(schema, null, 2)}\n`);
  await writeFile(
    path.join(outDir, 'metadata.schema.json'),
    `${JSON.stringify(metadataSchema, null, 2)}\n`
  );

  for (const connector of connectors) {
    const destinationDir = path.join(outDir, 'connectors', connector.slug);
    await mkdir(path.join(destinationDir, 'icons'), { recursive: true });
    for (const contract of connector.contracts) {
      await writeFile(path.join(destinationDir, `${contract.version}.yaml`), contract.raw);
    }
    await writeFile(path.join(outDir, connector.icon.publishedPath), connector.icon.raw);
  }

  log(
    `Built ${manifest.connectors.length} connector version(s) from ${connectors.length} type(s); sequence ${manifest.sequence}`
  );
  log(`catalogVersion ${manifest.catalogVersion}`);
  log(`Output: ${outDir}`);
  return { manifest, connectors };
};

const isMain =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const options = parseCliOptions(process.argv.slice(2));
  buildConnectorCatalog(options).catch((error) => {
    console.error('[build-connector-catalog] FAILED:', error.message);
    process.exit(1);
  });
}
