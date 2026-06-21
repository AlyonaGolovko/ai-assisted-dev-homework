// transaction_validator.js - stage 1.
//
// Validates raw transactions and routes them forward as fresh envelopes:
//   - valid   -> status "validated", target the fraud detector
//   - invalid -> status "rejected" + reason, target the reporting agent directly
//
// run() does the file I/O (input -> processing -> output); process() is pure
// over a message and is the unit under test. A --dry-run mode validates
// sample-transactions.json and prints a table without moving any files.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import cc from 'currency-codes';

import { isValidAmountString, gt } from './lib/money.js';
import {
  createMessage,
  defaultDirs,
  ensureDirs,
  moveMessage,
  readMessages,
  writeMessage,
  PROJECT_ROOT,
} from './lib/messaging.js';
import { audit, redact } from './lib/logger.js';

const AGENT = 'transaction_validator';
const SAMPLES = path.join(PROJECT_ROOT, 'sample-transactions.json');

// Fields a transaction must carry to be processable.
export const REQUIRED_FIELDS = [
  'transaction_id',
  'timestamp',
  'source_account',
  'destination_account',
  'amount',
  'currency',
  'transaction_type',
];

/**
 * Decide whether a transaction payload is valid.
 * @returns {{ status: 'validated' } | { status: 'rejected', reason: string }}
 */
export function validate(data) {
  for (const field of REQUIRED_FIELDS) {
    const value = data?.[field];
    if (value === undefined || value === null || value === '') {
      return { status: 'rejected', reason: `missing field: ${field}` };
    }
  }
  if (cc.code(data.currency) === undefined) {
    return { status: 'rejected', reason: `bad currency: ${data.currency}` };
  }
  if (!isValidAmountString(data.amount)) {
    return { status: 'rejected', reason: `invalid amount format: ${data.amount}` };
  }
  // amount <= 0 is rejected unless this is a refund (refunds may be negative).
  if (data.transaction_type !== 'refund' && !gt(data.amount, '0')) {
    return { status: 'rejected', reason: `non-positive amount: ${data.amount}` };
  }
  return { status: 'validated' };
}

/**
 * Pure transform: take an incoming envelope, return a fresh envelope with the
 * validation status applied and the correct downstream target.
 * @param {object} message
 * @returns {object} message
 */
export function process(message) {
  const data = { ...message.data };
  const decision = validate(data);
  const nextData = { ...data, status: decision.status };
  if (decision.status === 'rejected') nextData.reason = decision.reason;
  const target = decision.status === 'validated' ? 'fraud_detector' : 'reporting_agent';
  return createMessage({
    source_agent: AGENT,
    target_agent: target,
    message_type: message.message_type ?? 'transaction',
    data: nextData,
  });
}

/** Side-effecting stage: read input, move through processing, write output. */
export async function run({ dirs = defaultDirs } = {}) {
  await ensureDirs(dirs);
  const incoming = await readMessages(dirs.input);
  const outputs = [];
  for (const { file, message } of incoming) {
    await moveMessage(file, dirs.input, dirs.processing);
    const out = process(message);
    const txnId = out.data.transaction_id;
    const detail = `${redact(message.data.source_account)} -> ${redact(message.data.destination_account)}`;
    const outcome = out.data.status === 'validated'
      ? 'validated'
      : `rejected: ${out.data.reason}`;
    audit({ agent: AGENT, transactionId: txnId, outcome, detail });
    await writeMessage(dirs.output, out);
    outputs.push(out);
  }
  return outputs;
}

/** --dry-run: validate the sample file and print a table; no file moves. */
export async function dryRun({ samplesPath = SAMPLES } = {}) {
  const txns = JSON.parse(await readFile(samplesPath, 'utf8'));
  const rows = txns.map((t) => {
    const decision = validate(t);
    return {
      transaction_id: t.transaction_id,
      currency: t.currency,
      amount: t.amount,
      status: decision.status,
      reason: decision.reason ?? '',
    };
  });
  printTable(rows);
  const valid = rows.filter((r) => r.status === 'validated').length;
  console.log(`\nTotal: ${rows.length} | valid: ${valid} | invalid: ${rows.length - valid}`);
  return rows;
}

function printTable(rows) {
  const header = ['TXN', 'CURRENCY', 'AMOUNT', 'STATUS', 'REASON'];
  const widths = [12, 9, 12, 10, 30];
  const fmt = (cols) => cols.map((c, i) => String(c).padEnd(widths[i])).join(' ');
  console.log(fmt(header));
  console.log(fmt(widths.map((w) => '-'.repeat(w - 1))));
  for (const r of rows) {
    console.log(fmt([r.transaction_id, r.currency, r.amount, r.status, r.reason]));
  }
}

function isMain() {
  return globalThis.process.argv[1] && import.meta.url === pathToFileURL(globalThis.process.argv[1]).href;
}

if (isMain()) {
  if (globalThis.process.argv.includes('--dry-run')) {
    await dryRun();
  } else {
    await run();
  }
}
