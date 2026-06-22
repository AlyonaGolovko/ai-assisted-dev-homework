// Unit tests for agents/transaction_validator.js (stage 1).
// validate()/process() are pure and tested directly; run()/dryRun() do file I/O
// and are tested against a temp dir + a temp samples file - never the real
// shared/ or the real sample-transactions.json.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  validate,
  process as validatorProcess,
  run,
  dryRun,
  REQUIRED_FIELDS,
} from '../../agents/transaction_validator.js';
import { dirsFor, ensureDirs, createMessage, writeMessage, readMessages } from '../../agents/lib/messaging.js';

const validTxn = {
  transaction_id: 'TXN001',
  timestamp: '2026-03-16T09:00:00Z',
  source_account: 'ACC-1001',
  destination_account: 'ACC-2001',
  amount: '1500.00',
  currency: 'USD',
  transaction_type: 'transfer',
};

describe('validate', () => {
  it('accepts a well-formed transaction', () => {
    expect(validate(validTxn)).toEqual({ status: 'validated' });
  });

  it('rejects a missing required field', () => {
    const { amount, ...noAmount } = validTxn;
    expect(validate(noAmount)).toEqual({ status: 'rejected', reason: 'missing field: amount' });
  });

  it('treats an empty-string field as missing', () => {
    expect(validate({ ...validTxn, source_account: '' })).toEqual({
      status: 'rejected',
      reason: 'missing field: source_account',
    });
  });

  it('rejects a currency outside ISO 4217 (XYZ)', () => {
    expect(validate({ ...validTxn, currency: 'XYZ' })).toEqual({
      status: 'rejected',
      reason: 'bad currency: XYZ',
    });
  });

  it('rejects a malformed amount string', () => {
    expect(validate({ ...validTxn, amount: '12.345' })).toEqual({
      status: 'rejected',
      reason: 'invalid amount format: 12.345',
    });
  });

  it('rejects a negative amount for a non-refund', () => {
    expect(validate({ ...validTxn, amount: '-100.00', transaction_type: 'transfer' })).toEqual({
      status: 'rejected',
      reason: 'non-positive amount: -100.00',
    });
  });

  it('rejects a zero amount', () => {
    expect(validate({ ...validTxn, amount: '0.00' })).toEqual({
      status: 'rejected',
      reason: 'non-positive amount: 0.00',
    });
  });

  it('allows a negative amount when the transaction is a refund', () => {
    expect(validate({ ...validTxn, amount: '-100.00', transaction_type: 'refund' })).toEqual({
      status: 'validated',
    });
  });

  it('exports the required-field list it enforces', () => {
    expect(REQUIRED_FIELDS).toContain('amount');
    expect(REQUIRED_FIELDS).toContain('currency');
  });
});

describe('process', () => {
  it('routes a validated transaction to the fraud detector', () => {
    const out = validatorProcess(createMessage({
      source_agent: 'integrator',
      target_agent: 'transaction_validator',
      data: { ...validTxn },
    }));
    expect(out.source_agent).toBe('transaction_validator');
    expect(out.target_agent).toBe('fraud_detector');
    expect(out.data.status).toBe('validated');
    expect(out.data.reason).toBeUndefined();
  });

  it('routes a rejected transaction straight to reporting with a reason', () => {
    const out = validatorProcess(createMessage({
      source_agent: 'integrator',
      target_agent: 'transaction_validator',
      data: { ...validTxn, currency: 'XYZ' },
    }));
    expect(out.target_agent).toBe('reporting_agent');
    expect(out.data.status).toBe('rejected');
    expect(out.data.reason).toBe('bad currency: XYZ');
  });

  it('defaults message_type to "transaction" when the input lacks one', () => {
    const out = validatorProcess({ data: { ...validTxn } });
    expect(out.message_type).toBe('transaction');
  });
});

describe('run (file I/O)', () => {
  let root;
  let dirs;
  let logSpy;
  let errSpy;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'hw6-validator-'));
    dirs = dirsFor(root);
    await ensureDirs(dirs);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    await rm(root, { recursive: true, force: true });
  });

  it('moves input -> processing and writes routed envelopes to output', async () => {
    for (const txn of [validTxn, { ...validTxn, transaction_id: 'TXN006', currency: 'XYZ' }]) {
      await writeMessage(dirs.input, createMessage({
        source_agent: 'integrator',
        target_agent: 'transaction_validator',
        data: { ...txn },
      }));
    }

    const outputs = await run({ dirs });

    expect(outputs).toHaveLength(2);
    // input drained (only .gitkeep), both moved into processing, both written to output
    expect(await readdir(dirs.input)).toEqual(['.gitkeep']);
    expect((await readdir(dirs.processing)).filter((f) => f.endsWith('.json'))).toHaveLength(2);

    const written = await readMessages(dirs.output);
    const byId = Object.fromEntries(written.map(({ message }) => [message.data.transaction_id, message]));
    expect(byId.TXN001.target_agent).toBe('fraud_detector');
    expect(byId.TXN006.target_agent).toBe('reporting_agent');
    expect(byId.TXN006.data.reason).toBe('bad currency: XYZ');
    expect(errSpy).toHaveBeenCalled(); // audit lines emitted
  });
});

describe('dryRun (no file moves)', () => {
  let root;
  let logSpy;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'hw6-dryrun-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    await rm(root, { recursive: true, force: true });
  });

  it('validates a samples file and prints a table + totals', async () => {
    const samplesPath = path.join(root, 'samples.json');
    await writeFile(samplesPath, JSON.stringify([
      validTxn,
      { ...validTxn, transaction_id: 'TXN006', currency: 'XYZ' },
    ]));

    const rows = await dryRun({ samplesPath });

    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe('validated');
    expect(rows[1].status).toBe('rejected');
    expect(rows[1].reason).toBe('bad currency: XYZ');
    // header + separator + 2 data rows + totals line were printed
    expect(logSpy).toHaveBeenCalled();
    const printed = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(printed).toContain('Total: 2 | valid: 1 | invalid: 1');
  });
});
