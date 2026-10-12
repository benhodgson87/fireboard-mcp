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

- `fireboard-api-client` — Published package owning Fireboard transport, response validation, raw types, and device caching.
- `src/fireboard/client.ts` — MCP adapter retaining a client per token, passing configuration, logging errors, and mapping empty Drive responses to null.
- `src/transformers/index.ts` — Pure functions mapping raw API shapes to MCP response shapes. Keeps MCP response formatting separate from the client package.
- `src/tools/` — One file per tool group. Each exports a `register*Tools(server, token)` function. Token is injected via closure — never a tool parameter.
- `src/tools/outputSchemas.ts` — Zod shapes for all tool `outputSchema` declarations. Shared across tool files.
- `src/oauth/provider.ts` — `FireboardOAuthProvider` implementing `OAuthServerProvider`. Handles dynamic client registration, authorization code flow, and token verification. Client registrations and token mappings use the existing Container Durable Object in Cloudflare via a private outbound bridge (`src/oauth/state.ts` and `cloudflare/oauth-state.js`); local development defaults to memory. Login transactions and pending codes remain in memory.
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

- The client package raises Fireboard HTTP and validation errors. The adapter retains Winston logging and established tool error messages. Tool handlers return failures as `isError: true`.
- Token is injected into tool handlers via closure from `createMcpServer(token)`. It is never a tool input parameter.
- Read-only tools set `annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`. Write tools (e.g. drive control) set `readOnlyHint: false, idempotentHint: false`.
- All tools must declare `outputSchema` (in `outputSchemas.ts`) and return `structuredContent` matching it alongside `content`.
- MCP output schemas use Zod 3. Raw API schemas come from the client package (Zod 4); do not duplicate or mix these schemas.
- Tests sit next to the file they test. Cover transformer outputs, adapter integration, and OAuth behavior with synthetic responses.
- No comments unless the reason is non-obvious.
