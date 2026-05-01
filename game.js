/**
 * ============================================================================
 *  🐍 贪吃蛇 Snake — 核心游戏逻辑
 *  技术栈：Vanilla JS (ES6+) + Canvas API
 *  文件构成：Game / Snake / Food / InputHandler 四个类
 * ============================================================================
 */

// ============================================================================
//  常量定义
// ============================================================================
const GRID_SIZE   = 20;        // 网格行列数 (20×20)
const CELL_SIZE   = 20;        // 每格像素大小 (px)
const TICK_INTERVAL = 150;     // 游戏更新间隔 (ms)，即蛇每 150ms 移动一格
const CANVAS_SIZE  = GRID_SIZE * CELL_SIZE; // 400px

// 方向向量 —— 用 {dx, dy} 表示移动方向
const DIR = {
    UP:    { dx:  0, dy: -1 },
    DOWN:  { dx:  0, dy:  1 },
    LEFT:  { dx: -1, dy:  0 },
    RIGHT: { dx:  1, dy:  0 },
};

// 游戏状态枚举
const STATE = {
    IDLE:      'idle',       // 初始待机（显示开始界面）
    PLAYING:   'playing',    // 游戏中
    PAUSED:    'paused',     // 暂停
    GAME_OVER: 'gameover',   // 游戏结束
};

// ============================================================================
//  InputHandler — 键盘事件处理
//  职责：统一监听键盘输入，将按键映射为方向/动作指令
//  关键设计：缓冲输入（buffered direction），防止单帧内多次输入导致反向
// ============================================================================
class InputHandler {
    /**
     * @param {Object} callbacks - 回调函数集合
     *   .onDirection(dir)  — 方向变化时调用
     *   .onStart()         — 开始/重开时调用
     *   .onTogglePause()   — 切换暂停时调用
     */
    constructor(callbacks) {
        this.callbacks = callbacks;
        // 绑定 keydown 事件
        this._onKeyDown = this._handleKeyDown.bind(this);
        document.addEventListener('keydown', this._onKeyDown);
    }

    /** 键盘映射表：按键名 → 方向向量 */
    static KEY_MAP = {
        // 方向键
        'ArrowUp':    DIR.UP,
        'ArrowDown':  DIR.DOWN,
        'ArrowLeft':  DIR.LEFT,
        'ArrowRight': DIR.RIGHT,
        // WASD
        'w': DIR.UP,
        'W': DIR.UP,
        's': DIR.DOWN,
        'S': DIR.DOWN,
        'a': DIR.LEFT,
        'A': DIR.LEFT,
        'd': DIR.RIGHT,
        'D': DIR.RIGHT,
    };

    /**
     * 核心键盘处理函数
     * 为什么这里只做"缓冲"而不直接应用方向？
     * → 防止玩家在两次 tick 之间快速按键导致蛇在单帧内反转（头撞到自己身体）。
     *   update() 会在 tick 边界统一消费 nextDirection，保证逻辑一致性。
     */
    _handleKeyDown(e) {
        const key = e.key;

        // --- 方向键（游戏中才处理）---
        if (key in InputHandler.KEY_MAP) {
            e.preventDefault();
            if (this.callbacks.onDirection) {
                this.callbacks.onDirection(InputHandler.KEY_MAP[key]);
            }
            return;
        }

        // --- 空格键：开始 / 重开 ---
        if (key === ' ' || key === 'Spacebar') {
            e.preventDefault();
            if (this.callbacks.onStart) {
                this.callbacks.onStart();
            }
            return;
        }

        // --- P / ESC：暂停切换 ---
        if (key === 'p' || key === 'P' || key === 'Escape') {
            e.preventDefault();
            if (this.callbacks.onTogglePause) {
                this.callbacks.onTogglePause();
            }
            return;
        }
    }

    /** 销毁事件监听（防止内存泄漏） */
    destroy() {
        document.removeEventListener('keydown', this._onKeyDown);
    }
}


// ============================================================================
//  Snake — 蛇管理
//  职责：存储蛇身坐标数组，处理移动、转向（含防反向）、碰撞检测
//  关键数据结构：body = [{x, y}, ...]，body[0] 为蛇头
// ============================================================================
class Snake {
    /**
     * @param {number} startX - 初始蛇头 X (网格坐标)
     * @param {number} startY - 初始蛇头 Y (网格坐标)
     * @param {number} length - 初始长度
     * @param {{dx,dy}} direction - 初始方向
     */
    constructor(startX, startY, length, direction) {
        this.reset(startX, startY, length, direction);
    }

