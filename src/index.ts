import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import express from 'express'
import { readFileSync } from 'fs'
import { name, version } from './config.js'
import { createMcpServer } from './server.js'

const app = express()
app.use(express.json())

const landingTemplate = readFileSync(new URL('./views/landing.html', import.meta.url), 'utf-8')

app.post('/mcp', async (req, res) => {
  const server = createMcpServer()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => transport.close())
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

app.get('/', (_req, res) => {
  const domain = process.env.PUBLIC_DOMAIN ?? 'localhost:3000'
  const endpoint = `https://${domain}/mcp`
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(
    landingTemplate
      .replaceAll('{{ENDPOINT}}', endpoint)
      .replaceAll('{{NAME}}', name)
      .replaceAll('{{VERSION}}', version),
  )
})

const port = process.env.PORT ?? 3000
app.listen(port, () => {
  console.log(`Fireboard MCP listening on port ${port}`)
})
