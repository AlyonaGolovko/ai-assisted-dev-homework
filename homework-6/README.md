# Homework 6 — AI-Powered Multi-Agent Banking Pipeline

> **Student Name**: Alona Holovko
> **Date Submitted**: 22.06.2026
> **AI Tools Used**: Claude Code

---

A file-based, multi-agent banking transaction pipeline built in Node.js. Three
cooperating agents pass JSON message envelopes through a shared directory bus to
validate, risk-score, and report on a batch of transactions. The system is
wrapped with Claude Code tooling: slash commands that drive it, a pre-push hook
that gates on test coverage, and a custom MCP server that makes the pipeline's
results queryable.

Money is handled with `decimal.js` (never floating point), currencies are
validated against ISO 4217, and PII (account numbers, names) is redacted from
every log and kept out of all persisted output.

## The pipeline agents

- **Transaction Validator** (`agents/transaction_validator.js`) — the entry
  stage. Checks every transaction for required fields, an ISO 4217 currency, a
  well-formed decimal `amount`, and a positive amount (negatives are allowed
  only for refunds). Valid transactions are routed to the fraud detector;
  rejected ones go straight to reporting with a reason.
- **Fraud Detector** (`agents/fraud_detector.js`) — scores each validated
  transaction with an additive risk model (high-value, off-hours, cross-border,
  and high-value-wire signals), caps the score at 100, and flags anything
  scoring ≥ 50. Every amount comparison goes through `decimal.js`.
- **Reporting Agent** (`agents/reporting_agent.js`) — the sole writer of
  `shared/results/`. Consumes both rejected and scored transactions, writes one
  `shared/results/<transaction_id>.json` per transaction, and aggregates a
  `shared/results/pipeline-summary.json` with processed / validated / rejected /
  flagged counts.

An **integrator** (`integrator.js`) orchestrates the three agents in order and
prints a run summary. A custom **MCP server** (`mcp/server.js`) exposes the
results read-only over the Model Context Protocol.

## Architecture

```
                          ┌──────────────────────────────────────────────┐
                          │  integrator.js  (npm run pipeline)             │
                          │  load sample-transactions.json → emit msgs     │
                          └───────────────────────┬──────────────────────┘
                                                  │ writes envelopes
                                                  ▼
        ┌───────────┐   ┌───────────────────┐   ┌──────────────────┐   ┌──────────────────┐
        │  shared/  │   │     shared/       │   │     shared/      │   │     shared/      │
        │  input/   │   │   processing/     │   │     output/      │   │     results/     │
        └─────┬─────┘   └─────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘
              │                   │                      │                      │
              ▼                   ▼                      ▼                      ▼
    ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐   one <id>.json
    │ Transaction       │   │ (in-flight)       │   │ Fraud Detector    │   per transaction
    │ Validator         │──▶│                   │──▶│ risk_score+flagged│──▶ + pipeline-
    │ valid / rejected  │   │                   │   │                   │     summary.json
    └─────────┬─────────┘   └───────────────────┘   └─────────┬─────────┘        │
              │ rejected (skips fraud) ─────────────────────────────────▶ Reporting Agent
              │                                                          (sole results writer)
              └──────────────────────────────────────────────────────────────────┘
                                                  │
                              shared/results/  ◀──┘  read-only
                                    ▲
                                    │
                          ┌─────────┴───────────┐
                          │ mcp/server.js       │   tools:    get_transaction_status,
                          │ "pipeline-status"   │             list_pipeline_results
                          │ (MCP over stdio)    │   resource: pipeline://summary
                          └─────────────────────┘

  Claude Code layer:  /write-spec  /run-pipeline  /validate-transactions   (.claude/commands)
                      pre-push hook → blocks `git push` when coverage < 80% (.claude/settings.json)
```

Every file written under `shared/` is a standard message envelope:

```json
{
  "message_id": "uuid4",
  "timestamp": "ISO-8601Z",
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

## Expected outcome (acceptance oracle)

Running the pipeline over the 8 sample transactions yields **7 validated,
1 rejected, 3 flagged**: `TXN006` is rejected (currency `XYZ` is not ISO 4217),
and `TXN002`, `TXN004`, `TXN005` are flagged for fraud.

## Tech stack

| Area       | Choice                                         | Notes                                               |
| ---------- | ---------------------------------------------- | --------------------------------------------------- |
| Runtime    | Node.js ≥ 22, ESM (`"type": "module"`)         | Uses top-level `await` and `node:` built-ins        |
| Money      | `decimal.js`                                   | Never float; `ROUND_HALF_UP` to 2 dp                |
| Currency   | `currency-codes`                               | ISO 4217 validation                                 |
| IDs / time | `node:crypto` `randomUUID()`, ISO-8601 UTC     | Message ids + audit timestamps                      |
| MCP        | `@modelcontextprotocol/sdk` + `zod`            | stdio transport; zod-validated tool inputs          |
| Tests      | `vitest` + `@vitest/coverage-v8`               | v8 coverage, `json-summary` reporter, 80% line gate |
| Tooling    | Claude Code slash commands + a PreToolUse hook | `.claude/commands/`, `.claude/settings.json`        |

## Testing

`npm run coverage` runs the full suite (81 tests across `tests/{lib,agents,integration}`)
and enforces an 80% line-coverage threshold; current line coverage is **97.5%**.
All tests run against temporary directories created with `fs.mkdtemp` — the real
`shared/` tree is never read or written.

See **[HOWTORUN.md](./HOWTORUN.md)** for step-by-step setup and run instructions.
