// ============================================================================
//  🐍 Snake — 蛇
//  职责：数据结构、移动逻辑、碰撞检测
// ============================================================================

import {
  type SnakeSegment,
  Direction,
  DIRECTION_DELTA,
} from './types';
import { COLS, ROWS } from './constants';

export class Snake {
  body: SnakeSegment[];
  direction: Direction;
  /** 下一个 tick 将要采用的方向（由 InputHandler 提供） */
  nextDirection: Direction;
  /** 是否处于反转状态（紫色道具） */
  reversed = false;

  constructor(startX: number, startY: number, length: number, dir: Direction) {
    this.direction = dir;
    this.nextDirection = dir;
    this.body = [];
    for (let i = 0; i < length; i++) {
      this.body.push({ x: startX - i * DIRECTION_DELTA[dir].x, y: startY - i * DIRECTION_DELTA[dir].y });
    }
  }

  /** 重置（用于重新开始游戏） */
  reset(startX: number, startY: number, length: number, dir: Direction): void {
    this.direction = dir;
    this.nextDirection = dir;
    this.reversed = false;
    this.body = [];
    for (let i = 0; i < length; i++) {
      this.body.push({ x: startX - i * DIRECTION_DELTA[dir].x, y: startY - i * DIRECTION_DELTA[dir].y });
    }
  }

  /** 蛇头坐标 */
  get head(): SnakeSegment {
    const h = this.body[0];
    if (!h) throw new Error('Snake body is empty');
    return h;
  }

  /** 蛇尾坐标 */
  get tail(): SnakeSegment {
    const t = this.body[this.body.length - 1];
    if (!t) throw new Error('Snake body is empty');
    return t;
  }

  /** 设置下一步方向（带防反向检查） */
  setDirection(newDir: Direction): void {
    const current = this.direction;
    const delta = DIRECTION_DELTA[newDir];
    const opposite = DIRECTION_DELTA[current];
    // 禁止 180° 掉头（除非蛇长 1）
    if (this.body.length > 1 && delta.x + opposite.x === 0 && delta.y + opposite.y === 0) {
      return;
    }
    this.nextDirection = this.reversed ? this.opposite(newDir) : newDir;
  }

  /** 获取反方向 */
  private opposite(dir: Direction): Direction {
    const map: Record<Direction, Direction> = {
      [Direction.UP]:    Direction.DOWN,
      [Direction.DOWN]:  Direction.UP,
      [Direction.LEFT]:  Direction.RIGHT,
      [Direction.RIGHT]: Direction.LEFT,
    };
    return map[dir];
  }

  /** 推进一个 tick：移动蛇头，移除蛇尾 */
  update(): SnakeSegment {
    this.direction = this.nextDirection;
    const delta = DIRECTION_DELTA[this.direction];
    const newHead: SnakeSegment = {
      x: this.head.x + delta.x,
      y: this.head.y + delta.y,
    };
    this.body.unshift(newHead);
    return this.body.pop()!; // 返回移除的尾部（用于判断是否吃到食物）
  }

  /** 在 update() 之后调用：延长蛇身（吃到食物） */
  grow(tail: SnakeSegment): void {
    this.body.push(tail);
  }

  /** 碰墙检测（非穿墙模式） */
  checkWallCollision(wrapMode: boolean): boolean {
    const h = this.head;
    if (wrapMode) {
      // 穿墙模式：环绕到对面
      this.body[0] = {
        x: ((h.x % COLS) + COLS) % COLS,
        y: ((h.y % ROWS) + ROWS) % ROWS,
      };
      return false;
    }
    return h.x < 0 || h.x >= COLS || h.y < 0 || h.y >= ROWS;
  }

  /** 自身碰撞检测 */
  checkSelfCollision(): boolean {
    const h = this.head;
    // 从索引 1 开始检查（蛇头不能撞自己身体）
    for (let i = 1; i < this.body.length; i++) {
      const seg = this.body[i];
      if (seg && seg.x === h.x && seg.y === h.y) return true;
    }
    return false;
  }