    /** 重置蛇到初始状态 */
    reset(startX, startY, length, direction) {
        // 生成蛇身：蛇头在最前方，身体向后延伸
        // 例如方向向右，则身体各节依次向左排列
        this.body = [];
        for (let i = 0; i < length; i++) {
            this.body.push({
                x: startX - i * direction.dx,
                y: startY - i * direction.dy,
            });
        }
        this.direction     = { ...direction };  // 当前实际移动方向
        this.nextDirection = { ...direction };  // 缓冲的下一个方向
        this.growing = false;                   // 是否正在生长（吃食物后置 true）
    }

    /**
     * 设置蛇的下一个移动方向（带防反向检测）
     *
     * 防反向原理：
     *   假设当前方向为 RIGHT (dx=1, dy=0)，玩家按下 LEFT (dx=-1, dy=0)。
     *   两个方向的和为 (0, 0)，即方向向量之和为零向量 ⇔ 互为反向。
     *   所以检测条件：dir1.dx + dir2.dx === 0 && dir1.dy + dir2.dy === 0
     *
     *   注意：这里对比的是 nextDirection（缓冲方向）而非 direction（当前帧方向），
     *   这样如果玩家快速按了两次（例如先按上再按左），不会因为中间状态而出错。
     */
    setDirection(newDir) {
        const cur = this.nextDirection;
        // 如果新方向与当前方向相同 → 忽略（无需处理）
        // 如果新方向与当前方向相反 → 忽略（禁止反向）
        if (newDir.dx === cur.dx && newDir.dy === cur.dy) return;
        if (newDir.dx + cur.dx === 0 && newDir.dy + cur.dy === 0) return;
        this.nextDirection = newDir;
    }

    /**
     * 每 tick 调用一次：移动蛇
     * 1. 将缓冲方向 applied 为当前方向
     * 2. 计算新蛇头位置
     * 3. 插入新蛇头到 body 头部
     * 4. 如果不在生长状态，移除尾部（pop）；否则保留尾部（长度+1）
     *
     * 为什么不直接每帧移动？
     * → 固定 tick 间隔保证游戏速度恒定，不受帧率波动影响。
     */
    update() {
        // 消费缓冲方向
        this.direction = { ...this.nextDirection };

        // 计算新蛇头坐标
        const head = this.body[0];
        const newHead = {
            x: head.x + this.direction.dx,
            y: head.y + this.direction.dy,
        };

        // 新蛇头插入头部
        this.body.unshift(newHead);

        // 如果不在生长状态，移除尾部；否则保留（长度+1）
        if (!this.growing) {
            this.body.pop();
        } else {
            this.growing = false;
        }
    }

    /** 标记蛇为"生长"状态，下次 update 时长度+1 */
    grow() {
        this.growing = true;
    }

    /**
     * 检测蛇头是否超出画布边界（撞墙）
     * 边界条件：坐标 < 0 或 >= GRID_SIZE
     */
    checkWallCollision() {
        const head = this.body[0];
        return head.x < 0 || head.x >= GRID_SIZE ||
               head.y < 0 || head.y >= GRID_SIZE;
    }

    /**
     * 检测蛇头是否碰到自己的身体（咬己）
     * 从索引 1 开始遍历（跳过蛇头自身），检查是否有重叠
     */
    checkSelfCollision() {
        const head = this.body[0];
        for (let i = 1; i < this.body.length; i++) {
            if (this.body[i].x === head.x && this.body[i].y === head.y) {
                return true;
            }
        }
        return false;
    }

    /** 判断给定坐标是否被蛇身占据（用于食物生成时避免重叠） */
    occupies(x, y) {
        return this.body.some(seg => seg.x === x && seg.y === y);
    }

