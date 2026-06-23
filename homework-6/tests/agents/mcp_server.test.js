// Tests for mcp/server.js - the read-only "pipeline-status" MCP server.
// The pure helpers (textContent / readResult / listResultIds) are tested
// directly; the tool + resource handlers are exercised end-to-end by wiring the
// server to an MCP Client over an in-memory transport pair. Everything points
// at a temp results dir built with fs.mkdtemp - the real shared/results/ is
// never touched.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import {
  textContent,
  readResult,
  listResultIds,
  createServer,
} from '../../mcp/server.js';

const TXN001 = { transaction_id: 'TXN001', status: 'validated', amount: '1500.00', currency: 'USD', transaction_type: 'transfer', risk_score: 0, flagged: false };
const TXN006 = { transaction_id: 'TXN006', status: 'rejected', amount: '200.00', currency: 'XYZ', transaction_type: 'transfer', reason: 'bad currency: XYZ' };
const SUMMARY = { processed: 2, validated: 1, rejected: 1, flagged: 0, flagged_ids: [], rejection_reasons: [{ transaction_id: 'TXN006', reason: 'bad currency: XYZ' }] };

let resultsDir;
let emptyDir;
const openClients = [];

async function seed(dir, name, obj) {
  await writeFile(path.join(dir, name), JSON.stringify(obj, null, 2));
}

// Wire a fresh Client to a fresh server over a linked in-memory transport pair.
async function connectClient(dir) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer({ resultsDir: dir });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  openClients.push({ client, server });
  return client;
}

beforeEach(async () => {
  resultsDir = await mkdtemp(path.join(tmpdir(), 'hw6-mcp-'));
  emptyDir = await mkdtemp(path.join(tmpdir(), 'hw6-mcp-empty-'));
  await seed(resultsDir, 'TXN001.json', TXN001);
  await seed(resultsDir, 'TXN006.json', TXN006);
  await seed(resultsDir, 'pipeline-summary.json', SUMMARY);
});

afterEach(async () => {
  while (openClients.length) {
    const { client, server } = openClients.pop();
    await client.close();
    await server.close();
  }
  await rm(resultsDir, { recursive: true, force: true });
  await rm(emptyDir, { recursive: true, force: true });
});

describe('pure helpers', () => {
  it('textContent wraps a string verbatim', () => {
    expect(textContent('hello')).toEqual({ content: [{ type: 'text', text: 'hello' }] });
  });

  it('textContent pretty-prints a non-string value as JSON', () => {
    expect(textContent({ a: 1 })).toEqual({ content: [{ type: 'text', text: '{\n  "a": 1\n}' }] });
  });

  it('readResult returns the parsed result or null when absent', async () => {
    expect(await readResult(resultsDir, 'TXN001')).toEqual(TXN001);
    expect(await readResult(resultsDir, 'MISSING')).toBeNull();
  });

  it('listResultIds lists ids (excluding the summary) and returns [] for a missing dir', async () => {
    expect(await listResultIds(resultsDir)).toEqual(['TXN001', 'TXN006']);
    expect(await listResultIds(path.join(resultsDir, 'does-not-exist'))).toEqual([]);
  });
});

describe('MCP handlers over an in-memory transport', () => {
  it('get_transaction_status returns a found result', async () => {
    const client = await connectClient(resultsDir);
    const res = await client.callTool({ name: 'get_transaction_status', arguments: { transaction_id: 'TXN001' } });
    const payload = JSON.parse(res.content[0].text);
    expect(payload.found).toBe(true);
    expect(payload.status).toBe('validated');
  });

  it('get_transaction_status returns a graceful not-found payload', async () => {
    const client = await connectClient(resultsDir);
    const res = await client.callTool({ name: 'get_transaction_status', arguments: { transaction_id: 'NOPE' } });
    const payload = JSON.parse(res.content[0].text);
    expect(payload.found).toBe(false);
    expect(payload.status).toBe('not found');
  });

  it('rejects an empty transaction_id (zod validation)', async () => {
    const client = await connectClient(resultsDir);
    const res = await client.callTool({ name: 'get_transaction_status', arguments: { transaction_id: '' } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('transaction_id must be a non-empty string');
  });

  it('list_pipeline_results summarizes every processed transaction', async () => {
    const client = await connectClient(resultsDir);
    const res = await client.callTool({ name: 'list_pipeline_results', arguments: {} });
    const payload = JSON.parse(res.content[0].text);
    expect(payload.count).toBe(2);
    expect(payload.results.map((r) => r.transaction_id)).toEqual(['TXN001', 'TXN006']);
    expect(payload.results.find((r) => r.transaction_id === 'TXN006').reason).toBe('bad currency: XYZ');
  });

  it('exposes the pipeline://summary resource as JSON text', async () => {
    const client = await connectClient(resultsDir);
    const res = await client.readResource({ uri: 'pipeline://summary' });
    expect(res.contents[0].mimeType).toBe('application/json');
    expect(JSON.parse(res.contents[0].text)).toEqual(SUMMARY);
  });

  it('returns a helpful error payload when the summary file is missing', async () => {
    const client = await connectClient(emptyDir);
    const res = await client.readResource({ uri: 'pipeline://summary' });
    expect(JSON.parse(res.contents[0].text).error).toMatch(/run `npm run pipeline`/);
  });
});
