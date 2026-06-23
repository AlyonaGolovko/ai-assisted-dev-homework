---
description: Run the banking pipeline end-to-end and summarize results + rejections
---

# /run-pipeline

Run the full multi-agent banking pipeline against `sample-transactions.json`
and report what came out the other end.

## Steps

1. Confirm `sample-transactions.json` exists in the project root. If it is
   missing, stop and tell the user the input file is required - do not run the
   pipeline.
2. Clear stale state from the previous run by removing every JSON file under
   `shared/input/`, `shared/processing/`, `shared/output/`, and
   `shared/results/` (keep each directory and its `.gitkeep`). For example:
   ```bash
   find shared -type f -name '*.json' -delete
   ```
3. Run the pipeline:
   ```bash
   npm run pipeline
   ```
4. Read `shared/results/pipeline-summary.json` and the per-transaction files in
   `shared/results/`. Summarize the run: total processed, validated, rejected,
   and flagged counts, plus the flagged transaction ids.
5. List every rejected transaction with its `transaction_id` and rejection
   `reason` (from `pipeline-summary.json`'s `rejection_reasons`).

## Output

Print a short summary in this shape:

- **Processed:** N (validated: V, rejected: R, flagged: F)
- **Flagged:** comma-separated transaction ids
- **Rejections:** a list of `transaction_id - reason`

If there were no rejections, say so explicitly.

## Constraints

- Do not modify `sample-transactions.json` or any agent/runtime code.
- Only delete generated JSON inside `shared/`; never delete the directories or
  their `.gitkeep` files.
- Report the actual numbers from `pipeline-summary.json` - do not assume the
  oracle outcome.
