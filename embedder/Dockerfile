FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
# Modell beim Build laden, damit der Dienst später offline läuft
ARG EMBED_MODEL=Xenova/multilingual-e5-small
ENV EMBED_MODEL=${EMBED_MODEL}
RUN node --input-type=module -e "import {pipeline,env} from '@xenova/transformers'; env.cacheDir='/models'; await pipeline('feature-extraction', process.env.EMBED_MODEL, {quantized:true}); console.log('Modell geladen')"

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production MODEL_DIR=/models
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /models /models
COPY package.json ./
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]
