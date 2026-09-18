/**
 * Worker-backed schema validator. Compiles both variants inside a worker thread
 * with an enlarged stack and returns an async `validateSchema(variant, target)`
 * that dispatches documents to it, plus a `close()` to terminate the worker.
 *
 * The workflow step schema is deeply recursive, and `ajv` compiles it into a
 * validator that consumes a large slice of the call stack per nesting level.
 * The main thread's stack (~8 MB) overflows on real, moderately-nested
 * workflows, so validation runs in a worker whose stack is sized explicitly.
 * If a pathologically deep document still overflows, it is reported as
 * `overflowed` rather than crashing the process.
 */

import { Worker } from 'node:worker_threads';

/** Worker stack size (MB). Comfortably validates thousands of nesting levels. */
export const DEFAULT_WORKER_STACK_SIZE_MB = 32;

const WORKER_URL = new URL('./validate-worker.mjs', import.meta.url);

export const createSchemaValidator = (
  schemas,
  { stackSizeMb = DEFAULT_WORKER_STACK_SIZE_MB } = {}
) => {
  const worker = new Worker(WORKER_URL, {
    workerData: { schemas },
    resourceLimits: { stackSizeMb },
  });

  const pending = new Map();
  let nextId = 0;
  let fatal = null;

  const failAll = (error) => {
    fatal = error;
    for (const { reject } of pending.values()) {
      reject(error);
    }
    pending.clear();
  };

  const ready = new Promise((resolve, reject) => {
    const onFirst = (message) => {
      if (message.type === 'ready') {
        resolve();
      } else if (message.type === 'init-error') {
        reject(new Error(message.message));
      }
    };
    worker.once('message', onFirst);
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Schema validation worker exited early (code ${code}).`));
    });
  });

  worker.on('message', (message) => {
    if (message.type !== 'result') return;
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      request.resolve({ errors: message.errors, overflowed: message.overflowed });
    }
  });

  worker.on('error', (error) => {
    failAll(error);
  });

  const validateSchema = async (variant, target) => {
    await ready;
    if (fatal) {
      throw fatal;
    }
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ type: 'validate', id, variant, target });
    });
  };

  const close = async () => {
    await worker.terminate();
  };

  return { validateSchema, close };
};
