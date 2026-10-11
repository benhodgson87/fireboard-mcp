import { describe, expect, it, vi } from "vitest";

vi.mock("@cloudflare/containers", () => ({ Container: class {} }));
const { default: worker, FireboardContainer } = await import("./worker.js");

describe("Cloudflare routing", () => {
  it("routes documentation, OAuth, and MCP to the same process and preserves responses", async () => {
    const fetch = vi.fn(
      async () =>
        new Response("event: message\ndata: {}\n\n", {
          headers: { "content-type": "text/event-stream" },
        }),
    );
    const getByName = vi.fn(() => ({ fetch }));
    const env = {
      PUBLIC_DOMAIN: "fireboard-mcp.example.workers.dev",
      FIREBOARD: { getByName },
    };
    for (const path of [
      "/",
      "/example-stall-analysis.png",
      "/authorize",
      "/token",
      "/oauth/login",
      "/mcp",
    ]) {
      const request = new Request(`https://${env.PUBLIC_DOMAIN}${path}`, {
        method: "POST",
        headers: {
          Authorization: "Bearer synthetic-test-token",
          "CF-Connecting-IP": "192.0.2.1",
          "X-Forwarded-For": "spoofed",
        },
        body: "request-body",
      });
      const response = await worker.fetch(request, env);
      expect(response.headers.get("content-type")).toBe("text/event-stream");
      expect(await response.text()).toContain("event: message");
      const forwarded = fetch.mock.calls.at(-1)[0];
      expect(forwarded.url).toBe(request.url);
      expect(await forwarded.text()).toBe("request-body");
      expect(forwarded.headers.get("authorization")).toBe(
        "Bearer synthetic-test-token",
      );
      expect(forwarded.headers.get("x-forwarded-for")).toBe("192.0.2.1");
      expect(forwarded.headers.get("x-forwarded-proto")).toBe("https");
    }
    expect(getByName.mock.calls.every(([name]) => name === "fireboard")).toBe(
      true,
    );
  });

  it("does not start a container without the public OAuth hostname", async () => {
    const getByName = vi.fn();
    const response = await worker.fetch(
      new Request("https://example.workers.dev/"),
      { FIREBOARD: { getByName } },
    );
    expect(response.status).toBe(503);
    expect(getByName).not.toHaveBeenCalled();
  });

  it("passes the configured OAuth hostname into the Node process", () => {
    const container = new FireboardContainer(
      {},
      { PUBLIC_DOMAIN: "fireboard-mcp.example.workers.dev" },
    );
    expect(container.envVars.PUBLIC_DOMAIN).toBe(
      "fireboard-mcp.example.workers.dev",
    );
    expect(container.defaultPort).toBe(3000);
  });
});
