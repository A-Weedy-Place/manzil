FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY server ./server
COPY shared ./shared
COPY scripts/build-server.mjs ./scripts/build-server.mjs
RUN node scripts/build-server.mjs
RUN npm prune --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production MANZIL_MODE=production HOST=0.0.0.0 PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node assets/routing ./assets/routing
COPY --chown=node:node assets/transit ./assets/transit
USER node
EXPOSE 8080
CMD ["node", "build/server/index.js"]
