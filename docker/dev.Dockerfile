# Shared development image for the Salon Booking System Node workspaces
# (the Express backend API and the React/Vite web PWA).
#
# Dependencies are installed at build time so the node_modules volumes declared
# in docker-compose.yml are seeded for fast, reproducible container starts. The
# actual run command (build / watch / serve) is supplied per service by compose.
FROM node:20-bookworm-slim

# openssl         -> required by Prisma's query engine at runtime.
# postgresql-client -> provides pg_isready + psql, used by the backend dev
#                      entrypoint to wait for the DB and apply the exclusion
#                      constraints that are not part of the Prisma schema.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl postgresql-client \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the whole repo (node_modules/dist excluded via .dockerignore) so the
# npm-workspaces install has every package manifest available.
COPY . .

# Install all workspace dependencies. A throwaway DATABASE_URL is provided only
# for this step so any Prisma postinstall generate has an env to read; it is not
# persisted into the image (compose injects the real value at runtime).
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public" \
    npm install

# Overridden by each service in docker-compose.yml.
CMD ["node", "--version"]
