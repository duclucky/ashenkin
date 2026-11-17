FROM oven/bun:1.4.0 AS dependencies
WORKDIR /build
COPY backend/package.json backend/bun.lock ./
RUN bun install --production --frozen-lockfile

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production BACKEND_HOST=0.0.0.0 PORT=4173
COPY --from=dependencies --chown=node:node /build/node_modules backend/node_modules/
COPY --chown=node:node backend/ backend/
COPY --chown=node:node frontend/dist/ frontend/dist/
USER node
EXPOSE 4173
CMD ["node", "backend/server.js", "--demo"]
