// Unit tests for agents/fraud_detector.js (stage 2).
// score() is the additive risk engine; we cover each signal, the >=50 flag
// threshold, the cap at 100, and the boundary that must NOT flag. run() is
// exercised against a temp dir and must score only its own targeted messages.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { score, process as fraudProcess, run } from '../../agents/fraud_detector.js';
import { dirsFor, ensureDirs, createMessage, writeMessage } from '../../agents/lib/messaging.js';

// Domestic-clean base: USD, US, daytime, low value -> 0 points.
const base = {
  transaction_id: 'TXN001',
  timestamp: '2026-03-16T09:00:00Z',
  amount: '1500.00',
  currency: 'USD',
  transaction_type: 'transfer',
  metadata: { country: 'US' },
};

describe('score', () => {
  it('flags a high-value wire transfer (50 + 15 = 65)', () => {
    // TXN002 / TXN005 shape
    expect(score({ ...base, amount: '25000.00', transaction_type: 'wire_transfer' }))
      .toEqual({ risk_score: 65, flagged: true });
  });

  it('flags an off-hours cross-border transfer (25 + 25 = 50)', () => {
    // TXN004 shape: 02:47 UTC, EUR/DE
    expect(score({ ...base, timestamp: '2026-03-16T02:47:00Z', amount: '500.00', currency: 'EUR', metadata: { country: 'DE' } }))
      .toEqual({ risk_score: 50, flagged: true });
  });

  it('does NOT flag an amount just under the high-value threshold', () => {
    // TXN003 shape: 9999.99 is not > 10000
    expect(score({ ...base, amount: '9999.99' })).toEqual({ risk_score: 0, flagged: false });
  });

  it('does NOT flag a clean domestic transaction', () => {
    // TXN001 / TXN008 shape
    expect(score(base)).toEqual({ risk_score: 0, flagged: false });
  });

  it('scores a cross-border refund at 25 (allowed, not flagged)', () => {
    // TXN007 shape: -100 GBP/GB refund -> currency != USD
    expect(score({ ...base, amount: '-100.00', currency: 'GBP', transaction_type: 'refund', metadata: { country: 'GB' } }))
      .toEqual({ risk_score: 25, flagged: false });
  });

  it('treats a non-US country alone as cross-border even when currency is USD', () => {
    expect(score({ ...base, metadata: { country: 'CA' } })).toEqual({ risk_score: 25, flagged: false });
  });

  it('treats absent metadata as cross-border (country is undefined)', () => {
    const noMeta = { ...base };
    delete noMeta.metadata;
    expect(score(noMeta)).toEqual({ risk_score: 25, flagged: false });
  });

  it('caps the score at 100 when every signal fires', () => {
    // 50 + 25 + 25 + 15 = 115 -> capped to 100
    const all = { ...base, amount: '50000.00', timestamp: '2026-03-16T02:00:00Z', currency: 'EUR', transaction_type: 'wire_transfer', metadata: { country: 'DE' } };
    expect(score(all)).toEqual({ risk_score: 100, flagged: true });
  });
});

describe('process', () => {
  it('carries risk_score + flagged forward toward reporting', () => {
    const out = fraudProcess(createMessage({
      source_agent: 'transaction_validator',
      target_agent: 'fraud_detector',
      data: { ...base, amount: '25000.00', transaction_type: 'wire_transfer', status: 'validated' },
    }));
    expect(out.source_agent).toBe('fraud_detector');
    expect(out.target_agent).toBe('reporting_agent');
    expect(out.data.risk_score).toBe(65);
    expect(out.data.flagged).toBe(true);
  });
});

describe('run (file I/O)', () => {
  let root;
  let dirs;
  let errSpy;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'hw6-fraud-'));
    dirs = dirsFor(root);
    await ensureDirs(dirs);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    errSpy.mockRestore();
    await rm(root, { recursive: true, force: true });
  });

  it('scores only fraud-targeted messages and ignores the rest', async () => {
    // a validated txn aimed at the fraud detector...
    await writeMessage(dirs.output, createMessage({
      source_agent: 'transaction_validator',
      target_agent: 'fraud_detector',
      data: { ...base, amount: '25000.00', transaction_type: 'wire_transfer', status: 'validated' },
    }));
    // ...and a rejected one aimed straight at reporting (must be ignored here)
    await writeMessage(dirs.output, createMessage({
      source_agent: 'transaction_validator',
      target_agent: 'reporting_agent',
      data: { transaction_id: 'TXN006', status: 'rejected', reason: 'bad currency: XYZ' },
    }));

    const outputs = await run({ dirs });

    expect(outputs).toHaveLength(1);
    expect(outputs[0].target_agent).toBe('reporting_agent');
    expect(outputs[0].data.risk_score).toBe(65);
    expect(outputs[0].data.flagged).toBe(true);
    expect(errSpy).toHaveBeenCalled();
  });
});