    /**
     * 绘制蛇到 Canvas
     * 视觉风格：蛇头发光 + 蛇身渐变
     */
    draw(ctx) {
        const len = this.body.length;
        for (let i = 0; i < len; i++) {
            const seg = this.body[i];
            const px = seg.x * CELL_SIZE;
            const py = seg.y * CELL_SIZE;

            if (i === 0) {
                // ---- 蛇头：亮绿色 + 发光效果 ----
                ctx.fillStyle = '#00ff41';
                ctx.shadowColor = '#00ff41';
                ctx.shadowBlur = 12;
                ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
                // 蛇头眼睛（小白点）
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#0a0a0a';
                const eyeSize = 3;
                // 根据方向放置眼睛位置
                const d = this.direction;
                const cx = px + CELL_SIZE / 2;
                const cy = py + CELL_SIZE / 2;
                // 左右眼
                ctx.beginPath();
                ctx.arc(cx + d.dx * 4 - d.dy * 3, cy + d.dy * 4 + d.dx * 3, eyeSize, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(cx + d.dx * 4 + d.dy * 3, cy + d.dy * 4 - d.dx * 3, eyeSize, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // ---- 蛇身：从蛇头到尾部渐变色 ----
                const t = i / len;  // 0~1, 越靠近尾部值越大
                const green = Math.floor(0xcc - t * 0x66); // #cc → #66
                const r = 0;
                const g = green;
                const b = Math.floor(0x33 - t * 0x33);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.shadowColor = '#00ff41';
                ctx.shadowBlur = Math.max(0, 6 - t * 5);
                // 身体稍微内缩，显出间隙感
                const margin = 1 + Math.floor(t * 1);
                ctx.fillRect(px + margin, py + margin, CELL_SIZE - margin * 2, CELL_SIZE - margin * 2);
            }
        }
        // 重置阴影
        ctx.shadowBlur = 0;
    }
}


// ============================================================================
//  Food — 食物管理
//  职责：保持一个食物坐标，提供随机重生（避开蛇身）
// ============================================================================
class Food {
    constructor() {
        this.position = { x: 0, y: 0 };
    }

    /**
     * 在空白网格上随机生成食物
     *
     * 算法说明：
     *   1. 生成所有空闲坐标的列表（总格子数 - 蛇身占用的格子数）
     *   2. 从中随机选一个
     *   → 在 20×20 网格（400 格）上，即便蛇身很长，空闲格子也远多于蛇身，
     *      所以这种"建表法"简洁且足够高效。
     *
     * @param {Snake} snake - 蛇实例，用于获取已占用的坐标
     */
    spawn(snake) {
        const freeCells = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            for (let y = 0; y < GRID_SIZE; y++) {
                if (!snake.occupies(x, y)) {
                    freeCells.push({ x, y });
                }
            }
        }
        // 如果所有格子都被占满（理论上蛇吃满 400 格），选 (0,0) 兜底
        if (freeCells.length === 0) {
            this.position = { x: 0, y: 0 };
            return;
        }
        const idx = Math.floor(Math.random() * freeCells.length);
        this.position = freeCells[idx];
    }

    /** 判断蛇头是否吃到了食物（碰撞检测） */
    isEatenBy(head) {
        return head.x === this.position.x && head.y === this.position.y;
    }

    /**
     * 绘制食物
     * 视觉风格：红色发光圆角方块，带呼吸动画效果（通过 Game 传入 time）
     */
    draw(ctx, time) {
        const px = this.position.x * CELL_SIZE;
        const py = this.position.y * CELL_SIZE;

        // 呼吸光晕：根据时间正弦变化
        const pulse = 0.6 + 0.4 * Math.sin(time * 0.004);
        const glowSize = 6 + 4 * pulse;

        ctx.shadowColor = '#ff0044';
        ctx.shadowBlur = glowSize;

        // 外发光圆角方块
        ctx.fillStyle = '#ff0044';
        const margin = 2;
        const radius = 4;
        const w = CELL_SIZE - margin * 2;
        const h = CELL_SIZE - margin * 2;
        const x = px + margin;
        const y = py + margin;

        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();

        // 内部高光
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(x + 3, y + 3, w - 6, h / 3);

        ctx.shadowBlur = 0;
    }
}


// ============================================================================
//  Game — 游戏主控制器
//  职责：游戏状态机、游戏循环（requestAnimationFrame + 固定步长）、
//        分数管理、协调 Snake / Food / InputHandler / 渲染
// ============================================================================
class Game {
    constructor() {
        // ---- Canvas 初始化 ----
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        // ---- DOM 元素引用 ----
        this.currentScoreEl = document.getElementById('current-score');
        this.highScoreEl    = document.getElementById('high-score');
        this.finalScoreEl   = document.getElementById('final-score-value');
        this.startOverlay   = document.getElementById('start-overlay');
        this.pauseOverlay   = document.getElementById('pause-overlay');
        this.gameoverOverlay= document.getElementById('gameover-overlay');
        this.newRecordBadge = document.getElementById('new-record-badge');

        // ---- 游戏核心数据 ----
        this.score     = 0;
        this.highScore = parseInt(localStorage.getItem('snake-high-score') || '0', 10);
        this.state     = STATE.IDLE;

        // ---- 子模块 ----
        this.snake = new Snake(
            Math.floor(GRID_SIZE / 2),  // 蛇头起始 X (网格中央)
            Math.floor(GRID_SIZE / 2),  // 蛇头起始 Y
            3,                          // 初始长度
            DIR.RIGHT                   // 初始方向向右
        );
        this.food  = new Food();

        // ---- 游戏循环计时 ----
        this.lastTickTime = 0;    // 上次 tick 的时间戳 (ms)
        this.accumulator  = 0;    // 时间累积器
        this.animFrameId  = null; // requestAnimationFrame ID
        this.startTime    = 0;    // 游戏开始时间（用于食物呼吸动画）

        // ---- 初始化 -- 先生成食物 ----
        this.food.spawn(this.snake);

        // ---- 事件输入 ----
        this.inputHandler = new InputHandler({
            onDirection:  (dir) => this.snake.setDirection(dir),
            onStart:      ()    => this._handleStart(),
            onTogglePause:()    => this._handleTogglePause(),
        });

        // ---- Canvas 点击事件（开始/重开） ----
        this.canvas.addEventListener('click', () => this._handleStart());

        // ---- 显示历史最高分 ----
        this._updateScoreDisplay();

        // ---- 启动渲染循环 ----
        // 即使游戏处于 IDLE 状态，渲染循环也在运行（绘制静态画面）
        this._loop(0);
    }

