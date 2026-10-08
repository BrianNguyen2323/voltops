FROM node:22-slim AS build
# python3/make/g++: pnpm 9 runs node-gyp for better-sqlite3 even when a prebuilt binary exists.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
# Keep the traced standalone node_modules (~95 MB). webpack bundles zod/drizzle-orm, so migrate.mjs and
# check-env.mjs need them added back from the full install. Drop musl natives (runtime is glibc).
RUN STANDALONE=1 SKIP_ENV_VALIDATION=1 pnpm build && pnpm build:worker \
 && cd .next/standalone/node_modules \
 && for p in zod drizzle-orm; do cp -a /app/node_modules/.pnpm/$p@* .pnpm/ && cp -a /app/node_modules/$p . ; done \
 && rm -rf .pnpm/*musl*

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/dist/worker.mjs ./dist/worker.mjs
COPY --from=build /app/scripts/migrate.mjs /app/scripts/check-env.mjs ./scripts/
COPY --from=build /app/fixtures/fleet-api/calendar_history_energy.json /app/fixtures/fleet-api/site_info.json ./fixtures/fleet-api/
COPY --from=build /app/fixtures/open-meteo/forecast.json ./fixtures/open-meteo/
COPY --from=build /app/src/env.schema.js ./src/env.schema.js
RUN mkdir /data && chown node /data
USER node
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0 DATABASE_PATH=/data/voltops.db
CMD ["sh","-c","node scripts/check-env.mjs && node scripts/migrate.mjs && node server.js"]
