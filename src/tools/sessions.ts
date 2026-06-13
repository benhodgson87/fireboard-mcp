import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  fetchSessionChart,
  fetchSessionDetail,
  fetchSessions,
} from '../fireboard/client.js'
import {
  transformChartChannels,
  transformSessionChart,
  transformSessionDetail,
  transformSessionSummary,
} from '../transformers/index.js'

export function registerSessionTools(server: McpServer, token: string) {
  server.registerTool(
    'list_sessions',
    {
      description:
        'Lists recent cook sessions. Use in_progress_only to find the active cook without scanning the full list — this is the cheapest way to check if a cook is running. limit and in_progress_only are applied client-side after fetching — the Fireboard API does not support native filtering. Call once and reuse session IDs from the result rather than calling repeatedly. API calls: 1 (uncached).',
      inputSchema: {
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Maximum number of sessions to return. Default 20. Applied client-side.'),
        in_progress_only: z
          .boolean()
          .optional()
          .describe('If true, only return sessions currently in progress. Applied client-side.'),
      },
    },
    async ({ limit = 20, in_progress_only }) => {
      try {
        const raw = await fetchSessions(token)
        let sessions = raw.map(transformSessionSummary)
        if (in_progress_only) sessions = sessions.filter((s) => s.in_progress)
        sessions = sessions.slice(0, limit)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ sessions, limit_applied: limit }),
            },
          ],
        }
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: (err as Error).message }],
          isError: true,
        }
      }
    },
  )

  server.registerTool(
    'get_session_detail',
    {
      description:
        'Returns session metadata — title, description, timing, linked devices, channels, and cook notes. Use this when you need context about a session but do not need temperature data. Prefer this over get_session_chart or get_all_session_data when temperature analysis is not required. API calls: 1 (uncached).',
      inputSchema: {
        session_id: z.number().int().describe('Session ID from list_sessions'),
      },
    },
    async ({ session_id }) => {
      try {
        const raw = await fetchSessionDetail(token, session_id)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(transformSessionDetail(raw)),
            },
          ],
        }
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: (err as Error).message }],
          isError: true,
        }
      }
    },
  )

  server.registerTool(
    'get_session_chart',
    {
      description:
        'Returns probe time-series data for a session — channel readings only, no session metadata or notes. Use when you only need temperature data (stall detection, rate of rise) and already have session context from get_session_detail or get_all_session_data. Cheaper than get_all_session_data when metadata is not needed. Set include_drive to true to include FireBoard Drive % as an additional channel. API calls: 1 (uncached).',
      inputSchema: {
        session_id: z.number().int().describe('Session ID from list_sessions'),
        include_drive: z
          .boolean()
          .optional()
          .describe('Include FireBoard Drive % data as an additional channel. Default false.'),
      },
    },
    async ({ session_id, include_drive = false }) => {
      try {
        const chart = await fetchSessionChart(token, session_id, include_drive)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ channels: transformChartChannels(chart) }),
            },
          ],
        }
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: (err as Error).message }],
          isError: true,
        }
      }
    },
  )

  server.registerTool(
    'get_all_session_data',
    {
      description:
        'Returns full session data — metadata, cook notes, and complete probe time-series in one call. Use when you need both context and temperature data together, e.g. comparing two cooks or analysing a stall with notes for reference. Costs 2 API calls (session detail + chart, fanned out server-side), uncached. If you only need metadata use get_session_detail (1 call). If you only need chart data use get_session_chart (1 call). Set include_drive to true to include FireBoard Drive % as an additional channel.',
      inputSchema: {
        session_id: z.number().int().describe('Session ID from list_sessions'),
        include_drive: z
          .boolean()
          .optional()
          .describe('Include FireBoard Drive % data as an additional channel. Default false.'),
      },
    },
    async ({ session_id, include_drive = false }) => {
      try {
        const [detail, chart] = await Promise.all([
          fetchSessionDetail(token, session_id),
          fetchSessionChart(token, session_id, include_drive),
        ])
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(transformSessionChart(detail, chart)),
            },
          ],
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
