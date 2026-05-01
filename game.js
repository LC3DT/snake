/**
 * ============================================================================
 *  🐍 贪吃蛇 Snake — 核心游戏逻辑 (增强版 v2.0)
 *  技术栈：Vanilla JS (ES6+) + Canvas API + Web Audio API
 *  文件构成：
 *    Constants     — 网格/速度/状态常量
 *    AudioManager  — Web Audio API 8-bit 音效合成
 *    Particle      — 粒子特效系统
 *    InputHandler  — 键盘/触控事件 + 指令队列缓冲
 *    Snake         — 蛇管理（含穿墙/反转模式）
 *    Item          — 道具系统（普通/金色/蓝色/紫色）
 *    Game          — 游戏主控制器（状态机/固定步长循环/特效管理）
 * ============================================================================
 */

// ============================================================================
//  常量定义
// ============================================================================
const GRID_SIZE   = 20;                // 网格行列数 (20×20)
const CELL_SIZE   = 20;                // 每格像素大小 (px)
const CANVAS_SIZE = GRID_SIZE * CELL_SIZE; // 400px

// 基础速度参数
const BASE_TICK_INTERVAL  = 150;       // 初始 tick 间隔 (ms)
const MIN_TICK_INTERVAL   = 60;        // 最快 tick 间隔下限
const FOODS_PER_SPEEDUP   = 5;         // 每吃几个食物加速一次
const SPEEDUP_AMOUNT      = 8;         // 每次加速减少的 ms 数

// 方向向量 —— {dx, dy} 表示单位移动方向
const DIR = {
    UP:    { dx:  0, dy: -1 },
    DOWN:  { dx:  0, dy:  1 },
    LEFT:  { dx: -1, dy:  0 },
    RIGHT: { dx:  1, dy:  0 },
};

// 游戏状态枚举
const STATE = {
    IDLE:      'idle',
    PLAYING:   'playing',
    PAUSED:    'paused',
    GAME_OVER: 'gameover',
};

// 道具类型枚举
const ItemType = {
    NORMAL: 'normal',   // 红色   +10分  +1节
    GOLDEN: 'golden',   // 金色   +50分  5秒后自动消失
    BLUE:   'blue',     // 蓝色   0分    减速10秒
    PURPLE: 'purple',   // 紫色   0分    反转方向5秒
};

// 各道具类型的属性配置表
const ITEM_CONFIG = {
    [ItemType.NORMAL]: {
        color:     '#ff0044',
        glowColor: '#ff0044',
        score:     10,
        growCount: 1,
        label:     '+10',
        weight:    0.60,       // 生成权重 60%
        lifespan:  Infinity,   // 不会自动消失
    },
    [ItemType.GOLDEN]: {
        color:     '#ffd700',
        glowColor: '#ffd700',
        score:     50,
        growCount: 1,
        label:     '+50',
        weight:    0.15,       // 15%
        lifespan:  5000,       // 5 秒后消失
    },
    [ItemType.BLUE]: {
        color:     '#00bfff',
        glowColor: '#00bfff',
        score:     0,
        growCount: 1,
        label:     'SLOW',
        weight:    0.15,       // 15%
        lifespan:  Infinity,
        effectType: 'slow',
        effectDuration: 10000, // 减速 10 秒
    },
    [ItemType.PURPLE]: {
        color:     '#bf00ff',
        glowColor: '#bf00ff',
        score:     0,
        growCount: 1,
        label:     'REV',
        weight:    0.10,       // 10%
        lifespan:  Infinity,
        effectType: 'reverse',
        effectDuration: 5000,  // 反转 5 秒
    },
};


// ============================================================================
//  AudioManager — 浏览器内置 Web Audio API 合成 8-bit 音效
//  无需任何外部音频文件，直接用代码合成复古游戏音效
// ============================================================================
class AudioManager {
    constructor() {
        // AudioContext 需要在用户交互后才能创建（浏览器策略）
        this.ctx = null;
        this._initialized = false;
    }

    /** 懒初始化：在第一次用户交互时创建 AudioContext */
    _ensureContext() {
        if (this._initialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this._initialized = true;
        } catch (e) {
            console.warn('Web Audio API 不可用，跳过音效');
        }
    }

