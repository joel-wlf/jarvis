# Build context: repository root (see docker-compose.yml), so the Expo app and the shared contract are available.

# 1. Web app: the Expo app (app/) exported as a static site
FROM node:22-bookworm-slim AS web
WORKDIR /repo
COPY packages/contract/src packages/contract/src
COPY app/package*.json app/
RUN cd app && npm ci
COPY app app
RUN cd app && npx expo export --platform web --output-dir /web

# 2. Admin service
FROM node:22-alpine AS build
WORKDIR /app
COPY admin/package*.json ./
RUN npm ci
COPY admin/tsconfig.json ./
COPY admin/src ./src
COPY admin/test ./test
COPY admin/scripts ./scripts
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
# Docker CLI + compose plugin: the admin service controls the Jarvis containers through the Docker socket
RUN apk add --no-cache docker-cli docker-cli-compose
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=web /web ./web
COPY admin/package.json ./
EXPOSE 8080
# Runs as root in the container: needed for the Docker socket and to write .env owned by the project folder's owner
CMD ["node", "dist/src/index.js"]
