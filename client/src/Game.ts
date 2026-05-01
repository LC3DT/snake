// ============================================================================
//  🐍 Snake — 主控制器
//  职责：整合 Canvas 渲染、FSM 状态机、主循环、DOM 管理
// ============================================================================

import {
  type Point,
  type ActiveEffect,
  Direction,
  GameState,
  ItemType,
} from './types';
import {
  COLS,
  ROWS,
  CELL_SIZE,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GAME_CONFIG,
  INITIAL_SNAKE_LENGTH,
  INITIAL_SNAKE_DIR,
  SNAKE_START_X,
  SNAKE_START_Y,
  COLORS,
  getItemConfig,
} from './constants';
import { GameStateMachine } from './GameStateMachine';
import { Snake } from './Snake';
import { InputHandler } from './InputHandler';
import { AudioManager } from './AudioManager';
import { ParticleSystem } from './Particle';
import { Item } from './Item';
import { AIController } from './AIController';
import { Network } from './Network';

export class Game {
  // ---- Canvas ----
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  // ---- 核心组件 ----
  private readonly fsm: GameStateMachine;
  private readonly snake: Snake;
  private readonly item: Item;
  private readonly input: InputHandler;
  private readonly audio: AudioManager;
  private readonly ai: AIController;
  private readonly network: Network;
  private readonly particles: ParticleSystem;

  // ---- 游戏状态 ----
  private score = 0;
  private highScore = 0;
  private tickInterval: number;
  private accumulator = 0;
  private lastTickTime = 0;
  /** 帧计数器（用于道具呼吸动画） */
  private frameCount = 0;

  // ---- 活跃效果 ----
  private readonly effects: ActiveEffect[] = [];
  /** 护盾：免疫一次碰撞 */
  private shieldActive = false;
  /** 幽灵模式：临时穿墙 */
  private ghostActive = false;

  // ---- 屏幕震动 ----
  private shakeTime = 0;
  private readonly SHAKE_DURATION = 400;

  // ---- 穿墙模式 ----
  private wrapMode = false;

  // ---- DOM 元素 ----
  private readonly currentScoreEl: HTMLElement | null;
  private readonly highScoreEl: HTMLElement | null;
  private readonly finalScoreEl: HTMLElement | null;
  private readonly speedLevelEl: HTMLElement | null;
  private readonly startOverlay: HTMLElement | null;
  private readonly pauseOverlay: HTMLElement | null;
  private readonly gameoverOverlay: HTMLElement | null;
  private readonly newRecordBadge: HTMLElement | null;
  private readonly wrapToggle: HTMLInputElement | null;
  private readonly aiStatusEl: HTMLElement | null;

  // ---- 排行榜 DOM ----
  private readonly leaderboardBody: HTMLElement | null;
  private readonly playerNameInput: HTMLInputElement | null;
  private readonly submitScoreBtn: HTMLButtonElement | null;
  private readonly submitArea: HTMLElement | null;
  private readonly submitSuccess: HTMLElement | null;
  private readonly refreshBtn: HTMLElement | null;

  // ---- 效果状态面板 DOM ----
  private readonly effectsPanel: HTMLElement | null;

  constructor() {
    // ---- Canvas ----
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!canvas) throw new Error('Canvas element #game-canvas not found');
    this.canvas = canvas;
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2D context');
    this.ctx = ctx;

    // ---- DOM ----
    this.currentScoreEl  = document.getElementById('current-score');
    this.highScoreEl     = document.getElementById('high-score');
    this.finalScoreEl    = document.getElementById('final-score-value');
    this.speedLevelEl    = document.getElementById('speed-level');
    this.startOverlay    = document.getElementById('start-overlay');
    this.pauseOverlay    = document.getElementById('pause-overlay');
    this.gameoverOverlay = document.getElementById('gameover-overlay');
    this.newRecordBadge  = document.getElementById('new-record-badge');
    this.wrapToggle      = document.getElementById('wrap-toggle') as HTMLInputElement | null;
    this.aiStatusEl      = document.getElementById('ai-status');
    this.effectsPanel    = document.getElementById('effects-panel');