  /** 检查某坐标是否在蛇身上 */
  occupies(x: number, y: number): boolean {
    return this.body.some(seg => seg.x === x && seg.y === y);
  }

  /** 呼吸动画相位（外部调用时可注入 timestamp 驱动） */
  private _phase = 0;

  /** 绘制 — 拟真蛇身 */
  draw(ctx: CanvasRenderingContext2D, cellSize: number): void {
    this._phase += 0.03;
    const len = this.body.length;
    if (len === 0) return;

    // ---- 先绘制身体（蛇头之上，模拟层次感） ----
    for (let i = len - 1; i >= 1; i--) {
      const seg = this.body[i];
      if (!seg) continue;
      this._drawSegment(ctx, seg, i, len, cellSize, false);
    }

    // ---- 再绘制蛇头（最上层） ----
    const head = this.body[0];
    if (head) this._drawSegment(ctx, head, 0, len, cellSize, true);

    ctx.shadowBlur = 0;
  }

  /** 绘制单个蛇身段 */
  private _drawSegment(
    ctx: CanvasRenderingContext2D,
    seg: SnakeSegment,
    index: number,
    total: number,
    cellSize: number,
    isHead: boolean,
  ): void {
    const x = seg.x * cellSize;
    const y = seg.y * cellSize;
    const pad = isHead ? 0.5 : 1.5;
    const size = cellSize - pad * 2;
    const ratio = index / total; // 0=head, 1=tail
    const breathScale = isHead ? 1 + Math.sin(this._phase) * 0.04 : 1;

    // ---- 身体段 ----
    const cx = x + cellSize / 2;
    const cy = y + cellSize / 2;
    const half = (size / 2) * breathScale;

    ctx.save();

    if (!isHead) {
      // --- 蛇身：圆角矩形 + 鳞片纹理 ----
      const g = Math.round(0xdd - (0xdd - 0x22) * ratio);
      const r = Math.round(0x00 + 0x30 * (1 - ratio));
      const b = Math.round(0x33 + 0x20 * (1 - ratio));
      const bodyColor = `rgb(${r}, ${g}, ${b})`;

      // 主体填充
      ctx.fillStyle = bodyColor;
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      this.roundRect(ctx, x + pad, y + pad, size, size, 4);
      ctx.fill();

      // 鳞片 V 形纹理（每段一个小 V）
      ctx.strokeStyle = `rgba(0, 255, 65, ${0.08 + 0.12 * (1 - ratio)})`;
      ctx.lineWidth = 1;
      const vx = cx;
      const vy = cy - half * 0.2;
      ctx.beginPath();
      ctx.moveTo(vx - half * 0.35, vy + half * 0.25);
      ctx.lineTo(vx, vy - half * 0.1);
      ctx.lineTo(vx + half * 0.35, vy + half * 0.25);
      ctx.stroke();

      // 第二道小鳞片
      ctx.beginPath();
      ctx.moveTo(vx - half * 0.25, vy + half * 0.45);
      ctx.lineTo(vx, vy + half * 0.15);
      ctx.lineTo(vx + half * 0.25, vy + half * 0.45);
      ctx.stroke();

      // 边缘高光（上边缘亮线）
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.03 + 0.04 * (1 - ratio)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + pad + 3, y + pad + 1);
      ctx.lineTo(x + pad + size - 3, y + pad + 1);
      ctx.stroke();
    } else {
      // ============================================================
      //  蛇头 — 更圆润、带眼睛和舌头
      // ============================================================

      // 外发光
      ctx.shadowColor = '#00ff41';
      ctx.shadowBlur = 12;

      // 主圆角矩形（蛇头）
      const headPad = 1;
      const headSize = cellSize - headPad * 2;
      const grad = ctx.createRadialGradient(cx - half * 0.2, cy - half * 0.2, 0, cx, cy, half);
      grad.addColorStop(0, '#66ff88');
      grad.addColorStop(0.6, '#00ff41');
      grad.addColorStop(1, '#009922');
      ctx.fillStyle = grad;
      this.roundRect(ctx, x + headPad, y + headPad, headSize, headSize, 6);
      ctx.fill();

      ctx.shadowBlur = 0;

      // ---- 眼睛 ----
      const dir = this.direction;
      let eyeOffX = 0, eyeOffY = 0;
      let pupilOffX = 0, pupilOffY = 0;
      // 眼睛偏移量（朝向移动方向）
      switch (dir) {
        case Direction.UP:
          eyeOffX = half * 0.5; eyeOffY = -half * 0.45; pupilOffY = -1.5;
          break;
        case Direction.DOWN:
          eyeOffX = half * 0.5; eyeOffY = half * 0.45; pupilOffY = 1.5;
          break;
        case Direction.LEFT:
          eyeOffX = -half * 0.45; eyeOffY = -half * 0.4; pupilOffX = -1.5;
          break;
        case Direction.RIGHT:
          eyeOffX = half * 0.45; eyeOffY = -half * 0.4; pupilOffX = 1.5;
          break;
      }

      const eyeRadius = half * 0.2;
      // 左眼
      this._drawEye(ctx, cx - half * 0.35 + eyeOffX * 0.3, cy + eyeOffY, eyeRadius, pupilOffX, pupilOffY);
      // 右眼
      this._drawEye(ctx, cx + half * 0.35 + eyeOffX * 0.3, cy + eyeOffY, eyeRadius, pupilOffX, pupilOffY);

      // ---- 舌头（分叉，动态伸缩） ----
      const tongueLen = half * (0.4 + Math.abs(Math.sin(this._phase * 2)) * 0.25);
      const tonguePhase = Math.sin(this._phase * 4);
      let tx = cx, ty = cy;
      // 舌头从蛇头前端伸出
      switch (dir) {
        case Direction.UP:    ty = y; tx = cx; break;
        case Direction.DOWN:  ty = y + cellSize; tx = cx; break;
        case Direction.LEFT:  tx = x; ty = cy; break;
        case Direction.RIGHT: tx = x + cellSize; ty = cy; break;
      }
      const tEndX = tx + (dir === Direction.RIGHT ? tongueLen : dir === Direction.LEFT ? -tongueLen : 0);
      const tEndY = ty + (dir === Direction.DOWN ? tongueLen : dir === Direction.UP ? -tongueLen : 0);
      // 分叉偏移
      const forkOff = tongueLen * 0.3;

      ctx.strokeStyle = '#ff4466';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      // 舌根
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tEndX, tEndY);
      ctx.stroke();
      // 左叉
      ctx.beginPath();
      ctx.moveTo(tEndX, tEndY);
      const forkX1 = tEndX + (dir === Direction.RIGHT ? forkOff : dir === Direction.LEFT ? -forkOff : forkOff * (1 - ratio));
      const forkY1 = tEndY + ((dir === Direction.UP || dir === Direction.DOWN) ? -forkOff * (1 + tonguePhase * 0.2) : forkOff);
      ctx.lineTo(forkX1, forkY1);
      ctx.stroke();
      // 右叉
      ctx.beginPath();
      ctx.moveTo(tEndX, tEndY);
      const forkX2 = tEndX + (dir === Direction.RIGHT ? forkOff : dir === Direction.LEFT ? -forkOff : -forkOff * (1 - ratio));
      const forkY2 = tEndY + ((dir === Direction.UP || dir === Direction.DOWN) ? forkOff * (1 + tonguePhase * 0.2) : -forkOff);
      ctx.lineTo(forkX2, forkY2);
      ctx.stroke();
    }

    ctx.restore();
  }

  /** 绘制单只眼睛 */
  private _drawEye(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    radius: number,
    pupilOffX: number, pupilOffY: number,
  ): void {
    // 白色眼球
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#f0f0f0';
    ctx.fill();
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // 黑色瞳孔
    const pupilR = radius * 0.55;
    ctx.beginPath();
    ctx.arc(cx + pupilOffX, cy + pupilOffY, pupilR, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();

    // 瞳孔高光（反光点）
    ctx.beginPath();
    ctx.arc(cx + pupilOffX - pupilR * 0.3, cy + pupilOffY - pupilR * 0.3, pupilR * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
