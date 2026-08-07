# syntax=docker/dockerfile:1

# RepoGauge as a container, for a host that is not Vercel.
#
# Three stages so the runtime image carries no package manager, no sources and
# no build cache: only the standalone server Next emits, its static assets, and
# a non-root user to run them.

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# --frozen-lockfile: a container build is the wrong place to discover that the
# lockfile and the manifest disagree.
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# lib/config.ts parses the environment at import time, and `next build`
# imports it while collecting page data. These are placeholders that satisfy
# the schema and are never used: the real values arrive at runtime, and
# NEXT_PUBLIC_SITE_URL is deliberately absent so no build-time value is
# inlined into the client bundle.
ENV GITHUB_TOKEN=build-time-placeholder \
    RATE_LIMIT_SECRET=build-time-placeholder-16-plus \
    DATABASE_URL=postgresql://build:build@build.invalid/build \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Runs as an unprivileged user. `node` already exists in the base image.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000

# The app answers on / with no database round trip, so this is a real liveness
# signal rather than a TCP check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
