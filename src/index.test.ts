import { createHash } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const nativeFetch = globalThis.fetch;
const verifier = "a".repeat(43);
const challenge = createHash("sha256").update(verifier).digest("base64url");
const callback = "https://client.example/callback";
let server: Server;
let base: string;
let clientId: string;
let otherClientId: string;
let tokenCounter = 0;
const upstreamFetch = vi.fn();

async function registerClient() {
  const response = await nativeFetch(`${base}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      redirect_uris: [callback],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    }),
  });
  expect(response.status).toBe(201);
  return (await response.json()).client_id as string;
}

function formDetails(response: Response, html: string) {
  const id = html.match(/name="transaction_id" value="([^"]+)"/)?.[1];
  expect(id).toBeTruthy();
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`__Host-fireboard-login-${id}=`));
  expect(cookie).toBeTruthy();
  return { id: id as string, cookie: cookie?.split(";")[0] as string };
}

async function authorization(state = "client-state") {
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  const response = await nativeFetch(`${base}/authorize?${query}`);
  expect(response.status).toBe(200);
  const html = await response.text();
  return { ...formDetails(response, html), response, html };
}

function submitLogin(
  id: string,
  cookie?: string,
  extra: Record<string, string> = {},
) {
  return nativeFetch(`${base}/oauth/login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: new URLSearchParams({
      username: "synthetic-user",
      password: "synthetic-password",
      transaction_id: id,
      ...extra,
    }),
  });
}

async function authorizationCode() {
  const login = await authorization();
  const response = await submitLogin(login.id, login.cookie);
  expect(response.status).toBe(302);
  return new URL(response.headers.get("location") as string).searchParams.get(
    "code",
  ) as string;
}

function exchange(
  code: string,
  redirectUri = callback,
  client = clientId,
  codeVerifier = verifier,
) {
  return nativeFetch(`${base}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: client,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  });
}

function mcp(token?: string) {
  return nativeFetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    }),
  });
}

beforeAll(async () => {
  vi.stubEnv("PORT", "0");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PUBLIC_DOMAIN", "localhost:3000");
  server = (await import("./index")).httpServer;
  if (!server.listening)
    await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  clientId = await registerClient();
  otherClientId = await registerClient();
});

beforeEach(() => {
  vi.restoreAllMocks();
  upstreamFetch.mockReset();
  upstreamFetch.mockImplementation(async (url: string) => {
    expect(url).toBe("https://fireboard.io/api/rest-auth/login/");
    return new Response(
      JSON.stringify({ key: `synthetic-token-${++tokenCounter}` }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  });
  vi.stubGlobal("fetch", upstreamFetch);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
});

describe("OAuth login security", () => {
  it("keeps malicious OAuth state out of the login HTML and blocks scripts", async () => {
    const payload = '"><script>window.securityProbe=1</script>';
    const login = await authorization(payload);
    expect(login.html).not.toContain(payload);
    expect(login.html).not.toContain("<script>");
    expect(login.response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(login.response.headers.get("content-security-policy")).toContain(
      "form-action 'self'",
    );
    expect(login.response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(login.response.headers.get("cache-control")).toBe("no-store");
    const cookie = login.response.headers.get("set-cookie") as string;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("rejects a fabricated login transaction without contacting Fireboard", async () => {
    const response = await submitLogin(
      "fabricated",
      "__Host-fireboard-login-fabricated=fake",
    );
    expect(response.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("requires the browser cookie and does not consume a transaction on a CSRF attempt", async () => {
    const login = await authorization();
    expect((await submitLogin(login.id)).status).toBe(400);
    expect(
      (await submitLogin(login.id, `${login.cookie.split("=")[0]}=wrong`))
        .status,
    ).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
    expect((await submitLogin(login.id, login.cookie)).status).toBe(302);
  });

  it("rejects expired login transactions", async () => {
    const login = await authorization();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 10 * 60 * 1000 + 1);
    expect((await submitLogin(login.id, login.cookie)).status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("uses server-held client, callback, state and PKCE values despite forged form fields", async () => {
    const login = await authorization();
    const response = await submitLogin(login.id, login.cookie, {
      client_id: otherClientId,
      redirect_uri: "https://attacker.example/callback",
      code_challenge: "attacker-challenge",
      state: "attacker-state",
    });
    expect(response.status).toBe(302);
    const target = new URL(response.headers.get("location") as string);
    expect(`${target.origin}${target.pathname}`).toBe(callback);
    expect(target.searchParams.get("state")).toBe("client-state");
    expect(
      (await exchange(target.searchParams.get("code") as string)).status,
    ).toBe(200);
  });

  it("allows only one concurrent submission of a login transaction", async () => {
    const login = await authorization();
    const responses = await Promise.all([
      submitLogin(login.id, login.cookie),
      submitLogin(login.id, login.cookie),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([302, 400]);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
  });

  it("rotates the transaction after a failed login and allows a safe retry", async () => {
    upstreamFetch.mockResolvedValueOnce(new Response("{}", { status: 400 }));
    const login = await authorization();
    const failed = await submitLogin(login.id, login.cookie, {
      state: '"><script>window.securityProbe=1</script>',
    });
    expect(failed.status).toBe(400);
    const html = await failed.text();
    expect(html).toContain("Incorrect username or password.");
    expect(html).not.toContain("<script>");
    const retry = formDetails(failed, html);
    expect(retry.id).not.toBe(login.id);
    expect((await submitLogin(login.id, login.cookie)).status).toBe(400);
    expect((await submitLogin(retry.id, retry.cookie)).status).toBe(302);
  });

  it("rejects malformed login fields without contacting Fireboard", async () => {
    const response = await nativeFetch(`${base}/oauth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: [], password: {}, transaction_id: [] }),
    });
    expect(response.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});

