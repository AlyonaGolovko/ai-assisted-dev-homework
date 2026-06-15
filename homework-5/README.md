# 🔌 Homework 5: Configure MCP Servers (GitHub, Filesystem, Jira or Notion, Custom)

> **Student Name**: Alona Holovko
> **Date Submitted**: 14.06.2026
> **AI Tools Used**: Claude Code

---

## Task 1: GitHub MCP

Connected Claude Code to GitHub via the official remote GitHub MCP server
(https://api.githubcopilot.com/mcp) using a fine-grained Personal Access Token.
The token is stored in `.env` (gitignored) and referenced in `.mcp.json` as
`${GITHUB_PAT}`.

**Interactions performed against `AlyonaGolovko/gen-ai-software-engineering`:**

1. Listed the repository's pull requests via the GitHub MCP server.
2. Created an issue — the server created "MCP test issue" (#7).

Screenshots: `docs/screenshots/github-list-prs.png`, `docs/screenshots/github-create-issue.png`, `docs/screenshots/github-issue.png`.

---

## Task 2: Filesystem MCP

Connected Claude Code to a local directory via the official Filesystem MCP server
(`@modelcontextprotocol/server-filesystem`), run locally over **stdio** with `npx`.
Unlike the remote GitHub server, this runs on the machine and needs no credentials —
access is scoped to a single allowed directory passed as an argument.

The server is registered in `.mcp.json` and enabled in
`.claude/settings.local.json`. It is scoped to the `homework-5` project folder.

**Interaction performed against the `homework-5` folder:**

Listed all files in the directory and summarized `README.md` — via the
filesystem MCP tools (`list_directory` / `read_text_file`).

Screenshots: `docs/screenshots/filesystem-mcp-connected.png` (server connected),
`docs/screenshots/filesystem-list-summarize.png` (list + read result).

---

## Task 3: Jira MCP

Connected Claude Code to Jira via the **official Atlassian Rovo MCP server**, a
remote server reached over **streamable HTTP** at `https://mcp.atlassian.com/v1/mcp`.
Authentication is **OAuth 2.1**, handled interactively by Claude Code (`/mcp` →
Authenticate → browser login) — no tokens are stored in `.mcp.json` or `.env`.

> Note: the first OAuth grant returned Confluence-only scopes, so Jira calls failed.
> Re-authorizing (`/mcp` → clear auth → reconnect) and accepting the **Jira** scopes
> on the Atlassian consent screen fixed it.

**Request performed (per the assignment):**

> "Give me the tickets of the last 5 bugs on a project."

Claude ran a JQL search via the Jira MCP server
(`issuetype = Bug ORDER BY created DESC`, limited to 5) and returned the 5 most
recent bug tickets. To avoid sharing sensitive information, only the ticket
**keys/numbers** are shown (see screenshot) — no summaries or descriptions.

Screenshots: `docs/screenshots/jira-mcp.png` (server connected),
`docs/screenshots/jira-tickets-list.png` (last 5 bug tickets result).

---

## Task 4: Custom MCP Server (FastMCP)

Built a custom MCP server in Python using **FastMCP** that reads a local
`lorem-ipsum.md` file and returns the first N words. The server exposes both a
**Resource** (a URI Claude reads passively) and a **Tool** (an action Claude calls
with arguments).

### Resource vs Tool

- **Resource** — a URI that Claude _reads from_, like fetching a file or an API
  endpoint. No arguments are passed; the data lives at the URI. Here: `lorem://words`
  returns 30 words; `lorem://words/{word_count}` returns N words.
- **Tool** — an action Claude _calls_ with parameters, like invoking a function.
  The server executes logic and returns the result. Here: `read(word_count=30)` reads
  the first N words from `lorem-ipsum.md`.

### Server details

| Component   | Detail                                        |
| ----------- | --------------------------------------------- |
| File        | `custom-mcp-server/server.py`                 |
| Framework   | FastMCP 3.4.2                                 |
| Source text | `custom-mcp-server/lorem-ipsum.md`            |
| Tool        | `read(word_count: int = 30)`                  |
| Resources   | `lorem://words`, `lorem://words/{word_count}` |
| Transport   | stdio                                         |
| Config      | `.mcp.json` → `"lorem"` entry                 |

### How to set up

See [`HOWTORUN.md`](./HOWTORUN.md) for full install, run, and connect instructions.

### Interactions performed

1. Called `read` with `word_count=5` → returned exactly 5 words.
2. Called `read` with no argument → returned the default 30 words.

Screenshot: `docs/screenshots/custom-mcp-read-tool-result.png`.
