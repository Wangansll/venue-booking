# ── 阶段 1：构建前端 ──
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ── 阶段 2：生产依赖 ──
FROM node:20-alpine AS deps
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev

# ── 阶段 3：运行时（同时提供前端静态与 API，单端口）──
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PUBLIC_DIR=/app/public

COPY --from=deps /app/node_modules ./node_modules
COPY server/package*.json ./
COPY server/src ./src
COPY --from=web /web/dist ./public

RUN mkdir -p uploads && addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
