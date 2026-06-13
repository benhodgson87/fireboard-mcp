import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js'
import express from 'express'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { name, version } from './config.js'
import logger, { requestContext } from './logger.js'
import { createMcpServer } from './server.js'
import { oauthProvider } from './oauth/provider.js'

const app = express()
app.use(express.json())
app.use(express.static(new URL('./public', import.meta.url).pathname))

const landingTemplate = readFileSync(new URL('./views/landing.html', import.meta.url), 'utf-8')
const loginTemplate = readFileSync(new URL('./views/login.html', import.meta.url), 'utf-8')

const domain = process.env.PUBLIC_DOMAIN ?? 'localhost:3000'
const issuerUrl = new URL(`https://${domain}`)

app.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl,
    scopesSupported: [],
    serviceDocumentationUrl: new URL(`https://${domain}`),
  }),
)

app.post('/oauth/login', express.urlencoded({ extended: false }), async (req, res) => {
  const { username, password, client_id, redirect_uri, code_challenge, state } = req.body as Record<string, string>

  const renderError = (message: string) => {
    const html = loginTemplate
      .replaceAll('{{CLIENT_ID}}', client_id ?? '')
      .replaceAll('{{REDIRECT_URI}}', redirect_uri ?? '')
      .replaceAll('{{CODE_CHALLENGE}}', code_challenge ?? '')
      .replaceAll('{{STATE}}', state ?? '')
      .replaceAll(
        '{{ERROR}}',
        `<div class="error">${message}</div>`,
      )
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(400).send(html)
  }

  try {
    const loginRes = await fetch('https://fireboard.io/api/rest-auth/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (loginRes.status === 400) {
      renderError('Incorrect username or password.')
      return
    }
    if (!loginRes.ok) {
      renderError('Fireboard is unavailable. Please try again shortly.')
      return
    }

    const { key: fireboardToken } = (await loginRes.json()) as { key: string }

    const code = oauthProvider.issueCode({
      clientId: client_id,
      codeChallenge: code_challenge,
      redirectUri: redirect_uri,
      state,
      fireboardToken,
    })

    const redirectUrl = new URL(redirect_uri)
    redirectUrl.searchParams.set('code', code)
    if (state) redirectUrl.searchParams.set('state', state)
    res.redirect(redirectUrl.toString())
  } catch {
    renderError('Something went wrong. Please try again.')
  }
})

app.post('/mcp', (req, res, next) => {
  const reqId = randomUUID().slice(0, 8)

  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined

  requestContext.run({ reqId }, async () => {
    const start = Date.now()
    const method: string | undefined = req.body?.method
    const tool: string | undefined = method === 'tools/call' ? req.body?.params?.name : undefined
    const ua = req.headers['user-agent']
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip

    if (!token) {
      logger.warn('mcp request without token', { method, ua, ip })
      res.setHeader('WWW-Authenticate', `Bearer realm="${issuerUrl.href}", resource_metadata="${issuerUrl.href}.well-known/oauth-protected-resource"`)
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    if (tool) {
      logger.info('tool call', { tool, ua, ip })
    } else if (method) {
      logger.info('mcp request', { method, ua, ip })
    }

    const server = createMcpServer(token)
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
