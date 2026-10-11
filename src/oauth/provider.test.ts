import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { FireboardOAuthProvider } from "./provider";
import { InMemoryOAuthState, OAuthStateUnavailableError } from "./state";

describe("login rendering", () => {
  it("escapes error text instead of inserting executable markup or template replacements", () => {
    const response = {
      cookie: vi.fn(),
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    const provider = new FireboardOAuthProvider();
    provider.renderLogin(
      response as unknown as Response,
      {
        clientId: "client",
        redirectUri: "https://client.example/callback",
        codeChallenge: "challenge",
      },
      '<script>alert("test")</script> & \' $&',
    );
    const html = response.send.mock.calls[0][0] as string;
    expect(html).not.toContain("<script>");
    expect(html).toContain(
      "&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt; &amp; &#39; $&",
    );
    expect(html).not.toContain("{{ERROR}}");
    expect(response.status).toHaveBeenCalledWith(400);
  });
});

describe("opaque MCP tokens", () => {
  const callback = "https://client.example/callback";
  const client = (id: string) => ({ client_id: id, redirect_uris: [callback] });

  async function issue(provider: FireboardOAuthProvider, clientId: string) {
    const code = provider.issueCode({
      clientId,
      redirectUri: callback,
      codeChallenge: "challenge",
      fireboardToken: "synthetic-shared-fireboard-token",
    });
    return (
      await provider.exchangeAuthorizationCode(
        client(clientId),
        code,
        undefined,
        callback,
      )
    ).access_token;
  }

  it("issues distinct tokens per authorization without exposing the upstream credential", async () => {
    const provider = new FireboardOAuthProvider();
    const first = await issue(provider, "client-a");
    const second = await issue(provider, "client-a");
    const third = await issue(provider, "client-b");
    expect(new Set([first, second, third]).size).toBe(3);
    for (const token of [first, second, third]) {
      expect(token).not.toBe("synthetic-shared-fireboard-token");
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect((await provider.verifyAccessToken(token)).fireboardToken).toBe(
        "synthetic-shared-fireboard-token",
      );
    }
    expect((await provider.verifyAccessToken(first)).clientId).toBe("client-a");
    expect((await provider.verifyAccessToken(third)).clientId).toBe("client-b");
    await expect(
      provider.verifyAccessToken("synthetic-shared-fireboard-token"),
    ).rejects.toThrow("Invalid token");
  });

  it("revokes only the selected authorization even when clients share an upstream token", async () => {
    const provider = new FireboardOAuthProvider();
    const first = await issue(provider, "client-a");
    const second = await issue(provider, "client-a");
    const third = await issue(provider, "client-b");
    await provider.revokeToken(client("client-a"), { token: first });
    await expect(provider.verifyAccessToken(first)).rejects.toThrow(
      "Invalid token",
    );
    await expect(provider.verifyAccessToken(second)).resolves.toMatchObject({
      clientId: "client-a",
    });
    await expect(provider.verifyAccessToken(third)).resolves.toMatchObject({
      clientId: "client-b",
    });
  });

  it("does not let a different client revoke a token", async () => {
    const provider = new FireboardOAuthProvider();
    const token = await issue(provider, "client-a");
    await provider.revokeToken(client("client-b"), { token });
    await expect(provider.verifyAccessToken(token)).resolves.toMatchObject({
      clientId: "client-a",
    });
  });

  it("requires reauthentication when the in-memory provider is replaced", async () => {
    const provider = new FireboardOAuthProvider();
    const token = await issue(provider, "client-a");
    await expect(
      new FireboardOAuthProvider().verifyAccessToken(token),
    ).rejects.toThrow("Invalid token");
  });
});

describe("authorization-code persistence failures", () => {
  const client = {
    client_id: "client",
    redirect_uris: ["https://client.example/callback"],
  };
  function issue(provider: FireboardOAuthProvider) {
    return provider.issueCode({
      clientId: client.client_id,
      redirectUri: client.redirect_uris[0],
      codeChallenge: "challenge",
      fireboardToken: "synthetic-upstream-token",
    });
  }
  function exchange(provider: FireboardOAuthProvider, code: string) {
    return provider.exchangeAuthorizationCode(
      client,
      code,
      undefined,
      client.redirect_uris[0],
    );
  }

  it("allows retry after persistence recovers while blocking simultaneous exchange and successful replay", async () => {
    const state = new InMemoryOAuthState();
    let rejectWrite!: (error: Error) => void;
    const write = vi.spyOn(state, "putToken").mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectWrite = reject;
        }),
    );
    const provider = new FireboardOAuthProvider(state);
    const code = issue(provider);
    const first = exchange(provider, code);
    const failure = expect(first).rejects.toBeInstanceOf(
      OAuthStateUnavailableError,
    );
    await expect(exchange(provider, code)).rejects.toThrow(
      "Invalid authorization code",
    );
    expect(write).toHaveBeenCalledTimes(1);
    rejectWrite(new OAuthStateUnavailableError());
    await failure;
    await expect(
      provider.challengeForAuthorizationCode(client, code),
    ).resolves.toBe("challenge");
    const token = await exchange(provider, code);
    await expect(
      provider.verifyAccessToken(token.access_token),
    ).resolves.toMatchObject({ clientId: "client" });
    await expect(exchange(provider, code)).rejects.toThrow(
      "Invalid authorization code",
    );
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("does not restore a code that expires while its persistence request fails", async () => {
    const state = new InMemoryOAuthState();
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    vi.spyOn(state, "putToken").mockImplementationOnce(async () => {
      clock.mockReturnValue(now + 5 * 60 * 1000);
      throw new OAuthStateUnavailableError();
    });
    try {
      const provider = new FireboardOAuthProvider(state);
      const code = issue(provider);
      await expect(exchange(provider, code)).rejects.toBeInstanceOf(
        OAuthStateUnavailableError,
      );
      clock.mockReturnValue(now);
      await expect(exchange(provider, code)).rejects.toThrow(
        "Invalid authorization code",
      );
    } finally {
      clock.mockRestore();
    }
  });
});
