// ============================================================================
//  🐍 Snake — AI 控制器
//  职责：A* 寻路 + 虚拟预演 + 追尾保底 + 洪泛逃生
//  四层决策树，零外部依赖
// ============================================================================

import {
  type Point,
  type PathNode,
  Direction,
  DIRECTION_DELTA,
} from './types';
import { COLS, ROWS } from './constants';
import { Snake } from './Snake';

/** 二维 Uint8Array 包装，O(1) 访问 */
class GridCache {
  private data: Uint8Array;
  readonly rows: number;
  readonly cols: number;

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.data = new Uint8Array(rows * cols);
  }

  reset(): void {
    this.data.fill(0);
  }

  set(y: number, x: number, v: number): void {
    this.data[y * this.cols + x] = v;
  }

  get(y: number, x: number): number {
    return this.data[y * this.cols + x] ?? 0;
  }
}

export class AIController {
  private enabled = false;
  private readonly obstacles = new GridCache(ROWS, COLS);
  private readonly visited  = new GridCache(ROWS, COLS);

  /** AI 是否启用 */
  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(val: boolean): void {
    this.enabled = val;
  }

  /** AI 开关切换 */
  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /** 重置 AI 内部状态（游戏重新开始时调用） */
  reset(): void {
    // AI 开关状态（enabled）不由 reset 控制
  }

  /** 四层决策：返回 AI 建议的下一步方向 */
  decide(head: Point, snake: Snake, food: Point): Direction {
    if (!this.enabled) return snake.direction;

    // Layer 1: A* 寻路 → 食物
    const path = this._aStar(head, food, snake);
    if (path && path.length > 1) {
      // Layer 2: 虚拟预演
      if (this._simulateEat(path, snake)) {
        return this._dirFromPath(head, path);
      }
    }

    // Layer 3: 追尾
    const tail = snake.tail;
    const tailPath = this._aStar(head, tail, snake);
    if (tailPath && tailPath.length > 1) {
      return this._dirFromPath(head, tailPath);
    }

    // Layer 4: 洪泛逃生
    return this._findSafestDir(head, snake);
  }

  /** 从路径中提取第一步方向 */
  private _dirFromPath(from: Point, path: Point[]): Direction {
    const next = path[1];
    if (!next) return Direction.UP;
    const dx = next.x - from.x;
    const dy = next.y - from.y;
    if (dx === 1)  return Direction.RIGHT;
    if (dx === -1) return Direction.LEFT;
    if (dy === 1)  return Direction.DOWN;
    return Direction.UP;
  }

  // ========================================================================
  //  Layer 1 & 3 — A* 寻路
  // ========================================================================

  private _aStar(start: Point, goal: Point, snake: Snake): Point[] | null {
    this.obstacles.reset();

    // 标记蛇身为障碍物（排除蛇尾，因为每 tick 尾部会移动）
    for (let i = 0; i < snake.body.length - 1; i++) {
      const seg = snake.body[i];
      if (seg) {
        this.obstacles.set(seg.y, seg.x, 1);
      }
    }

    // 开放列表：使用数组 + 线性扫描（400 节点网格无需堆优化）
    const open: PathNode[] = [];
    const startNode: PathNode = {
      x: start.x, y: start.y, g: 0,
      f: this._heuristic(start, goal),
      parent: null,
    };
    open.push(startNode);
    this.visited.reset();
    this.visited.set(start.y, start.x, 1);

    const dirs = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT];

    while (open.length > 0) {
      // 找最小 f
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        const a = open[i];
        const b = open[bestIdx];
        if (a && b && a.f < b.f) bestIdx = i;
      }
      const current = open[bestIdx];
      if (!current) break;
      open.splice(bestIdx, 1);

      // 到达目标
      if (current.x === goal.x && current.y === goal.y) {
        return this._reconstructPath(current);
      }

      for (const dir of dirs) {
        const d = DIRECTION_DELTA[dir];
        const nx = current.x + d.x;
        const ny = current.y + d.y;

        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        if (this.obstacles.get(ny, nx) !== 0) continue;
        if (this.visited.get(ny, nx) !== 0) continue;

        this.visited.set(ny, nx, 1);
        const g = current.g + 1;
        const h = this._heuristic({ x: nx, y: ny }, goal);
        open.push({ x: nx, y: ny, g, f: g + h, parent: current });
      }
    }

    return null; // 无路可达
  }

  private _heuristic(a: Point, b: Point): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  private _reconstructPath(node: PathNode): Point[] {
    const path: Point[] = [];
    let current: PathNode | null = node;
    while (current) {
      path.unshift({ x: current.x, y: current.y });
      current = current.parent;
    }
    return path;
  }

  // ========================================================================
  //  Layer 2 — 虚拟预演
  //  模拟沿路径移动并吃到食物后，检查能否存活
  // ========================================================================

  private _simulateEat(path: Point[], snake: Snake): boolean {
    // 深拷贝蛇身
    const simBody: Point[] = snake.body.map(s => ({ ...s }));
    const simSnake = new Snake(0, 0, 1, Direction.RIGHT);
    simSnake.body = simBody;

    // 沿路径模拟（排除第一步 = 当前位置）
    for (let i = 1; i < path.length; i++) {
      const p = path[i];
      if (!p) break;

      // 移动
      const tail = simSnake.body.pop()!;
      simSnake.body.unshift({ ...p });

      // 到达食物
      if (p.x === path[path.length - 1]?.x && p.y === path[path.length - 1]?.y) {
        simSnake.body.push(tail); // 增长（不 pop）
      }

      // 碰撞检测（排除蛇尾）
      const head = simSnake.body[0]!;
      for (let j = 1; j < simSnake.body.length - 1; j++) {
        const seg = simSnake.body[j];
        if (seg && seg.x === head.x && seg.y === head.y) return false;
      }
    }

    // 模拟吃掉后，检查蛇头到蛇尾是否可达
    const simHead = simSnake.body[0]!;
    const simTail = simSnake.body[simSnake.body.length - 1]!;
    const escapePath = this._aStar(simHead, simTail, simSnake);
    return escapePath !== null;
  }

  // ========================================================================
  //  Layer 4 — 洪泛逃生
  //  选择连通格子最多的方向
  // ========================================================================

  private _findSafestDir(head: Point, snake: Snake): Direction {
    const dirs = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT];
    let bestDir = Direction.UP;
    let bestCount = -1;

    for (const dir of dirs) {
      const d = DIRECTION_DELTA[dir];
      const nx = head.x + d.x;
      const ny = head.y + d.y;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      if (snake.occupies(nx, ny)) continue;

      const count = this._floodFill(nx, ny, snake);
      if (count > bestCount) {
        bestCount = count;
        bestDir = dir;
      }
    }

    return bestDir;
  }

  private _floodFill(sx: number, sy: number, snake: Snake): number {
    this.visited.reset();
    let count = 0;
    const stack: Point[] = [{ x: sx, y: sy }];
    this.visited.set(sy, sx, 1);

    const dirs = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT];

    while (stack.length > 0) {
      const p = stack.pop();
      if (!p) continue;
      count++;

      for (const dir of dirs) {
        const d = DIRECTION_DELTA[dir];
        const nx = p.x + d.x;
        const ny = p.y + d.y;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        if (this.visited.get(ny, nx) !== 0) continue;
        if (snake.occupies(nx, ny)) continue;
        this.visited.set(ny, nx, 1);
        stack.push({ x: nx, y: ny });
      }
    }

    return count;
  }
}
