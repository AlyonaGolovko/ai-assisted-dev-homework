# Banking Specification Template (hint)

> This is the template `/write-spec` fills in. Copy this structure into
> `specification.md` and replace every bracketed placeholder with concrete,
> testable content. Keep all five sections in this exact order. Do not delete a
> section; if it does not apply, state why in one line.

> Ingest the information from this file, implement the Low-Level Tasks, and
> generate the code that satisfies the High and Mid-Level Objectives.

## 1. High-Level Objective

- [One sentence describing what the system does and for whom. No implementation
  detail. Example shape: "Process raw banking transactions through cooperating
  agents that validate, score for fraud, and report outcomes."]

## 2. Mid-Level Objectives

> 4-5 items. Each must be concrete and testable: a reviewer can point at a file,
> a number, or a run output and say pass/fail. Avoid "robust", "fast", "secure"
> with no measure. Prefer "X is rejected with reason R", "score >= N flags it".

- [Testable objective 1 - what the system must do, not how]
- [Testable objective 2 - include the exact threshold / rule / file path]
- [Testable objective 3]
- [Testable objective 4]
- [Testable objective 5 - optional]

## 3. Implementation Notes

> Hard technical rules and constraints the implementation must obey. For a
> banking pipeline, at minimum cover money precision, currency validation,
> logging, and PII handling.

- Monetary values: use a precise decimal type for all amounts and arithmetic;
  never use binary float / `Number` math on money. [name the library]
- Currency codes: validate against ISO 4217. [how the code set is sourced]
- Audit logging: every agent operation logs an ISO-8601 (UTC) timestamp, agent
  name, transaction id, and outcome.
- PII: account numbers and names are sensitive; never written to logs in
  plaintext - redact or mask. [name the redaction rule]
- Runtime / language / module system: [e.g. Node 22, ESM]
- Dependencies: [list]
- Coding standards: [small testable functions, named exports, etc.]

## 4. Context

### Beginning context

- [Files that exist at the start, e.g. `sample-transactions.json`]
- [Current system state, available resources]

### Ending context

- [Files that will exist at the end, e.g. agent modules, integrator]
- [Expected system state, e.g. results in `shared/results/`, pipeline summary]
- [Quality bar, e.g. test coverage >= 90%]

## 5. Low-Level Tasks

> One entry per agent/component, in build order. Use this exact block for each.
> The Prompt is the literal text you would hand to the code-generation agent.

### 1. [Component / Agent name]

```
Task: [Agent name]
Prompt: "[The exact prompt you will give the code-generation agent]"
File to CREATE: [path, e.g. agents/transaction_validator.js]
Function to CREATE: [signature, e.g. process(message) -> message]
Details: [What it checks, transforms, or decides; the exact rules and outputs]
```

### 2. [Component / Agent name]

```
Task: [Agent name]
Prompt: "[...]"
File to CREATE: [path]
Function to CREATE: [signature]
Details: [...]
```

### 3. [Component / Agent name]

```
Task: [Agent name]
Prompt: "[...]"
File to CREATE: [path]
Function to CREATE: [signature]
Details: [...]
```

> Add further numbered blocks as needed (e.g. the integrator/orchestrator that
> wires the agents together).
