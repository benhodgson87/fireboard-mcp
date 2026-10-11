import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { InvalidGrantError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Response } from "express";
import { type OAuthState, createOAuthState } from "./state";

const loginTemplate = readFileSync(
  new URL("../views/login.html", import.meta.url),
  "utf-8",
);

const loginStyle = loginTemplate.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
const loginStyleHash = createHash("sha256").update(loginStyle).digest("base64");
const loginTtlMs = 10 * 60 * 1000;
const codeTtlMs = 5 * 60 * 1000;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

type LoginAuthorization = {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  state?: string;
};

type LoginTransaction = LoginAuthorization & {
  browserToken: string;
  expiresAt: number;
};

type PendingCode = LoginAuthorization & {
  fireboardToken: string;
  expiresAt: number;
};

class ClientsStore {
  constructor(private state: OAuthState) {}

  async getClient(
    clientId: string,
  ): Promise<OAuthClientInformationFull | undefined> {
    return this.state.getClient(clientId);
  }

  async registerClient(
    metadata: OAuthClientInformationFull,
  ): Promise<OAuthClientInformationFull> {
    await this.state.putClient(metadata);
    return metadata;
  }
}

export class FireboardOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: ClientsStore;
  constructor(private state: OAuthState = createOAuthState()) {
    this.clientsStore = new ClientsStore(state);
  }
  private loginTransactions = new Map<string, LoginTransaction>();
  private pendingCodes = new Map<string, PendingCode>();

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    this.renderLogin(res, {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
    });
  }

  renderLogin(
    res: Response,
    authorization: LoginAuthorization,
    error?: string,
  ): void {
    const transactionId = randomUUID();
    const browserToken = randomUUID();
    this.loginTransactions.set(transactionId, {
      ...authorization,
      browserToken,
      expiresAt: Date.now() + loginTtlMs,
    });
    setTimeout(
      () => this.loginTransactions.delete(transactionId),
      loginTtlMs,
    ).unref();
    res.cookie(`__Host-fireboard-login-${transactionId}`, browserToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: loginTtlMs,
    });
    const html = loginTemplate
      .replaceAll("{{TRANSACTION_ID}}", () => escapeHtml(transactionId))
      .replaceAll("{{ERROR}}", () =>
        error ? `<div class="error">${escapeHtml(error)}</div>` : "",
      );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'none'; style-src 'sha256-${loginStyleHash}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    );
    res.status(error ? 400 : 200).send(html);
  }

  consumeLogin(
    transactionId: string,
    cookieHeader?: string,
  ): LoginAuthorization {
    const entry = this.loginTransactions.get(transactionId);
    const cookieName = `__Host-fireboard-login-${transactionId}`;
    const browserToken = cookieHeader
      ?.split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (
      !entry ||
      entry.expiresAt <= Date.now() ||
      browserToken !== entry.browserToken
    ) {
      throw new InvalidGrantError("Invalid or expired login transaction");
    }
    this.loginTransactions.delete(transactionId);
    return {
      clientId: entry.clientId,
      redirectUri: entry.redirectUri,
      codeChallenge: entry.codeChallenge,
      state: entry.state,
    };
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const entry = this.pendingCodes.get(authorizationCode);
    if (
      !entry ||
      entry.clientId !== client.client_id ||
      entry.expiresAt <= Date.now()
    )
      throw new InvalidGrantError("Invalid authorization code");
    return entry.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const entry = this.pendingCodes.get(authorizationCode);
    if (
      !entry ||
      entry.clientId !== client.client_id ||
      entry.expiresAt <= Date.now() ||
      redirectUri !== entry.redirectUri
    )
      throw new InvalidGrantError("Invalid authorization code or redirect URI");
    this.pendingCodes.delete(authorizationCode);
    const accessToken = randomBytes(32).toString("base64url");
    try {
      await this.state.putToken(accessToken, {
        clientId: client.client_id,
        fireboardToken: entry.fireboardToken,
      });
    } catch (error) {
      if (entry.expiresAt > Date.now()) {
        this.pendingCodes.set(authorizationCode, entry);
      }
      throw error;
    }
    return { access_token: accessToken, token_type: "bearer" };
  }

  async exchangeRefreshToken(): Promise<OAuthTokens> {
    throw new Error("Refresh tokens not supported");
  }

  async verifyAccessToken(
    token: string,
  ): Promise<AuthInfo & { fireboardToken: string }> {
    const entry = await this.state.getToken(token);
    if (!entry) throw new Error("Invalid token");
    return {
      token,
      clientId: entry.clientId,
      scopes: [],
      fireboardToken: entry.fireboardToken,
    };
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    await this.state.revokeToken(request.token, client.client_id);
  }

  issueCode(params: LoginAuthorization & { fireboardToken: string }): string {
    const code = randomUUID();
    this.pendingCodes.set(code, {
      ...params,
      expiresAt: Date.now() + codeTtlMs,
    });
    setTimeout(() => this.pendingCodes.delete(code), codeTtlMs).unref();
    return code;
  }
}

export const oauthProvider = new FireboardOAuthProvider();
