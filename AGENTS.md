# Fireboard MCP — Agent Instructions

## Commands

- Type check: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`
- Format: `npm run format`
- Dev server: `npm run dev`
- Docs build: `npm run docs:build` (install website dependencies with `npm ci --prefix website`)
- Docs dev server: `npm run docs:dev`

## Language and modules

TypeScript, ESM (`"type": "module"`), `moduleResolution: "Bundler"`. Internal relative imports use no file extension. Third-party imports keep whatever extension their package exports map requires (e.g. `@modelcontextprotocol/sdk/server/mcp.js`). `tsx` runs TypeScript directly in both dev (`tsx watch`) and production — no compilation step.

## Structure

- `src/fireboard/schemas.ts` — Zod schemas for raw Fireboard API responses. Source of truth for all raw types.
- `src/fireboard/client.ts` — All Fireboard REST calls. Holds the per-token device list cache (TTL 2 min).
- `src/transformers/index.ts` — Pure functions mapping raw API shapes to MCP response shapes. The only unit-tested layer.
- `src/tools/` — One file per tool group. Each exports a `register*Tools(server, token)` function. Token is injected via closure — never a tool parameter.
- `src/tools/outputSchemas.ts` — Zod shapes for all tool `outputSchema` declarations. Shared across tool files.
- `src/oauth/provider.ts` — `FireboardOAuthProvider` implementing `OAuthServerProvider`. Handles dynamic client registration, authorization code flow, and token verification. In-memory storage (lost on restart).
- `src/views/login.html` — OAuth login form.
- `website/` — Astro Starlight documentation. Tool pages are generated from MCP definitions by `website/scripts/generate-tools.ts`; editable guides live in `website/src/content/docs/`. Static output is built into `website/dist/` and served by Express.
- `public/` — Static assets served at `/`. Lives at the repo root (not inside `src/`).
- `src/server.ts` — Creates `McpServer`, calls all register functions.
- `src/index.ts` — Express entry point: OAuth routes via `mcpAuthRouter`, `POST /oauth/login` (Fireboard credential exchange), `POST /mcp` (token-gated MCP handler), static documentation at `/`, and public asset serving.

## Documentation

- Run `npm ci --prefix website` before building or developing the site. `npm run docs:dev` serves live-reloading docs on port 4321; Express on port 3000 serves the last `npm run docs:build` output.
- Edit tool descriptions and schemas in `src/tools/`. Use paragraph breaks and backticks for tool references. Do not edit generated pages in `website/src/content/docs/tools/`; they are ignored and recreated on each docs build.
- When adding or changing tools, update the input examples and API-cost/caching badges in `website/scripts/generate-tools.ts`, and response examples in `website/scripts/tool-examples.json`. Verify costs against the handler's upstream requests and cache behavior.
- The Docker docs-build stage installs the website dependencies and copies `website/dist/` into the runtime image. Documentation changes do not require changing the Cloudflare deploy command.

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
- Read-only tools set `annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`. Write tools (e.g. drive control) set `readOnlyHint: false, idempotentHint: false`.
- All tools must declare `outputSchema` (in `outputSchemas.ts`) and return `structuredContent` matching it alongside `content`.
- Zod schemas use default `.strip()` mode. Parse failures throw.
- Tests sit next to the file they test. Only the transformers layer has tests.
- No comments unless the reason is non-obvious.
