# 🐍 贪吃蛇 Snake — 全栈增强版

> **前端**：HTML5 Canvas + CSS3 (Dark Neon主题) + Vanilla JS (ES6+)
>
> **后端**：Node.js + Express + SQLite (sql.js — 纯 JS，无需原生编译)
>
> **零前端依赖** — 无需任何外部库或框架，纯浏览器原生 API 实现

---

## 📋 功能总览

### 🎮 游戏基础
| 功能 | 说明 |
|------|------|
| 20×20 网格系统 | 固定大小网格，蛇和道具以格为单位移动 |
| WASD / 方向键控制 | 支持键盘和触控滑动 |
| 防反向机制 | 不能 180° 掉头撞自己 |
| 分数系统 (localStorage) | 本地持久化存储最高分 |
| 三个状态界面 | 开始 / 暂停 / 游戏结束覆盖层 |

### ⚡ 增强特性 (v2.0)

#### 1. 输入指令队列 (Input Queuing)
- 缓存最多 3 个方向指令，每 tick 消费一个
- 极速连按时不丢指令、不反向
- 比单值缓冲更精准地响应微操

#### 2. 动态难度曲线 (Dynamic Speed)
- 每吃 5 个食物加速一级（-8ms/tick）
- 初始 150ms/tick，最快 60ms/tick
- 速度等级显示在顶部面板

#### 3. 道具系统 (Power-ups)
| 道具 | 颜色 | 效果 | 权重 |
|------|------|------|------|
| 🍎 普通 | 红色 `#ff0044` | +10 分，+1 节 | 60% |
| ⭐ 金色 | 金色 `#ffd700` | +50 分，5 秒后消失 | 15% |
| 💧 蓝色 | 蓝色 `#00bfff` | 减速 10 秒（tick 翻倍） | 15% |
| ☠️ 紫色 | 紫色 `#bf00ff` | 反转方向 5 秒 | 10% |

道具生成位置完全避开蛇身，不会生成在蛇所占用的格子上。

#### 4. 粒子特效 (Particle System)
- 吃到道具时爆发生成 10 个彩色粒子
- 粒子向外扩散、速度衰减、生命值递减
- 发光圆形光点效果

#### 5. 8-bit 音效 (Web Audio API)
- 纯代码合成，零外部音频文件
- 不同道具不同音色（方波/三角波/锯齿波）
- 速度提升时有上升琶音

#### 6. 触控滑动 (Touch Swipe)
- 移动端通过滑动控制方向
- 最小滑动阈值 20px 防误触
- 桌面端自动隐藏触控提示

#### 7. 屏幕震动 (Screen Shake)
- 蛇死亡时触发 400ms 震动
- 强度随时间衰减
- 基于 `ctx.translate()` 实现

#### 8. 穿墙模式 (Wrap-around Mode)
- 顶部面板 Toggle 开关
- 蛇碰到墙壁从对侧穿出
- 穿墙模式下自动禁用撞墙检测

#### 9. PWA 支持 (Progressive Web App)
- `manifest.json` — 可安装到主屏幕
- Service Worker — 缓存优先策略，离线可用
- 移动端沉浸式状态栏

### 🤖 AI 自动驾驶 (v3.0)

按 **F 键** 随时切换 AI / 手动模式。

#### 四层决策树

```
Layer 1: A* 寻路 → 食物
    ↓ (路径不通 或 预演不安全)
Layer 2: 虚拟预演 → 吃食物后能否活？
    ↓ (不安全)
Layer 3: A* 追尾 → 追逐蛇尾巴
    ↓ (无路可追)
Layer 4: 洪泛逃生 → 选最大连通方向
```

##### Layer 1 — A* 寻路
- 曼哈顿距离启发函数 `|x1-x2| + |y1-y2|`
- 蛇身为障碍物，边界为墙壁
- 使用 `Uint8Array` 实现 O(1) 访问的 visited/gScore/parent
- 线性扫描 openList 找最小 f（400 节点网格，堆优化非必要）

##### Layer 2 — 虚拟预演 (核心)
- 深拷贝蛇身，沿 A* 路径模拟移动
- 模拟吃掉食物后（蛇身 +1 节不 pop）
- 排除最后一节（蛇尾）作为障碍物
  — 真实蛇每 tick 尾巴会 pop，等效"让出一个格子"
  — 把尾巴也堵死会导致 AI 过于保守
