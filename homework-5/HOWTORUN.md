# How to Run the Custom Lorem MCP Server

## Prerequisites

- macOS with [Homebrew](https://brew.sh) installed
- `uv` Python package manager (installed below)

---

## 1. Install `uv`

`uv` is used instead of plain `pip` because the Homebrew Python 3.12 on macOS has a
broken `pyexpat` extension that prevents `pip` from running. `uv` is a Rust-based
installer that ships its own CPython and sidesteps the issue entirely.

```bash
pip3 install uv --user
```

---

## 2. Create the virtualenv and install dependencies

```bash
cd homework-5

uv venv custom-mcp-server/.venv --python 3.12
uv pip install fastmcp --python custom-mcp-server/.venv/bin/python
```

Verify:

```bash
custom-mcp-server/.venv/bin/python -c "import fastmcp; print(fastmcp.__version__)"
# expected: 3.4.2 (or newer)
```

---

## 3. Run the server standalone (sanity check)

```bash
custom-mcp-server/.venv/bin/python custom-mcp-server/server.py
```

You should see the FastMCP banner and `Starting MCP server 'lorem' with transport 'stdio'`.
Press `Ctrl+C` to stop.

---

## 4. Connect to Claude Code via `.mcp.json`

The server is already registered in `.mcp.json`:

```json
"lorem": {
  "command": "/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-5/custom-mcp-server/.venv/bin/python",
  "args": [
    "/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-5/custom-mcp-server/server.py"
  ]
}
```

> If you clone this repo, update the absolute paths to match your local directory.

After updating the paths (if needed), restart Claude Code and run `/mcp`.
Approve the `lorem` server when prompted — it should show as **connected** with the
`read` tool listed.

---

## 5. Test the `read` tool

In a Claude Code chat, send:

```
Use the lorem MCP server's read tool to get 5 words.
```

Expected result: exactly 5 words from `lorem-ipsum.md`.

```
Use the lorem MCP server's read tool with no word_count argument.
```

Expected result: the default 30 words.

---

## What the server exposes

| Type     | Identifier                   | Description                                     |
| -------- | ---------------------------- | ----------------------------------------------- |
| Tool     | `read(word_count: int = 30)` | Returns the first N words from `lorem-ipsum.md` |
| Resource | `lorem://words`              | Same content, default 30 words                  |
| Resource | `lorem://words/{word_count}` | Same content, N words as a URI parameter        |

### Resource vs Tool

- **Resource** — a URI that Claude can _read from_ passively, like fetching a file or API endpoint. Claude resolves `lorem://words` and gets back text, without "doing" anything.
- **Tool** — an action Claude can _call_ with arguments, like invoking a function. Claude calls `read(word_count=5)` and the server executes the logic and returns the result.
