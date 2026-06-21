# Multi-Agent Banking Transaction Pipeline Specification

> Generated with `/write-spec` for "a file-based multi-agent banking transaction
> pipeline with validator, fraud detector, and reporting agents", then refined
> to match the binding rules in `agents.md`.

> Ingest the information from this file, implement the Low-Level Tasks, and
> generate the code that satisfies the High and Mid-Level Objectives.

## 1. High-Level Objective

- Process raw banking transactions through three cooperating, file-based agents
  that validate each transaction, score it for fraud risk, and report the final
  outcome to `shared/results/`.

## 2. Mid-Level Objectives

- The Transaction Validator rejects any transaction that is missing a required
  field, carries a currency not in the ISO 4217 code set, has an `amount` that
  is not a string matching `^-?\d+(\.\d{1,2})?$`, or has `amount <= 0` unless
  `transaction_type === "refund"`; each rejection is written to
  `shared/results/<id>.json` with `status: "rejected"` and a `reason`.
- The Fraud Detector assigns an additive `risk_score` (capped at 100) using
  high-value (+50 if amount > 10,000), off-hours (+25 if UTC hour in 0-5),
  cross-border (+25 if country != "US" or currency != "USD"), and wire
  high-value (+15 if wire_transfer and amount > 10,000), and sets
  `flagged = (risk_score >= 50)`.
- Running `npm run pipeline` over `sample-transactions.json` produces exactly 8
  result files in `shared/results/` plus `pipeline-summary.json`, matching the
  acceptance oracle: 7 validated, 1 rejected (TXN006), 3 flagged (TXN002,
  TXN004, TXN005).
- Every agent operation is appended to the audit log with an ISO-8601 UTC
  timestamp, the agent name, the transaction id, and the outcome; account
  numbers and names never appear in the log in plaintext (they are redacted).
- All monetary comparisons and arithmetic use `decimal.js` on decimal-string
  amounts; no path in the pipeline parses an amount into a JS `Number`.

## 3. Implementation Notes

- Money: carry amounts as decimal strings; convert with `decimal.js` for any
  compare/arithmetic. Never use `Number`, `parseFloat`, or float operators on
  money. Rounding is `ROUND_HALF_UP` to 2 decimal places.
- Currency: validate against a hardcoded ISO 4217 alphabetic code set (USD, EUR,
  GBP, JPY, CHF, CAD, AUD, ...). No network call, no external dependency for
  this check.
- Audit logging: `agents/lib/logger.js` `audit({ agent, transactionId, outcome,
  detail })` writes one ISO-8601 UTC line per operation.
- PII: `source_account`, `destination_account`, names, and `description` are
  sensitive; redact via `redact(value)` before logging (e.g. `ACC-1001` ->
  `ACC-****`). Never log raw account numbers or names.
- Runtime: Node.js 22, ESM only (`"type": "module"`); `import`/`export`, no
  `require`. UUIDs from `node:crypto` `randomUUID()`.
- Dependencies: `decimal.js`, `@modelcontextprotocol/sdk`, `zod`; dev:
  `vitest`, `@vitest/coverage-v8`.
- Conventions: small, pure, testable functions; named exports; each agent
  exports a pure `process(message)` and a side-effecting `run()`.
- Messaging: every file in `shared/` is a single JSON envelope with
  `message_id`, `timestamp`, `source_agent`, `target_agent`, `message_type`,
  `data`. See `agents.md` section 5.

## 4. Context

### Beginning context

- `sample-transactions.json` - 8 raw transaction records (exists).
- `agents.md` - binding project rules. `specification-TEMPLATE-hint.md` - the
  template this spec fills in.
- `homework-6/` is otherwise greenfield (no runtime code yet).

### Ending context

- `agents/lib/{messaging,money,logger}.js` - shared helpers.
- `agents/transaction_validator.js`, `agents/fraud_detector.js`,
  `agents/reporting_agent.js` - the three pipeline agents.
- `integrator.js` - orchestrator.
- `shared/{input,processing,output,results}/` populated by a run; final outcomes
  and `pipeline-summary.json` in `shared/results/`.
- Test suite with coverage >= 90% (gate 80%).

## 5. Low-Level Tasks

### 1. Shared libraries (foundation)

