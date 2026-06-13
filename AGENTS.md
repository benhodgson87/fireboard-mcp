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
- `src/tools/` — One file per tool group. Each exports a `register*Tools(server: McpServer)` function.
- `src/server.ts` — Creates `McpServer`, calls all register functions.
- `src/index.ts` — Express server entry point (`POST /mcp`, `GET /`).

## Tool handler pattern

```typescript
server.tool('tool_name', 'description', { param: z.string() }, async ({ param }) => {
  try {
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
  } catch (err) {
    return { content: [{ type: 'text' as const, text: (err as Error).message }], isError: true }
  }
})
```

## Key constraints

- All Fireboard API errors (401, 429, 5xx) throw in `src/fireboard/client.ts` with exact message strings. Tool handlers catch and return them as `isError: true`.
- Zod schemas use default `.strip()` mode. Parse failures throw.
- Tests sit next to the file they test. Only the transformers layer has tests.
- No comments unless the reason is non-obvious.