    // ========================================================================
    //  游戏循环（核心）
    //
    //  为什么用 requestAnimationFrame + 固定步长，而不是 setInterval？
    //  1. requestAnimationFrame 在页面不可见时自动暂停，节省资源。
    //  2. 固定步长（TICK_INTERVAL = 150ms）确保游戏逻辑更新速度恒定，
    //     不受显示器刷新率（60Hz / 144Hz）影响。
    //  3. 时间累积器（accumulator）处理 deltaTime 波动：
    //     - 如果帧间隔小于 TICK_INTERVAL，累积，等够了一次 tick 再更新逻辑。
    //     - 如果帧间隔大于 TICK_INTERVAL（如切换标签页回来后），
    //       通过 clamped deltaTime 防止"瞬移"。
    // ========================================================================
    _loop(timestamp) {
        // 首次调用时初始化计时
        if (this.lastTickTime === 0) {
            this.lastTickTime = timestamp;
            this.startTime    = timestamp;
        }

        // 计算时间差（毫秒），限制最大值为 TICK_INTERVAL * 3 防止长时间挂起后瞬移
        let deltaTime = timestamp - this.lastTickTime;
        if (deltaTime > TICK_INTERVAL * 3) {
            deltaTime = TICK_INTERVAL * 3;
        }
        this.lastTickTime = timestamp;
        this.accumulator += deltaTime;

        // ---- 固定步长更新 ----
        // 当累积时间足够一次 tick 时，消费 TICK_INTERVAL 并更新游戏逻辑
        while (this.accumulator >= TICK_INTERVAL) {
            if (this.state === STATE.PLAYING) {
                this._update();
            }
            this.accumulator -= TICK_INTERVAL;
        }

        // ---- 渲染（每帧都执行） ----
        this._render(timestamp);

        // 继续下一帧
        this.animFrameId = requestAnimationFrame((t) => this._loop(t));
    }

    // ========================================================================
    //  _update() — 每 tick 调用的游戏逻辑更新
    // ========================================================================
    _update() {
        // 1. 蛇移动
        this.snake.update();

        // 2. 碰撞检测：撞墙 或 咬己 → 游戏结束
        if (this.snake.checkWallCollision() || this.snake.checkSelfCollision()) {
            this._gameOver();
            return;
        }

        // 3. 食物检测：蛇头是否吃到食物
        if (this.food.isEatenBy(this.snake.body[0])) {
            this.snake.grow();             // 蛇身增长
            this.score += 10;              // 得分 +10
            this._updateScoreDisplay();    // 更新 UI
            this.food.spawn(this.snake);   // 重新生成食物
        }
    }

