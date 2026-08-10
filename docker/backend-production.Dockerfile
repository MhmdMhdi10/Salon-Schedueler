# Production backend image: compile TypeScript once, then run only built artifacts.
FROM node:20-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl postgresql-client \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public" \
    npm install --include=dev \
 && mkdir -p node_modules/@salon \
 && ln -sfn /app/packages/shared node_modules/@salon/shared

RUN npm run build --workspace @salon/shared \
 && npm run build --workspace @salon/backend

FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl postgresql-client \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/backend/package.json ./packages/backend/package.json
COPY --from=build /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/prisma ./packages/backend/prisma
COPY docker/backend-production-entrypoint.sh /usr/local/bin/backend-production-entrypoint.sh

RUN chmod 0755 /usr/local/bin/backend-production-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/backend-production-entrypoint.sh"]
CMD ["node", "packages/backend/dist/main.js"]
