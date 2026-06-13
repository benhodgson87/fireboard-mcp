import { randomUUID } from 'crypto'
import type { Response } from 'express'
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js'
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { readFileSync } from 'fs'

const loginTemplate = readFileSync(new URL('../views/login.html', import.meta.url), 'utf-8')

type PendingCode = {
  clientId: string
  codeChallenge: string
  redirectUri: string
  state?: string
  fireboardToken: string
}

type IssuedToken = {
  clientId: string
}

class InMemoryClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>()

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(clientId)
  }

  async registerClient(metadata: OAuthClientInformationFull): Promise<OAuthClientInformationFull> {
    this.clients.set(metadata.client_id, metadata)
    return metadata
  }
}

export class FireboardOAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new InMemoryClientsStore()
  private pendingCodes = new Map<string, PendingCode>()
  private issuedTokens = new Map<string, IssuedToken>()

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const html = loginTemplate
      .replaceAll('{{CLIENT_ID}}', client.client_id)
      .replaceAll('{{REDIRECT_URI}}', params.redirectUri)
      .replaceAll('{{CODE_CHALLENGE}}', params.codeChallenge)
      .replaceAll('{{STATE}}', params.state ?? '')
      .replaceAll('{{ERROR}}', '')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const entry = this.pendingCodes.get(authorizationCode)
    if (!entry) throw new Error('Invalid authorization code')
    return entry.codeChallenge
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<OAuthTokens> {
    const entry = this.pendingCodes.get(authorizationCode)
    if (!entry || entry.clientId !== client.client_id) throw new Error('Invalid authorization code')
    this.pendingCodes.delete(authorizationCode)
    this.issuedTokens.set(entry.fireboardToken, { clientId: client.client_id })
    return { access_token: entry.fireboardToken, token_type: 'bearer' }
  }

  async exchangeRefreshToken(): Promise<OAuthTokens> {
    throw new Error('Refresh tokens not supported')
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const entry = this.issuedTokens.get(token)
    if (!entry) throw new Error('Invalid token')
    return { token, clientId: entry.clientId, scopes: [] }
  }

  async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    this.issuedTokens.delete(request.token)
  }

  issueCode(params: PendingCode): string {
    const code = randomUUID()
    this.pendingCodes.set(code, params)
    setTimeout(() => this.pendingCodes.delete(code), 5 * 60 * 1000)
    return code
  }
}

export const oauthProvider = new FireboardOAuthProvider()