    /**
     * 通用音效合成函数
     * @param {string} type - 波形类型 'square'|'sawtooth'|'sine'|'triangle'
     * @param {number[]} frequencies - 频率序列 [start, end?]
     * @param {number} duration - 音效时长 (秒)
     * @param {number} volume - 音量 0~1
     */
    _playTone(type, frequencies, duration, volume = 0.3) {
        this._ensureContext();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        const now = this.ctx.currentTime;

        // 设置频率序列：支持单音或滑音
        if (frequencies.length === 1) {
            osc.frequency.setValueAtTime(frequencies[0], now);
        } else {
            osc.frequency.setValueAtTime(frequencies[0], now);
            osc.frequency.linearRampToValueAtTime(frequencies[1], now + duration);
        }

        // 音量包络：起音 → 衰减
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + duration);
    }

    /** 🍎 吃食物音效：短促上升的"嘀"声 */
    playEat() {
        this._playTone('square', [880, 1320], 0.12, 0.2);
    }

    /** ⭐ 吃金色食物音效：双音叠加的"叮"声 */
    playGoldenEat() {
        this._ensureContext();
        if (!this.ctx) return;
        // 两个振荡器同时播放，产生更丰富的音色
        this._playTone('square', [1047, 1568], 0.15, 0.2);
        this._playTone('triangle', [1319, 1976], 0.15, 0.1);
    }

    /** 💀 死亡音效：低频下滑"轰"声 */
    playDie() {
        this._playTone('sawtooth', [200, 40], 0.4, 0.35);
    }

    /** ⚡ 速度提升音效：上升琶音（三个快速音符） */
    playSpeedUp() {
        this._ensureContext();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const notes = [523, 659, 784]; // C5, E5, G5
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            const t = now + i * 0.07;
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(0.2, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
            osc.connect(gain).connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.1);
        });
    }

    /** 特殊道具音效 */
    playPowerUp() {
        this._playTone('triangle', [660, 990], 0.2, 0.25);
    }
}


// ============================================================================
//  Particle — 粒子特效
//  在食物被吃的位置生成一圈向外扩散的发光粒子
// ============================================================================
class Particle {
    /**
     * @param {number} x - 初始 X (像素坐标)
     * @param {number} y - 初始 Y (像素坐标)
     * @param {string} color - 颜色
     * @param {number} vx - 水平速度 (px/s)
     * @param {number} vy - 垂直速度 (px/s)
     */
    constructor(x, y, color, vx, vy) {
        this.x = x + CELL_SIZE / 2;  // 格子中心
        this.y = y + CELL_SIZE / 2;
        this.color = color;
        this.vx = vx;
        this.vy = vy;
        this.life = 1.0;        // 生命值 1.0 → 0.0
        this.decay = 0.025;     // 每帧衰减速度
        this.size = 3 + Math.random() * 2;  // 2~4px
    }

    /**
     * 每帧更新：移动 + 生命衰减
     * @param {number} dt - 帧时间差 (ms)
     */
    update(dt) {
        const sec = dt / 16.67; // 归一化到 60fps
        this.x += this.vx * sec;
        this.y += this.vy * sec;
        this.life -= this.decay;
        // 速度逐渐减缓（阻力）
        this.vx *= 0.96;
        this.vy *= 0.96;
    }

    /** 是否存活（生命 > 0） */
    isAlive() {
        return this.life > 0;
    }

    /** 绘制粒子：半透明圆形光点 */
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 6 * this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}


// ============================================================================
//  InputHandler — 键盘 & 触控事件处理
//
//  增强功能：
//  1. 输入指令队列 (Input Queuing)：玩家按键被压入队列，
//     每 tick 消费一个，使极速微操不丢指令、不反向。
//  2. 移动端触控支持 (Touch Swipe)：计算滑动方向映射为方向键。
// ============================================================================
class InputHandler {
    /**
     * @param {Object} callbacks
     *   .onDirection(dir)  — (不再使用，改用队列消费)
     *   .onStart()         — 空格/点击开始
     *   .onTogglePause()   — P/Esc 暂停切换
     */
    constructor(callbacks) {
        this.callbacks = callbacks;

        // ---- 方向指令队列 ----
        // 为什么用队列而不是单值缓冲？
        // 单缓冲只能存"最后一个"方向，极速连按时中间指令会丢失。
        // 队列可以缓存多个方向，每 tick 消费一个，确保每个操作都被执行。
        this.queue = [];
        this.MAX_QUEUE = 3;  // 最大缓存数，防止积压过多导致操控滞后

        // 绑定事件
        this._onKeyDown = this._handleKeyDown.bind(this);
        this._onTouchStart = this._handleTouchStart.bind(this);
        this._onTouchEnd = this._handleTouchEnd.bind(this);

        document.addEventListener('keydown', this._onKeyDown);

        // 触控事件绑定到 Canvas 容器
        const container = document.getElementById('canvas-container');
        if (container) {
            container.addEventListener('touchstart', this._onTouchStart, { passive: true });
            container.addEventListener('touchend', this._onTouchEnd, { passive: true });
        }
    }

    /** 键盘方向键映射表 */
    static KEY_MAP = {
        'ArrowUp':    DIR.UP,
        'ArrowDown':  DIR.DOWN,
        'ArrowLeft':  DIR.LEFT,
        'ArrowRight': DIR.RIGHT,
        'w': DIR.UP,    'W': DIR.UP,
        's': DIR.DOWN,  'S': DIR.DOWN,
        'a': DIR.LEFT,  'A': DIR.LEFT,
        'd': DIR.RIGHT, 'D': DIR.RIGHT,
    };

