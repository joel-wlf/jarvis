FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
COPY scripts ./scripts
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
# Docker-CLI + Compose-Plugin: die Oberfläche steuert die Jarvis-Container über den Docker-Socket
RUN apk add --no-cache docker-cli docker-cli-compose
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY public ./public
COPY package.json ./
EXPOSE 8080
# Läuft als root im Container: nötig für den Docker-Socket und um .env mit dem Besitzer des Projektordners zu schreiben
CMD ["node", "dist/src/index.js"]
