FROM node:22-bookworm-slim AS docs-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY website/package.json website/package-lock.json ./website/
RUN --mount=type=secret,id=network_ca \
    if [ -f /run/secrets/network_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/network_ca; fi; \
    npm ci --ignore-scripts --no-audit --no-fund && \
    npm ci --prefix website --ignore-scripts --no-audit --no-fund
COPY src ./src
COPY public ./public
COPY website ./website
ENV ASTRO_TELEMETRY_DISABLED=1
RUN npm run docs:build

FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=network_ca \
    if [ -f /run/secrets/network_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/network_ca; fi; \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --from=docs-build --chown=node:node /app/website/dist ./website/dist
ENV NODE_ENV=production PORT=3000
USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "src/index.ts"]
