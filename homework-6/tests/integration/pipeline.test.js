// Integration test - the whole pipeline end to end.
//
// Runs integrator.run() (validator -> fraud detector -> reporting agent) against
// a throwaway temp dir created with fs.mkdtemp under os.tmpdir(), using the real
// sample-transactions.json as input, and asserts the acceptance oracle:
//   7 validated, 1 rejected, 3 flagged; TXN006 rejected; TXN002/004/005 flagged.
// The real shared/ tree is never read or written - only `dirs` (the temp tree).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { run } from '../../integrator.js';
import { dirsFor } from '../../agents/lib/messaging.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES = path.resolve(HERE, '..', '..', 'sample-transactions.json');

let root;
let dirs;
let logSpy;
let errSpy;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hw6-pipeline-'));
  dirs = dirsFor(root);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  await rm(root, { recursive: true, force: true });
});

describe('full pipeline (integrator.run)', () => {
  it('produces the acceptance oracle on the 8 sample transactions', async () => {
    const summary = await run({ dirs, samplesPath: SAMPLES });

    expect(summary.processed).toBe(8);
    expect(summary.validated).toBe(7);
    expect(summary.rejected).toBe(1);
    expect(summary.flagged).toBe(3);
    expect(summary.flagged_ids).toEqual(['TXN002', 'TXN004', 'TXN005']);
    expect(summary.rejection_reasons).toEqual([
      { transaction_id: 'TXN006', reason: 'bad currency: XYZ' },
    ]);
  });

  it('writes one result file per transaction plus the summary', async () => {
    await run({ dirs, samplesPath: SAMPLES });

    const files = (await readdir(dirs.results)).filter((f) => f.endsWith('.json')).sort();
    expect(files).toEqual([
      'TXN001.json', 'TXN002.json', 'TXN003.json', 'TXN004.json',
      'TXN005.json', 'TXN006.json', 'TXN007.json', 'TXN008.json',
      'pipeline-summary.json',
    ].sort());

    const read = async (id) => JSON.parse(await readFile(path.join(dirs.results, `${id}.json`), 'utf8'));
    expect(await read('TXN001')).toMatchObject({ status: 'validated', flagged: false });
    expect(await read('TXN002')).toMatchObject({ status: 'validated', flagged: true, risk_score: 65 });
    expect(await read('TXN003')).toMatchObject({ status: 'validated', flagged: false, risk_score: 0 });
    expect(await read('TXN006')).toMatchObject({ status: 'rejected', reason: 'bad currency: XYZ' });
    expect(await read('TXN007')).toMatchObject({ status: 'validated', flagged: false });

    // result files must never carry raw account numbers (PII stays out of output)
    const txn001 = await read('TXN001');
    expect(txn001).not.toHaveProperty('source_account');
    expect(txn001).not.toHaveProperty('destination_account');
  });

  it('is idempotent - a second run yields the same counts', async () => {
    const first = await run({ dirs, samplesPath: SAMPLES });
    const second = await run({ dirs, samplesPath: SAMPLES });
    expect(second).toEqual(first);
    // reset between runs means no duplicate result files pile up
    const files = (await readdir(dirs.results)).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(9);
  });
});
