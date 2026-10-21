# Build context: repository root (see docker-compose.yml), so the shared contract package is available.
FROM node:20-bookworm-slim AS build
WORKDIR /repo
COPY packages/contract/package.json packages/contract/tsconfig.json packages/contract/
COPY packages/contract/src packages/contract/src
COPY mcp-server/package*.json mcp-server/
RUN cd mcp-server && npm ci
COPY mcp-server/tsconfig.json mcp-server/
COPY mcp-server/src mcp-server/src
RUN cd mcp-server && npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim
ENV NODE_ENV=production
# node_modules/@jarvis/contract is a link to ../../packages/contract, so keep the same layout
COPY --from=build /repo/packages/contract/package.json /repo/packages/contract/package.json
COPY --from=build /repo/packages/contract/dist /repo/packages/contract/dist
WORKDIR /repo/mcp-server
COPY --from=build /repo/mcp-server/node_modules ./node_modules
COPY --from=build /repo/mcp-server/dist ./dist
COPY mcp-server/package.json ./
# 3000: MCP, OAuth and app API (published to the host for the tunnel); 3001: internal admin API (docker network only)
EXPOSE 3000 3001
USER node
CMD ["node", "dist/index.js"]
