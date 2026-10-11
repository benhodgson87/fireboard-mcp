import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { FireboardOAuthProvider } from "./provider";

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
