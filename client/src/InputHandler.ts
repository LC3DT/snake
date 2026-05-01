// ============================================================================
//  🐍 Snake — 输入处理器
//  职责：键盘事件 + 触控滑动 + 指令队列
// ============================================================================

import { Direction } from './types';
import { SWIPE_THRESHOLD } from './constants';

export type KeyAction =
  | { type: 'direction'; dir: Direction }
  | { type: 'start' }
  | { type: 'togglePause' }
  | { type: 'toggleAI' };

/** 按键 → 动作映射 */
const KEY_MAP: Record<string, Direction | 'start' | 'pause' | 'ai'> = {
  ArrowUp:    Direction.UP,
  ArrowDown:  Direction.DOWN,
  ArrowLeft:  Direction.LEFT,
  ArrowRight: Direction.RIGHT,
  w:          Direction.UP,
  W:          Direction.UP,
  s:          Direction.DOWN,
  S:          Direction.DOWN,
  a:          Direction.LEFT,
  A:          Direction.LEFT,
  d:          Direction.RIGHT,
  D:          Direction.RIGHT,
  ' ':        'start',
  p:          'pause',
  P:          'pause',
  Escape:     'pause',
  f:          'ai',
  F:          'ai',
};

export class InputHandler {
  private queue: Direction[] = [];
  private readonly maxQueue: number;
  private readonly onAction: (action: KeyAction) => void;

  /** 触控状态 */
  private touchStartX = 0;
  private touchStartY = 0;

  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundTouchStart: (e: TouchEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;

  constructor(maxQueue: number, onAction: (action: KeyAction) => void) {
    this.maxQueue = maxQueue;
    this.onAction = onAction;

    this.boundKeyDown = this._handleKeyDown.bind(this);
    this.boundTouchStart = this._handleTouchStart.bind(this);
    this.boundTouchEnd = this._handleTouchEnd.bind(this);

    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('touchstart', this.boundTouchStart, { passive: true });
    document.addEventListener('touchend', this.boundTouchEnd, { passive: true });
  }

  /** 从队列中消费一个方向 */
  consumeDirection(): Direction | null {
    if (this.queue.length === 0) return null;
    return this.queue.shift() ?? null;
  }

  /** 清空队列 */
  clearQueue(): void {
    this.queue = [];
  }

  /** 销毁（移除事件监听） */
  destroy(): void {
    document.removeEventListener('keydown', this.boundKeyDown);
    document.removeEventListener('touchstart', this.boundTouchStart);
    document.removeEventListener('touchend', this.boundTouchEnd);
  }

  private _handleKeyDown(e: KeyboardEvent): void {
    // 如果焦点在输入框中，不拦截任何按键
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    const activeEl = document.activeElement as HTMLElement | null;
    if (
      activeTag === 'input' ||
      activeTag === 'textarea' ||
      activeTag === 'select' ||
      activeEl?.isContentEditable
    ) {
      return;
    }

    const mapped = KEY_MAP[e.key];
    if (!mapped) return;
    e.preventDefault();

    if (mapped === 'start') {
      this.onAction({ type: 'start' });
    } else if (mapped === 'pause') {
      this.onAction({ type: 'togglePause' });
    } else if (mapped === 'ai') {
      this.onAction({ type: 'toggleAI' });
    } else {
      // 方向键 — 入队列
      if (this.queue.length < this.maxQueue) {
        this.queue.push(mapped);
      }
    }
  }

  private _handleTouchStart(e: TouchEvent): void {
    const t = e.touches[0];
    if (!t) return;
    this.touchStartX = t.clientX;
    this.touchStartY = t.clientY;
  }

  private _handleTouchEnd(e: TouchEvent): void {
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - this.touchStartX;
    const dy = t.clientY - this.touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) return;

    let dir: Direction;
    if (absDx > absDy) {
      dir = dx > 0 ? Direction.RIGHT : Direction.LEFT;
    } else {
      dir = dy > 0 ? Direction.DOWN : Direction.UP;
    }
    if (this.queue.length < this.maxQueue) {
      this.queue.push(dir);
    }
  }
}
