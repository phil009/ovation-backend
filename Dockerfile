# Ovation API: production image.
#   docker build -t ovation-api .
#   docker run --env-file .env -p 5000:5000 ovation-api
# On start it applies pending database migrations, then runs the API.

# ---- base: Node 24 + pnpm ----
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:/app/node_modules/.bin:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate
WORKDIR /app

# ---- deps: install from the lockfile (cached until package files change) ----
FROM base AS deps
# openssl: Prisma's migration engine checks for it on Debian
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# ---- build: generate the Prisma client, compile, drop dev dependencies ----
FROM deps AS build
COPY tsconfig.json prisma7.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN pnpm exec prisma generate \
    && pnpm build \
    && pnpm prune --prod --ignore-scripts

# ---- runtime: only what's needed to run ----
FROM base AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=5000
COPY --from=build --chown=node:node /app/package.json /app/prisma7.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 5000
# Migrations first (Prisma takes a lock, so parallel starts are safe); if they fail, the container
# exits and the previous deploy keeps serving. `exec` makes node PID 1 so it gets shutdown signals.
CMD ["sh", "-c", "prisma migrate deploy && exec node dist/main.js"]