    // ========================================================================
    //  键盘处理
    // ========================================================================
    _handleKeyDown(e) {
        const key = e.key;

        // ---- 方向键：压入队列 ----
        if (key in InputHandler.KEY_MAP) {
            e.preventDefault();
            this.queue.push(InputHandler.KEY_MAP[key]);
            // 限制队列长度，防止积压
            if (this.queue.length > this.MAX_QUEUE) {
                this.queue.shift();
            }
            return;
        }

        // ---- 空格：开始/重开 ----
        if (key === ' ' || key === 'Spacebar') {
            e.preventDefault();
            if (this.callbacks.onStart) this.callbacks.onStart();
            return;
        }

        // ---- P / ESC：暂停切换 ----
        if (key === 'p' || key === 'P' || key === 'Escape') {
            e.preventDefault();
            if (this.callbacks.onTogglePause) this.callbacks.onTogglePause();
            return;
        }
    }

    // ========================================================================
    //  触控处理 (Swipe 手势)
    //
    //  算法：touchstart 记录起点，touchend 计算与起点的偏移量。
    //  比较 |dx| 和 |dy| 判断水平/垂直方向，再根据正负判断具体方向。
    //  最小滑动阈值 20px，避免误触。
    // ========================================================================
    _handleTouchStart(e) {
        const touch = e.touches[0];
        this._touchStartX = touch.clientX;
        this._touchStartY = touch.clientY;
    }

    _handleTouchEnd(e) {
        if (this._touchStartX === undefined) return;

        const touch = e.changedTouches[0];
        const dx = touch.clientX - this._touchStartX;
        const dy = touch.clientY - this._touchStartY;

        // 重置起点
        this._touchStartX = undefined;
        this._touchStartY = undefined;

        const MIN_SWIPE = 20; // 最小滑动像素阈值
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // 如果两个方向滑动都太小，忽略
        if (absDx < MIN_SWIPE && absDy < MIN_SWIPE) return;

        let dir;
        if (absDx > absDy) {
            // 水平滑动
            dir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
        } else {
            // 垂直滑动
            dir = dy > 0 ? DIR.DOWN : DIR.UP;
        }

        this.queue.push(dir);
        if (this.queue.length > this.MAX_QUEUE) {
            this.queue.shift();
        }
    }

    // ========================================================================
    //  队列消费
    // ========================================================================
    /**
     * 每 tick 调用一次，从队列头部取出一个方向
     * @returns {{dx,dy}|null} 方向向量，队列为空时返回 null
     */
    consumeDirection() {
        if (this.queue.length === 0) return null;
        return this.queue.shift();
    }

    /** 清空方向队列（重启时使用） */
    clearQueue() {
        this.queue = [];
    }

    /** 销毁事件监听 */
    destroy() {
        document.removeEventListener('keydown', this._onKeyDown);
        const container = document.getElementById('canvas-container');
        if (container) {
            container.removeEventListener('touchstart', this._onTouchStart);
            container.removeEventListener('touchend', this._onTouchEnd);
        }
    }
}


// ============================================================================
//  Snake — 蛇管理
//
//  增强功能：
//  1. 穿墙模式 (Wrap-around)：碰到墙壁从对侧穿出
//  2. 反转模式：方向控制被临时反向（紫色毒药效果）
// ============================================================================
class Snake {
    constructor(startX, startY, length, direction) {
        this.reset(startX, startY, length, direction);
        this.wrapMode = false;   // 穿墙模式开关
        this.reversed = false;   // 方向反转标志
    }

    /** 重置蛇到初始状态 */
    reset(startX, startY, length, direction) {
        this.body = [];
        for (let i = 0; i < length; i++) {
            this.body.push({
                x: startX - i * direction.dx,
                y: startY - i * direction.dy,
            });
        }
        this.direction     = { ...direction };
        this.nextDirection = { ...direction };
        this.growing = 0;  // 改为数字：待增长节数（可累计）
        this.reversed = false;
    }

    /**
     * 设置方向（含防反向 + 反转模式）
     *
     * 防反向：向量和为零 → 反向
     * 反转模式：如果 reversed=true，自动将方向取反，
     *   例如玩家按"上"实际变成"下"，增加操作趣味性。
     */
    setDirection(newDir) {
        // 如果处于反转状态，将方向翻转
        if (this.reversed) {
            newDir = { dx: -newDir.dx, dy: -newDir.dy };
        }

        const cur = this.nextDirection;
        // 相同方向 → 忽略
        if (newDir.dx === cur.dx && newDir.dy === cur.dy) return;
        // 相反方向 → 忽略（防反向）
        if (newDir.dx + cur.dx === 0 && newDir.dy + cur.dy === 0) return;
        this.nextDirection = newDir;
    }

