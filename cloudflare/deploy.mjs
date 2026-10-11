import { spawnSync } from "node:child_process";

const domain = process.env.PUBLIC_DOMAIN;
if (!domain || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(domain)) {
  console.error(
    "Set PUBLIC_DOMAIN to your Cloudflare hostname (no scheme, port, or path) before deploying.",
  );
  process.exit(1);
}

const result = spawnSync(
  "npx",
  [
    "--no-install",
    "wrangler",
    "deploy",
    "--var",
    `PUBLIC_DOMAIN:${domain}`,
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
