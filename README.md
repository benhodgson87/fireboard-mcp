# Fireboard MCP

MCP server for the [Fireboard](https://fireboard.io) BBQ temperature monitoring API. Exposes 7 tools for querying live and historical cook data from any MCP-compatible AI assistant.

Live endpoint: `https://fireboard-mcp.up.railway.app/mcp`

## Authentication

This server uses OAuth 2.0 with PKCE and Dynamic Client Registration — the standard required by MCP clients such as ChatGPT and Claude.

Fireboard's own API has no OAuth support; it only issues tokens via a username/password exchange. This server wraps that exchange behind a proper OAuth 2.0 flow: when you connect your AI assistant it opens a login page hosted by the MCP server, you enter your Fireboard credentials, and the server exchanges them with the Fireboard API for an access token. Your credentials are forwarded directly and are never stored — only the resulting API token is held in memory to authenticate tool calls on your behalf.

> **Note:** The token is stored in memory only. If the server restarts (e.g. after a deploy), you will need to re-authenticate.

## Connecting your AI assistant

Visit `https://fireboard-mcp.up.railway.app` for setup instructions for ChatGPT, Claude, Claude Code, and Gemini.

The MCP endpoint is: `https://fireboard-mcp.up.railway.app/mcp`

All clients use OAuth 2.0 with Dynamic Client Registration — no manual token setup required.

## Tools

| Tool | What it does | API calls |
|------|-------------|-----------|
| `list_devices` | All Fireboard devices on the account | 0–1 (cached 2 min) |
| `get_realtime_temps` | Current probe readings for all devices or a named device | 0–1 (cached 2 min) |
| `get_drive_status` | Real-time FireBoard Drive fan %, setpoint, and control mode | 1 |
| `list_sessions` | Recent cook sessions | 1 |
| `get_session_detail` | Session metadata and cook notes | 1 |
| `get_session_chart` | Full temperature time-series | 1 |
| `get_all_session_data` | Metadata, notes, and time-series in one call | 2 |

Rate limit: 17 calls per 5-minute window. See [Fireboard API docs](https://docs.fireboard.io/app/app-api/).

## Running locally

```bash
npm install
npm run dev
```

Server starts at `http://localhost:3000`. MCP endpoint: `http://localhost:3000/mcp`.

Set `PUBLIC_DOMAIN=localhost:3000` (no protocol) in your environment if you want the landing page links to resolve correctly.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PUBLIC_DOMAIN` | Yes | `localhost:3000` | Hostname (no protocol) used to build OAuth redirect URLs and the MCP endpoint. Must be set correctly in production — wrong value breaks OAuth. |
| `PORT` | No | `3000` | Port the HTTP server listens on. |
| `NODE_ENV` | No | — | Set to `production` to enable JSON structured logging. |
| `FIREBOARD_API_BASE` | No | `https://fireboard.io/api/v1` | Override the Fireboard API base URL (useful for testing). |
| `FIREBOARD_CACHE_TTL_MS` | No | `120000` | Device list cache TTL in milliseconds. |
