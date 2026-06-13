import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import express from 'express'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { name, version } from './config.js'
import logger, { requestContext } from './logger.js'
import { createMcpServer } from './server.js'

const app = express()
app.use(express.json())

const landingTemplate = readFileSync(new URL('./views/landing.html', import.meta.url), 'utf-8')

app.post('/mcp', (req, res, next) => {
  const reqId = randomUUID().slice(0, 8)

  requestContext.run({ reqId }, async () => {
    const start = Date.now()
    const method: string | undefined = req.body?.method
    const tool: string | undefined = method === 'tools/call' ? req.body?.params?.name : undefined
    const ua = req.headers['user-agent']
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip

    if (tool) {
      logger.info('tool call', { tool, ua, ip })
    } else if (method) {
      logger.info('mcp request', { method, ua, ip })
    }

    const server = createMcpServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      transport.close()
      // res 'close' fires outside the ALS context, so reqId must be passed explicitly
      logger.info('request complete', { ms: Date.now() - start, reqId })
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  }).catch(next)
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
  logger.info(`${name} v${version} listening on port ${port}`)
})
