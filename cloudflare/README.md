# Cloudflare hosting

One Cloudflare Worker routes all requests to one Cloudflare Container running the existing Express server. The server hosts the documentation at `/`, images from `public/`, OAuth routes, `/health`, and the MCP endpoint at `/mcp`. No application source changes are required.

Containers is the closest match to the existing Node application. Workers alone would require adapting its runtime and in-memory OAuth storage; Pages alone cannot run this server. A separate documentation service is unnecessary for the current single-page documentation and would require maintaining the endpoint and template rendering separately.

## Account setup and deployment

Cloudflare Containers requires a Workers Paid account, and Docker must be running on the deployment machine. Select a Workers subdomain in the Cloudflare dashboard before deployment. The hostname will be `fireboard-mcp.work-22a.workers.dev`.

```bash
npm ci
npx wrangler login
npx wrangler whoami
PUBLIC_DOMAIN=fireboard-mcp.work-22a.workers.dev npm run deploy
```

`PUBLIC_DOMAIN` must be the hostname only, without a protocol, port, or path. The deploy command saves it as a Worker variable and the Worker passes it to the Node process so the documentation and OAuth metadata use the correct HTTPS origin. Set it on every deploy. A missing hostname causes deployment to stop locally; a Worker deployed without the variable returns HTTP 503.

For automation, configure `CLOUDFLARE_ACCOUNT_ID` and a scoped `CLOUDFLARE_API_TOKEN` securely on the deployment machine or CI. Use Cloudflare's Containers deployment documentation to select current required permissions, including Worker, Durable Object, and container/image deployment access. Never commit credentials. No Fireboard service credential is needed at deployment: users sign in through the existing OAuth form.

On machines where the home directory is read-only, set `DOCKER_CONFIG` and `XDG_CONFIG_HOME` to writable directories before invoking Docker or Wrangler. These are local tool configuration paths, not application variables. For a network proxy with a private CA, the Dockerfile accepts an optional BuildKit secret named `network_ca`; pass the trusted CA bundle using `docker build --secret id=network_ca,src=/path/to/ca-bundle`. Configure Docker build proxy settings as needed. The CA mount is temporary and TLS verification stays enabled.

## Deploy on merges to main

Connect this repository through Cloudflare Workers Builds, using project name `fireboard-mcp`, production branch `main`, and the repository root. Cloudflare installs dependencies automatically. Set the build command to `npm run build` and the deploy command to `npm run deploy`. Add `PUBLIC_DOMAIN=fireboard-mcp.work-22a.workers.dev` as a build environment variable. Workers Builds supplies deployment authentication and supports building the container image; no GitHub Actions deployment token is needed.

Disable non-production branch deployments initially so previews do not share the production container and OAuth state. Protect `main` with required CI checks. Once connected, merges into `main` trigger deployment. Ensure this migration is merged before the first build.

## Verify before switching clients

Wait for container provisioning after the first deployment, then check:

- `/health` returns HTTP 200 and `{"status":"ok"}`.
- `/` renders the documentation with the deployed `/mcp` endpoint; example images load.
- `/.well-known/oauth-authorization-server` advertises the deployed HTTPS hostname.
- A POST to `/mcp` without a bearer token returns HTTP 401 and a `WWW-Authenticate` header.
- Register and connect an MCP client through the OAuth flow, then call a read-only tool such as `list_devices`. Do not use Drive control as a smoke test.

The MCP registry metadata in `server.json` targets this hostname. Verify the live deployment before publishing it.

Change existing MCP client URLs to the new hostname and reconnect through OAuth. The previous deployment's in-memory OAuth state cannot be transferred. Only retire the old hosting service after these live checks pass. Removing the old configuration files from Git does not delete a hosted service or cancel its billing.

## Lifecycle and cost

All paths use the same named container; `max_instances` is 1. The application's clients, authorization codes, issued tokens, and device cache live in that Node process. Distributing requests across containers would break the OAuth flow.

The container sleeps after 24 hours without requests. This avoids short idle periods interrupting OAuth, but a running container consumes billable resources even when no request is being handled. Sleep, platform restarts, crashes, and deployments erase in-memory OAuth state; clients may need to register and authenticate again. A first request after sleep has a cold-start delay. Durable Object SQLite storage does not automatically persist the Node process's maps. Changing this behavior requires a separate application change.

Use the Cloudflare Containers dashboard and `npx wrangler containers list` to inspect provisioning and logs. No production deployment or successful account authentication is implied by a local dry run.

## Local checks

The existing `npm run dev`, `npm run build`, `npm run lint`, and `npm test` remain available. To exercise the Worker and container locally with Docker running:

```bash
npm run dev:cloudflare
```

Wrangler serves on port 8787; the container listens internally on port 3000. Local OAuth metadata still advertises HTTPS, as in the original application; an actual MCP OAuth client requires an HTTPS deployment.

Onboarding validation: the Linux/amd64 production image built and passed health, rendered documentation, static image, OAuth metadata, and MCP tool-list smoke checks. Wrangler's deployment dry run passed. The cloud workspace could not run the full local Worker-to-container path because Cloudflare's local egress helper failed to install its iptables PREROUTING rule (missing kernel support). Run that check on a Docker host with the required networking support or validate the deployed Worker after account authentication. This limitation does not establish that a live deployment works.

References: [Containers getting started](https://developers.cloudflare.com/containers/get-started/), [Container lifecycle](https://developers.cloudflare.com/containers/), [Wrangler](https://developers.cloudflare.com/workers/wrangler/).
