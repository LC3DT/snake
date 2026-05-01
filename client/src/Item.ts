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

  /** 绘制道具 — 3D 拟真球体 */
  draw(ctx: CanvasRenderingContext2D, time: number): void {
    if (!this.active) return;

    const cfg = getItemConfig(this.type);
    const cx = this.position.x * CELL_SIZE + CELL_SIZE / 2;
    const cy = this.position.y * CELL_SIZE + CELL_SIZE / 2;
    const pulse = Math.sin(time * 0.005) * 0.12 + 0.88;
    const baseSize = CELL_SIZE * 0.4;
    const size = baseSize * pulse;
    const lifeRatio = this.getLifeRatio(time);

    ctx.save();
    ctx.globalAlpha = lifeRatio;

    // ---- 投影（地面阴影） ----
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.9, size * 0.7, size * 0.15, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();

    // ---- 3D 径向渐变主体 ----
    const grad = ctx.createRadialGradient(
      cx - size * 0.3, cy - size * 0.35, size * 0.1,  // 高光点
      cx, cy, size,                                        // 球体边缘
    );
    grad.addColorStop(0, this._lightenColor(cfg.color, 60));
    grad.addColorStop(0.4, cfg.color);
    grad.addColorStop(0.85, this._darkenColor(cfg.color, 40));
    grad.addColorStop(1, this._darkenColor(cfg.color, 70));

    ctx.shadowColor = cfg.glow;
    ctx.shadowBlur = 14 * lifeRatio;

    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.shadowBlur = 0;

    // ---- 镜面高光（顶部反光点） ----
    ctx.beginPath();
    ctx.ellipse(
      cx - size * 0.28, cy - size * 0.3,
      size * 0.22, size * 0.14,
      -0.5, 0, Math.PI * 2,
    );
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();

    // 第二层小高光
    ctx.beginPath();
    ctx.ellipse(
      cx - size * 0.35, cy - size * 0.38,
      size * 0.1, size * 0.06,
      -0.5, 0, Math.PI * 2,
    );
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();

    // ---- 每种球独特装饰 ----
    this._drawItemDecoration(ctx, cx, cy, size, time);

    ctx.restore();
  }

  /** 每种道具的独特装饰 */
  private _drawItemDecoration(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    size: number, time: number,
  ): void {
    const rot = time * 0.002;
    ctx.save();
    ctx.globalAlpha = 0.5;

    switch (this.type) {
      case ItemType.NORMAL:
        // 红色苹果：内部小圈 + 旋转光晕
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.45, 0, Math.PI * 2);
        ctx.stroke();
        break;

      case ItemType.GOLDEN:
        // 星星：闪烁十字光晕
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.5, cy);
        ctx.lineTo(cx + size * 0.5, cy);
        ctx.moveTo(cx, cy - size * 0.5);
        ctx.lineTo(cx, cy + size * 0.5);
        ctx.stroke();
        // 旋转光环
        ctx.strokeStyle = 'rgba(255,215,0,0.25)';
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.65, rot, rot + Math.PI * 1.5);
        ctx.stroke();
        ctx.setLineDash([]);
        break;

      case ItemType.BLUE:
        // 水滴：内部波浪线
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          const wy = cy - size * 0.25 + i * size * 0.25;
          ctx.beginPath();
          for (let t = -0.5; t <= 0.5; t += 0.05) {
            const wx = cx + t * size * 0.8;
            const wvy = wy + Math.sin((t + rot * 0.5) * 8) * size * 0.06;
            t === -0.5 ? ctx.moveTo(wx, wvy) : ctx.lineTo(wx, wvy);
          }
          ctx.stroke();
        }
        break;

      case ItemType.PURPLE:
        // 反转：螺旋线
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 3; a += 0.1) {
          const r = size * 0.1 + (size * 0.35) * (a / (Math.PI * 3));
          const sx = cx + Math.cos(a + rot) * r;
          const sy = cy + Math.sin(a + rot) * r;
          a === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        break;

      case ItemType.SHIELD:
        // 护盾：六边形轮廓 + 闪烁光点
        ctx.strokeStyle = 'rgba(0,255,136,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6 + rot;
          const sx = cx + Math.cos(angle) * size * 0.55;
          const sy = cy + Math.sin(angle) * size * 0.55;
          i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.stroke();

        // 中心光点
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,255,136,0.3)';
        ctx.fill();
        break;

      case ItemType.GHOST:
        // 幽灵：环状光晕 + 闪烁
        ctx.strokeStyle = 'rgba(170,136,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        // 内部雾状点
        for (let i = 0; i < 5; i++) {
          const angle = (Math.PI * 2 / 5) * i + rot;
          const px = cx + Math.cos(angle) * size * 0.35;
          const py = cy + Math.sin(angle) * size * 0.35;
          ctx.beginPath();
          ctx.arc(px, py, size * 0.08, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(200,180,255,0.2)';
          ctx.fill();
        }
        break;
    }

    ctx.restore();
  }

  /** 颜色变亮 */
  private _lightenColor(hex: string, amount: number): string {
    const c = this._hexToRgb(hex);
    const r = Math.min(255, c.r + amount);
    const g = Math.min(255, c.g + amount);
    const b = Math.min(255, c.b + amount);
    return `rgb(${r},${g},${b})`;
  }

  /** 颜色变暗 */
  private _darkenColor(hex: string, amount: number): string {
    const c = this._hexToRgb(hex);
    const r = Math.max(0, c.r - amount);
    const g = Math.max(0, c.g - amount);
    const b = Math.max(0, c.b - amount);
    return `rgb(${r},${g},${b})`;
  }

  /** 十六进制 → RGB */
  private _hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  }
}