- 再次 A* 检查：模拟蛇头 → 蛇尾是否可达
- 可达 → 安全，执行路径

##### Layer 3 — 追尾保底
- 放弃食物，A* 追逐蛇尾
- 蛇尾总在移动，追尾可以拖延时间

##### Layer 4 — 洪泛逃生
- 对蛇头四个方向做 BFS 连通区计数
- 选择连通格子最多的方向
- 绝境中最大程度延长生存时间

#### 性能优化
- 缓存 `Uint8Array` 二维数组，每帧只 `fill(0)` 不清空重建
- 虚拟模拟仅深拷贝 ~400 个坐标对（~0.01ms）
- 完整决策周期 < 0.5ms，远低于 150ms tick 间隔

### 🌐 全球排行榜 (v4.0)

```
┌─────────────────────────────────┐
│         全栈架构                  │
│                                 │
│  前端 (浏览器 / Nginx)           │
│    ↓ fetch() / 反向代理          │
│  Node.js + Express              │
│    ↓ sql.js (纯 JS SQLite)      │
│  SQLite (leaderboard.db)        │
└─────────────────────────────────┘
```

- 游戏结束后可提交分数到后端服务器
- 实时 Top 10 排行榜面板（右侧显示）
- 排行榜自动刷新 — 提交分数后即时更新
- 首三位分别用 🥇🥈🥉 标记
- Dark Neon 风格，与游戏主题统一

### 🐳 容器化 & 集群部署 (v5.0)

支持 Docker Compose 一键部署和 K3s/Kubernetes 集群部署，详见下文「部署方式 — 方式四 / 方式五」。

---

## 🎮 操作说明

| 按键 | 功能 |
|------|------|
| `W` / `↑` | 上移 |
| `S` / `↓` | 下移 |
| `A` / `←` | 左移 |
| `D` / `→` | 右移 |
| `Space` | 开始 / 重新开始 |
| `P` / `Esc` | 暂停 / 继续 |
| `F` | 切换 AI 自动驾驶 |
| 触摸滑动 | 移动端方向控制 |

---

## 🚀 部署方式

### 方式一：纯前端（离线游玩）

```bash
# 克隆或下载项目到本地
git clone <repo-url>

# 直接用浏览器打开 index.html
# 游戏核心功能完全离线可用（排行榜除外）
```

> **注意**：Service Worker (PWA) 需要 HTTP(S) 协议才能注册。
> 本地直接用 `file://` 打开时，PWA 缓存功能不可用，但游戏本身正常运行。

### 方式二：完整全栈（推荐，含排行榜）

需要 **Node.js 18+** 环境。

```bash
# 1. 安装后端依赖
cd server
npm install

# 2. 启动后端服务（默认端口 3001）
npm start

# 3. 启动前端静态服务（另一个终端）
cd ..   # 回到项目根目录
npx http-server ./ -p 8080 -c-1
# 或使用 VS Code Live Server

# 4. 访问 http://localhost:8080
# 排行榜将自动连接 http://localhost:3001
```

### 方式三：部署到生产环境

| 组件 | 推荐平台 | 说明 |
|------|---------|------|
| 前端 (静态文件) | Netlify / Vercel / GitHub Pages | 部署 `index.html` + 资源 |
| 后端 (API) | Render / Railway / Fly.io | 部署 `server/` 目录 |

> 生产部署时，若前后端不同源，需配置 CORS 或在 Nginx 侧添加反向代理规则。
> [`game.js`](game.js:30) 的 `API_BASE_URL` 已自动适配：通过 HTTP 访问时使用相对路径 `/api`（反向代理模式），直接打开时使用 `localhost:3001`。

### 方式四：Docker Compose（本地容器化）

需要 **Docker Engine 24+** 和 **Docker Compose v2**（通常已内置）。

```bash
# 1. 克隆项目
git clone <repo-url> && cd snake

# 2. 一键构建并启动
docker compose up -d

# 3. 访问 http://localhost:8080
#    后端 API 通过 Nginx 反向代理自动转发，零跨域配置
```

**架构说明：**

```
宿主机 :8080         宿主机 :3001 (可选)
    │                     │
    ▼                     ▼
┌─────────────┐    ┌──────────────┐
│  Frontend   │    │   Backend    │
│  nginx:alpine │    │  node:alpine │
│  ─────────  │    │  ──────────  │
│  /api/ → ───┼───►│  :3001       │
│  静态文件    │    │  SQLite      │
└─────────────┘    └──────┬───────┘
                          │ /data/leaderboard.db
                          ▼
                   ┌──────────────┐
                   │  named volume │
                   │ snake-db-data│
                   └──────────────┘
```

