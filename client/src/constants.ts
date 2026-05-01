// ============================================================================
//  🐍 Snake — 游戏常量
// ============================================================================

import { Direction, ItemType, type GameConfig, type ItemConfig } from './types';

// ---- 网格 & 画布 ----
export const COLS = 20;
export const ROWS = 20;
export const CELL_SIZE = 28;
export const CANVAS_WIDTH  = COLS * CELL_SIZE;   // 560
export const CANVAS_HEIGHT = ROWS * CELL_SIZE;   // 560

// ---- 游戏配置 ----
export const GAME_CONFIG: GameConfig = {
  gridWidth:       COLS,
  gridHeight:      ROWS,
  cellSize:        CELL_SIZE,
  tickInterval:    150,
  maxTickInterval: 150,
  minTickInterval: 60,
  speedStep:       8,
  itemsPerFood:    1,
  inputQueueSize:  3,
};

// ---- 初始蛇 ----
export const INITIAL_SNAKE_LENGTH = 3;
export const INITIAL_SNAKE_DIR = Direction.RIGHT;
export const SNAKE_START_X = 3;
export const SNAKE_START_Y = 10;

// ---- 道具配置 ----
export const ITEM_CONFIGS: readonly ItemConfig[] = Object.freeze([
  {
    type:     ItemType.NORMAL,
    color:    '#ff0044',
    glow:     'rgba(255,0,68,0.4)',
    points:   10,
    duration: 0,
    weight:   45,
    label:    '🍎',
  },
  {
    type:     ItemType.GOLDEN,
    color:    '#ffd700',
    glow:     'rgba(255,215,0,0.5)',
    points:   50,
    duration: 5,     // 5 秒后消失
    weight:   12,
    label:    '⭐',
  },
  {
    type:     ItemType.BLUE,
    color:    '#00bfff',
    glow:     'rgba(0,191,255,0.4)',
    points:   0,
    duration: 10,    // 减速 10 秒
    weight:   12,
    label:    '💧',
  },
  {
    type:     ItemType.PURPLE,
    color:    '#bf00ff',
    glow:     'rgba(191,0,255,0.4)',
    points:   0,
    duration: 5,     // 反转 5 秒
    weight:   10,
    label:    '☠️',
  },
  {
    type:     ItemType.SHIELD,
    color:    '#00ff88',
    glow:     'rgba(0,255,136,0.4)',
    points:   0,
    duration: 8,     // 护盾 8 秒
    weight:   12,
    label:    '🛡️',
  },
  {
    type:     ItemType.GHOST,
    color:    '#aa88ff',
    glow:     'rgba(170,136,255,0.4)',
    points:   0,
    duration: 8,     // 幽灵 8 秒
    weight:   9,
    label:    '👻',
  },
]);

/** 根据权重随机选取道具类型 */
export function randomItemType(): ItemType {
  const total = ITEM_CONFIGS.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const cfg of ITEM_CONFIGS) {
    r -= cfg.weight;
    if (r <= 0) return cfg.type;
  }
  return ItemType.NORMAL;
}

/** 根据类型获取配置 */
export function getItemConfig(type: ItemType): ItemConfig {
  const c = ITEM_CONFIGS.find(i => i.type === type);
  if (!c) throw new Error(`Unknown ItemType: ${type}`);
  return c;
}

// ---- 颜色 ----
export const COLORS = {
  bgGradientTop:    '#0a0a0a',
  bgGradientBottom: '#1a0a0a',
  gridLine:         'rgba(255,255,255,0.04)',
  snakeHead:        '#00ff41',
  snakeBody:        '#00cc33',
  food:             '#ff0044',
  textPrimary:      '#00ff41',
  textSecondary:    '#888',
} as const;

// ---- 触摸 ----
export const SWIPE_THRESHOLD = 20;
