# Snake Game — 增强功能可行性分析与架构方案

> 基于现有代码架构的增量改造计划

---

## 一、需求可行性评估速览

| # | 需求 | 复杂度 | 影响范围 | 优先级建议 |
|---|------|--------|----------|-----------|
| 1 | **动态难度曲线** (Dynamic Speed) | ⭐ 低 | `Game` 类常量改造 | P0 必做 |
| 2 | **输入指令队列** (Input Queuing) | ⭐⭐ 中 | `InputHandler` + `Game._update()` | P0 必做 |
| 3 | **特殊食物系统** (Power-ups) | ⭐⭐⭐ 高 | `Food` → `Item` 体系重构 + 定时器 | P1 推荐 |
| 4 | **粒子特效** (Particle System) | ⭐⭐ 中 | 新增 `Particle` 类 + `Game._render()` | P1 推荐 |
| 5 | **音效引擎** (Web Audio API) | ⭐⭐ 中 | 新增 `AudioManager` 类 | P1 推荐 |
| 6 | **移动端触控** (Touch Controls) | ⭐⭐ 中 | `InputHandler` 扩展 touch 事件 | P1 推荐 |
| 7 | **穿墙模式** (Wrap-around) | ⭐ 低 | `Snake` 碰撞检测分支 | P2 可选 |
| 8 | **屏幕震动** (Screen Shake) | ⭐ 低 | `Game._render()` 偏移 | P2 可选 |
| 9 | **PWA 支持** | ⭐ 低 | 新增 `manifest.json` + `sw.js` | P2 可选 |
| 10 | **局部重绘** (Partial Re-render) | ⭐⭐⭐⭐ 高 | 渲染架构重构 | ❌ 不建议 |

---

## 二、逐项可行性分析与设计方案

### ✅ P0：动态难度曲线 (Dynamic Speed)

**思路**：将 `TICK_INTERVAL` 从常量改为变量，每吃 `FOODS_PER_SPEEDUP`（如 5）个食物减少一次。

```
初始 TICK_INTERVAL = 150ms
每吃 5 个食物 → TICK_INTERVAL -= 8ms
最低下限 = 60ms（再快就不可玩了）
```

**修改点**：
- [`game.js`](game.js:14) `TICK_INTERVAL` 常量 → `Game` 实例属性 `this.tickInterval`
- [`Game._update()`](game.js:486) 中食物判定后增加速度更新逻辑
- [`Game._loop()`](game.js:469) 中的 `while` 条件改用 `this.tickInterval`

**代码改动量**：~15 行

---

### ✅ P0：输入指令队列 (Input Queuing)

**痛点分析**：当前用 `nextDirection` 单缓冲，快速连按"下→左"（右方向时）会导致第二个输入覆盖第一个，蛇可能在单 tick 内反向。

**设计方案**：

```
InputHandler 维护一个方向队列 (Array)
  ↓
按键时 push 到队列尾部（最多缓存 3 个，防止积压）
  ↓
Game._update() 每 tick shift() 出一个方向 → snake.setDirection()
  ↓
Snake.setDirection() 依然做防反向检测
```

```
queue: [DIR.DOWN, DIR.LEFT]  // 玩家快速按了两下
       ↓ tick 1: consume DIR.DOWN → direction 变为 DOWN
       ↓ tick 2: consume DIR.LEFT → direction 变为 LEFT
```

**修改点**：
- [`InputHandler`](game.js:38) 新增 `this.queue = []` 和 `MAX_QUEUE = 3`
- `_handleKeyDown` 中改为 `this.queue.push(dir)`
- 新增 `consumeDirection()` 方法 → `shift()` 出队首
- [`Game._update()`](game.js:486) 开头调用 `consumeDirection()`

**代码改动量**：~20 行

---

### ✅ P1：特殊食物系统 (Power-ups)

**设计方案**：

```
enum ItemType {
  NORMAL,    // 红色  +10分, +1节
  GOLDEN,    // 金色  +50分, 5秒后消失
  BLUE_ICE,  // 蓝色  减速10秒
  PURPLE,    // 紫色  反转方向5秒
}
```

**核心类变更**：
- `Food` 类 → `Item` 类（更通用的命名）
- 新增 `ItemType` 枚举和 `Item.spawn()` 加入类型随机逻辑
- 每种类型有 `color`, `score`, `effect`, `duration`, `lifespan` 属性

**定时效果管理**：在 `Game` 中新增 `this.effects = []` 数组，每 tick 更新效果计时。

**特殊效果实现**：

