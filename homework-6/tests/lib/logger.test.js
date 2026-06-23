// Unit tests for agents/lib/logger.js - PII redaction + audit lines.
// Redaction is a security control (account numbers / names must never appear in
// plaintext), so we pin its exact masking. audit() writes to stderr; we spy on
// console.error to assert the line is emitted AND returned for testability.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { redact, audit } from '../../agents/lib/logger.js';

describe('redact', () => {
  it('keeps a 4-char prefix and masks the rest', () => {
    expect(redact('ACC-1001')).toBe('ACC-****');
    expect(redact('Jane Doe')).toBe('Jane****');
  });

  it('fully masks short values (<= 4 chars)', () => {
    expect(redact('abc')).toBe('****');
    expect(redact('1234')).toBe('****');
  });

  it('coerces non-strings before masking', () => {
    expect(redact(123456)).toBe('1234****');
  });

  it('passes null and undefined through unchanged', () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });
});

describe('audit', () => {
  let errSpy;

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
  });

  it('emits one pipe-delimited line to stderr and returns it', () => {
    const line = audit({
      agent: 'transaction_validator',
      transactionId: 'TXN001',
      outcome: 'validated',
      detail: 'ACC-**** -> ACC-****',
    });
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith(line);
    const parts = line.split(' | ');
    expect(parts[1]).toBe('transaction_validator');
    expect(parts[2]).toBe('TXN001');
    expect(parts[3]).toBe('validated');
    expect(parts[4]).toBe('ACC-**** -> ACC-****');
  });

  it('starts the line with an ISO-8601 UTC timestamp', () => {
    const line = audit({ agent: 'a', transactionId: 'TXN9', outcome: 'ok' });
    const timestamp = line.split(' | ')[0];
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });

  it('substitutes "-" for a missing transaction id and omits absent detail', () => {
    const line = audit({ agent: 'reporting_agent', outcome: 'done' });
    const parts = line.split(' | ');
    expect(parts[2]).toBe('-');
    expect(parts).toHaveLength(4); // timestamp | agent | "-" | outcome, no detail
  });
});
