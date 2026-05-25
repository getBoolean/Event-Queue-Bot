# syntax=docker/dockerfile:1.7

# ---- deps (install + prebuild verification) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --prefer-offline --no-audit --no-fund \
 && node -e "require('better-sqlite3'); require('@swc-node/register/esm'); console.log('native + loader prebuild OK')"

# ---- runtime ----
FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENTRYPOINT ["npm", "start"]
