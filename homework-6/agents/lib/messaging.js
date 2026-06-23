// messaging.js - the file-based message bus.
//
// Agents never call each other directly. They cooperate by reading and writing
// JSON message envelopes under shared/{input,processing,output,results}. Every
// file written to shared/ is a single envelope of this shape:
//
//   {
//     message_id:   "<uuid4>",
//     timestamp:    "<ISO-8601 UTC>",
//     source_agent: "...",
//     target_agent: "...",
//     message_type: "transaction",
//     data:         { transaction_id, amount, currency, status, ... }
//   }
//
// The shared directory set is resolvable against any root so the pipeline can
// run against a temporary directory in tests without ever touching the real
// shared/ tree.

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// agents/lib -> agents -> project root
export const PROJECT_ROOT = path.resolve(HERE, '..', '..');

const STAGES = ['input', 'processing', 'output', 'results'];

/** Build the four shared-stage directory paths under `root/shared`. */
export function dirsFor(root) {
  const base = path.join(root, 'shared');
  return Object.fromEntries(STAGES.map((s) => [s, path.join(base, s)]));
}

/** The real shared directories used by `npm run pipeline`. */
export const defaultDirs = dirsFor(PROJECT_ROOT);

/** Current time as an ISO-8601 UTC string (trailing Z). */
export function isoNow() {
  return new Date().toISOString();
}

/** Build a fresh message envelope with a new uuid4 id and current timestamp. */
export function createMessage({ source_agent, target_agent, message_type = 'transaction', data }) {
  return {
    message_id: randomUUID(),
    timestamp: isoNow(),
    source_agent,
    target_agent,
    message_type,
    data,
  };
}

/** Create every shared directory (and a .gitkeep) if missing. Idempotent. */
export async function ensureDirs(dirs = defaultDirs) {
  for (const dir of Object.values(dirs)) {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, '.gitkeep'), '');
  }
}

/** Remove every message file from the shared stages, keeping .gitkeep. */
export async function resetDirs(dirs = defaultDirs) {
  for (const dir of Object.values(dirs)) {
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name === '.gitkeep') continue;
      await unlink(path.join(dir, name));
    }
  }
}

/** Write a message envelope to `dir` as <message_id>.json. Returns its path. */
export async function writeMessage(dir, message) {
  const file = path.join(dir, `${message.message_id}.json`);
  await writeFile(file, JSON.stringify(message, null, 2));
  return file;
}

/**
 * Read every *.json message envelope in `dir`.
 * @returns {Promise<Array<{ file: string, message: object }>>} sorted by filename
 */
export async function readMessages(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const jsonFiles = entries.filter((name) => name.endsWith('.json')).sort();
  const out = [];
  for (const file of jsonFiles) {
    const raw = await readFile(path.join(dir, file), 'utf8');
    out.push({ file, message: JSON.parse(raw) });
  }
  return out;
}

/** Move a single file from one stage directory to another. */
export async function moveMessage(file, fromDir, toDir) {
  await rename(path.join(fromDir, file), path.join(toDir, file));
}
