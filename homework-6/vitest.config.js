// vitest.config.js - test runner + coverage gate.
//
// Coverage is the quality gate enforced by the Task 3 pre-push hook: the line
// percentage is read from coverage/coverage-summary.json and a push is blocked
// below 80%. We keep that 80% threshold here too so `npm run coverage` fails
// locally the moment coverage regresses - the gate and the config agree.
//
// `all: true` means every file matched by `include` is reported even if no test
// imported it, so an untested module shows up as 0% instead of silently
// vanishing from the denominator.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      all: true,
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['agents/**/*.js', 'mcp/**/*.js', 'integrator.js'],
      thresholds: {
        lines: 80,
      },
    },
  },
});
