// check-coverage.cjs - standalone coverage gate. Prints line coverage and exits
// 2 if it is below 80%, 0 otherwise; exits 2 if the summary is missing. Written
// as CommonJS with synchronous I/O for the same any-node compatibility reason as
// pre-push-guard.cjs.

const fs = require('fs');
const path = require('path');

const THRESHOLD = 80;
const SUMMARY_PATH = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');

let raw;
try {
  raw = fs.readFileSync(SUMMARY_PATH, 'utf8');
} catch (err) {
  console.error('Coverage summary not found at ' + SUMMARY_PATH + '. Run `npm run coverage` first.');
  process.exit(2);
}

const summary = JSON.parse(raw);
const pct = summary && summary.total && summary.total.lines ? summary.total.lines.pct : undefined;
if (typeof pct !== 'number') {
  console.error('Coverage summary is missing total.lines.pct.');
  process.exit(2);
}

console.log('Line coverage: ' + pct + '% (threshold ' + THRESHOLD + '%)');
process.exit(pct < THRESHOLD ? 2 : 0);
