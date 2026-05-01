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

  /** 绘制 */
  draw(ctx: CanvasRenderingContext2D, cellSize: number): void {
    for (let i = 0; i < this.body.length; i++) {
      const seg = this.body[i];
      if (!seg) continue;
      const x = seg.x * cellSize;
      const y = seg.y * cellSize;
      const pad = 1;
      const radius = i === 0 ? 4 : 3;

      if (i === 0) {
        // 蛇头 — 亮绿色
        ctx.fillStyle = '#00ff41';
        ctx.shadowColor = '#00ff41';
        ctx.shadowBlur = 8;
      } else {
        // 蛇身 — 渐变色
        const ratio = i / this.body.length;
        const g = Math.round(0xcc + (0x33 - 0xcc) * ratio);
        ctx.fillStyle = `rgb(0, ${g}, ${0x33 + Math.round(0x20 * (1 - ratio))})`;
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }

      this.roundRect(ctx, x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2, radius);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
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
