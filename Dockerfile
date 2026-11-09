# JournalMind — one container serving the API and the built web app.
# Persistent data (journal, recordings, backups) lives in DATA_DIR: mount a disk/volume there.

# ── 1. Build the client ───────────────────────────────────────────────────────
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── 2. Runtime ────────────────────────────────────────────────────────────────
FROM node:22-alpine
# tzdata so TZ (e.g. Asia/Kolkata) controls streak days and reminder times
RUN apk add --no-cache tzdata
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src ./src
COPY --from=client /app/client/dist /app/client/dist

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    DATA_DIR=/data \
    TRUST_PROXY=1

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1
CMD ["node", "src/index.js"]
