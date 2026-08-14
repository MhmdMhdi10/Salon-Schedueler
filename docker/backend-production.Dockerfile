# Production backend image: compile TypeScript once, then run only built artifacts.
FROM node:20-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl postgresql-client \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Keep dependency installation cacheable across source-only changes. Workspace
# manifests are enough for npm to resolve the lockfile; application source is
# copied in the next layer.
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/mobile/package.json packages/mobile/package.json

RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public" \
    npm ci --include=dev --ignore-scripts --legacy-peer-deps \
      --workspace @salon/backend --workspace @salon/shared \
      --include-workspace-root=false \
 && mkdir -p node_modules/@salon

COPY . .

RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public" \
    npm run prisma:generate --workspace @salon/backend \
 && mkdir -p node_modules/@salon \
 && ln -sfn /app/packages/shared node_modules/@salon/shared

RUN npm run build --workspace @salon/shared \
 && npm run build --workspace @salon/backend \
 && npm install --omit=dev --ignore-scripts --legacy-peer-deps --offline \
      --workspace @salon/backend --workspace @salon/shared \
      --include-workspace-root=false

FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl postgresql-client \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY docker/backend-production-entrypoint.sh /usr/local/bin/backend-production-entrypoint.sh

RUN chmod 0755 /usr/local/bin/backend-production-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/backend-production-entrypoint.sh"]
CMD ["node", "backend/dist/main.js"]
