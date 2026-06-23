// integrator.js - the orchestrator (npm run pipeline).
//
// Loads sample-transactions.json, emits one input envelope per transaction into
// shared/input, then runs the three agents in order:
//   validator -> fraud detector -> reporting agent
// and prints a console summary. The shared message stages are reset at the
// start of every run so the pipeline is idempotent and the result counts are
// deterministic.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createMessage,
  defaultDirs,
  ensureDirs,
  resetDirs,
  writeMessage,
  PROJECT_ROOT,
} from './agents/lib/messaging.js';
import * as validator from './agents/transaction_validator.js';
import * as fraud from './agents/fraud_detector.js';
import * as reporting from './agents/reporting_agent.js';

const SAMPLES = path.join(PROJECT_ROOT, 'sample-transactions.json');

/**
 * Run the whole pipeline.
 * @param {object} [opts]
 * @param {object} [opts.dirs]         - shared stage dirs (defaults to the real shared/)
 * @param {string} [opts.samplesPath]  - path to the transactions file
 * @returns {Promise<object>} the pipeline summary
 */
export async function run({ dirs = defaultDirs, samplesPath = SAMPLES } = {}) {
  await ensureDirs(dirs);
  await resetDirs(dirs);

  const txns = JSON.parse(await readFile(samplesPath, 'utf8'));
  for (const txn of txns) {
    const msg = createMessage({
      source_agent: 'integrator',
      target_agent: 'transaction_validator',
      message_type: 'transaction',
      data: { ...txn },
    });
    await writeMessage(dirs.input, msg);
  }

  await validator.run({ dirs });
  await fraud.run({ dirs });
  const { summary } = await reporting.run({ dirs });

  printSummary(summary);
  return summary;
}

function printSummary(s) {
  console.log('\n=== Pipeline Summary ===');
  console.log(`Processed: ${s.processed}`);
  console.log(`Validated: ${s.validated}`);
  console.log(`Rejected:  ${s.rejected}`);
  console.log(`Flagged:   ${s.flagged}`);
  if (s.flagged_ids.length) {
    console.log(`Flagged transactions: ${s.flagged_ids.join(', ')}`);
  }
  if (s.rejection_reasons.length) {
    console.log('Rejected transactions:');
    for (const r of s.rejection_reasons) {
      console.log(`  - ${r.transaction_id}: ${r.reason}`);
    }
  }
  console.log('========================');
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  await run();
}
