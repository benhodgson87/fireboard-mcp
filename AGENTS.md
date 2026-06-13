# Fireboard MCP — Agent Instructions

## Commands

- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`
- Format: `npm run format`
- Dev server: `npm run dev`

## Language and modules

TypeScript, ESM (`"type": "module"`), NodeNext module resolution. All imports must use `.js` extensions even when importing `.ts` source files.

## Structure

- `src/fireboard/schemas.ts` — Zod schemas for raw Fireboard API responses. Source of truth for all raw types.
- `src/fireboard/client.ts` — All Fireboard REST calls. Holds the per-token device list cache (TTL 2 min).
- `src/transformers/index.ts` — Pure functions mapping raw API shapes to MCP response shapes. The only unit-tested layer.
- `src/tools/` — One file per tool group. Each exports a `register*Tools(server, token)` function. Token is injected via closure — never a tool parameter.
- `src/tools/outputSchemas.ts` — Zod shapes for all tool `outputSchema` declarations. Shared across tool files.
- `src/oauth/provider.ts` — `FireboardOAuthProvider` implementing `OAuthServerProvider`. Handles dynamic client registration, authorization code flow, and token verification. In-memory storage (lost on restart).
- `src/views/` — HTML templates: `landing.html` (docs site) and `login.html` (OAuth login form).
- `src/public/` — Static assets served at `/`. Copied to `dist/public` on build.
- `src/server.ts` — Creates `McpServer`, calls all register functions.
- `src/index.ts` — Express entry point: OAuth routes via `mcpAuthRouter`, `POST /oauth/login` (Fireboard credential exchange), `POST /mcp` (token-gated MCP handler), `GET /` (landing page), static file serving.

## Tool handler pattern

```typescript
server.registerTool(
  'tool_name',
  {
    description: '...',
    inputSchema: { param: z.string() },
    outputSchema: { result: z.string() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ param }) => {
    try {
      const result = { result: doSomething(param) }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result,
      }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: (err as Error).message }], isError: true }
    }
  },
)
```

## Key constraints

- All Fireboard API errors (401, 429, 5xx) throw in `src/fireboard/client.ts` with exact message strings. Tool handlers catch and return them as `isError: true`.
- Token is injected into tool handlers via closure from `createMcpServer(token)`. It is never a tool input parameter.
- All tools are read-only. Always set `annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`.
- All tools must declare `outputSchema` (in `outputSchemas.ts`) and return `structuredContent` matching it alongside `content`.
- Zod schemas use default `.strip()` mode. Parse failures throw.
- Tests sit next to the file they test. Only the transformers layer has tests.
- No comments unless the reason is non-obvious.