    /**
     * 每 tick 移动蛇
     * 增强：如果 wrapMode=true，穿墙处理
     */
    update() {
        this.direction = { ...this.nextDirection };

        const head = this.body[0];
        let newHead = {
            x: head.x + this.direction.dx,
            y: head.y + this.direction.dy,
        };

        // ---- 穿墙模式：如果开启，墙壁对侧穿出 ----
        if (this.wrapMode) {
            if (newHead.x < 0) newHead.x = GRID_SIZE - 1;
            if (newHead.x >= GRID_SIZE) newHead.x = 0;
            if (newHead.y < 0) newHead.y = GRID_SIZE - 1;
            if (newHead.y >= GRID_SIZE) newHead.y = 0;
        }

        this.body.unshift(newHead);

        if (this.growing > 0) {
            this.growing--;
        } else {
            this.body.pop();
        }
    }

    /** 标记蛇增长 n 节 */
    grow(count = 1) {
        this.growing += count;
    }

    /**
     * 撞墙检测
     * 穿墙模式下永不返回 true（因为会被包裹回来）
     */
    checkWallCollision() {
        if (this.wrapMode) return false;
        const head = this.body[0];
        return head.x < 0 || head.x >= GRID_SIZE ||
               head.y < 0 || head.y >= GRID_SIZE;
    }

    /** 咬己检测：蛇头 vs 身体（从索引 1 开始） */
    checkSelfCollision() {
        const head = this.body[0];
        for (let i = 1; i < this.body.length; i++) {
            if (this.body[i].x === head.x && this.body[i].y === head.y) {
                return true;
            }
        }
        return false;
    }

    /** 判断坐标是否被蛇身占据 */
    occupies(x, y) {
        return this.body.some(seg => seg.x === x && seg.y === y);
    }

    /** 获取蛇头引用 */
    getHead() {
        return this.body[0];
    }

    /**
     * 绘制蛇到 Canvas
     * 蛇头：亮绿色发光 + 动态眼睛
     * 蛇身：从亮到暗渐变
     */
    draw(ctx) {
        const len = this.body.length;
        for (let i = 0; i < len; i++) {
            const seg = this.body[i];
            const px = seg.x * CELL_SIZE;
            const py = seg.y * CELL_SIZE;

            if (i === 0) {
                // 蛇头
                ctx.fillStyle = '#00ff41';
                ctx.shadowColor = '#00ff41';
                ctx.shadowBlur = 12;
                ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);

                ctx.shadowBlur = 0;
                ctx.fillStyle = '#0a0a0a';
                const eyeSize = 3;
                const d = this.direction;
                const cx = px + CELL_SIZE / 2;
                const cy = py + CELL_SIZE / 2;

                // 如果方向被反转，眼睛位置也要反
                const edx = this.reversed ? -d.dx : d.dx;
                const edy = this.reversed ? -d.dy : d.dy;

                ctx.beginPath();
                ctx.arc(cx + edx * 4 - edy * 3, cy + edy * 4 + edx * 3, eyeSize, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(cx + edx * 4 + edy * 3, cy + edy * 4 - edx * 3, eyeSize, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // 蛇身渐变
                const t = i / len;
                const green = Math.floor(0xcc - t * 0x66);
                const g = green;
                const b = Math.floor(0x33 - t * 0x33);
                ctx.fillStyle = `rgb(0, ${g}, ${b})`;
                ctx.shadowColor = '#00ff41';
                ctx.shadowBlur = Math.max(0, 6 - t * 5);
                const margin = 1 + Math.floor(t * 1);
                ctx.fillRect(px + margin, py + margin, CELL_SIZE - margin * 2, CELL_SIZE - margin * 2);
            }
        }
        ctx.shadowBlur = 0;
    }
}


// ============================================================================
//  Item — 道具系统（替代原来的 Food）
//
//  四种道具类型：
//    NORMAL (红色)  — +10 分, +1 节
//    GOLDEN (金色)  — +50 分, 5 秒后自动消失
//    BLUE   (蓝色)  — 减速 10 秒
//    PURPLE (紫色)  — 反转方向 5 秒
// ============================================================================
class Item {
    constructor() {
        this.position = { x: 0, y: 0 };
        this.type = ItemType.NORMAL;
        this.spawnTime = 0;   // 生成时的时间戳 (ms)，用于金色倒计时
    }

    /**
     * 在空白格上随机生成道具
     * 类型按权重随机：
     *   普通 60% | 金色 15% | 蓝色 15% | 紫色 10%
     *
     * @param {Snake} snake - 蛇实例
     * @param {number} now - 当前时间戳 (ms)
     */
    spawn(snake, now) {
        // ---- 选类型（加权随机） ----
        const rand = Math.random();
        let cumulative = 0;
        let chosenType = ItemType.NORMAL;
        for (const [type, cfg] of Object.entries(ITEM_CONFIG)) {
            cumulative += cfg.weight;
            if (rand < cumulative) {
                chosenType = type;
                break;
            }
        }
        this.type = chosenType;
        this.spawnTime = now || 0;

        // ---- 选位置（避开蛇身） ----
        const freeCells = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            for (let y = 0; y < GRID_SIZE; y++) {
                if (!snake.occupies(x, y)) {
                    freeCells.push({ x, y });
                }
            }
        }
        if (freeCells.length === 0) {
            this.position = { x: 0, y: 0 };
            return;
        }
        const idx = Math.floor(Math.random() * freeCells.length);
        this.position = freeCells[idx];
    }

