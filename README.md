# Fireboard MCP

MCP server for the [Fireboard](https://fireboard.io) BBQ temperature monitoring API. Exposes tools for querying devices, live probe temperatures, Drive fan controller status and control, and historical cook sessions from any MCP-compatible AI assistant.

Cloudflare deployment: `https://fireboard-mcp.hdgsn.dev/mcp`.

## Authentication

This server uses OAuth 2.0 with PKCE and Dynamic Client Registration — the standard required by MCP clients such as ChatGPT and Claude.

Fireboard's own API has no OAuth support; it only issues tokens via a username/password exchange. This server wraps that exchange behind a proper OAuth 2.0 flow: when you connect your AI assistant it opens a login page hosted by the MCP server, you enter your Fireboard credentials, and the server exchanges them with the Fireboard API for an access token. Your credentials are forwarded directly and are never stored — the resulting Fireboard API token stays on the server, which issues a separate opaque MCP token to your assistant.

> **Note:** On Cloudflare, client registrations and token mappings are persisted in the existing Durable Object and survive container restarts and deployments. Local development uses memory unless `OAUTH_STATE_URL` is configured. Login attempts and authorization codes remain short-lived in memory.

## Connecting your AI assistant

Visit your deployed server's root URL for setup instructions for ChatGPT, Claude, and Claude Code.

The MCP endpoint is `/mcp` on the same hostname.

## Tools

> Rate limit: 17 calls per 5-minute window. See [Fireboard API docs](https://docs.fireboard.io/app/app-api/).

| Tool | What it does | API calls |
|------|-------------|-----------|
| `list_devices` | All Fireboard devices on the account | Cached (2 min TTL); 1 call on cache miss |
| `get_realtime_temps` | Current probe readings for all devices or a named device | Cached (2 min TTL); 1 call on cache miss |
| `get_drive_status` | Real-time Fireboard Drive fan %, setpoint, and control mode | 1–2 (extra call on device-cache miss) |
| `set_drive_setpoint` | Set target temperature and/or control channel (auto mode) | 1–2 |
| `set_drive_speed` | Set fan to a fixed speed (manual mode) | 1 |
| `set_drive_off` | Turn the Drive fan off | 1 |
| `list_sessions` | Recent cook sessions | 1 |
| `get_session_detail` | Session metadata and cook notes | 1 |
| `get_session_chart` | Full temperature time-series | 1 |
| `get_all_session_data` | Metadata, notes, and time-series in one call | 2 |

## Running locally

```bash
npm ci
npm ci --prefix website
npm run docs:build
npm run dev
```

Server starts at `http://localhost:3000`, serving the built documentation at `/`. MCP endpoint: `http://localhost:3000/mcp`.

For documentation live reload, run `npm run docs:dev` and open `http://localhost:4321`. Rebuild with `npm run docs:build` to update the documentation served by Express.

The documentation uses Astro Starlight. Tool reference pages are generated from the MCP tool definitions; guides live in `website/src/content/docs/`. The Docker build generates and includes the static site automatically, so Cloudflare uses the existing build and deploy commands.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PUBLIC_DOMAIN` | In production | `localhost:3000` | Hostname (no protocol) used to build OAuth redirect URLs and the MCP endpoint. Must be set correctly in production — wrong value breaks OAuth. |
| `PORT` | No | `3000` | Port the HTTP server listens on. |
| `NODE_ENV` | No | — | Set to `production` to enable JSON structured logging. |
| `FIREBOARD_API_BASE` | No | `https://fireboard.io/api/v1` | Override the Fireboard API base URL (useful for testing). |
| `FIREBOARD_CACHE_TTL_MS` | No | `120000` | Device list cache TTL in milliseconds. |
