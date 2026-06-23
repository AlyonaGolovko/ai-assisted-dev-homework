// Unit tests for agents/reporting_agent.js (stage 3, the sole writer of
// shared/results/). process() reduces an envelope to a persisted result;
// summarize() aggregates the counts; run() reads reporting-targeted messages
// from a temp output dir and writes per-transaction files + the summary.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { process as reportingProcess, summarize, run } from '../../agents/reporting_agent.js';
import { dirsFor, ensureDirs, createMessage, writeMessage } from '../../agents/lib/messaging.js';

describe('process', () => {
  it('keeps the score for a validated transaction', () => {
    const result = reportingProcess({ data: {
      transaction_id: 'TXN002', status: 'validated', amount: '25000.00',
      currency: 'USD', transaction_type: 'wire_transfer', risk_score: 65, flagged: true,
    } });
    expect(result).toEqual({
      transaction_id: 'TXN002', status: 'validated', amount: '25000.00',
      currency: 'USD', transaction_type: 'wire_transfer', risk_score: 65, flagged: true,
    });
    expect(result.reason).toBeUndefined();
  });

  it('defaults score/flag to 0/false when absent on a validated transaction', () => {
    const result = reportingProcess({ data: {
      transaction_id: 'TXN001', status: 'validated', amount: '1500.00',
      currency: 'USD', transaction_type: 'transfer',
    } });
    expect(result.risk_score).toBe(0);
    expect(result.flagged).toBe(false);
  });

  it('keeps the reason for a rejected transaction and omits the score', () => {
    const result = reportingProcess({ data: {
      transaction_id: 'TXN006', status: 'rejected', amount: '200.00',
      currency: 'XYZ', transaction_type: 'transfer', reason: 'bad currency: XYZ',
    } });
    expect(result.reason).toBe('bad currency: XYZ');
    expect(result.risk_score).toBeUndefined();
    expect(result.flagged).toBeUndefined();
  });
});

describe('summarize', () => {
  it('counts validated / rejected / flagged and collects ids + reasons', () => {
    const summary = summarize([
      { transaction_id: 'TXN002', status: 'validated', flagged: true },
      { transaction_id: 'TXN001', status: 'validated', flagged: false },
      { transaction_id: 'TXN006', status: 'rejected', reason: 'bad currency: XYZ' },
    ]);
    expect(summary).toEqual({
      processed: 3,
      validated: 2,
      rejected: 1,
      flagged: 1,
      flagged_ids: ['TXN002'],
      rejection_reasons: [{ transaction_id: 'TXN006', reason: 'bad currency: XYZ' }],
    });
  });
});

describe('run (file I/O)', () => {
  let root;
  let dirs;
  let errSpy;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'hw6-reporting-'));
    dirs = dirsFor(root);
    await ensureDirs(dirs);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    errSpy.mockRestore();
    await rm(root, { recursive: true, force: true });
  });

  it('writes one result file per reporting-targeted txn plus the summary, sorted by id', async () => {
    // flagged validated (out of order), a rejected one, and one NOT for reporting.
    await writeMessage(dirs.output, createMessage({
      source_agent: 'fraud_detector', target_agent: 'reporting_agent',
      data: { transaction_id: 'TXN002', status: 'validated', amount: '25000.00', currency: 'USD', transaction_type: 'wire_transfer', risk_score: 65, flagged: true },
    }));
    await writeMessage(dirs.output, createMessage({
      source_agent: 'transaction_validator', target_agent: 'reporting_agent',
      data: { transaction_id: 'TXN006', status: 'rejected', amount: '200.00', currency: 'XYZ', transaction_type: 'transfer', reason: 'bad currency: XYZ' },
    }));
    await writeMessage(dirs.output, createMessage({
      source_agent: 'transaction_validator', target_agent: 'fraud_detector',
      data: { transaction_id: 'TXN999', status: 'validated' },
    }));

    const { results, summary } = await run({ dirs });

    // only the two reporting-targeted txns were processed, sorted TXN002 < TXN006
    expect(results.map((r) => r.transaction_id)).toEqual(['TXN002', 'TXN006']);
    expect(summary).toMatchObject({ processed: 2, validated: 1, rejected: 1, flagged: 1, flagged_ids: ['TXN002'] });

    const files = (await readdir(dirs.results)).filter((f) => f.endsWith('.json')).sort();
    expect(files).toEqual(['TXN002.json', 'TXN006.json', 'pipeline-summary.json'].sort());

    const txn002 = JSON.parse(await readFile(path.join(dirs.results, 'TXN002.json'), 'utf8'));
    expect(txn002).toMatchObject({ status: 'validated', risk_score: 65, flagged: true });
    const txn006 = JSON.parse(await readFile(path.join(dirs.results, 'TXN006.json'), 'utf8'));
    expect(txn006).toMatchObject({ status: 'rejected', reason: 'bad currency: XYZ' });

    const summaryFile = JSON.parse(await readFile(path.join(dirs.results, 'pipeline-summary.json'), 'utf8'));
    expect(summaryFile).toEqual(summary);
  });
});