- 前端 Nginx 容器托管静态文件 + 反向代理 `/api/` → `backend:3001`
- 后端使用命名卷 [`snake-db-data`](docker-compose.yml:60) 持久化 SQLite 数据库
- 后端依赖 `service_healthy` 条件启动，确保数据库就绪后前端才接受请求
- 直接访问 `http://localhost:8080`，同源通信，无需 CORS

**常用命令：**
```bash
docker compose logs -f              # 查看实时日志
docker compose down -v              # 停止并删除卷（⚠ 会丢失排行榜数据）
docker compose restart backend      # 仅重启后端
docker compose build --no-cache     # 强制重建镜像
```

### 方式五：K3s / Kubernetes（生产集群）

需要 **K3s 1.19+** 或 **Kubernetes 1.19+** 集群。

```bash
# 1. 构建镜像并推送到节点可访问的仓库（或使用 K3s 内置 containerd）
docker build -t snake-backend:latest ./server
docker build -t snake-frontend:latest .

# 2. 如果是 K3s 单节点，可直接导入镜像
k3s ctr images import snake-backend:latest
k3s ctr images import snake-frontend:latest

# 3. 部署
kubectl apply -f k8s-manifest.yaml

# 4. 查看服务状态
kubectl get pods
kubectl get svc snake-frontend

# 5. 访问 http://<node-ip>:30080
```

**K8s 架构说明：**

```
用户 → http://<node-ip>:30080
         │
         ▼
┌──────────────────────────────┐
│  Service: snake-frontend     │  ← NodePort :30080
│  selector: app=snake/frontend│
└──────────┬───────────────────┘
           │  (kube-proxy 轮询)
     ┌─────┴─────┐
     ▼           ▼
┌─────────┐ ┌─────────┐
│ Frontend│ │ Frontend│  ← Deployment, replicas: 2
│ Pod #1  │ │ Pod #2  │
│ Nginx   │ │ Nginx   │
└────┬────┘ └────┬────┘
     │ /api/ 请求 │
     └─────┬─────┘
           ▼
┌──────────────────────────────┐
│  Service: backend (ClusterIP)│  ← 名称 "backend" 与 nginx.conf 一致
│  selector: app=snake/backend │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  Pod: snake-backend (×1)    │  ← SQLite 限制单副本
│  /data/leaderboard.db       │
│  ─────────────────────────  │
│  PVC: snake-db-pvc           │  ← 1Gi 持久化存储
└──────────────────────────────┘
```

**Nginx 反向代理在 K8s 中的路由逻辑：**
1. 浏览器请求 `http://<node-ip>:30080/api/leaderboard`
2. Nginx 匹配 `location /api/` → `proxy_pass http://backend:3001`
3. CoreDNS 将 `backend` 解析为后端 ClusterIP Service 的虚拟 IP
4. kube-proxy 将请求转发到 snake-backend Pod 的 3001 端口
5. 整个过程浏览器始终与同一个 origin 通信，无需配置 CORS

**PVC 挂载逻辑（数据持久化）：**
1. [`snake-db-pvc`](k8s-manifest.yaml:36) 声明 1Gi 存储 → K3s `local-path` 自动创建 PV
2. Deployment 通过 `volumes[].persistentVolumeClaim` 引用 PVC
3. 宿主机目录被挂载到 Pod 的 `/data` 路径
4. 后端通过 `DB_DIR=/data` 环境变量将数据库写入 `/data/leaderboard.db`
5. 容器重启、升级、调度到其他节点时，数据通过 PVC 持久保留

---

## 📁 项目结构