describe("OAuth code and MCP validation", () => {
  it("rejects a changed callback without consuming the valid code", async () => {
    const code = await authorizationCode();
    const invalid = await exchange(code, "https://attacker.example/callback");
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toBe("invalid_grant");
    expect((await exchange(code)).status).toBe(200);
  });

  it("rejects token exchange when the callback is omitted", async () => {
    const code = await authorizationCode();
    const response = await nativeFetch(`${base}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        code_verifier: verifier,
      }),
    });
    expect(response.status).toBe(400);
    expect((await exchange(code)).status).toBe(200);
  });

  it("rejects another client and incorrect PKCE verifiers", async () => {
    const code = await authorizationCode();
    expect((await exchange(code, callback, otherClientId)).status).toBe(400);
    expect(
      (await exchange(code, callback, clientId, "b".repeat(43))).status,
    ).toBe(400);
    expect((await exchange(code)).status).toBe(200);
  });

  it("rejects replayed authorization codes", async () => {
    const code = await authorizationCode();
    expect((await exchange(code)).status).toBe(200);
    expect((await exchange(code)).status).toBe(400);
  });

  it("rejects expired authorization codes", async () => {
    const code = await authorizationCode();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5 * 60 * 1000 + 1);
    expect((await exchange(code)).status).toBe(400);
  });

  it("returns 401 for missing and unissued tokens without contacting Fireboard", async () => {
    for (const token of [undefined, "synthetic-never-issued-token"]) {
      const response = await mcp(token);
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("Bearer");
    }
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("resolves the opaque MCP token to the upstream credential for tool calls", async () => {
    const response = await exchange(await authorizationCode());
    expect(response.status).toBe(200);
    const tokenBody = await response.json();
    const upstreamToken = `synthetic-token-${tokenCounter}`;
    expect(tokenBody.access_token).not.toBe(upstreamToken);
    expect(JSON.stringify(tokenBody)).not.toContain(upstreamToken);
    expect((await mcp(upstreamToken)).status).toBe(401);

    upstreamFetch.mockResolvedValueOnce(
      new Response("[]", { headers: { "Content-Type": "application/json" } }),
    );
    const result = await nativeFetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${tokenBody.access_token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "list_sessions", arguments: {} },
      }),
    });
    expect(result.status).toBe(200);
    const body = await result.text();
    expect(body).not.toContain('"isError":true');
    expect(body).not.toContain(upstreamToken);
    expect(upstreamFetch).toHaveBeenLastCalledWith(
      "https://fireboard.io/api/v1/sessions.json",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Token ${upstreamToken}`,
        }),
      }),
    );
  });

  it("accepts an OAuth-issued token and rejects it immediately after revocation", async () => {
    const response = await exchange(await authorizationCode());
    expect(response.status).toBe(200);
    const token = (await response.json()).access_token;
    expect((await mcp(token)).status).toBe(200);
    const revoked = await nativeFetch(`${base}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, token }),
    });
    expect(revoked.status).toBe(200);
    expect((await mcp(token)).status).toBe(401);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
  });
});
