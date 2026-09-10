/**
 * Worker-thread half of the schema validator. The (deeply recursive) workflow
 * schema is compiled and validated here — inside a thread with an enlarged
 * stack — so validating real, nested workflows does not overflow the call
 * stack. The main thread's stack is capped by the OS thread stack (~8 MB),
 * which is not enough for this schema even on moderately-nested documents.
 *
 * Protocol (host <-> worker):
 *   host -> worker: { type: 'validate', id, variant, target }
 *   worker -> host: { type: 'ready' }
 *                   { type: 'init-error', message }
 *                   { type: 'result', id, errors, overflowed }
 */

import { parentPort, workerData } from 'node:worker_threads';
import { compileValidators } from './compile-validators.mjs';

const port = parentPort;
if (!port) {
  throw new Error('validate-worker must be run as a worker thread.');
}

let validators;
try {
  validators = compileValidators(workerData.schemas);
  port.postMessage({ type: 'ready' });
} catch (error) {
  port.postMessage({
    type: 'init-error',
    message: error instanceof Error ? error.message : String(error),
  });
  // Leave the worker idle; the host rejects on `init-error` and terminates it.
}

port.on('message', (message) => {
  if (message.type !== 'validate' || !validators) {
    return;
  }
  const { id, variant, target } = message;
  let errors = [];
  let overflowed = false;
  try {
    const { validate } = validators[variant];
    if (!validate(target)) {
      errors = validate.errors ?? [];
    }
  } catch {
    // Even with the enlarged stack, a pathologically deep document can overflow.
    overflowed = true;
  }
  port.postMessage({ type: 'result', id, errors, overflowed });
});
