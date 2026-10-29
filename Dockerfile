# ── 1. Build the React client ───────────────────────────────────────────
FROM node:24-bookworm-slim AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── 2. Install server dependencies (better-sqlite3 is native) ──────────
FROM node:24-bookworm-slim AS server-deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

# ── 3. Runtime ──────────────────────────────────────────────────────────
FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    STATIC_DIR=/app/public
WORKDIR /app/server
COPY --from=server-deps /app/server/node_modules ./node_modules
COPY server/package.json ./
COPY server/src ./src
COPY --from=client /app/client/dist /app/public
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
