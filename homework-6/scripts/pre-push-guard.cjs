// pre-push-guard.cjs - Claude Code PreToolUse hook (matcher: Bash).
//
// Reads the PreToolUse event JSON from stdin. Acts only on Bash commands that
// contain `git push`; everything else exits 0 (allowed). For a push it enforces
// the 80% line-coverage gate from coverage/coverage-summary.json:
//   coverage >= 80  -> exit 0 (allow)
//   coverage <  80  -> exit 2 (block)
//   summary missing -> exit 2 (block, asks to run `npm run coverage`)
//
// Exit code 2 is how Claude Code blocks a tool call; stderr is the block reason.
//
// Written as CommonJS with synchronous I/O on purpose: Claude Code spawns this
// hook under whatever node the environment resolves (which may be an older
// nvm-default version, not the project's Node 22). CommonJS + sync fs avoids
// ESM / `node:` builtins / top-level await / optional chaining, so the gate
// runs on any node version.

const fs = require('fs');
const path = require('path');

const THRESHOLD = 80;
const SUMMARY_PATH = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8'); // fd 0 = stdin
  } catch (err) {
    return ''; // no stdin attached -> treat as empty (fail open)
  }
}

let event;
try {
  event = JSON.parse(readStdinSync());
} catch (err) {
  // Not a parseable hook payload - do not interfere with the command.
  process.exit(0);
}

const command = (event && event.tool_input && event.tool_input.command) || '';
if (command.indexOf('git push') === -1) {
  process.exit(0); // not a push - allow it through untouched
}

// This is a `git push`: enforce the coverage gate.
let raw;
try {
  raw = fs.readFileSync(SUMMARY_PATH, 'utf8');
} catch (err) {
  console.error(
    'Blocked git push: coverage report not found. Run `npm run coverage` first (expected ' +
      SUMMARY_PATH + ').',
  );
  process.exit(2);
}

let pct;
try {
  const parsed = JSON.parse(raw);
  pct = parsed && parsed.total && parsed.total.lines ? parsed.total.lines.pct : undefined;
} catch (err) {
  console.error('Blocked git push: coverage-summary.json is not valid JSON. Re-run `npm run coverage`.');
  process.exit(2);
}

if (typeof pct !== 'number') {
  console.error('Blocked git push: coverage-summary.json is missing total.lines.pct. Re-run `npm run coverage`.');
  process.exit(2);
}

if (pct < THRESHOLD) {
  console.error(
    'Blocked git push: line coverage is ' + pct + '%, below the ' + THRESHOLD +
      '% gate. Add tests until `npm run coverage` reports >= 80%.',
  );
  process.exit(2);
}

process.exit(0); // coverage passes - allow the push