    this.leaderboardBody = document.getElementById('leaderboard-body');
    this.playerNameInput = document.getElementById('player-name-input') as HTMLInputElement | null;
    this.submitScoreBtn  = document.getElementById('submit-score-btn') as HTMLButtonElement | null;
    this.submitArea      = document.getElementById('score-submit-area');
    this.submitSuccess   = document.getElementById('submit-success');
    this.refreshBtn      = document.getElementById('refresh-leaderboard-btn');

    // ---- 初始化组件 ----
    this.tickInterval = GAME_CONFIG.tickInterval;
    this.highScore = parseInt(localStorage.getItem('snake-high-score') ?? '0', 10);

    this.snake = new Snake(SNAKE_START_X, SNAKE_START_Y, INITIAL_SNAKE_LENGTH, INITIAL_SNAKE_DIR);
    this.item = new Item();
    this.particles = new ParticleSystem();
    this.audio = new AudioManager();
    this.ai = new AIController();
    this.network = new Network();

    // ---- 有限状态机 ----
    this.fsm = new GameStateMachine(GameState.MENU);
    this.fsm.onTransition((state, prev) => this._onStateChange(state, prev));

    // ---- 输入处理器 ----
    this.input = new InputHandler(GAME_CONFIG.inputQueueSize, (action) => {
      this._handleAction(action);
    });

    // ---- 穿墙切换 ----
    if (this.wrapToggle) {
      this.wrapToggle.addEventListener('change', () => {
        this.wrapMode = this.wrapToggle!.checked;
      });
    }

