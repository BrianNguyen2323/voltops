FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN STANDALONE=1 SKIP_ENV_VALIDATION=1 pnpm build && pnpm prune --prod && rm -rf .next/standalone/node_modules

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
RUN mkdir /data && chown node /data
USER node
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0 DATABASE_PATH=/data/voltops.db
CMD ["sh","-c","node scripts/migrate.mjs && node server.js"]
