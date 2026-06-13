import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { fetchDevices } from '../fireboard/client.js'
import { transformDeviceWithTemps } from '../transformers/index.js'
import { getRealtimeTempsOutputSchema } from './outputSchemas.js'

export function registerTempsTools(server: McpServer, token: string) {
  server.registerTool(
    'get_realtime_temps',
    {
      description:
        'Returns current probe readings for all devices (or a named device). Sourced entirely from the cached device list — no additional per-device calls. Data freshness is bounded by the cache TTL (2 min). Avoid calling more than once per minute during active monitoring. Returns device UUIDs alongside readings — reuse these in session calls. Channels with no current reading are omitted. API calls: 0–1 (0 if cache is warm, 1 if cold. TTL 2 min).',
      inputSchema: {
        device_title: z
          .string()
          .optional()
          .describe('Case-insensitive filter on device title. Omit to return all devices.'),
      },
      outputSchema: getRealtimeTempsOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ device_title }) => {
      try {
        const { data, fromCache, cacheAgeSeconds } = await fetchDevices(token)

        const filtered = device_title
          ? data.filter((d) => d.title.toLowerCase().includes(device_title.toLowerCase()))
          : data

        const result = { devices: filtered.map(transformDeviceWithTemps), from_cache: fromCache, cache_age_seconds: cacheAgeSeconds }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        }
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: (err as Error).message }],
          isError: true,
        }
      }
    },
  )
}
