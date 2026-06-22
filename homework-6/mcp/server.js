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

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// mcp/ -> project root -> shared/results
const RESULTS_DIR = path.resolve(HERE, '..', 'shared', 'results');
const SUMMARY_FILE = path.join(RESULTS_DIR, 'pipeline-summary.json');

/** A `{ type: 'text' }` content payload from a JS value (pretty JSON or string). */
function textContent(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }] };
}

/** Read and parse a single <transaction_id>.json result file, or null if absent. */
async function readResult(transactionId) {
  const file = path.join(RESULTS_DIR, `${transactionId}.json`);
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/** List the transaction ids that have a result file in shared/results/. */
async function listResultIds() {
  let entries;
  try {
    entries = await readdir(RESULTS_DIR);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith('.json') && name !== 'pipeline-summary.json')
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
}

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
    const result = await readResult(transaction_id);
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
    const ids = await listResultIds();
    const results = [];
    for (const id of ids) {
      const r = await readResult(id);
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
      text = await readFile(SUMMARY_FILE, 'utf8');
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

const transport = new StdioServerTransport();
await server.connect(transport);
