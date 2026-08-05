# 2dai hosted MCP server — mcp.2dai.io.
#
# This image runs the HTTP entry (dist/index-http.js) and speaks the MCP
# Streamable HTTP transport in stateless mode. It is completely independent of
# the stdio entry (dist/index.js) that ships to end users via `npx 2dai-mcp-server`;
# both are built from the same sources, and both keep the SDK client per-request
# so nothing leaks across sessions.

FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
USER node
EXPOSE 3100
CMD ["node", "dist/index-http.js"]
