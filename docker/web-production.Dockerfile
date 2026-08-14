# Production web image: build the PWA once, then serve immutable assets through
# nginx. The development Vite server is intentionally not used in production:
# it exposes HMR/lazy source modules and can leave an active browser in a
# broken loading state when the source tree changes or a WebSocket resets.
FROM node:20-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# Prisma's package postinstall only needs a syntactically valid URL here; the
# runtime backend receives the real DATABASE_URL from docker-compose.
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public" \
    npm install --include=dev \
 && mkdir -p node_modules/@salon \
 && ln -sfn /app/packages/shared node_modules/@salon/shared

RUN npm run build --workspace @salon/shared

ARG VITE_SITE_ORIGIN
ARG VITE_PUBLIC_SITE_URL
ENV VITE_SITE_ORIGIN=$VITE_SITE_ORIGIN
ENV VITE_PUBLIC_SITE_URL=$VITE_PUBLIC_SITE_URL

# The bundle audit remains a CI check. Deployment build skips it because a
# non-functional budget warning must not prevent serving a verified bundle.
RUN npm run build:production --workspace @salon/web

FROM nginx:1.27-alpine

COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY docker/nginx.server.conf /etc/nginx/conf.d/default.conf
