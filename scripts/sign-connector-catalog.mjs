#!/usr/bin/env node

import { sign, verify } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const toBuffer = (bytes) => (Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8'));

export const signCatalog = (bytes, privateKeyPem) =>
  sign(null, toBuffer(bytes), privateKeyPem).toString('base64');

export const verifyCatalogSignature = (bytes, signatureBase64, publicKeyPems) => {
  let signature;
  try {
    signature = Buffer.from(signatureBase64.trim(), 'base64');
  } catch {
    return false;
  }
  if (signature.length === 0) {
    return false;
  }
  const payload = toBuffer(bytes);
  return publicKeyPems.some((publicKeyPem) => {
    try {
      return verify(null, payload, publicKeyPem, signature);
    } catch {
      return false;
    }
  });
};

export const loadPublicKeys = async (dir) => {
  const files = (await readdir(dir)).filter((fileName) => fileName.endsWith('.pem')).sort();
  return Promise.all(files.map((fileName) => readFile(path.join(dir, fileName), 'utf8')));
};

export const signConnectorCatalog = async ({ distDir, privateKeyPem, publicKeyPems }) => {
  const catalogPath = path.join(distDir, 'catalog.json');
  const bytes = await readFile(catalogPath);
  const signature = signCatalog(bytes, privateKeyPem);
  if (!verifyCatalogSignature(bytes, signature, publicKeyPems)) {
    throw new Error('Catalog signature does not verify against any committed public key');
  }
  const signaturePath = path.join(distDir, 'catalog.json.sig');
  await writeFile(signaturePath, `${signature}\n`);
  return { signaturePath };
};

const parseCliOptions = (argv) => {
  const options = { publicKeysDir: path.resolve('connectors/signing-keys') };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dist') {
      options.distDir = argv[index + 1];
      index += 1;
    } else if (arg === '--key-file') {
      options.keyFile = argv[index + 1];
      index += 1;
    } else if (arg === '--public-keys') {
      options.publicKeysDir = argv[index + 1];
      index += 1;
    }
  }
  if (!options.distDir || !options.keyFile) {
    throw new Error(
      'Usage: sign-connector-catalog.mjs --dist <dir> --key-file <pem> [--public-keys <dir>]'
    );
  }
  return options;
};

const isMain =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    const options = parseCliOptions(process.argv.slice(2));
    const privateKeyPem = await readFile(options.keyFile, 'utf8');
    const publicKeyPems = await loadPublicKeys(options.publicKeysDir);
    await signConnectorCatalog({
      distDir: options.distDir,
      privateKeyPem,
      publicKeyPems,
    });
  } catch (error) {
    console.error('[sign-connector-catalog] FAILED:', error.message);
    process.exit(1);
  }
}
