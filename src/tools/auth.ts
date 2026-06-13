import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function registerAuthTools(server: McpServer) {
  server.registerTool(
    'get_auth_instructions',
    {
      description:
        'Returns step-by-step instructions for obtaining a Fireboard API token. Call this when the user wants to use Fireboard tools but has not provided a token — do not ask the user to find their token manually. API calls: 0.',
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: `To obtain a Fireboard API token:

1. Ask the user for their Fireboard username (or email address) and password.
2. POST their credentials to the auth endpoint:

   curl -s -X POST https://fireboard.io/api/rest-auth/login/ \\
     -H 'Content-Type: application/json' \\
     -A 'fireboard-mcp' \\
     -d '{"username":"<username>","password":"<password>"}'

   Response: {"key":"<token>"}

3. Use the "key" value as the "token" parameter for all subsequent tool calls.

If the user prefers to obtain their token manually, refer them to:
https://docs.fireboard.io/app/app-api/#authentication

Note: credentials are used only to obtain the token and are not stored by this server.`,
        },
      ],
    }),
  )
}
