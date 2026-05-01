# cassette container image. Multi-stage so the runner is small and fast.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

# Bundle the migration runner with esbuild so the runner image only needs
# Node + a single .cjs entry, no devDependencies. The migrator depends on
# drizzle-orm/postgres-js, postgres, and our own tiny load-env helper.
RUN ./node_modules/.bin/esbuild scripts/migrate.ts \
    --bundle --platform=node --target=node22 --format=cjs \
    --outfile=scripts/migrate.cjs \
    --external:pg-native

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/src/server/db/triggers.sql ./src/server/db/triggers.sql
COPY --from=build /app/scripts/migrate.cjs ./scripts/migrate.cjs
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
