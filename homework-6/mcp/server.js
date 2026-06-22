// mcp/server.js - "pipeline-status" MCP server.
//
// Makes the banking pipeline's results queryable over the Model Context
// Protocol (stdio transport). It is a READ-ONLY view over shared/results/ -
// it never recomputes the pipeline. Task 2 is the sole writer of those files.
//
// Registered capabilities:
//   tool     get_transaction_status({ transaction_id })  - one result file
//   tool     list_pipeline_results()                     - summary of all files
//   resource pipeline://summary                          - pipeline-summary.json
//
// All tool inputs are validated with zod. A missing transaction is returned as
// a graceful "not found" payload rather than throwing.
//
// The server is built by createServer({ resultsDir }) so it can be wired to an
// in-memory transport against a temp directory in tests, never touching the
// real shared/results/. Run directly (`node mcp/server.js`) it builds the
// server over the default results dir and connects stdio - the isMain() guard
// keeps that side effect out of the way when the module is merely imported.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// mcp/ -> project root -> shared/results
export const DEFAULT_RESULTS_DIR = path.resolve(HERE, '..', 'shared', 'results');

/** A `{ type: 'text' }` content payload from a JS value (pretty JSON or string). */
export function textContent(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }] };
}

/** Read and parse a single <transaction_id>.json result file, or null if absent. */
export async function readResult(resultsDir, transactionId) {
  const file = path.join(resultsDir, `${transactionId}.json`);
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/** List the transaction ids that have a result file in `resultsDir`. */
export async function listResultIds(resultsDir) {
  let entries;
  try {
    entries = await readdir(resultsDir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith('.json') && name !== 'pipeline-summary.json')
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
}

/**
 * Build the pipeline-status MCP server over a given results directory.
 * @param {object} [opts]
 * @param {string} [opts.resultsDir]  - directory holding the <id>.json result files
 * @returns {McpServer}
 */
export function createServer({ resultsDir = DEFAULT_RESULTS_DIR } = {}) {
  const summaryFile = path.join(resultsDir, 'pipeline-summary.json');

  const server = new McpServer({
    name: 'pipeline-status',
    version: '1.0.0',
  });

  server.registerTool(
    'get_transaction_status',
    {
      title: 'Get transaction status',
      description:
        'Return the pipeline result for a single transaction id by reading ' +
        'shared/results/<transaction_id>.json. Returns a "not found" payload if ' +
        'the transaction was never processed.',
      inputSchema: {
        transaction_id: z
          .string()
          .min(1, 'transaction_id must be a non-empty string')
          .describe('The transaction id to look up, e.g. "TXN001".'),
      },
    },
    async ({ transaction_id }) => {
      const result = await readResult(resultsDir, transaction_id);
      if (result === null) {
        return textContent({
          transaction_id,
          found: false,
          status: 'not found',
          message: `No pipeline result for transaction "${transaction_id}".`,
        });
      }
      return textContent({ found: true, ...result });
    },
  );

  server.registerTool(
    'list_pipeline_results',
    {
      title: 'List pipeline results',
      description:
        'Summarize every processed transaction in shared/results/: id, status, ' +
        'flagged, and risk score. Excludes pipeline-summary.json.',
      inputSchema: {},
    },
    async () => {
      const ids = await listResultIds(resultsDir);
      const results = [];
      for (const id of ids) {
        const r = await readResult(resultsDir, id);
        if (!r) continue;
        results.push({
          transaction_id: r.transaction_id ?? id,
          status: r.status ?? 'unknown',
          flagged: r.flagged ?? false,
          risk_score: r.risk_score ?? null,
          reason: r.reason,
        });
      }
      return textContent({ count: results.length, results });
    },
  );

  server.registerResource(
    'pipeline-summary',
    'pipeline://summary',
    {
      title: 'Pipeline summary',
      description:
        'The aggregate pipeline-summary.json: processed/validated/rejected/' +
        'flagged counts, flagged ids, and rejection reasons.',
      mimeType: 'application/json',
    },
    async (uri) => {
      let text;
      try {
        text = await readFile(summaryFile, 'utf8');
      } catch {
        text = JSON.stringify(
          { error: 'pipeline-summary.json not found; run `npm run pipeline` first.' },
          null,
          2,
        );
      }
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text }],
      };
    },
  );

  return server;
}

function isMain() {
  return globalThis.process.argv[1] && import.meta.url === pathToFileURL(globalThis.process.argv[1]).href;
}

if (isMain()) {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
