import { createHash } from "node:crypto";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

export type IssuedToken = { clientId: string; fireboardToken: string };
export interface OAuthState {
  getClient(id: string): Promise<OAuthClientInformationFull | undefined>;
  putClient(client: OAuthClientInformationFull): Promise<void>;
  getToken(token: string): Promise<IssuedToken | undefined>;
  putToken(token: string, value: IssuedToken): Promise<void>;
  revokeToken(token: string, clientId: string): Promise<void>;
}

function tokenKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class InMemoryOAuthState implements OAuthState {
  private clients = new Map<string, OAuthClientInformationFull>();
  private tokens = new Map<string, IssuedToken>();
  async getClient(id: string) {
    return this.clients.get(id);
  }
  async putClient(client: OAuthClientInformationFull) {
    this.clients.set(client.client_id, client);
  }
  async getToken(token: string) {
    return this.tokens.get(tokenKey(token));
  }
  async putToken(token: string, value: IssuedToken) {
    this.tokens.set(tokenKey(token), value);
  }
  async revokeToken(token: string, clientId: string) {
    const key = tokenKey(token);
    if (this.tokens.get(key)?.clientId === clientId) this.tokens.delete(key);
  }
}

export class OAuthStateUnavailableError extends Error {
  constructor() {
    super("OAuth state unavailable");
  }
}

export class DurableOAuthState implements OAuthState {
  constructor(private endpoint: string) {}
  private async request<T>(operation: Record<string, unknown>): Promise<T> {
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(operation),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new OAuthStateUnavailableError();
      return (await response.json()) as T;
    } catch {
      throw new OAuthStateUnavailableError();
    }
  }
  async getClient(id: string) {
    return (
      (await this.request<OAuthClientInformationFull | null>({
        action: "get",
        collection: "clients",
        key: id,
      })) ?? undefined
    );
  }
  async putClient(client: OAuthClientInformationFull) {
    await this.request({
      action: "put",
      collection: "clients",
      key: client.client_id,
      value: client,
    });
  }
  async getToken(token: string) {
    return (
      (await this.request<IssuedToken | null>({
        action: "get",
        collection: "tokens",
        key: tokenKey(token),
      })) ?? undefined
    );
  }
  async putToken(token: string, value: IssuedToken) {
    await this.request({
      action: "put",
      collection: "tokens",
      key: tokenKey(token),
      value,
    });
  }
  async revokeToken(token: string, clientId: string) {
    await this.request({
      action: "revoke",
      collection: "tokens",
      key: tokenKey(token),
      clientId,
    });
  }
}

export function createOAuthState(): OAuthState {
  return process.env.OAUTH_STATE_URL
    ? new DurableOAuthState(process.env.OAUTH_STATE_URL)
    : new InMemoryOAuthState();
}