| 效果 | 实现方式 |
|------|---------|
| 减速 (Slow) | `this.tickInterval` 临时改为 `ORIGINAL * 2`（恢复时还原动态值） |
| 反转 (Reverse) | `Snake.setDirection()` 中自动将方向取反 |
| 金色倒计时 | `Item` 存储 `spawnTime`，`_update()` 中检查超时则移除 |

**修改点**：
- 新增 `ItemType` 对象
- 重写 `Food` → `Item` 类
- `Game` 新增 `this.effects`、`this.baseTickInterval`
- `Snake` 新增 `reversed` 标志位

**代码改动量**：~120 行

---

### ✅ P1：粒子特效 (Particle System)

**设计方案**：

```javascript
class Particle {
  constructor(x, y, color, vx, vy) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color;
    this.life = 1.0;       // 0~1, 逐渐衰减
    this.decay = 0.02;     // 每帧衰减速度
    this.size = 4;
  }
  update() { /* 移动 + 衰减 */ }
  draw(ctx) { /* 半透明圆点 */ }
}
```

- 在 `Game` 中维护 `this.particles = []`
- 吃到食物时生成 8~12 个粒子，颜色对应食物类型
- 每帧 `update()` 粒子位置和生命值，`life <= 0` 时移除

**修改点**：
- 新增 `Particle` 类 (~50 行)
- `Game._update()` 中食物判定后批量生成粒子
- `Game._render()` 中绘制粒子

**代码改动量**：~60 行

---

### ✅ P1：音效引擎 (Web Audio API)

**设计方案**：

```javascript
class AudioManager {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  // 8-bit 吃食物音效：短促高频
  playEat() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);
    osc.frequency.setValueAtTime(1320, this.ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(); osc.stop(this.ctx.currentTime + 0.15);
  }

  // 死亡音效：低频下降滑音
  playDie() {
    // osc.type = 'sawtooth', 从 200Hz 下滑到 50Hz
  }

  // 速度提升音效：上升琶音
  playSpeedUp() {
    // 三个快速上升的音符
  }
}
```

**修改点**：
- 新增 `AudioManager` 类 (~60 行)
- `Game` 构造函数中实例化
- 在食物判定、死亡、加速时调用对应方法

**代码改动量**：~70 行

---

### ✅ P1：移动端触控 (Touch Controls)

**设计方案**：在 `InputHandler` 中增加 touch 事件监听。

```
touchstart: 记录 startX, startY
touchmove:  preventDefault() 防止页面滚动
touchend:   计算 deltaX, deltaY
             如果 |deltaX| > |deltaY| → 水平方向
             否则 → 垂直方向
             阈值 > 20px 才视为有效滑动
```

**修改点**：
- `InputHandler` 新增 `_handleTouchStart`, `_handleTouchEnd`
- 方向判定后调用 `this.callbacks.onDirection(direction)`

**代码改动量**：~40 行

---

### ✅ P2：穿墙模式 (Wrap-around)

**设计方案**：在 `Snake.update()` 新增墙壁包裹逻辑：

```javascript
const head = this.body[0];
if (head.x < 0) head.x = GRID_SIZE - 1;
if (head.x >= GRID_SIZE) head.x = 0;
if (head.y < 0) head.y = GRID_SIZE - 1;
if (head.y >= GRID_SIZE) head.y = 0;
```

- 新增游戏模式选择按钮（普通 / 穿墙）
- `Game` 中新增 `this.wrapMode = false`
- UI 上添加一个切换按钮

**修改点**：
- `Snake` 新增 `wrapMode` 属性
- `checkWallCollision()` 中根据 `wrapMode` 分支
- [`index.html`](index.html) 添加模式切换按钮
- [`style.css`](style.css) 添加按钮样式

**代码改动量**：~30 行

---

### ✅ P2：屏幕震动 (Screen Shake)

**设计方案**：

```javascript
// Game 中新增
this.shake = { active: false, duration: 500, elapsed: 0, intensity: 4 };

// 死亡时触发
triggerShake() {
  this.shake.active = true;
  this.shake.elapsed = 0;
}

// _render() 中应用偏移
if (this.shake.active) {
  const offsetX = (Math.random() - 0.5) * this.shake.intensity * 2;
  const offsetY = (Math.random() - 0.5) * this.shake.intensity * 2;
  ctx.save();
  ctx.translate(offsetX, offsetY);
  // ... 正常绘制 ...
  ctx.restore();
  this.shake.elapsed += deltaTime;
  if (this.shake.elapsed >= this.shake.duration) this.shake.active = false;
} else {
  // 正常绘制
}
```

**修改点**：
- `Game` 新增震动状态属性
- `Game._render()` 中应用 `ctx.translate()`
- `Game._gameOver()` 中调用 `triggerShake()`

