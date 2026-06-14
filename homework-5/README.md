# 🏦 Homework 1: Banking Transactions API

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
