# ============================================================================
#  🐍 Snake Frontend (TypeScript + Vite) — Multi-stage Dockerfile
#
#  Stage 1: Build — 使用 Node.js 编译 TypeScript + Vite 构建
#  Stage 2: Runtime — 使用轻量 Nginx 提供静态文件服务
#
#  构建：    docker build -t snake-frontend:latest ./client
#  运行：    docker run -p 8080:80 snake-frontend:latest
# ============================================================================

# ---- Stage 1: Build ----
FROM node:22-alpine AS builder

WORKDIR /app

# 复制依赖配置文件
COPY package.json package-lock.json* ./

# 安装依赖（使用 npmmirror 或默认 registry）
RUN npm install

# 复制源码
COPY tsconfig.json vite.config.ts ./
COPY src/ ./src/
COPY index.html ./

# 构建（tsc 类型检查 + Vite 打包）
RUN npm run build

# ---- Stage 2: Runtime ----
FROM nginx:alpine

# 复制自定义 Nginx 配置（含 /api/ 反向代理规则）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 从 builder 阶段复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 移除 Nginx 默认站点配置
RUN rm -f /etc/nginx/conf.d/default.conf.bak 2>/dev/null || true

# ---- 端口 ----
EXPOSE 80

# ---- 健康检查 ----
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# ---- 启动 ----
CMD ["nginx", "-g", "daemon off;"]
