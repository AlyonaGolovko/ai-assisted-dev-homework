# Task 4 — Custom MCP Server (FastMCP) — Step-by-Step Plan

> Working checklist for building our own MCP server. Check off `[x]` as we go.
> (This file is a helper — can be deleted before final submission.)

## Goal

Build a custom MCP server in Python with **FastMCP** that reads `lorem-ipsum.md`
and returns the first **N words** (default **30**). It must expose:

- a **Resource** (a URI Claude can _read from_), and
- a **Tool** named **`read`** (an action Claude can _call_) with an optional `word_count`.

Then register it in `.mcp.json`, call the `read` tool, screenshot the result, and document it.

## Concept recap (goes in the docs)

- **Resource** = a URI Claude reads from (like a file/API) → here `lorem://words` returns text.
- **Tool** = an action Claude calls to perform an operation → here `read(word_count)` returns the words.

## Target files

```
homework-5/
├── custom-mcp-server/
│   ├── server.py          ← FastMCP server (resource + `read` tool)
│   ├── lorem-ipsum.md     ← source text
│   ├── requirements.txt   ← must include `fastmcp`
│   └── .venv/             ← local virtualenv (gitignored, NOT committed)
├── HOWTORUN.md            ← install / run / connect / test instructions
├── .mcp.json              ← add the `lorem` server entry
└── README.md              ← add Task 4 section
```

---

## Prerequisites

- [x] **Install modern Python** (3.10+): `brew install python@3.12`
- [x] Confirm it works: `python3.12 --version`

## Step 1 — Project scaffold + dependencies

- [x] Create `custom-mcp-server/requirements.txt` containing `fastmcp`
- [x] Create the virtualenv: `uv venv custom-mcp-server/.venv --python 3.12` (used uv — Homebrew Python 3.12 has a broken pyexpat that breaks pip; uv downloads its own CPython 3.12 and works fine)
- [x] Install deps: `uv pip install fastmcp --python custom-mcp-server/.venv/bin/python`
- [x] Verify: `custom-mcp-server/.venv/bin/python -c "import fastmcp; print(fastmcp.__version__)"` → 3.4.2

## Step 2 — Source text

- [x] Create `custom-mcp-server/lorem-ipsum.md` with a few paragraphs of lorem ipsum (enough for 30+ words)

## Step 3 — Write `server.py`

- [x] `from fastmcp import FastMCP`; create `mcp = FastMCP("lorem")`
- [x] Helper that reads `lorem-ipsum.md` and returns the first `word_count` words (default 30)
- [x] **Resource**: `@mcp.resource("lorem://words/{word_count}")` (+ a default `lorem://words` = 30 words)
- [x] **Tool**: `@mcp.tool()` named `read(word_count: int = 30)` returning the words
- [x] `if __name__ == "__main__": mcp.run()` (stdio transport)

## Step 4 — Run the server standalone (sanity check)

- [x] `custom-mcp-server/.venv/bin/python custom-mcp-server/server.py` starts with no errors (FastMCP 3.4.2, stdio transport)

## Step 5 — Register in `.mcp.json`

- [x] Add a `lorem` server using the **venv python (absolute path)** as `command` and `server.py` as the arg:

```json
"lorem": {
  "command": "/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-5/custom-mcp-server/.venv/bin/python",
  "args": ["/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-5/custom-mcp-server/server.py"]
}
```

- [x] (if needed) enable it in `.claude/settings.local.json`

## Step 6 — Activate + verify (user action)

- [x] Restart Claude Code (Node 22 so the other servers keep working)
- [x] `/mcp` → approve `lorem` → shows ✓ **connected** with the `read` tool

## Step 7 — Test the `read` tool (fresh prompt — user action)

- [x] Send: _"Use the lorem MCP server's `read` tool to get 5 words."_ → returns exactly 5 words
- [x] Send: _"Now call `read` with no word_count."_ → returns 30 words (the default)

## Step 8 — Screenshot (user action)

- [x] Save `docs/screenshots/custom-mcp-read-tool-result.png` (prompt + `read` tool call + word-limited result)

## Step 9 — Documentation

- [x] Write `HOWTORUN.md`: install deps, run server, connect MCP config, use/test the `read` tool
- [x] Add a **## Task 4: Custom MCP Server (FastMCP)** section to `README.md`
- [x] Include the Resource-vs-Tool explanation in the docs

---

## Verification (success criteria)

- [x] `server.py` runs under FastMCP with no errors
- [x] `read` tool returns exactly `word_count` words (and 30 by default)
- [x] Resource URI returns the same word-limited content
- [x] `fastmcp` listed in `requirements.txt`
- [x] `/mcp` shows `lorem` connected; startup command + config verified
- [x] `HOWTORUN.md` steps are complete and reproducible
- [x] `docs/screenshots/custom-mcp-read-tool-result.png` exists