    // ========================================================================
    //  _render(timestamp) — 每帧绘制的画面
    // ========================================================================
    _render(timestamp) {
        const ctx = this.ctx;

        // ---- 清空画布 ----
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        // ---- 绘制网格线 ----
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= GRID_SIZE; i++) {
            ctx.beginPath();
            ctx.moveTo(i * CELL_SIZE, 0);
            ctx.lineTo(i * CELL_SIZE, CANVAS_SIZE);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * CELL_SIZE);
            ctx.lineTo(CANVAS_SIZE, i * CELL_SIZE);
            ctx.stroke();
        }

        // ---- 绘制食物 ----
        this.food.draw(ctx, timestamp - this.startTime);

        // ---- 绘制蛇 ----
        this.snake.draw(ctx);
    }

    // ========================================================================
    //  状态切换函数
    // ========================================================================

    /**
     * 处理"开始/重开"事件（空格键 / 点击）
     * 根据当前状态决定行为：
     *   IDLE      → 开始游戏
     *   GAME_OVER → 重开游戏
     *   其他状态  → 忽略
     */
    _handleStart() {
        if (this.state === STATE.IDLE) {
            this._startGame();
        } else if (this.state === STATE.GAME_OVER) {
            this._restartGame();
        }
    }

    /** 处理暂停切换（P / ESC） */
    _handleTogglePause() {
        if (this.state === STATE.PLAYING) {
            this._pauseGame();
        } else if (this.state === STATE.PAUSED) {
            this._resumeGame();
        }
    }

    /** 开始新游戏 */
    _startGame() {
        this.state = STATE.PLAYING;
        this.startOverlay.classList.add('hidden');
        this.gameoverOverlay.classList.add('hidden');
        this.pauseOverlay.classList.add('hidden');
    }

    /** 暂停游戏 */
    _pauseGame() {
        this.state = STATE.PAUSED;
        this.pauseOverlay.classList.remove('hidden');
    }

    /** 继续游戏 */
    _resumeGame() {
        this.state = STATE.PLAYING;
        this.pauseOverlay.classList.add('hidden');
    }

    /** 重新开始（重置所有状态） */
    _restartGame() {
        // 重置蛇到初始位置
        this.snake.reset(
            Math.floor(GRID_SIZE / 2),  // 蛇头起始 X
            Math.floor(GRID_SIZE / 2),  // 蛇头起始 Y
            3,                          // 初始长度
            DIR.RIGHT                   // 初始方向
        );
        // 重置分数
        this.score = 0;
        this._updateScoreDisplay();
        // 重置食物
        this.food.spawn(this.snake);
        // 更新最高分显示
        this._loadHighScore();
        // 切换到进行状态
        this.state = STATE.PLAYING;
        this.startOverlay.classList.add('hidden');
        this.gameoverOverlay.classList.add('hidden');
        this.pauseOverlay.classList.add('hidden');
        // 重置计时器防止大跳帧
        this.lastTickTime = 0;
        this.accumulator = 0;
    }

    /**
     * 游戏结束处理
     * 1. 更新最高分（如果当前分 > 历史最高，存入 localStorage）
     * 2. 显示游戏结束面板
     */
    _gameOver() {
        this.state = STATE.GAME_OVER;

        // 检查是否打破纪录
        let isNewRecord = false;
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('snake-high-score', String(this.highScore));
            isNewRecord = true;
        }

        // 更新 UI
        this.finalScoreEl.textContent = this.score;
        this._updateScoreDisplay();

        if (isNewRecord) {
            this.newRecordBadge.classList.remove('hidden');
        } else {
            this.newRecordBadge.classList.add('hidden');
        }

        this.gameoverOverlay.classList.remove('hidden');
    }

    // ========================================================================
    //  UI 更新工具函数
    // ========================================================================

    /** 更新分数显示（补零到三位，如 0 → "000"） */
    _updateScoreDisplay() {
        this.currentScoreEl.textContent = String(this.score).padStart(3, '0');
        this.highScoreEl.textContent    = String(this.highScore).padStart(3, '0');
    }

    /** 从 localStorage 加载历史最高分 */
    _loadHighScore() {
        this.highScore = parseInt(localStorage.getItem('snake-high-score') || '0', 10);
        this._updateScoreDisplay();
    }
}


// ============================================================================
//  入口 — 当 DOM 加载完成后实例化 Game
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    new Game();
});
