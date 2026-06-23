// fraud_detector.js - stage 2.
//
// Scores validated transactions for fraud risk. The score is additive and
// capped at 100; a transaction is flagged when its score is >= 50. All amount
// comparisons go through decimal.js (via money.gt) - never float math.
//
//   Signal           Condition                                            Points
//   ---------------  ---------------------------------------------------  ------
//   High-value       amount > 10,000                                       +50
//   Off-hours        UTC hour of timestamp in 0-5                          +25
//   Cross-border     metadata.country !== "US" OR currency !== "USD"       +25
//   Wire high-value  transaction_type === "wire_transfer" AND amount>10k   +15

import { pathToFileURL } from 'node:url';

import { gt } from './lib/money.js';
import {
  createMessage,
  defaultDirs,
  ensureDirs,
  readMessages,
  writeMessage,
} from './lib/messaging.js';
import { audit, redact } from './lib/logger.js';

const AGENT = 'fraud_detector';
const SCORE_CAP = 100;
const FLAG_THRESHOLD = 50;
const HIGH_VALUE = '10000';

/**
 * Compute the additive risk score and flag for a transaction payload.
 * @returns {{ risk_score: number, flagged: boolean }}
 */
export function score(data) {
  let risk = 0;
  const isHighValue = gt(data.amount, HIGH_VALUE);
  if (isHighValue) risk += 50;

  const hour = new Date(data.timestamp).getUTCHours();
  if (hour >= 0 && hour <= 5) risk += 25;

  const country = data.metadata?.country;
  if (country !== 'US' || data.currency !== 'USD') risk += 25;

  if (data.transaction_type === 'wire_transfer' && isHighValue) risk += 15;

  const risk_score = Math.min(risk, SCORE_CAP);
  return { risk_score, flagged: risk_score >= FLAG_THRESHOLD };
}

/**
 * Pure transform: carry risk_score and flagged forward toward reporting.
 * @param {object} message
 * @returns {object} message
 */
export function process(message) {
  const data = { ...message.data };
  const { risk_score, flagged } = score(data);
  const nextData = { ...data, risk_score, flagged };
  return createMessage({
    source_agent: AGENT,
    target_agent: 'reporting_agent',
    message_type: message.message_type ?? 'transaction',
    data: nextData,
  });
}

/** Side-effecting stage: score validated messages from output, forward them. */
export async function run({ dirs = defaultDirs } = {}) {
  await ensureDirs(dirs);
  const incoming = await readMessages(dirs.output);
  const mine = incoming.filter(({ message }) => message.target_agent === AGENT);
  const outputs = [];
  for (const { message } of mine) {
    const out = process(message);
    const { transaction_id, risk_score, flagged } = out.data;
    const outcome = flagged ? `flagged: score ${risk_score}` : `clear: score ${risk_score}`;
    audit({ agent: AGENT, transactionId: transaction_id, outcome, detail: redact(message.data.source_account) });
    await writeMessage(dirs.output, out);
    outputs.push(out);
  }
  return outputs;
}

function isMain() {
  return globalThis.process.argv[1] && import.meta.url === pathToFileURL(globalThis.process.argv[1]).href;
}

if (isMain()) {
  await run();
}
