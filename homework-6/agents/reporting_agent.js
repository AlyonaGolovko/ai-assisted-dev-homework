// reporting_agent.js - stage 3 (the sole writer of shared/results/).
//
// Consumes every reporting-targeted envelope in shared/output - both the
// rejected transactions routed straight from the validator and the scored
// transactions from the fraud detector - and writes:
//   - one shared/results/<transaction_id>.json per transaction
//   - one shared/results/pipeline-summary.json with the totals
//
// Result files keep the transaction id, amount, currency and outcome but never
// raw account numbers or names (PII stays out of persisted output).

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  defaultDirs,
  ensureDirs,
  readMessages,
} from './lib/messaging.js';
import { audit } from './lib/logger.js';

const AGENT = 'reporting_agent';

/**
 * Pure transform: reduce a final envelope to a persisted per-transaction
 * result. Rejected transactions carry a reason; validated ones carry the score.
 * @param {object} message
 * @returns {object} result
 */
export function process(message) {
  const d = message.data;
  const result = {
    transaction_id: d.transaction_id,
    status: d.status,
    amount: d.amount,
    currency: d.currency,
    transaction_type: d.transaction_type,
  };
  if (d.status === 'rejected') {
    result.reason = d.reason;
  } else {
    result.risk_score = d.risk_score ?? 0;
    result.flagged = d.flagged ?? false;
  }
  return result;
}

/** Build the aggregate summary from a list of per-transaction results. */
export function summarize(results) {
  const summary = {
    processed: results.length,
    validated: 0,
    rejected: 0,
    flagged: 0,
    flagged_ids: [],
    rejection_reasons: [],
  };
  for (const r of results) {
    if (r.status === 'validated') {
      summary.validated += 1;
      if (r.flagged) {
        summary.flagged += 1;
        summary.flagged_ids.push(r.transaction_id);
      }
    } else {
      summary.rejected += 1;
      summary.rejection_reasons.push({ transaction_id: r.transaction_id, reason: r.reason });
    }
  }
  return summary;
}

/** Side-effecting stage: read reporting-targeted messages, write results. */
export async function run({ dirs = defaultDirs } = {}) {
  await ensureDirs(dirs);
  const incoming = await readMessages(dirs.output);
  const mine = incoming
    .filter(({ message }) => message.target_agent === AGENT)
    .sort((a, b) => a.message.data.transaction_id.localeCompare(b.message.data.transaction_id));

  const results = [];
  for (const { message } of mine) {
    const result = process(message);
    await writeFile(
      path.join(dirs.results, `${result.transaction_id}.json`),
      JSON.stringify(result, null, 2),
    );
    const outcome = result.status === 'rejected'
      ? `reported rejected: ${result.reason}`
      : `reported validated (flagged: ${result.flagged}, score ${result.risk_score})`;
    audit({ agent: AGENT, transactionId: result.transaction_id, outcome });
    results.push(result);
  }

  const summary = summarize(results);
  await writeFile(
    path.join(dirs.results, 'pipeline-summary.json'),
    JSON.stringify(summary, null, 2),
  );
  return { results, summary };
}

function isMain() {
  return globalThis.process.argv[1] && import.meta.url === pathToFileURL(globalThis.process.argv[1]).href;
}

if (isMain()) {
  await run();
}
