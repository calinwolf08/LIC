# Production image for the LIC scheduling app (SvelteKit + adapter-node).
#
# Built by GitHub Actions (.github/workflows/deploy.yml) and pulled by Coolify,
# so the Coolify server never compiles anything.
#
# At start the container runs `npm run db:setup` (idempotent: auth tables,
# migrations, account backfills) and then serves `node build` on $PORT (3000).
# db:setup runs TypeScript via tsx from src/, which is why the runtime keeps the
# full node_modules and the src tree (see README "Deploying").

ARG NODE_VERSION=22

# ---------------------------------------------------------------- build stage
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app

# Toolchain for native modules (better-sqlite3) when no prebuilt binary fits.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
# Browsers are only needed for tests, never in the image.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

COPY . .
# svelte.config.js selects adapter-node when COOLIFY is set.
ENV COOLIFY=true
RUN npm run build

# -------------------------------------------------------------- runtime stage
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
	PORT=3000 \
	# Behind Coolify's proxy (Traefik/Caddy): derive the public origin from the
	# forwarded headers, so SvelteKit's CSRF check accepts form posts. Setting
	# ORIGIN=https://your-domain in Coolify works too and takes precedence.
	PROTOCOL_HEADER=x-forwarded-proto \
	HOST_HEADER=x-forwarded-host

COPY --from=build /app/package.json /app/package-lock.json /app/.npmrc ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/src ./src

USER node
EXPOSE 3000
CMD ["sh", "-c", "npm run db:setup && exec node build"]