    /** 获取当前道具类型的配置 */
    get config() {
        return ITEM_CONFIG[this.type];
    }

    /** 判断蛇头是否吃到道具 */
    isEatenBy(head) {
        return head.x === this.position.x && head.y === this.position.y;
    }

    /**
     * 判断金色道具是否超时
     * @param {number} now - 当前时间戳 (ms)
     */
    isExpired(now) {
        if (this.type !== ItemType.GOLDEN) return false;
        return (now - this.spawnTime) > this.config.lifespan;
    }

    /**
     * 金色道具的剩余存活比例 (0~1)，用于 UI 提示
     */
    getLifeRatio(now) {
        if (this.type !== ItemType.GOLDEN) return 1;
        const elapsed = now - this.spawnTime;
        return Math.max(0, 1 - elapsed / this.config.lifespan);
    }

    /**
     * 绘制道具
     * 视觉风格：彩色发光圆角方块 + 标签文字
     * 金色额外显示倒计时进度条
     */
    draw(ctx, time) {
        const cfg = this.config;
        const px = this.position.x * CELL_SIZE;
        const py = this.position.y * CELL_SIZE;

        // 呼吸光晕：使用 (time % 2000) 归一化到 2 秒周期，
        // 避免 Date.now() 大数值导致 Math.sin 精度损失
        const pulse = 0.6 + 0.4 * Math.sin((time % 2000) * 0.003);
        const glowSize = 5 + 4 * pulse;

        ctx.shadowColor = cfg.glowColor;
        ctx.shadowBlur = glowSize;
        ctx.fillStyle = cfg.color;

        const margin = 2;
        const radius = 4;
        const w = CELL_SIZE - margin * 2;
        const h = CELL_SIZE - margin * 2;
        const x = px + margin;
        const y = py + margin;

        // 圆角矩形
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

        // 标签文字
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px Orbitron, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cfg.label, px + CELL_SIZE / 2, py + CELL_SIZE / 2);

        // 金色道具额外绘制倒计时进度条
        if (this.type === ItemType.GOLDEN) {
            const life = this.getLifeRatio(time);
            const barW = CELL_SIZE - 4;
            const barH = 2;
            const barX = px + 2;
            const barY = py + CELL_SIZE - 3;
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(barX, barY, barW * life, barH);
        }

        ctx.shadowBlur = 0;
    }
}


