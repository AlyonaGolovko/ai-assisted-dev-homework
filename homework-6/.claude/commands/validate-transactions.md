---
description: Dry-run the validator over sample-transactions.json and report a pass/fail table
---

# /validate-transactions

Validate every transaction in `sample-transactions.json` without running the
full pipeline or moving any files. This uses the validator's `--dry-run` mode.

## Steps

1. Confirm `sample-transactions.json` exists. If it is missing, stop and tell
   the user the input file is required.
2. Run the validator in dry-run mode:
   ```bash
   node agents/transaction_validator.js --dry-run
   ```
3. Parse the output. Report the totals: **total**, **valid**, and **invalid**.
4. Render the per-transaction results as a Markdown table with columns:
   `TXN | Currency | Amount | Status | Reason`. Leave the reason blank for valid
   transactions; for invalid ones, show the exact rejection reason.

## Output

Print:

- A one-line summary: `Total: N | valid: V | invalid: I`.
- The Markdown table of all transactions.

## Constraints

- Do not move, write, or delete any files in `shared/` - this is a read-only
  dry run.
- Report the actual statuses and reasons from the command output; do not invent
  results.
