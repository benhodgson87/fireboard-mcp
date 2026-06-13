import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { fetchDevices } from '../fireboard/client.js'
import { transformDeviceSummary } from '../transformers/index.js'
import { listDevicesOutputSchema } from './outputSchemas.js'

export function registerDeviceTools(server: McpServer, token: string) {
  server.registerTool(
    'list_devices',
    {
      description:
        'Returns all Fireboard devices on the account. The device list is cached server-side for 2 minutes — repeated calls within that window cost 0 API calls. Response includes from_cache and cache_age_seconds so you know how fresh the data is. UUIDs returned here can be reused in subsequent calls. Rarely needs to be called directly — get_realtime_temps already returns UUIDs. API calls: 1 (cached, TTL 2 min).',
      inputSchema: {},
      outputSchema: listDevicesOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const { data, fromCache, cacheAgeSeconds } = await fetchDevices(token)
        const result = {
          devices: data.map(transformDeviceSummary),
          from_cache: fromCache,
          cache_age_seconds: cacheAgeSeconds,
        }
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