    // ---- 排行榜事件 ----
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', () => this._fetchLeaderboard());
    }
    if (this.submitScoreBtn) {
      this.submitScoreBtn.addEventListener('click', () => this._submitScore());
    }
    if (this.playerNameInput) {
      this.playerNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._submitScore();
      });
    }

    // ---- 初始渲染 ----
    this._updateScoreDisplay();
    this._updateHighScoreDisplay();
    this._updateAIStatus();
    this._syncOverlayVisibility();

    // ---- 首次加载排行榜 ----
    this._fetchLeaderboard();

    // ---- 启动主循环 ----
    this._loop(0);
  }

  // ========================================================================
  //  主循环
  // ========================================================================

  private _loop = (timestamp: number): void => {
    if (this.lastTickTime === 0) this.lastTickTime = timestamp;

    // 固定步长累计器
    let dt = timestamp - this.lastTickTime;
    this.lastTickTime = timestamp;

    // 防止切标签后瞬间追帧
    const maxDt = this.tickInterval * 3;
    if (dt > maxDt) dt = maxDt;

    this.accumulator += dt;

    // 更新活跃效果
    this._updateEffects(dt);
    this._updateEffectsUI();

    // 只在 PLAYING 状态下执行逻辑更新
    if (this.fsm.state === GameState.PLAYING) {
      const effectiveInterval = this._getDynamicInterval();
      while (this.accumulator >= effectiveInterval) {
        this._update();
        this.accumulator -= effectiveInterval;
      }
    } else {
      // 非 PLAYING 状态：丢弃累计器，防止切回时瞬间追帧
      this.accumulator = 0;
    }

    // 每帧渲染
    this._render(timestamp);

    requestAnimationFrame(this._loop);
  };

  // ========================================================================
  //  逻辑更新（固定步长）
  // ========================================================================

  private _update(): void {
    this.frameCount++;

    // ---- AI 决策 ----
    if (this.ai.isEnabled) {
      let aiDir = this.ai.decide(this.snake.head, this.snake, this.item.position);
      // 反转效果补偿：AI 计算的是真实移动方向，
      // 但 reversed 状态下 setDirection 会翻转方向，
      // 因此需要传入相反方向，让 setDirection 翻回 AI 的意图
      if (this.snake.reversed) {
        aiDir = this._oppositeDir(aiDir);
      }
      this.snake.setDirection(aiDir);
    }

    // ---- 消费输入 ----
    const dir = this.input.consumeDirection();
    if (dir) {
      this.snake.setDirection(dir);
    }

    // ---- 蛇移动 ----
    const removedTail = this.snake.update();

    // ---- 穿墙 & 碰撞 ----
    const wallHit = this.snake.checkWallCollision(this.wrapMode);
    const selfHit = this.snake.checkSelfCollision();
    if (wallHit || selfHit) {
      // 护盾免疫一次碰撞
      if (this.shieldActive) {
        this.shieldActive = false;
        // 移除护盾效果
        const idx = this.effects.findIndex(e => e.type === ItemType.SHIELD);
        if (idx >= 0) this.effects.splice(idx, 1);
        this.audio.playItemEat(ItemType.SHIELD);
        // 粒子爆发
        const cx = this.snake.head.x * CELL_SIZE + CELL_SIZE / 2;
        const cy = this.snake.head.y * CELL_SIZE + CELL_SIZE / 2;
        this.particles.burst(cx, cy, '#00ff88', 15);
        this._updateEffectsUI();
        return; // 跳过本次移动（不前进）
      }
      this._onDeath();
      return;
    }

    // ---- 道具拾取 ----
    if (this.item.active &&
        this.snake.head.x === this.item.position.x &&
        this.snake.head.y === this.item.position.y) {
      this._onEatItem();
      // 延长蛇身
      this.snake.grow(removedTail);
      // 生成新道具
      this.item.spawn(this.snake, performance.now());
    } else {
      // 检查道具是否过期
      if (this.item.isExpired(performance.now())) {
        this.item.active = false;
        this.item.spawn(this.snake, performance.now());
      }
    }

    // ---- 速度更新 ----
    this._updateSpeed();

    // ---- 粒子更新 ----
    this.particles.update(1); // dt=1 固定步长
  }

  // ========================================================================
  //  碰撞死亡
  // ========================================================================

  private _onDeath(): void {
    this.audio.playDeath();
    this._triggerShake();

    // 保存最高分
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('snake-high-score', String(this.highScore));
    }

    // FSM 流转到 GAME_OVER
    this.fsm.gameOver();
  }

  // ========================================================================
  //  状态变更回调
  // ========================================================================

  private _onStateChange(state: GameState, prev: GameState): void {
    this._syncOverlayVisibility();
    this._updateScoreDisplay();

    // 进入 GAME_OVER
    if (state === GameState.GAME_OVER) {
      this._showGameOver();
    }

    // 进入 PLAYING（从 MENU 或 GAME_OVER）
    if (state === GameState.PLAYING && prev !== GameState.PAUSED) {
      this._startGame();
    }

    // 恢复时重置累计器
    if (state === GameState.PLAYING && prev === GameState.PAUSED) {
      this.accumulator = 0;
      this.lastTickTime = 0;
    }
  }

  private _startGame(): void {
    this.score = 0;
    this.tickInterval = GAME_CONFIG.tickInterval;
    this.accumulator = 0;
    this.lastTickTime = 0;
    this.effects.length = 0;
    this.shieldActive = false;
    this.ghostActive = false;
    this.particles.clear();

    this.snake.reset(SNAKE_START_X, SNAKE_START_Y, INITIAL_SNAKE_LENGTH, INITIAL_SNAKE_DIR);
    this.input.clearQueue();
    this.item.spawn(this.snake, performance.now());

    this._resetSubmitUI();
    this._updateScoreDisplay();
    this._updateSpeedDisplay();
    this._applyEffect(ItemType.BLUE, false);   // 清除减速
    this._applyEffect(ItemType.PURPLE, false); // 清除反转
    this._updateEffectsUI();
  }

  // ========================================================================
  //  渲染
  // ========================================================================

  private _render(timestamp: number): void {
    const ctx = this.ctx;

    // ---- 清除 ----
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // ---- 屏幕震动 ----
    const shake = this._computeShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    // ---- 背景 ----
    const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGrad.addColorStop(0, COLORS.bgGradientTop);
    bgGrad.addColorStop(1, COLORS.bgGradientBottom);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // ---- 网格 ----
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL_SIZE, 0);
      ctx.lineTo(x * CELL_SIZE, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL_SIZE);
      ctx.lineTo(CANVAS_WIDTH, y * CELL_SIZE);
      ctx.stroke();
    }

    // ---- 道具 ----
    this.item.draw(ctx, timestamp);

    // ---- 蛇 ----
    this.snake.draw(ctx, CELL_SIZE);

    // ---- 粒子 ----
    this.particles.draw(ctx);

    ctx.restore();
  }

  // ========================================================================
  //  屏幕震动
  // ========================================================================

  private _triggerShake(): void {
    this.shakeTime = this.SHAKE_DURATION;
  }

  private _computeShakeOffset(): Point {
    if (this.shakeTime <= 0) return { x: 0, y: 0 };
    this.shakeTime -= this.tickInterval;
    const intensity = this.shakeTime / this.SHAKE_DURATION;
    return {
      x: (Math.random() - 0.5) * 8 * intensity,
      y: (Math.random() - 0.5) * 8 * intensity,
    };
  }

  // ========================================================================
  //  道具拾取逻辑
  // ========================================================================

  private _onEatItem(): void {
    const cfg = getItemConfig(this.item.type);
    this.score += cfg.points;
    this.audio.playItemEat(this.item.type);
    this._updateScoreDisplay();

    // 粒子特效
    const cx = this.item.position.x * CELL_SIZE + CELL_SIZE / 2;
    const cy = this.item.position.y * CELL_SIZE + CELL_SIZE / 2;
    this.particles.burst(cx, cy, cfg.color, 10);

    // 应用效果
    if (cfg.duration > 0) {
      this._addEffect(this.item.type, cfg.duration * 1000);
      this._updateEffectsUI();
    }
  }

  private _addEffect(type: ItemType, durationMs: number): void {
    // 同类型效果刷新计时
    const existing = this.effects.find(e => e.type === type);
    if (existing) {
      existing.remaining = durationMs;
    } else {
      this.effects.push({ type, remaining: durationMs });
      this._applyEffect(type, true);
    }
  }

  private _updateEffects(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      if (!e) continue;
      e.remaining -= dt;
      if (e.remaining <= 0) {
        this._applyEffect(e.type, false);
        this.effects.splice(i, 1);
      }
    }
  }

  private _applyEffect(type: ItemType, active: boolean): void {
    switch (type) {
      case ItemType.BLUE:
        // 减速 / 恢复 — 速度由 _getDynamicInterval 处理
        break;
      case ItemType.PURPLE:
        this.snake.reversed = active;
        break;
      case ItemType.SHIELD:
        this.shieldActive = active;
        break;
      case ItemType.GHOST:
        this.ghostActive = active;
        // 幽灵模式自动开启穿墙，效果结束恢复用户设置
        if (active) {
          this.wrapMode = true;
          if (this.wrapToggle) this.wrapToggle.checked = true;
        } else {
          this.wrapMode = false;
          if (this.wrapToggle) this.wrapToggle.checked = false;
        }
        break;
    }
  }

  private _getDynamicInterval(): number {
    let interval = this.tickInterval;
    // 减速效果（蓝色道具）：tick 翻倍
    if (this.effects.some(e => e.type === ItemType.BLUE)) {
      interval *= 2;
    }
    return interval;
  }

  /** 更新右上角效果状态面板 */
  private _updateEffectsUI(): void {
    if (!this.effectsPanel) return;

    if (this.effects.length === 0 && !this.shieldActive && !this.ghostActive) {
      this.effectsPanel.innerHTML = '';
      this.effectsPanel.classList.add('hidden');
      return;
    }
    this.effectsPanel.classList.remove('hidden');

    const items: string[] = [];

    for (const e of this.effects) {
      const cfg = getItemConfig(e.type);
      const remaining = Math.ceil(e.remaining / 1000);
      const color = cfg.color;
      items.push(`<div class="effect-item">
        <span class="effect-icon" style="color:${color}">${cfg.label}</span>
        <span class="effect-bar" style="background:${color};width:${Math.min(100, (e.remaining / (cfg.duration * 1000)) * 100)}%"></span>
        <span class="effect-time">${remaining}s</span>
      </div>`);
    }

    this.effectsPanel.innerHTML = items.join('');
  }

  // ========================================================================
  //  速度管理
  // ========================================================================

  private _updateSpeed(): void {
    // 每吃 5 个食物加速一级
    const speedLevel = Math.floor(this.score / 50); // 每 50 分一级（约 5 个普通食物）
    const newInterval = Math.max(
      GAME_CONFIG.minTickInterval,
      GAME_CONFIG.maxTickInterval - speedLevel * GAME_CONFIG.speedStep,
    );
    if (newInterval !== this.tickInterval) {
      this.tickInterval = newInterval;
      this._updateSpeedDisplay();
      // 加速音效
      if (newInterval < GAME_CONFIG.maxTickInterval) {
        this.audio.playSpeedUp();
      }
    }
  }

  // ========================================================================
  //  Overlay 可见性同步
  // ========================================================================

  private _syncOverlayVisibility(): void {
    const state = this.fsm.state;
    this._setVisible(this.startOverlay,    state === GameState.MENU);
    this._setVisible(this.pauseOverlay,    state === GameState.PAUSED);
    this._setVisible(this.gameoverOverlay, state === GameState.GAME_OVER);
  }

  private _setVisible(el: HTMLElement | null, visible: boolean): void {
    if (!el) return;
    el.classList.toggle('hidden', !visible);
  }

  // ========================================================================
  //  Game Over 流程
  // ========================================================================

  private _showGameOver(): void {
    if (this.finalScoreEl) {
      this.finalScoreEl.textContent = String(this.score);
    }
    if (this.newRecordBadge) {
      this.newRecordBadge.classList.toggle('hidden', this.score <= this.highScore);
    }

    // 分数 > 0 时显示提交区域
    this._resetSubmitUI();
    if (this.score > 0 && this.submitArea) {
      this.submitArea.classList.remove('hidden');
      if (this.playerNameInput) {
        setTimeout(() => this.playerNameInput!.focus(), 100);
      }
    }
  }

  // ========================================================================
  //  输入处理代理人
  // ========================================================================

  private _handleAction(action: { type: string; dir?: Direction }): void {
    switch (action.type) {
      case 'start':
        if (this.fsm.state === GameState.MENU) {
          this.fsm.start();
        } else if (this.fsm.state === GameState.GAME_OVER) {
          this.fsm.restart();
        }
        break;
      case 'togglePause':
        this.fsm.togglePause();
        break;
      case 'toggleAI': {
        const enabled = this.ai.toggle();
        this._updateAIStatus();
        // 开启 AI 时清除指令队列，避免干扰
        if (enabled) this.input.clearQueue();
        break;
      }
    }
  }

  // ========================================================================
  //  排行榜 API
  // ========================================================================

  private async _fetchLeaderboard(): Promise<void> {
    if (!this.leaderboardBody) return;
    this.leaderboardBody.innerHTML = '<div class="leaderboard-loading">加载中...</div>';

    try {
      const data = await this.network.fetchLeaderboard();

      if (data.length === 0) {
        this.leaderboardBody.innerHTML = '<div class="leaderboard-empty">暂无记录</div>';
        return;
      }

      this.leaderboardBody.innerHTML = data.map(entry => {
        const rankClass = entry.rank <= 3 ? ` top-${entry.rank}` : '';
        const medal = entry.rank === 1 ? '🥇'
          : entry.rank === 2 ? '🥈'
          : entry.rank === 3 ? '🥉'
          : `#${entry.rank}`;
        return `<div class="lb-entry${rankClass}">
          <span class="lb-rank">${medal}</span>
          <span class="lb-name">${this._escapeHtml(entry.playerName)}</span>
          <span class="lb-score">${String(entry.score).padStart(3, '0')}</span>
        </div>`;
      }).join('');
    } catch (err) {
      console.warn('排行榜获取失败:', err);
      this.leaderboardBody.innerHTML = '<div class="leaderboard-error">⚠ 服务器离线</div>';
    }
  }

  private async _submitScore(): Promise<void> {
    if (!this.playerNameInput || !this.submitScoreBtn || !this.submitSuccess) return;

    const name = this.playerNameInput.value.trim();

    // 验证
    if (!/^[a-zA-Z0-9_]{3,10}$/.test(name)) {
      this.playerNameInput.style.borderColor = '#ff0044';
      this.playerNameInput.style.boxShadow = '0 0 10px rgba(255, 0, 68, 0.3)';
      return;
    }
    this.playerNameInput.style.borderColor = '#333';
    this.playerNameInput.style.boxShadow = 'none';

    this.submitScoreBtn.disabled = true;
    this.submitScoreBtn.textContent = '...';

    try {
      await this.network.submitScore(name, this.score);

      this.submitArea?.classList.add('hidden');
      this.submitSuccess.classList.remove('hidden');

      this._fetchLeaderboard();
    } catch (err) {
      console.warn('分数提交失败:', err);
      const ss = this.submitSuccess;
      ss.textContent = '⚠ 提交失败，请重试';
      ss.style.color = '#ff0044';
      ss.classList.remove('hidden');
      setTimeout(() => {
        ss.textContent = '✅ 提交成功！';
        ss.style.color = '#00ff41';
        ss.classList.add('hidden');
      }, 3000);
    } finally {
      this.submitScoreBtn.disabled = false;
      this.submitScoreBtn.textContent = '提交';
    }
  }

  private _resetSubmitUI(): void {
    if (this.submitArea)    this.submitArea.classList.add('hidden');
    if (this.submitSuccess) this.submitSuccess.classList.add('hidden');
    if (this.playerNameInput) {
      this.playerNameInput.value = '';
      this.playerNameInput.style.borderColor = '#333';
      this.playerNameInput.style.boxShadow = 'none';
    }
    if (this.submitScoreBtn) {
      this.submitScoreBtn.disabled = false;
      this.submitScoreBtn.textContent = '提交';
    }
  }

  // ========================================================================
  //  UI 更新
  // ========================================================================

  private _updateScoreDisplay(): void {
    if (this.currentScoreEl) {
      this.currentScoreEl.textContent = String(this.score).padStart(3, '0');
    }
  }

  private _updateHighScoreDisplay(): void {
    if (this.highScoreEl) {
      this.highScoreEl.textContent = String(this.highScore).padStart(3, '0');
    }
  }

  private _updateSpeedDisplay(): void {
    if (this.speedLevelEl) {
      const level = Math.floor((GAME_CONFIG.maxTickInterval - this.tickInterval) / GAME_CONFIG.speedStep) + 1;
      this.speedLevelEl.textContent = `Lv.${level}`;
    }
  }

  private _updateAIStatus(): void {
    if (this.aiStatusEl) {
      this.aiStatusEl.textContent = this.ai.isEnabled ? '🤖 自动' : '👤 手动';
      this.aiStatusEl.style.color = this.ai.isEnabled ? '#00ff41' : '#888';
    }
  }

  // ========================================================================
  //  工具
  // ========================================================================

  /** 获取反方向（用于反转效果补偿） */
  private _oppositeDir(dir: Direction): Direction {
    const map: Record<Direction, Direction> = {
      [Direction.UP]:    Direction.DOWN,
      [Direction.DOWN]:  Direction.UP,
      [Direction.LEFT]:  Direction.RIGHT,
      [Direction.RIGHT]: Direction.LEFT,
    };
    return map[dir];
  }

  private _escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
}
