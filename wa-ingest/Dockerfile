FROM node:20-bookworm-slim AS build
# Baileys zieht libsignal über git
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Auth-Volume muss dem Node-Benutzer gehören, damit der Ordner beim ersten Mounten übernommen wird
RUN mkdir -p /data/auth /data/status && chown -R node:node /data
USER node
CMD ["node", "dist/index.js"]
