import { randomUUID } from "node:crypto";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { FireboardError } from "fireboard-api-client";
import { name, version } from "./config";
import { loginFireboard } from "./fireboard/client";
import logger, { requestContext } from "./logger";
import { oauthProvider } from "./oauth/provider";
import { OAuthStateUnavailableError } from "./oauth/state";
import { createMcpServer } from "./server";

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.static(new URL("../public", import.meta.url).pathname));

const domain = process.env.PUBLIC_DOMAIN ?? "localhost:3000";
const issuerUrl = new URL(`https://${domain}`);

app.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl,
    scopesSupported: [],
    serviceDocumentationUrl: new URL(`https://${domain}`),
  }),
);

app.post(
  "/oauth/login",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const { username, password, transaction_id } = req.body as Record<
      string,
      unknown
    >;
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      typeof transaction_id !== "string"
    ) {
      res.status(400).json({ error: "Invalid login request" });
      return;
    }

    let authorization: ReturnType<typeof oauthProvider.consumeLogin>;
    try {
      authorization = oauthProvider.consumeLogin(
        transaction_id,
        req.headers.cookie,
      );
    } catch {
      res.status(400).json({ error: "Invalid or expired login transaction" });
      return;
    }
    res.clearCookie(`__Host-fireboard-login-${transaction_id}`, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    const renderError = (message: string) =>
      oauthProvider.renderLogin(res, authorization, message);

    try {
      const fireboardToken = await loginFireboard({ username, password });
      const code = oauthProvider.issueCode({
        ...authorization,
        fireboardToken,
      });
      const redirectUrl = new URL(authorization.redirectUri);
      redirectUrl.searchParams.set("code", code);
      if (authorization.state)
        redirectUrl.searchParams.set("state", authorization.state);
      res.redirect(redirectUrl.toString());
    } catch (error) {
      if (error instanceof FireboardError && error.code === "AUTHENTICATION") {
        renderError("Incorrect username or password.");
      } else if (
        error instanceof FireboardError &&
        ["API_UNAVAILABLE", "INVALID_RESPONSE", "RATE_LIMIT"].includes(
          error.code,
        )
      ) {
        renderError("Fireboard is unavailable. Please try again shortly.");
      } else {
        renderError("Something went wrong. Please try again.");
      }
    }
  },
);

app.post("/mcp", (req, res, next) => {
  const reqId = randomUUID().slice(0, 8);

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  requestContext
    .run({ reqId }, async () => {
      const start = Date.now();
      const method: string | undefined = req.body?.method;
      const tool: string | undefined =
        method === "tools/call" ? req.body?.params?.name : undefined;
      const ua = req.headers["user-agent"];
      const ip =
        (req.headers["x-forwarded-for"] as string | undefined)
          ?.split(",")[0]
          ?.trim() ?? req.ip;

      let fireboardToken: string | undefined;
      if (token) {
        try {
          const auth = await oauthProvider.verifyAccessToken(token);
          fireboardToken = auth.fireboardToken;
        } catch (error) {
          if (error instanceof OAuthStateUnavailableError) {
            res.status(503).json({ error: "Service unavailable" });
            return;
          }
          fireboardToken = undefined;
        }
      }
      if (!fireboardToken) {
        logger.warn("mcp request without valid token", { method, ua, ip });
        res.setHeader(
          "WWW-Authenticate",
          `Bearer realm="${issuerUrl.href}", resource_metadata="${issuerUrl.href}.well-known/oauth-protected-resource"`,
        );
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (tool) {
        logger.info("tool call", { tool, ua, ip });
      } else if (method) {
        logger.info("mcp request", { method, ua, ip });
      }

      const server = createMcpServer(fireboardToken);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on("close", () => {
        transport.close();
        // res 'close' fires outside the ALS context, so reqId must be passed explicitly
        logger.info("request complete", { ms: Date.now() - start, reqId });
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    })
    .catch(next);
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/docs-config.json", (_req, res) => {
  const protocol = domain.startsWith("localhost:") ? "http" : "https";
  res.setHeader("Cache-Control", "no-store");
  res.json({ endpoint: `${protocol}://${domain}/mcp` });
});

app.use(express.static(new URL("../website/dist", import.meta.url).pathname));

const port = process.env.PORT ?? 3000;
export const httpServer = app.listen(port, () => {
  logger.info(`${name} v${version} listening on port ${port}`);
});
