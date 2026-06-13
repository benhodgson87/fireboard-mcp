# Fireboard MCP

MCP server for the [Fireboard](https://fireboard.io) BBQ temperature monitoring API. Exposes 6 tools for querying live and historical cook data.

## Getting a Fireboard token

```bash
curl -X POST https://fireboard.io/api/rest-auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username":"YOUR_EMAIL","password":"YOUR_PASSWORD"}'
```

Copy the `key` from the response. Pass it as the `token` argument to any tool.

## Connecting your AI client

MCP endpoint: `https://<your-railway-app>.railway.app/mcp`

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "fireboard": {
      "url": "https://<your-railway-app>.railway.app/mcp"
    }
  }
}
```

**ChatGPT**: Add as a custom connector pointing at the MCP endpoint.

## Running locally

```bash
npm install
npm run dev
```

Server starts at `http://localhost:3000`. MCP endpoint: `http://localhost:3000/mcp`.

## Deploying to Railway

1. Push to GitHub
2. New Railway project → Deploy from GitHub
3. Railway detects Node.js automatically — runs `npm install && npm run build`
4. Start command: `node dist/index.js` (or Railway reads from `Procfile`)

`PORT` and `RAILWAY_PUBLIC_DOMAIN` are injected automatically.

## Tools

| Tool | What it does | API calls |
|------|-------------|-----------|
| `list_devices` | All Fireboard devices on the account | 0–1 (cached) |
| `get_realtime_temps` | Current probe readings | 0–1 (cached) |
| `get_drive_status` | Real-time FireBoard Drive fan %, setpoint, mode | 1 |
| `list_sessions` | Recent cook sessions | 1 |
| `get_session_detail` | Session metadata and cook notes | 1 |
| `get_session_chart` | Full temperature time-series for analysis | 2 |

Rate limit: 17 calls per 5-minute window. See [Fireboard API docs](https://docs.fireboard.io/app/app-api/).
