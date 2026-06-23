// Unit tests for agents/lib/messaging.js - the file-based message bus.
// Every test runs against a private temp dir made with fs.mkdtemp under
// os.tmpdir(); the real shared/ tree is never read or written.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  dirsFor,
  isoNow,
  createMessage,
  ensureDirs,
  resetDirs,
  writeMessage,
  readMessages,
  moveMessage,
} from '../../agents/lib/messaging.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let root;
let dirs;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hw6-msg-'));
  dirs = dirsFor(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('dirsFor', () => {
  it('maps the four stages under <root>/shared', () => {
    expect(dirs).toEqual({
      input: path.join(root, 'shared', 'input'),
      processing: path.join(root, 'shared', 'processing'),
      output: path.join(root, 'shared', 'output'),
      results: path.join(root, 'shared', 'results'),
    });
  });
});

describe('isoNow', () => {
  it('returns a parseable ISO-8601 UTC string', () => {
    const now = isoNow();
    expect(now).toMatch(/Z$/);
    expect(new Date(now).toISOString()).toBe(now);
  });
});

describe('createMessage', () => {
  it('builds an envelope with a uuid4 id, timestamp and defaults', () => {
    const msg = createMessage({
      source_agent: 'integrator',
      target_agent: 'transaction_validator',
      data: { transaction_id: 'TXN001' },
    });
    expect(msg.message_id).toMatch(UUID_RE);
    expect(new Date(msg.timestamp).toISOString()).toBe(msg.timestamp);
    expect(msg.message_type).toBe('transaction'); // default
    expect(msg.source_agent).toBe('integrator');
    expect(msg.target_agent).toBe('transaction_validator');
    expect(msg.data).toEqual({ transaction_id: 'TXN001' });
  });

  it('honours an explicit message_type and gives unique ids', () => {
    const a = createMessage({ source_agent: 's', target_agent: 't', message_type: 'control', data: {} });
    const b = createMessage({ source_agent: 's', target_agent: 't', message_type: 'control', data: {} });
    expect(a.message_type).toBe('control');
    expect(a.message_id).not.toBe(b.message_id);
  });
});

describe('ensureDirs', () => {
  it('creates every stage directory with a .gitkeep (idempotently)', async () => {
    await ensureDirs(dirs);
    await ensureDirs(dirs); // second call must not throw
    for (const dir of Object.values(dirs)) {
      await expect(access(dir)).resolves.toBeUndefined();
      await expect(access(path.join(dir, '.gitkeep'))).resolves.toBeUndefined();
    }
  });
});

describe('writeMessage + readMessages', () => {
  it('writes <message_id>.json and reads envelopes back sorted by filename', async () => {
    await ensureDirs(dirs);
    const m1 = { message_id: 'bbb', data: { transaction_id: 'TXN2' } };
    const m2 = { message_id: 'aaa', data: { transaction_id: 'TXN1' } };
    const p1 = await writeMessage(dirs.input, m1);
    await writeMessage(dirs.input, m2);

    expect(p1).toBe(path.join(dirs.input, 'bbb.json'));

    const read = await readMessages(dirs.input);
    expect(read.map((r) => r.file)).toEqual(['aaa.json', 'bbb.json']); // sorted
    expect(read[0].message).toEqual(m2);
    expect(read[1].message).toEqual(m1);
  });

  it('ignores the .gitkeep and returns [] for a non-existent dir', async () => {
    await ensureDirs(dirs);
    expect(await readMessages(dirs.input)).toEqual([]); // only .gitkeep present
    expect(await readMessages(path.join(root, 'nope'))).toEqual([]);
  });
});

describe('moveMessage', () => {
  it('relocates a file between two stage directories', async () => {
    await ensureDirs(dirs);
    await writeMessage(dirs.input, { message_id: 'x', data: {} });
    await moveMessage('x.json', dirs.input, dirs.processing);
    expect(await readdir(dirs.input)).not.toContain('x.json');
    expect(await readdir(dirs.processing)).toContain('x.json');
  });
});

describe('resetDirs', () => {
  it('removes message files but keeps .gitkeep', async () => {
    await ensureDirs(dirs);
    await writeMessage(dirs.output, { message_id: 'r1', data: {} });
    await writeMessage(dirs.output, { message_id: 'r2', data: {} });

    await resetDirs(dirs);

    const entries = await readdir(dirs.output);
    expect(entries).toEqual(['.gitkeep']);
  });

  it('skips directories that do not exist (no throw)', async () => {
    const fresh = dirsFor(path.join(root, 'never-created'));
    await expect(resetDirs(fresh)).resolves.toBeUndefined();
  });
});
