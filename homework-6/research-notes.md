# Research Notes - context7 queries

Library documentation was pulled live via the **context7** MCP server while
building the pipeline. Each query below records the search term, the resolved
Context7 library ID, and the insight that was applied to the code.

## Query 1 - decimal.js rounding and comparison

- **Search term:** "Configure ROUND_HALF_UP with 2 decimal places; compare two
  decimal values; convert a string to Decimal; toFixed for fixed output"
- **Resolved library ID:** `/mikemcl/decimal.js`
- **Applied insight:** `ROUND_HALF_UP` is decimal.js rounding **mode 4** and is
  the library default; it is set explicitly with
  `Decimal.set({ rounding: Decimal.ROUND_HALF_UP })`. Comparisons use
  `comparedTo` / `greaterThan` (not float operators), and `toFixed(2)` returns a
  fixed-point **string** rounded with the configured mode. This shaped
  `agents/lib/money.js`: `gt()` uses `.greaterThan()`, `round2()` uses
  `.toFixed(2)`, and money never becomes a JS `Number`. It also confirmed the
  TXN003 edge case (`"9999.99" > "10000"` is `false`) resolves correctly under
  decimal comparison.

## Query 2 - @modelcontextprotocol/sdk server over stdio

- **Search term:** "Create an McpServer with StdioServerTransport; register a
  tool with a zod input schema; register a resource; return text content"
- **Resolved library ID:** `/modelcontextprotocol/typescript-sdk`
- **Applied insight:** A server is created with
  `new McpServer({ name, version })`, tools are registered via
  `server.registerTool(name, { description, inputSchema: z.object({...}) }, handler)`,
  and the handler returns `{ content: [{ type: 'text', text: ... }] }`. The
  process is wired to stdio with
  `await server.connect(new StdioServerTransport())`. This is the foundation for
  the custom `mcp/server.js` built in Task 4 (`get_transaction_status`,
  `list_pipeline_results`, and the `pipeline://summary` resource), and confirmed
  `zod` belongs in `dependencies` alongside the SDK.
