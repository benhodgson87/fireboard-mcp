import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { fetchDriveLog } from '../fireboard/client.js'
import { transformDriveLog } from '../transformers/index.js'
import { getDriveStatusOutputSchema } from './outputSchemas.js'

export function registerDriveTools(server: McpServer, token: string) {
  server.registerTool(
    'get_drive_status',
    {
      description:
        'Returns real-time FireBoard Drive data for a specific device — fan/drive percentage, setpoint, control mode, and the channel being controlled. Costs 1 API call, uncached. If you already have recent data from get_realtime_temps, the last_drive field there is sourced from the same device payload and may be sufficient, saving this call. Use get_drive_status when drive state is the primary concern and freshness matters. Returns null drive if the device has no Drive attached.',
      inputSchema: {
        device_uuid: z.string().describe('UUID of the device to query'),
      },
      outputSchema: getDriveStatusOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ device_uuid }) => {
      try {
        const log = await fetchDriveLog(token, device_uuid)
        const result = { device_uuid, drive: log ? transformDriveLog(log) : null }
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
