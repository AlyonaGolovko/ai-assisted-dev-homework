# agents.md - Project Context for the Banking Pipeline

This file is the shared, authoritative context for every agent (human or AI)
working on this project. Read it before generating specs, code, tests, or docs.
The rules here are binding; `specification.md` and `/write-spec` must conform to
them.

## 1. Overview

A file-based, multi-agent banking transaction pipeline. Raw transactions enter
from `sample-transactions.json`; three cooperating agents process them in order
and write final outcomes to `shared/results/`:

```
sample-transactions.json
        |
   integrator  (loads samples, emits input messages, runs agents in order)
        |
  Transaction Validator  ->  Fraud Detector  ->  Reporting Agent
        |                         |                    |
   shared/input            shared/output         shared/results
   shared/processing
```

Agents do not call each other directly. They communicate only by reading and
writing JSON message files in `shared/` (see message envelope and layout below).

## 2. Stack and conventions

| Choice | Value |
|---|---|
| Language / runtime | Node.js 22 |
| Module system | ESM only (`"type": "module"`); use `import`/`export`, no `require` |
| Money | `decimal.js` - never binary float / `Number` math on amounts |
| Rounding | `ROUND_HALF_UP`, 2 decimal places |
| Currency | ISO 4217 validation via the `currency-codes` package |
| UUIDs | built-in `node:crypto` `randomUUID()` |
| Tests / coverage | `vitest` + `@vitest/coverage-v8`, `json-summary` reporter; gate 80%, aim >= 90% |
| MCP | `@modelcontextprotocol/sdk` (+ `zod`), stdio transport |
| Author | Alona Holovko |
| Commands dir | project-local `.claude/commands/` |

Coding conventions: small, pure, individually testable functions; named exports;
each agent exports a pure `process(message)` plus a side-effecting `run()` that
does file I/O. No secrets or live network calls in the pipeline.

## 3. Money rule (non-negotiable)

All monetary amounts are carried as decimal strings in messages (e.g.
`"1500.00"`) and converted with `decimal.js` for any comparison or arithmetic.
Never parse an amount into a JS `Number`, never use `parseFloat`, never use
`+`/`-`/`*` on money. Comparisons (e.g. amount > 10000) go through decimal
helpers. Rounding is `ROUND_HALF_UP` to 2 places.

## 4. Currency rule (ISO 4217)

Currencies are validated against ISO 4217 using the `currency-codes` package:
`cc.code(currency)` returns `undefined` for an unknown code, which causes the
validator to reject the transaction. We deliberately keep amount precision as a
simple <= 2 decimal-place check rather than varying decimals per currency.

## 5. Message envelope (standard at every stage)

Every file written to `shared/` is a single JSON object in this shape:

```json
{
  "message_id": "uuid4-string",
  "timestamp": "2026-03-16T10:00:00Z",
  "source_agent": "transaction_validator",
  "target_agent": "fraud_detector",
  "message_type": "transaction",
  "data": {
    "transaction_id": "TXN001",
    "amount": "1500.00",
    "currency": "USD",
    "status": "validated"
  }
}
```

- `message_id` - uuid4 from `randomUUID()`.
- `timestamp` - ISO-8601 in UTC (`...Z`).
- `source_agent` / `target_agent` - one of `integrator`, `transaction_validator`,
  `fraud_detector`, `reporting_agent`.
- `message_type` - `transaction` (extend only if specified).
- `data` - the transaction payload plus stage-specific fields (`status`,
  `reason`, `risk_score`, `flagged`).

## 6. Shared directory layout

```
shared/
  input/       integrator drops initial messages here
  processing/  an agent moves a message here while working on it
  output/      an agent writes its result here for the next agent
  results/     final per-transaction outcomes + pipeline summary land here
```

Flow: `input/` -> validator -> `processing/`/`output/` -> fraud -> `output/` ->
reporting -> `results/`. Each stage reads from its inbox, processes, and writes a
fresh envelope forward. Directories are created at startup (`ensureDirs()`); each
holds a `.gitkeep`.

## 7. Pipeline agents (the three cooperating modules)

### Transaction Validator - `agents/transaction_validator.js`
Validates raw transactions. Rejects if any of:
- a required field is missing,
- `currency` is not a valid ISO 4217 code,
- `amount` is not a numeric string matching `^-?\d+(\.\d{1,2})?$`,
- `amount <= 0`, unless `transaction_type === "refund"` (refunds may be negative).

Valid transactions get `status: "validated"` and pass to the fraud detector;
invalid ones get `status: "rejected"` plus a `reason` and are reported as
rejected.

### Fraud Detector - `agents/fraud_detector.js`
Computes an additive `risk_score` (capped at 100) and sets `flagged = score >= 50`:

| Signal | Condition | Points |
|---|---|---|
| High-value | `amount` > 10,000 | +50 |
| Off-hours | UTC hour of `timestamp` in 0-5 | +25 |
| Cross-border | `metadata.country !== "US"` OR `currency !== "USD"` | +25 |
| Wire high-value | `transaction_type === "wire_transfer"` AND `amount` > 10,000 | +15 |

All amount comparisons use `decimal.js`. Output carries `risk_score` and
`flagged` forward to reporting.

### Reporting Agent - `agents/reporting_agent.js`
Aggregates outcomes: writes one `shared/results/<transaction_id>.json` per
transaction and a `shared/results/pipeline-summary.json` with totals (processed,
validated, rejected, flagged, and the rejection reasons).

## 8. Audit logging and PII

- Audit log: every agent operation appends a line with an ISO-8601 UTC
  timestamp, agent name, transaction id, and outcome (e.g.
  `validated` / `rejected: bad currency` / `flagged: score 65`). Implemented in
  `agents/lib/logger.js` via `audit({ agent, transactionId, outcome, detail })`.
- PII: `source_account`, `destination_account`, and any name/description are
  sensitive. They must never appear in logs in plaintext. Use `redact(value)` to
  mask them (e.g. `ACC-1001` -> `ACC-****`) before logging. Result files may keep
  the transaction id but must not log raw account numbers.

## 9. Acceptance oracle (the 8 samples)

| Txn | Why | Result |
|---|---|---|
| TXN001 1500 USD transfer | clean | validated, not flagged |
| TXN002 25000 USD wire | 50+15=65 | flagged |
| TXN003 9999.99 USD transfer | just under 10k -> 0 | validated, not flagged |
| TXN004 500 EUR transfer 02:47 DE | 25+25=50 | flagged |
| TXN005 75000 USD wire | 50+15=65 | flagged |
| TXN006 200 XYZ | bad currency | rejected (never reaches fraud) |
| TXN007 -100 GBP refund GB | negative allowed for refund; cross-border 25 | validated, not flagged |
| TXN008 3200 USD transfer | clean | validated, not flagged |

Net: 7 validated, 1 rejected, 3 flagged.

## 10. npm scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run pipeline` | `node integrator.js` | run the full pipeline over the samples |
| `npm run validate` | `node agents/transaction_validator.js --dry-run` | validate samples only, print a table, no file moves |
| `npm test` | `vitest run` | run the test suite |
| `npm run coverage` | `vitest run --coverage` | run tests with coverage (json-summary; gate 80%) |

## 11. Supporting libraries

- `agents/lib/messaging.js` - `createMessage()`, `writeMessage()`,
  `readMessages()`, `moveMessage()`, `ensureDirs()`, `isoNow()`.
- `agents/lib/money.js` - `toDecimal()`, `isValidAmountString()`, `gt()`,
  `round2()` (ROUND_HALF_UP).
- `agents/lib/logger.js` - `audit()`, `redact()`.
