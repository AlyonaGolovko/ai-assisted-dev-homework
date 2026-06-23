// logger.js - audit logging and PII redaction.
//
// Every agent operation emits one audit line carrying an ISO-8601 UTC
// timestamp, the agent name, the transaction id, and the outcome. Account
// numbers and names are PII and must never appear in a log in plaintext, so
// callers pass them through redact() first.
//
// Audit lines are written to stderr so they stay separate from the integrator's
// stdout summary while remaining visible during a run. The formatted line is
// also returned, which keeps audit() easy to unit-test.

/**
 * Mask a sensitive value, keeping a short non-sensitive prefix.
 * e.g. "ACC-1001" -> "ACC-****", "Jane Doe" -> "Jane****".
 * Short values are fully masked.
 */
export function redact(value) {
  if (value === undefined || value === null) return value;
  const s = String(value);
  if (s.length <= 4) return '****';
  return `${s.slice(0, 4)}****`;
}

/**
 * Emit one audit line. Returns the formatted line.
 * @param {object} entry
 * @param {string} entry.agent          - emitting agent name
 * @param {string} entry.transactionId  - transaction id (never PII)
 * @param {string} entry.outcome        - short outcome, e.g. "validated", "rejected: bad currency", "flagged: score 65"
 * @param {string} [entry.detail]       - optional extra context (must be pre-redacted)
 */
export function audit({ agent, transactionId, outcome, detail }) {
  const timestamp = new Date().toISOString(); // ISO-8601, UTC, trailing Z
  const parts = [timestamp, agent, transactionId ?? '-', outcome];
  if (detail) parts.push(detail);
  const line = parts.join(' | ');
  console.error(line);
  return line;
}
