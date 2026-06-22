// Unit tests for agents/lib/money.js - the decimal-safe money helpers.
// These are the precision guardrails for the whole pipeline, so we exercise
// the amount-format grammar, the Decimal conversion (incl. the identity path),
// strict greater-than, and ROUND_HALF_UP rounding edges.

import { describe, it, expect } from 'vitest';

import {
  isValidAmountString,
  toDecimal,
  gt,
  round2,
  Decimal,
} from '../../agents/lib/money.js';

describe('isValidAmountString', () => {
  it.each([
    ['1500.00', true],
    ['9999.99', true],
    ['200', true],
    ['-100.00', true],
    ['100.5', true],
    ['0', true],
  ])('accepts well-formed amount %s', (value, expected) => {
    expect(isValidAmountString(value)).toBe(expected);
  });

  it.each([
    ['100.555', 'three decimals'],
    ['1,000.00', 'thousands separator'],
    ['1.2.3', 'two dots'],
    ['+100', 'leading plus'],
    ['abc', 'non-numeric'],
    ['', 'empty string'],
    ['  10', 'leading space'],
  ])('rejects malformed amount %s (%s)', (value) => {
    expect(isValidAmountString(value)).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isValidAmountString(100)).toBe(false);
    expect(isValidAmountString(null)).toBe(false);
    expect(isValidAmountString(undefined)).toBe(false);
  });
});

describe('toDecimal', () => {
  it('converts a string into a Decimal', () => {
    const d = toDecimal('1500.00');
    expect(d).toBeInstanceOf(Decimal);
    expect(d.toFixed(2)).toBe('1500.00');
  });

  it('returns the same instance when given a Decimal (identity path)', () => {
    const d = new Decimal('42');
    expect(toDecimal(d)).toBe(d);
  });
});

describe('gt', () => {
  it('is true only for strictly greater amounts', () => {
    expect(gt('10000.01', '10000')).toBe(true);
    expect(gt('25000.00', '10000')).toBe(true);
  });

  it('is false at the boundary and below', () => {
    expect(gt('10000', '10000')).toBe(false);
    expect(gt('9999.99', '10000')).toBe(false);
    expect(gt('-100', '0')).toBe(false);
  });

  it('works with Decimal operands too', () => {
    expect(gt(new Decimal('5'), new Decimal('4'))).toBe(true);
  });
});

describe('round2', () => {
  it('rounds half up at 2 decimal places', () => {
    expect(round2('1.005')).toBe('1.01');
    expect(round2('1.004')).toBe('1.00');
  });

  it('always returns a 2-decimal string', () => {
    expect(round2('2')).toBe('2.00');
    expect(round2('1500')).toBe('1500.00');
  });

  it('returns a string, never a number', () => {
    expect(typeof round2('3.14159')).toBe('string');
  });
});