```
Task: Shared libraries
Prompt: "Create the ESM helper modules for the pipeline: agents/lib/messaging.js with createMessage({source_agent,target_agent,message_type,data}) (randomUUID + ISO-8601 UTC timestamp), writeMessage(dir,msg), readMessages(dir), moveMessage(file,fromDir,toDir), ensureDirs(), isoNow(); agents/lib/money.js with toDecimal(str), isValidAmountString(str) matching ^-?\\d+(\\.\\d{1,2})?$, gt(a,b), round2(d) using ROUND_HALF_UP; agents/lib/logger.js with audit({agent,transactionId,outcome,detail}) writing one ISO-8601 UTC line and redact(value) masking account numbers and names. Use decimal.js in money.js; never float."
File to CREATE: agents/lib/messaging.js, agents/lib/money.js, agents/lib/logger.js
Function to CREATE: createMessage(), writeMessage(), readMessages(), moveMessage(), ensureDirs(), isoNow(); toDecimal(), isValidAmountString(), gt(), round2(); audit(), redact()
Details: messaging builds and moves message envelopes (see agents.md section 5) and creates shared/{input,processing,output,results}. money does all decimal math via decimal.js with ROUND_HALF_UP; isValidAmountString enforces the amount regex. logger emits ISO-8601 UTC audit lines and redacts PII so account numbers/names are never logged in plaintext.
```

### 2. Transaction Validator

```
Task: Transaction Validator
Prompt: "Create agents/transaction_validator.js as an ESM module exporting process(message) and run(). process applies the validation rules and returns a message with status validated or rejected (plus reason). run reads shared/input, moves each message through shared/processing, and writes validated messages to shared/output for the fraud detector; rejected ones are reported out. Support a --dry-run flag that validates sample-transactions.json and prints a table without moving files. Use agents/lib/money.js for amount checks and agents/lib/logger.js for audit logging; validate currency against ISO 4217."
File to CREATE: agents/transaction_validator.js
Function to CREATE: process(message) -> message; run({ dryRun }?)
Details: Reject if any required field is missing, currency is not a valid ISO 4217 code, amount fails ^-?\\d+(\\.\\d{1,2})?$, or amount <= 0 unless transaction_type === "refund". Valid -> status "validated"; invalid -> status "rejected" with a reason. Amount comparisons go through decimal.js. Audit-log every decision with redacted PII.
```

### 3. Fraud Detector

```
Task: Fraud Detector
Prompt: "Create agents/fraud_detector.js as an ESM module exporting process(message) and run(). process computes an additive risk_score (capped at 100) and sets flagged = (risk_score >= 50), then carries risk_score and flagged forward in the message data. run reads validated messages from shared/output, processes them, and writes results forward for the reporting agent. Use decimal.js (via agents/lib/money.js) for all amount comparisons and agents/lib/logger.js for audit logging."
File to CREATE: agents/fraud_detector.js
Function to CREATE: process(message) -> message; run()
Details: Scoring - high-value +50 (amount > 10,000); off-hours +25 (UTC hour of timestamp in 0-5); cross-border +25 (metadata.country != "US" OR currency != "USD"); wire high-value +15 (transaction_type === "wire_transfer" AND amount > 10,000). Cap at 100; flag at >= 50. On the samples this flags TXN002 (65), TXN004 (50), TXN005 (65). Audit-log score and flag with redacted PII.
```

### 4. Reporting Agent

```
Task: Reporting Agent
Prompt: "Create agents/reporting_agent.js as an ESM module exporting process(message) and run(). run reads processed messages from shared/output, writes one shared/results/<transaction_id>.json per transaction (final status, reason if rejected, risk_score, flagged), and writes shared/results/pipeline-summary.json with totals: processed, validated, rejected, flagged, and the list of rejection reasons. Use agents/lib/logger.js for audit logging."
File to CREATE: agents/reporting_agent.js
Function to CREATE: process(message) -> result; run()
Details: One result file per transaction id plus a single pipeline-summary.json. Summary counts must match the oracle for the samples: processed 8, validated 7, rejected 1 (TXN006: bad currency), flagged 3 (TXN002, TXN004, TXN005). Audit-log each result with redacted PII.
```

### 5. Integrator (orchestrator)

```
Task: Integrator
Prompt: "Create integrator.js as an ESM module that runs the full pipeline: call ensureDirs(), load sample-transactions.json, emit one input message per transaction into shared/input, then run the validator, fraud detector, and reporting agent in order, and print a console summary (processed / validated / rejected / flagged + rejected ids and reasons). Wire it to npm run pipeline."
File to CREATE: integrator.js
Function to CREATE: main() / run()
Details: Deterministic order: input -> validator -> processing/output -> fraud -> output -> reporting -> results. After the run, shared/results/ holds 8 files + pipeline-summary.json matching the oracle. No float math anywhere; audit log records every stage; PII stays redacted in logs.
```
