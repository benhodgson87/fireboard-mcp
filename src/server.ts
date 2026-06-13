import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { name, version } from './config.js'
import { registerAuthTools } from './tools/auth.js'
import { registerDeviceTools } from './tools/devices.js'
import { registerDriveTools } from './tools/drive.js'
import { registerSessionTools } from './tools/sessions.js'
import { registerTempsTools } from './tools/temps.js'

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name,
    version,
    description:
      'Fireboard API MCP. Rate limit: 17 calls per 5-minute window across all tools — exceeding this blocks all requests for ~5 minutes. Each tool description states its API call cost. Prefer cheaper tools when full data is not needed (e.g. get_session_detail over get_all_session_data, last_drive on get_realtime_temps over get_drive_status). Reuse device UUIDs and session IDs returned from earlier calls to avoid redundant lookups.',
  })

  registerAuthTools(server)
  registerDeviceTools(server)
  registerTempsTools(server)
  registerDriveTools(server)
  registerSessionTools(server)

  return server
}
