import { Container } from "@cloudflare/containers";

export class FireboardContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "24h";

  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = {
      NODE_ENV: "production",
      PORT: "3000",
      PUBLIC_DOMAIN: env.PUBLIC_DOMAIN,
    };
  }
}

export default {
  async fetch(request, env) {
    if (!env.PUBLIC_DOMAIN) {
      return new Response("Service unavailable", { status: 503 });
    }
    // OAuth clients and pending codes live in the Node process, so every path
    // must reach the same container, including documentation and OAuth routes.
    const container = env.FIREBOARD.getByName("fireboard");
    const headers = new Headers(request.headers);
    headers.set("X-Forwarded-Proto", "https");
    headers.set("X-Forwarded-Host", env.PUBLIC_DOMAIN);
    headers.set(
      "X-Forwarded-For",
      request.headers.get("CF-Connecting-IP") ?? "",
    );
    return container.fetch(new Request(request, { headers }));
  },
};
