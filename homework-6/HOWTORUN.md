# How to run — Homework 6 Banking Pipeline

Step-by-step instructions to set up the project, run the pipeline, run the
tests, use the Claude Code slash commands, and query the results over MCP.

## Prerequisites

- **Node.js ≥ 22** (the project uses ESM + top-level `await`; `package.json`
  pins `"engines": { "node": ">=22" }`). Check with `node --version`.
  If you use `nvm`, run `nvm use 22` (or `nvm install 22`) in this directory
  first — older Node versions will not run vitest 2.x.
- npm (ships with Node).

## 1. Install dependencies

```bash
npm install
```

This installs `decimal.js`, `currency-codes`, `@modelcontextprotocol/sdk`,
`zod`, and the dev tools `vitest` + `@vitest/coverage-v8`.

## 2. Run the pipeline

```bash
npm run pipeline
```

Loads `sample-transactions.json`, runs Validator → Fraud Detector → Reporting
Agent, and prints a summary. Expected result: **7 validated, 1 rejected,
3 flagged** (`TXN006` rejected; `TXN002`, `TXN004`, `TXN005` flagged). Per-
transaction results land in `shared/results/<id>.json`, with the aggregate in
`shared/results/pipeline-summary.json`.

## 3. Dry-run the validator

```bash
npm run validate
```

Validates `sample-transactions.json` without moving any files and prints a
pass/fail table plus total / valid / invalid counts.

## 4. Run the tests and coverage gate

```bash
npm test            # run the full vitest suite once
npm run coverage    # run with v8 coverage; fails if line coverage < 80%
```

`npm run coverage` writes `coverage/coverage-summary.json` and enforces the 80%
line threshold (current coverage ≈ 97.5%). All tests run against temporary
directories — they never touch the real `shared/` tree.

## 5. Use the Claude Code slash commands

Open this project in Claude Code, then run any of:

- **`/run-pipeline`** — checks the sample file, clears `shared/`, runs the
  pipeline, and summarizes results + rejections.
- **`/validate-transactions`** — dry-runs the validator and reports a
  total / valid / invalid table.
- **`/write-spec <feature description>`** — generates a testable
  `specification.md` from the hint template (the Agent 1 workflow).

These are defined in `.claude/commands/`.

## 6. The coverage-gate hook (Agent 3)

`.claude/settings.json` registers a `PreToolUse` hook on `Bash`. When a command
contains `git push`, `scripts/pre-push-guard.cjs` runs the coverage check and
**blocks the push (exit 2) if line coverage is below 80%**; non-push commands
pass through untouched. With the test suite in place, coverage is ≈ 97.5%, so
pushes are allowed. To see the gate block a push, you would need coverage to
drop below 80%.

## 7. Query the pipeline over MCP

The custom **`pipeline-status`** MCP server (`mcp/server.js`) exposes the
results read-only. `mcp.json` registers two servers — `context7` (library docs)
and `pipeline-status`.

1. Make sure the pipeline has run at least once (step 2) so `shared/results/`
   is populated.
2. Register the servers from `mcp.json`. In Claude Code:
   ```bash
   claude mcp add-json pipeline-status '{"command":"node","args":["mcp/server.js"]}'
   ```
   (or point Claude Code at the project `mcp.json`). Then check `/mcp` to
   confirm both servers connect.
3. Use the tools / resource:
   - **`get_transaction_status({ transaction_id: "TXN001" })`** → returns that
     transaction's status (e.g. `validated`). A missing id returns a graceful
     `"not found"` payload.
   - **`list_pipeline_results()`** → lists every processed transaction with its
     status, flag, and risk score.
   - **resource `pipeline://summary`** → returns `pipeline-summary.json` as text.

You can also run the server directly to confirm it starts:

```bash
node mcp/server.js
```

It speaks MCP over stdio (no output until a client connects); press Ctrl-C to
stop.