// ============================================================================
//  Game — 游戏主控制器
//
//  增强功能：
//  1. 动态难度曲线 (Dynamic Speed)
//  2. 特殊食物系统 (Power-ups)
//  3. 粒子特效 (Particle System)
//  4. 音效引擎 (AudioManager)
//  5. 屏幕震动 (Screen Shake)
//  6. 穿墙模式 (Wrap-around Mode)
//  7. 效果定时管理器 (Effect Manager)
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
        this.speedLevelEl   = document.getElementById('speed-level');
        this.startOverlay   = document.getElementById('start-overlay');
        this.pauseOverlay   = document.getElementById('pause-overlay');
        this.gameoverOverlay= document.getElementById('gameover-overlay');
        this.newRecordBadge = document.getElementById('new-record-badge');
        this.wrapToggle     = document.getElementById('wrap-toggle');

        // ---- 游戏核心数据 ----
        this.score       = 0;
        this.highScore   = parseInt(localStorage.getItem('snake-high-score') || '0', 10);
        this.state       = STATE.IDLE;
        this.foodsEaten  = 0;  // 累计吃道具数（用于动态速度）

        // ---- 动态速度 ----
        // baseTickInterval = 初始速度基准值
        // tickInterval = 当前实际间隔 (受动态难度 + 减速效果影响)
        this.baseTickInterval = BASE_TICK_INTERVAL;
        this.tickInterval     = BASE_TICK_INTERVAL;
        this.speedLevel       = 0;  // 当前加速等级

        // ---- 穿墙模式 ----
        this.wrapMode = false;

        // ---- 子模块 ----
        this.snake = new Snake(
            Math.floor(GRID_SIZE / 2),
            Math.floor(GRID_SIZE / 2),
            3,
            DIR.RIGHT
        );
        this.item = new Item();         // 取代原来的 Food
        this.audio = new AudioManager();
        this.inputHandler = new InputHandler({
            // onDirection 不再使用，改用队列 consumeDirection
            onStart:       () => this._handleStart(),
            onTogglePause: () => this._handleTogglePause(),
        });

        // ---- 粒子系统 ----
        this.particles = [];

        // ---- 效果管理器 (Effect Manager) ----
        // 存储当前生效的定时效果
        // [{ type: 'slow'|'reverse', remaining: ms }]
        this.effects = [];
        // 反转计时引用，用于蛇的反转状态同步
        this._reverseEffectIndex = -1;

        // ---- 屏幕震动状态 ----
        this.shake = {
            active:    false,
            elapsed:   0,
            duration:  400,    // 震动持续 400ms
            intensity: 3,      // 最大偏移像素
        };

        // ---- 游戏循环计时 ----
        this.lastTickTime = 0;
        this.accumulator  = 0;
        this.animFrameId  = null;
        this.startTime    = 0;

        // ---- 初始化 ----
        this.item.spawn(this.snake, Date.now());

        // ---- 穿墙模式按钮事件 ----
        if (this.wrapToggle) {
            this.wrapToggle.addEventListener('change', (e) => {
                this.wrapMode = e.target.checked;
                this.snake.wrapMode = e.target.checked;
            });
        }

        // ---- Canvas 点击事件 ----
        this.canvas.addEventListener('click', () => this._handleStart());
        // 阻止触控时的 click 事件冒泡
        this.canvas.addEventListener('touchstart', (e) => e.preventDefault());

        // ---- 显示最高分 ----
        this._updateScoreDisplay();
        this._updateSpeedDisplay();

        // ---- 启动渲染循环 ----
        this._loop(0);
    }

    // ========================================================================
    //  游戏循环 (requestAnimationFrame + 固定步长)
    // ========================================================================
    _loop(timestamp) {
        if (this.lastTickTime === 0) {
            this.lastTickTime = timestamp;
            this.startTime    = timestamp;
        }

        let deltaTime = timestamp - this.lastTickTime;
        if (deltaTime > this.tickInterval * 3) {
            deltaTime = this.tickInterval * 3;
        }
        this.lastTickTime = timestamp;
        this.accumulator += deltaTime;

        // ---- 固定步长更新 ----
        while (this.accumulator >= this.tickInterval) {
            if (this.state === STATE.PLAYING) {
                this._update();
            }
            this.accumulator -= this.tickInterval;
        }

        // ---- 更新粒子和效果（每帧更新，与 tick 独立） ----
        if (this.state === STATE.PLAYING) {
            this._updateParticles(deltaTime);
            this._updateEffects(deltaTime);
        } else {
            // 即使非进行状态，粒子也继续动画到消失
            this._updateParticles(deltaTime);
        }

        // ---- 渲染（传入 Date.now() 保证与 item.spawnTime 时间单位一致） ----
        this._render(Date.now());

        this.animFrameId = requestAnimationFrame((t) => this._loop(t));
    }

    // ========================================================================
    //  _update() — 每 tick 游戏逻辑更新
    // ========================================================================
    _update() {
        // ---- 1. 消费输入指令队列（每 tick 只消费一个） ----
        const dir = this.inputHandler.consumeDirection();
        if (dir) {
            this.snake.setDirection(dir);
        }

        // ---- 2. 蛇移动 ----
        this.snake.update();

        // ---- 3. 碰撞检测 ----
        if (this.snake.checkWallCollision() || this.snake.checkSelfCollision()) {
            this.audio.playDie();
            this._triggerShake();
            this._gameOver();
            return;
        }

        // ---- 4. 道具检测 ----
        if (this.item.isEatenBy(this.snake.getHead())) {
            this._onEatItem();
            return; // 吃道具后本 tick 不再继续（防止同一 tick 内多次判定）
        }

        // ---- 5. 金色道具超时检测 ----
        if (this.item.isExpired(Date.now())) {
            this.item.spawn(this.snake, Date.now());
        }

        // ---- 6. 消耗粒子（空闲时清理） ----
        // 粒子在 _updateParticles 中处理
    }

    /**
     * 处理吃到道具的逻辑
     * 根据道具类型执行不同的得分/效果/反馈
     */
    _onEatItem() {
        const cfg = this.item.config;
        const now = Date.now();

        // ---- 得分 ----
        this.score += cfg.score;
        this.foodsEaten++;

        // ---- 蛇身增长 ----
        if (cfg.growCount > 0) {
            this.snake.grow(cfg.growCount);
        }

        // ---- 粒子特效（在食物位置爆发） ----
        this._spawnParticleBurst(
            this.item.position.x * CELL_SIZE,
            this.item.position.y * CELL_SIZE,
            cfg.color,
            10
        );

        // ---- 音效 ----
        if (this.item.type === ItemType.GOLDEN) {
            this.audio.playGoldenEat();
        } else if (this.item.type === ItemType.NORMAL) {
            this.audio.playEat();
        } else {
            this.audio.playPowerUp();
        }

        // ---- 特殊效果（蓝色减速 / 紫色反转） ----
        if (cfg.effectType) {
            this._addEffect(cfg.effectType, cfg.effectDuration);
        }

        // ---- 动态速度更新 ----
        this._updateSpeed();

        // ---- UI 更新 ----
        this._updateScoreDisplay();

        // ---- 生成新道具 ----
        this.item.spawn(this.snake, now);
    }

    // ========================================================================
    //  效果管理器 (Effect Manager)
    //
    //  管理计时性效果（减速、反转）：
    //   - 添加效果时检查是否已存在同类型，如果存在则刷新计时（叠加）
    //   - 每帧更新剩余时间
    //   - 效果到期后自动移除并恢复原状态
    // ========================================================================

    /**
     * 添加一个定时效果
     * @param {string} type - 'slow' | 'reverse'
     * @param {number} duration - 持续时间 (ms)
     */
    _addEffect(type, duration) {
        // 检查是否已有同类型效果 → 刷新计时
        const existing = this.effects.find(e => e.type === type);
        if (existing) {
            existing.remaining = Math.max(existing.remaining, duration);
            return;
        }

        this.effects.push({ type, remaining: duration });

        // 立即应用效果
        this._applyEffect(type, true);
    }

    /** 每帧更新效果计时 */
    _updateEffects(dt) {
        let changed = false;
        for (let i = this.effects.length - 1; i >= 0; i--) {
            this.effects[i].remaining -= dt;
            if (this.effects[i].remaining <= 0) {
                // 效果到期，恢复
                this._applyEffect(this.effects[i].type, false);
                this.effects.splice(i, 1);
                changed = true;
            }
        }
    }

    /**
     * 应用/取消效果
     * @param {string} type
     * @param {boolean} active - true=生效, false=取消
     */
    _applyEffect(type, active) {
        switch (type) {
            case 'slow':
                if (active) {
                    // 减速：当前 tickInterval 翻倍
                    this.tickInterval = this._getDynamicInterval() * 2;
                } else {
                    // 恢复：重新计算动态速度
                    this.tickInterval = this._getDynamicInterval();
                }
                break;

            case 'reverse':
                this.snake.reversed = active;
                break;
        }
    }

    // ========================================================================
    //  动态速度系统
    // ========================================================================

    /**
     * 计算当前应使用的 tickInterval（不考虑减速效果）
     * 公式：BASE_TICK_INTERVAL - speedLevel * SPEEDUP_AMOUNT
     * 下限：MIN_TICK_INTERVAL
     */
    _getDynamicInterval() {
        return Math.max(
            MIN_TICK_INTERVAL,
            BASE_TICK_INTERVAL - this.speedLevel * SPEEDUP_AMOUNT
        );
    }

    /** 每吃 FOODS_PER_SPEEDUP 个食物加速一级 */
    _updateSpeed() {
        const newLevel = Math.floor(this.foodsEaten / FOODS_PER_SPEEDUP);

        if (newLevel > this.speedLevel) {
            // 速度等级提升了！
            const oldLevel = this.speedLevel;
            this.speedLevel = newLevel;

            // 播放加速音效（每次提升一级播放一次）
            if (oldLevel !== newLevel) {
                this.audio.playSpeedUp();
            }
        }

        // 更新 tickInterval（考虑减速效果）
        const dynamicInterval = this._getDynamicInterval();

        // 检查当前是否有减速效果
        const hasSlow = this.effects.some(e => e.type === 'slow');
        this.tickInterval = hasSlow ? dynamicInterval * 2 : dynamicInterval;

        this._updateSpeedDisplay();
    }

    // ========================================================================
    //  粒子系统
    // ========================================================================

    /**
     * 在指定位置生成粒子爆发
     * @param {number} cx - 中心 X (像素坐标)
     * @param {number} cy - 中心 Y (像素坐标)
     * @param {string} color - 颜色
     * @param {number} count - 粒子数量
     */
    _spawnParticleBurst(cx, cy, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
            const speed = 1.5 + Math.random() * 2.5;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this.particles.push(new Particle(cx, cy, color, vx, vy));
        }
    }

    /** 每帧更新所有粒子 */
    _updateParticles(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(dt);
            if (!this.particles[i].isAlive()) {
                this.particles.splice(i, 1);
            }
        }
    }

    // ========================================================================
    //  屏幕震动系统
    // ========================================================================

    /** 触发屏幕震动 */
    _triggerShake() {
        this.shake.active = true;
        this.shake.elapsed = 0;
    }

    /**
     * 计算当前帧的震动偏移
     * @returns {{dx: number, dy: number}}
     */
    _computeShakeOffset() {
        if (!this.shake.active) return { dx: 0, dy: 0 };

        // 震动强度随持续时间衰减
        const progress = this.shake.elapsed / this.shake.duration; // 0~1
        const intensity = this.shake.intensity * (1 - progress);

        return {
            dx: (Math.random() - 0.5) * 2 * intensity,
            dy: (Math.random() - 0.5) * 2 * intensity,
        };
    }

    // ========================================================================
    //  _render() — 每帧绘制
    // ========================================================================
    _render(timestamp) {
        const ctx = this.ctx;

        // ---- 屏幕震动 ----
        let shakeOffset = { dx: 0, dy: 0 };
        if (this.shake.active) {
            shakeOffset = this._computeShakeOffset();
            ctx.save();
            ctx.translate(shakeOffset.dx, shakeOffset.dy);
            this.shake.elapsed += 16.67; // 近似帧时间
            if (this.shake.elapsed >= this.shake.duration) {
                this.shake.active = false;
            }
        }

        // ---- 清空画布 ----
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        // ---- 网格线 ----
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

        // ---- 绘制道具（now = Date.now()，与 spawnTime 单位一致） ----
        this.item.draw(ctx, timestamp);

        // ---- 绘制蛇 ----
        this.snake.draw(ctx);

        // ---- 绘制粒子 ----
        for (const p of this.particles) {
            p.draw(ctx);
        }

        // ---- 恢复画布（震动偏移） ----
        if (this.shake.active || shakeOffset.dx !== 0 || shakeOffset.dy !== 0) {
            ctx.restore();
        }

        // ---- 效果指示器（在 Canvas 角落显示当前效果） ----
        this._renderEffectIndicators(ctx);
    }

    /**
     * 在 Canvas 右上角绘制当前生效效果的指示器
     * 蓝色 = 减速中，紫色 = 反转中
     */
    _renderEffectIndicators(ctx) {
        let y = 8;
        for (const effect of this.effects) {
            const remaining = Math.ceil(effect.remaining / 1000);
            const text = effect.type === 'slow'
                ? `🐢 SLOW ${remaining}s`
                : `🌀 REV ${remaining}s`;
            ctx.save();
            ctx.font = 'bold 10px Orbitron, monospace';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.shadowBlur = 8;
            ctx.shadowColor = effect.type === 'slow' ? '#00bfff' : '#bf00ff';
            ctx.fillStyle = effect.type === 'slow' ? '#00bfff' : '#bf00ff';
            ctx.fillText(text, CANVAS_SIZE - 8, y);
            ctx.restore();
            y += 16;
        }
    }

    // ========================================================================
    //  状态切换函数
    // ========================================================================

    _handleStart() {
        if (this.state === STATE.IDLE) {
            this._startGame();
        } else if (this.state === STATE.GAME_OVER) {
            this._restartGame();
        }
    }

    _handleTogglePause() {
        if (this.state === STATE.PLAYING) {
            this._pauseGame();
        } else if (this.state === STATE.PAUSED) {
            this._resumeGame();
        }
    }

    _startGame() {
        this.state = STATE.PLAYING;
        this.startOverlay.classList.add('hidden');
        this.gameoverOverlay.classList.add('hidden');
        this.pauseOverlay.classList.add('hidden');
    }

    _pauseGame() {
        this.state = STATE.PAUSED;
        this.pauseOverlay.classList.remove('hidden');
    }

    _resumeGame() {
        this.state = STATE.PLAYING;
        this.pauseOverlay.classList.add('hidden');
    }

    /** 完全重置游戏状态 */
    _restartGame() {
        // 重置蛇
        this.snake.reset(
            Math.floor(GRID_SIZE / 2),
            Math.floor(GRID_SIZE / 2),
            3,
            DIR.RIGHT
        );
        this.snake.wrapMode = this.wrapMode;

        // 重置数据
        this.score = 0;
        this.foodsEaten = 0;
        this.speedLevel = 0;
        this.tickInterval = BASE_TICK_INTERVAL;
        this.baseTickInterval = BASE_TICK_INTERVAL;

        // 重置效果
        this.effects = [];
        this._applyEffect('slow', false);
        this._applyEffect('reverse', false);

        // 重置粒子
        this.particles = [];

        // 重置道具
        this.item.spawn(this.snake, Date.now());

        // 清空输入队列
        this.inputHandler.clearQueue();

        // 更新 UI
        this._updateScoreDisplay();
        this._updateSpeedDisplay();
        this._loadHighScore();

        // 切换到进行状态
        this.state = STATE.PLAYING;
        this.startOverlay.classList.add('hidden');
        this.gameoverOverlay.classList.add('hidden');
        this.pauseOverlay.classList.add('hidden');

        // 重置计时器
        this.lastTickTime = 0;
        this.accumulator = 0;
    }

    _gameOver() {
        this.state = STATE.GAME_OVER;

        let isNewRecord = false;
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('snake-high-score', String(this.highScore));
            isNewRecord = true;
        }

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
    //  UI 更新
    // ========================================================================

    _updateScoreDisplay() {
        this.currentScoreEl.textContent = String(this.score).padStart(3, '0');
        this.highScoreEl.textContent    = String(this.highScore).padStart(3, '0');
    }

    _updateSpeedDisplay() {
        if (this.speedLevelEl) {
            this.speedLevelEl.textContent = `Lv.${this.speedLevel}`;
        }
    }

    _loadHighScore() {
        this.highScore = parseInt(localStorage.getItem('snake-high-score') || '0', 10);
        this._updateScoreDisplay();
    }
}


// ============================================================================
//  入口
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    new Game();
});
