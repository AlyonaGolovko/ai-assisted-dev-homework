---
description: Generate a testable banking specification.md from the hint template and a feature description
argument-hint: <feature description>
---

# /write-spec

Generate a complete, testable project specification by filling in the banking
template. The feature to specify is:

> $ARGUMENTS

## Steps

1. If `$ARGUMENTS` is empty, ask the user for a one-line feature description and
   stop until they answer. Do not invent a feature.
2. Read `specification-TEMPLATE-hint.md` (the structure to fill in) and
   `agents.md` (the binding project rules: stack, money, currency, message
   envelope, `shared/` layout, agents, PII/audit logging, npm scripts).
3. Write `specification.md` using all five sections from the hint template, in
   this exact order:
   - **High-Level Objective** - one sentence, no implementation detail.
   - **Mid-Level Objectives** - 4-5 items, each concrete and testable: a
     reviewer can point at a file, a number, or a run output to judge pass/fail.
     Bake in the exact thresholds and file paths from `agents.md` (e.g. fraud
     flag at score >= 50, rejected transactions written to `shared/results/`
     with a `reason`, audit lines carry ISO-8601 UTC timestamps).
   - **Implementation Notes** - carry over the non-negotiable rules from
     `agents.md`: decimal money (never float), ISO 4217 currency, ISO-8601 audit
     logging, no plaintext PII, Node 22 ESM, named dependencies.
   - **Context** - Beginning context (`sample-transactions.json` exists) and
     Ending context (agent modules + integrator exist; results in
     `shared/results/`; coverage >= 90%).
   - **Low-Level Tasks** - one numbered block per agent, in build order, plus the
     integrator that wires them. Each block uses exactly:
     ```
     Task: [Agent name]
     Prompt: "[exact prompt for the code-generation agent]"
     File to CREATE: [path]
     Function to CREATE: [signature, e.g. process(message) -> message]
     Details: [what it checks, transforms, or decides + exact rules/outputs]
     ```
4. Make sure the spec is internally consistent with `agents.md`: the message
   envelope, the `shared/input|processing|output|results` flow, the three
   pipeline agents (validator, fraud detector, reporting), and the npm scripts
   must match. Do not contradict any rule in `agents.md`.

## Output

Write the result to `specification.md` in the project root. Then print a short
summary: the High-Level Objective line and the count of Mid-Level Objectives and
Low-Level Tasks produced.

## Constraints

- Do not write any pipeline/runtime code - this command produces a spec only.
- Every Mid-Level Objective must be testable (measurable threshold, named file,
  or observable run output). Reject vague words like "robust" or "fast" unless
  paired with a measure.
- The spec must mandate: decimal money (never float), ISO 4217 currency
  validation, and no plaintext PII in logs.
