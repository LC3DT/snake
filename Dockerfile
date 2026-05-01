# ============================================================================
#  🐍 Snake Frontend — Dockerfile
#  Nginx + 静态文件 + 反向代理
#  Base: nginx:alpine (~25 MB final image)
# ============================================================================
FROM nginx:alpine

# ---- 复制自定义 Nginx 配置（含 /api/ 反向代理规则） ----
COPY nginx.conf /etc/nginx/conf.d/default.conf

# ---- 复制前端静态资源 ----
COPY index.html    /usr/share/nginx/html/
COPY style.css     /usr/share/nginx/html/
COPY game.js       /usr/share/nginx/html/
COPY ai.js         /usr/share/nginx/html/
COPY sw.js         /usr/share/nginx/html/
COPY manifest.json /usr/share/nginx/html/

# ---- 移除 Nginx 默认站点配置（已由 custom default.conf 覆盖） ----
RUN rm -f /etc/nginx/conf.d/default.conf.bak 2>/dev/null || true

# ---- 端口 ----
EXPOSE 80

# ---- 健康检查 ----
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# ---- 启动 ----
CMD ["nginx", "-g", "daemon off;"]
