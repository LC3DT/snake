# ============================================================================
#  🐍 Snake Backend — Dockerfile
#  Node.js + Express + sql.js (pure-JS SQLite)
#  Base: node:20-alpine (~130 MB final image)
# ============================================================================
FROM node:20-alpine

# ---- 系统依赖 ----
# sql.js 是纯 JS + WASM，Alpine 无需额外编译工具
RUN apk add --no-cache tini

# ---- 应用目录 ----
WORKDIR /app

# ---- 安装依赖（利用 Docker 层缓存） ----
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ---- 复制源码 ----
COPY server.js .

# ---- 数据卷挂载点 ----
# 挂载外部卷到 /data 目录，SQLite 数据库文件将存储在此
# 通过 DB_DIR 环境变量控制数据库文件路径
VOLUME /data
ENV DB_DIR=/data

# ---- 端口 ----
EXPOSE 3001

# ---- 健康检查 ----
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# ---- 启动 ----
# tini 确保信号正确处理（SIGTERM → 优雅退出）
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
