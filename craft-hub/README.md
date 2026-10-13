# craft-hub

One front door for the craft web apps. It shows a launcher, serves each app under `/<app>/`, and
puts an AI assistant over every app page. The apps themselves carry no chat code.

- **In-app chat**: the "Ask AI" button opens a chat that collapses to a button, floats (drag,
  resize) or docks to the right edge. Chat runs here on Claude Code, signed in with a Claude
  subscription token, and drives the app over MCP.
- **Claude Code or Claude**: the assistant's Connect tab gives each tab its own MCP URL, plus a
  `claude mcp add` command named per tab. One Claude Code session can drive several tabs and apps at once.

Each browser mints its own connection per app, and chats are tied to it, so no two browsers or
users share a session.

## How it fits together

```
browser ──▶ craft-hub ──▶ /<app>/          app containers (hayone/<app>:remote)
              │       ──▶ /_relay/…        craft-mcp: tab WebSocket + MCP endpoints
              └─ chat: Claude Code ──MCP──▶ craft-mcp ──▶ app CLI ──▶ the user's tab
```

The remote app images provide the page API and the MCP connector (`window.craftAssistant`); the
hub's overlay uses them. Apps without them still open from the launcher, without the assistant.

## Run

```sh
claude setup-token                        # on any computer signed in to Claude Code
export CLAUDE_CODE_OAUTH_TOKEN=<token> MCP_KEY=$(openssl rand -hex 24)
docker compose up -d                      # docker-compose.yml in this folder
```

Open http://localhost:8080. Behind TLS, also set `HUB_ORIGIN=https://<host>`.

| Variable | |
| --- | --- |
| `APPS` | `name=url` pairs, e.g. `photocraft=http://photocraft:8080,vectorcraft=http://localhost:8082` |
| `RELAY_URL` | craft-mcp's internal URL; craft-mcp's `PUBLIC_HOST` must be `<hub origin>/_relay` |
| `MCP_KEY` | the same value craft-mcp has |
| `CLAUDE_CODE_OAUTH_TOKEN` | turns chat on; optional `CHAT_MODEL`, `CHAT_EFFORT` |
| `REQUIRE_SIGN_IN` | `true`: apps and chat need a craft-mcp sign-in (its `AUTH_*` settings, with `APP_ORIGIN=https://<host>/{app}`) |

The token is a personal Claude subscription: every chat on the hub uses that plan. Anthropic only
allows this for your own use, so keep the hub private (`REQUIRE_SIGN_IN`, or a private network).