**代码改动量**：~35 行

---

### ✅ P2：PWA 支持

**设计方案**：

- [`manifest.json`](manifest.json)：应用名称、图标、主题色、display: standalone
- [`sw.js`](sw.js)：Cache-first 策略，缓存所有静态资源
- [`index.html`](index.html) 添加 `<link rel="manifest">` 和注册脚本

**修改点**：
- 新增 `manifest.json` (~20 行)
- 新增 `sw.js` (~30 行)
- `index.html` ~5 行

**代码改动量**：~55 行（新增 2 个文件）

---

### ❌ P3：局部重绘 (Partial Re-rendering) — 不建议

**原因分析**：
1. 当前 Canvas 使用 `shadowBlur` 发光效果，这种"全局合成"模式下，局部绘制无法正确叠加发光，必须全量重绘才能保证视觉效果正确性。
2. 400×400 的 Canvas 全量 `clearRect` + 绘制 20~100 个矩形，在现代浏览器中开销极小（<0.1ms/帧），优化收益几乎为零。
3. 引入局部重绘后，还需要额外维护脏区 (dirty rect) 列表，代码复杂度大幅上升。

**结论**：*不要优化不需要优化的东西*。保留全量重绘。

---

## 三、文件变更总览

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| [`game.js`](game.js) | 🔴 大改 | 新增 Item, Particle, AudioManager, 重写 InputHandler, Game 扩展 |
| [`index.html`](index.html) | 🟡 微改 | 添加模式切换按钮、manifest 链接、sw 注册 |
| [`style.css`](style.css) | 🟡 微改 | 添加新 UI 元素样式、响应式调整 |
| [`manifest.json`](manifest.json) | 🟢 新增 | PWA 清单 |
| [`sw.js`](sw.js) | 🟢 新增 | Service Worker |

---

## 四、执行优先级建议

**Phase 1 (P0 — 手感与核心体验)**：
1. 输入指令队列 (Input Queuing) — 手感质变
2. 动态难度曲线 (Dynamic Speed) — 核心玩法

**Phase 2 (P1 — 视觉与反馈)**：
3. 特殊食物系统 (Power-ups)
4. 粒子特效 (Particle System)
5. 音效引擎 (Web Audio API)
6. 移动端触控 (Touch Controls)

**Phase 3 (P2 — 锦上添花)**：
7. 屏幕震动 (Screen Shake)
8. 穿墙模式 (Wrap-around Mode)
9. PWA 支持

---

## 五、Mermaid 数据流图 (增强版)

```mermaid
flowchart TD
    subgraph Input
        KB[键盘事件] --> IH[InputHandler]
        TC[触摸事件] --> IH
        IH --> Q[方向队列 queue[]]
    end

    subgraph GameLoop [requestAnimationFrame Loop]
        RAF[每帧] --> ACC[deltaTime 累积器]
        ACC -->|>= tickInterval| TICK[Tick]
        TICK --> CQ[consumeDirection 出队]
        CQ --> SN[Snake.update 移动]
        SN --> COLL{碰撞检测}
        COLL -->|撞墙| WALL{wrapMode?}
        WALL -->|否| GOV[Game Over]
        WALL -->|是| WRAP[穿墙包裹]
        COLL -->|咬己| GOV
        COLL -->|无| ITEM{食物检测}
        
        ITEM -->|普通| EAT[+10分 +1节]
        ITEM -->|金色| GOLD[+50分 粒子]
        ITEM -->|蓝色| SLOW[减速10s]
        ITEM -->|紫色| REV[反转5s]
        
        EAT --> SPEED[动态速度更新]
        GOLD --> SPEED
        SLOW --> EFFECTS[Effect Manager]
        REV --> EFFECTS
        SPEED --> PARTICLE[生成粒子]
        
        GOV --> SHAKE[屏幕震动]
        GOV --> SOUND_DIE[死亡音效]
        EAT --> SOUND_EAT[吃食物音效]
    end

    subgraph Render
        RENDER[每帧渲染] --> GRID[网格线]
        RENDER --> ITEM_D[绘制道具]
        RENDER --> SN_D[绘制蛇]
        RENDER --> PT_D[绘制粒子]
        RENDER --> SHAKE_R[震动偏移]
    end

    GameLoop --> Render
```

---

## 六、请求确认

请告知：
1. **是否全部需求都要实现？** 还是优先选择部分 Phase？
2. **穿墙模式**是否需要 UI 切换按钮，还是作为一个选项？
3. **金色食物倒计时** — 需要在 Canvas 上显示倒计时进度条吗？
