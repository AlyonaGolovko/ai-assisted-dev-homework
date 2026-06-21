// money.js - decimal-safe money helpers.
//
// Every monetary amount in the pipeline is carried as a decimal STRING (e.g.
// "1500.00") and only ever converted with decimal.js for comparison or
// arithmetic. We never parse an amount into a JS Number, never use parseFloat,
// and never use the + - * operators on money. Rounding is ROUND_HALF_UP to 2
// decimal places.

import Decimal from 'decimal.js';

// ROUND_HALF_UP is decimal.js rounding mode 4 (and the library default). We set
// it explicitly so the behaviour is independent of any other configuration.
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

// A valid amount is an optionally-signed integer with up to two decimal places.
const AMOUNT_RE = /^-?\d+(\.\d{1,2})?$/;

/** Return true if `value` is a string shaped like a money amount. */
export function isValidAmountString(value) {
  return typeof value === 'string' && AMOUNT_RE.test(value);
}

/** Convert a decimal string (or Decimal) into a Decimal instance. */
export function toDecimal(value) {
  return value instanceof Decimal ? value : new Decimal(value);
}

/** Strictly greater-than comparison for two money values. */
export function gt(a, b) {
  return toDecimal(a).greaterThan(toDecimal(b));
}

/**
 * Round a money value to 2 decimal places using ROUND_HALF_UP and return it as
 * a string so it can travel safely inside a message envelope.
 */
export function round2(value) {
  return toDecimal(value).toFixed(2);
}

export { Decimal };
