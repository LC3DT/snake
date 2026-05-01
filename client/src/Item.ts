// ============================================================================
//  🐍 Snake — 道具系统
//  职责：生成、过期、绘制道具
// ============================================================================

import {
  type Point,
  ItemType,
} from './types';
import {
  COLS,
  ROWS,
  CELL_SIZE,
  getItemConfig,
  randomItemType,
} from './constants';
import { Snake } from './Snake';

export class Item {
  position: Point = { x: 0, y: 0 };
  type: ItemType = ItemType.NORMAL;
  /** 生成时间戳（ms） */
  spawnTime = 0;
  /** 道具是否有效 */
  active = false;

  /** 生成一个新道具（位置避开蛇身） */
  spawn(snake: Snake, now: number): void {
    const cfg = getItemConfig(randomItemType());
    this.type = cfg.type;
    this.spawnTime = now;

    // 收集所有被占用的格子
    const occupied = new Set(snake.body.map(s => `${s.x},${s.y}`));

    // 找出空闲格子
    const free: Point[] = [];
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        if (!occupied.has(`${x},${y}`)) {
          free.push({ x, y });
        }
      }
    }

    if (free.length === 0) {
      this.active = false;
      return;
    }
    const chosen = free[Math.floor(Math.random() * free.length)];
    if (!chosen) {
      this.active = false;
      return;
    }
    this.position = chosen;
    this.active = true;
  }

  /** 检查是否过期（金色道具专属） */
  isExpired(now: number): boolean {
    if (!this.active) return true;
    const cfg = getItemConfig(this.type);
    if (cfg.duration <= 0) return false; // 非限时道具永不过期
    return (now - this.spawnTime) > cfg.duration * 1000;
  }

  /** 寿命百分比（用于绘制呼吸动画） */
  getLifeRatio(now: number): number {
    const cfg = getItemConfig(this.type);
    if (cfg.duration <= 0) return 1;
    const elapsed = (now - this.spawnTime) / 1000;
    return Math.max(0, 1 - elapsed / cfg.duration);
  }

  /** 绘制道具 */
  draw(ctx: CanvasRenderingContext2D, time: number): void {
    if (!this.active) return;

    const cfg = getItemConfig(this.type);
    const cx = this.position.x * CELL_SIZE + CELL_SIZE / 2;
    const cy = this.position.y * CELL_SIZE + CELL_SIZE / 2;
    const pulse = Math.sin(time * 0.005) * 0.15 + 0.85;
    const size = (CELL_SIZE * 0.4) * pulse;
    const lifeRatio = this.getLifeRatio(time);

    // 呼吸光晕
    ctx.shadowColor = cfg.glow;
    ctx.shadowBlur = 12 * lifeRatio;

    // 外发光圆
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.fillStyle = cfg.color;
    ctx.globalAlpha = lifeRatio;
    ctx.fill();

    // 内部高光
    ctx.beginPath();
    ctx.arc(cx - size * 0.2, cy - size * 0.2, size * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}
