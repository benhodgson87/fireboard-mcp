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