```
snake/
├── index.html              # 入口 HTML — 游戏界面 + 排行榜面板
├── style.css               # Dark Neon 主题样式 + 响应式适配
├── game.js                 # 核心游戏逻辑 (≈1650 行)
│   ├─ Constants            # 网格/速度/状态常量
│   ├─ AudioManager         # Web Audio API 8-bit 音效
│   ├─ Particle             # 粒子特效
│   ├─ InputHandler         # 键盘/触控 + 指令队列
│   ├─ Snake                # 蛇管理（穿墙/反转）
│   ├─ Item                 # 道具系统（4 种类型）
│   └─ Game                 # 主控制器（状态机/循环/特效/排行榜 API）
├── ai.js                   # AI 自动驾驶 (≈400 行)
│   └─ AIPlayer             # A* 寻路 + 虚拟预演 + 追尾 + 洪泛
├── manifest.json           # PWA 清单
├── sw.js                   # Service Worker 缓存策略
├── nginx.conf              # Nginx 配置（反向代理 /api/ → 后端）
├── Dockerfile              # 前端容器构建文件 (nginx:alpine)
├── docker-compose.yml      # Docker Compose 编排（一键全栈启动）
├── k8s-manifest.yaml       # Kubernetes / K3s 部署清单
├── README.md               # 本文档
├── server/                 # 后端服务
│   ├── Dockerfile          # 后端容器构建文件 (node:alpine)
│   ├── package.json        # 依赖声明 (express + cors + sql.js)
│   ├── server.js           # Express 服务 + SQLite API
│   └── leaderboard.db      # SQLite 数据库（运行时自动创建）
└── plans/                  # 设计文档
    ├─ architecture-plan.md
    ├─ enhancement-plan.md
    └─ ai-autopilot-plan.md
```

---

## 🧠 技术架构

### 游戏循环

```
requestAnimationFrame
    ↓
_loop(timestamp)
    ↓
deltaTime = timestamp - lastTickTime
clamp(deltaTime, max = tickInterval × 3)  ← 防止切标签后瞬间追帧
    ↓
accumulator += deltaTime
    ↓
while (accumulator >= tickInterval)
    → _update()          ← 固定步长逻辑更新
    → accumulator -= tickInterval
    ↓
_render()                 ← 每帧视觉渲染（独立于更新频率）
```

### 核心类关系

```
Game ────┬─── Snake          — 蛇的位置/方向/碰撞/绘制
         ├─── Item           — 道具生成/类型/绘制
         ├─── InputHandler   — 键盘/触控事件 + 队列缓冲
         ├─── AudioManager   — Web Audio API 音效合成
         ├─── AIPlayer       — AI 决策（4 层树）
         ├─── particles[]    — 粒子特效列表
         ├─── effects[]      — 计时效果管理器
         └─── fetch()        — 排行榜 API 通信
```

---

## 🌐 API 文档

后端运行在 `http://localhost:3001`，提供以下 RESTful API：

### `POST /api/score` — 提交分数

**Request Body:**
```json
{
  "playerName": "PLAYER_1",
  "score": 150
}
```

**Validation:**
- `playerName`：3-10 个字符，仅允许字母、数字、下划线
- `score`：非负整数

**Response (201):**
```json
{
  "id": 1,
  "playerName": "PLAYER_1",
  "score": 150
}
```

**Error Response (400):**
```json
{
  "error": "playerName must be 3-10 characters (letters, digits, underscores)"
}
```

### `GET /api/leaderboard` — 获取排行榜

返回 Top 10 最高分，按分数降序排列，同分按提交时间升序。

**Response (200):**
```json
[
  {
    "rank": 1,
    "id": 5,
    "playerName": "CHAMP",
    "score": 500,
    "createdAt": "2026-05-01 10:00:00"
  },
  {
    "rank": 2,
    "id": 3,
    "playerName": "ACE",
    "score": 320,
    "createdAt": "2026-05-01 09:30:00"
  }
]
```

### `GET /api/health` — 健康检查

```json
{
  "status": "ok",
  "timestamp": "2026-05-01T10:00:00.000Z"
}
```

### 数据库结构 (SQLite)

```sql
CREATE TABLE scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT    NOT NULL,
    score      INTEGER NOT NULL CHECK(score >= 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🎨 视觉主题

- **Dark Neon** 暗色发光风格
- 字体：`Orbitron` (数字/标题) + `Inter` (正文)
- 蛇身：渐变色从亮绿到暗绿
- 背景：细微径向渐变纹理 (上绿下红)
- 道具：呼吸光晕 + 内部高光 + 圆角矩形
- 覆盖层：毛玻璃效果 (`backdrop-filter: blur`)
- 响应式：支持 480px / 360px 断点
- 排行榜面板：右侧独立面板，黄金/银/铜色前三名高亮

---

## 📜 许可

MIT License — 可自由使用、修改、分发。
