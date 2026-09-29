import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  signCatalog,
  signConnectorCatalog,
  verifyCatalogSignature,
} from './sign-connector-catalog.mjs';

const scriptPath = fileURLToPath(import.meta.url).replace(/\.test\.mjs$/, '.mjs');
const bytes = '{\n  "schemaVersion": 1\n}\n';

const generatePair = () => generateKeyPairSync('ed25519');

test('signCatalog round-trips with Ed25519 and rejects tampered bytes', () => {
  const { publicKey, privateKey } = generatePair();
  const signature = signCatalog(bytes, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  assert.equal(verifyCatalogSignature(bytes, signature, [publicPem]), true);
  assert.equal(verifyCatalogSignature(bytes.replace('1', '2'), signature, [publicPem]), false);
});

test('verifyCatalogSignature accepts a matching key later in the rotation list', () => {
  const first = generatePair();
  const second = generatePair();
  const signature = signCatalog(bytes, second.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  assert.equal(
    verifyCatalogSignature(bytes, signature, [
      first.publicKey.export({ type: 'spki', format: 'pem' }),
      second.publicKey.export({ type: 'spki', format: 'pem' }),
    ]),
    true
  );
});

test('signConnectorCatalog writes a 64-byte signature with a trailing newline', async (context) => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'connector-sign-'));
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const { publicKey, privateKey } = generatePair();
  const distDir = path.join(repoRoot, 'dist');
  const keysDir = path.join(repoRoot, 'keys');
  await mkdir(distDir, { recursive: true });
  await mkdir(keysDir, { recursive: true });
  await writeFile(path.join(distDir, 'catalog.json'), bytes);
  await writeFile(
    path.join(keysDir, 'dev-1.pem'),
    publicKey.export({ type: 'spki', format: 'pem' })
  );
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

  await signConnectorCatalog({
    distDir,
    privateKeyPem,
    publicKeyPems: [publicKey.export({ type: 'spki', format: 'pem' })],
  });
  const signatureFile = await readFile(path.join(distDir, 'catalog.json.sig'), 'utf8');
  assert.equal(signatureFile.endsWith('\n'), true);
  assert.equal(Buffer.from(signatureFile.trim(), 'base64').length, 64);
});

test('signConnectorCatalog throws when no committed public key matches', async (context) => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'connector-sign-'));
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const signer = generatePair();
  const other = generatePair();
  const distDir = path.join(repoRoot, 'dist');
  await mkdir(distDir, { recursive: true });
  await writeFile(path.join(distDir, 'catalog.json'), bytes);

  await assert.rejects(
    signConnectorCatalog({
      distDir,
      privateKeyPem: signer.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      publicKeyPems: [other.publicKey.export({ type: 'spki', format: 'pem' })],
    }),
    /does not verify against any committed public key/
  );
});

test('CLI refuses a missing --key-file', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--dist', 'dist/connectors/v1'], {
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--key-file/);
});
