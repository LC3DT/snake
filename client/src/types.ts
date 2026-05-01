// ============================================================================
//  🐍 Snake — 类型定义
//  所有枚举、接口、类型别名集中在此文件
// ============================================================================

// ---- 几何 / 坐标 ----
export interface Point {
  x: number;
  y: number;
}

// ---- 方向 ----
export enum Direction {
  UP    = 'UP',
  DOWN  = 'DOWN',
  LEFT  = 'LEFT',
  RIGHT = 'RIGHT',
}

/** 方向 → 坐标偏移映射 */
export const DIRECTION_DELTA: Readonly<Record<Direction, Point>> = {
  [Direction.UP]:    { x:  0, y: -1 },
  [Direction.DOWN]:  { x:  0, y:  1 },
  [Direction.LEFT]:  { x: -1, y:  0 },
  [Direction.RIGHT]: { x:  1, y:  0 },
};

// ---- 有限状态机 ----
export enum GameState {
  MENU      = 'MENU',
  PLAYING   = 'PLAYING',
  PAUSED    = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
}

// ---- 道具类型 ----
export enum ItemType {
  NORMAL = 'NORMAL',
  GOLDEN = 'GOLDEN',
  BLUE   = 'BLUE',
  PURPLE = 'PURPLE',
}

export interface ItemConfig {
  type:     ItemType;
  color:    string;
  glow:     string;
  points:   number;
  /** 0 = 立即生效，>0 = 持续效果（秒） */
  duration: number;
  weight:   number;
  label:    string;
}

// ---- 蛇 ----
/** 蛇身节点 = Point，但可扩展 */
export type SnakeSegment = Point;

// ---- 活跃效果 ----
export interface ActiveEffect {
  type:      ItemType;
  remaining: number; // 剩余秒数
}

// ---- 粒子 ----
export interface ParticleData {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

// ---- 网络 / API ----
export interface LeaderboardEntry {
  rank:       number;
  id:         number;
  playerName: string;
  score:      number;
  createdAt:  string;
}

export interface ScoreSubmitResponse {
  id:         number;
  playerName: string;
  score:      number;
}

export interface ApiError {
  error: string;
}

// ---- AI 寻路 ----
export interface PathNode {
  x:      number;
  y:      number;
  g:      number;
  f:      number;
  parent: PathNode | null;
}

// ---- 音频 ----
export interface ToneConfig {
  frequencies: number[];
  duration:    number;
  volume?:     number;
  type?:       OscillatorType;
}

// ---- 游戏配置 ----
export interface GameConfig {
  gridWidth:      number;
  gridHeight:     number;
  cellSize:       number;
  tickInterval:   number;
  maxTickInterval: number;
  minTickInterval: number;
  speedStep:      number;
  itemsPerFood:   number;
  inputQueueSize: number;
}
