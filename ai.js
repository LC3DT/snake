/**
 * ============================================================================
 *  🤖 AI 自动驾驶 — A* 寻路 + 生存保底策略
 *
 *  四层决策树：
 *    Layer 1: A* 寻路到食物
 *    Layer 2: 虚拟预演 — 吃掉食物后能否活？
 *    Layer 3: 追尾巴 (Fallback)
 *    Layer 4: 绝境盲走 — 洪水填充选最大区域
 * ============================================================================
 */

class AIPlayer {
    /**
     * @param {Game} game - 游戏实例引用
     */
    constructor(game) {
        this.game = game;
        this.enabled = false;

        // ---- 缓存二维数组（避免每帧重新分配） ----
        // visited[x][y]: 0=未访问, 1=在openList, 2=在closedSet
        this._visited = Array.from({ length: GRID_SIZE }, () => new Uint8Array(GRID_SIZE));
        // gScore[x][y]: 起点到该节点的最短步数
        this._gScore = Array.from({ length: GRID_SIZE }, () => new Int8Array(GRID_SIZE));
        // parent[x][y]: 回溯指针，编码为 0=UP, 1=DOWN, 2=LEFT, 3=RIGHT, -1=起点
        this._parent = Array.from({ length: GRID_SIZE }, () => new Int8Array(GRID_SIZE));
        // 是否障碍物（每帧重建）
        this._obstacle = Array.from({ length: GRID_SIZE }, () => new Uint8Array(GRID_SIZE));

        // 洪水填充的 visited
        this._floodVisited = Array.from({ length: GRID_SIZE }, () => new Uint8Array(GRID_SIZE));
    }

    // ========================================================================
    //  主决策入口 — 每 tick 调用一次
    //  返回 {dx, dy} 方向向量
    // ========================================================================
    decide() {
        const snake = this.game.snake;
        const head = snake.getHead();
        const food = this.game.item.position;

        // ---- 构建障碍物地图 ----
        this._buildObstacleMap(snake);

        // ====================================================================
        //  Layer 1: A* 寻路到食物
        // ====================================================================
        const pathToFood = this._aStar(head, food);

        if (pathToFood) {
            // ================================================================
            //  Layer 2 (核心): 虚拟预演 — "吃掉食物后还能活吗？"
            //
            //  思路：
            //    1. 深拷贝蛇身，沿 pathToFood 模拟移动，最后一步吃食物不 pop
            //    2. 在模拟状态下，把 body[0..n-2] 设为障碍物，body[n-1] 设为目标
            //    3. 跑 A* 检查模拟蛇头 → 模拟蛇尾 是否可达
            //
            //  为什么排除 body[n-1] (尾巴) 作为障碍物？
            //    → 真实蛇移动时尾巴每 tick 会 pop 消失，相当于"让出一个格子"。
            //      如果把全部蛇身都设为障碍，则蛇尾总被自己包围，A* 永远找不到，
            //      AI 会过于保守，永远不敢去吃食物。
            // ================================================================
            if (this._simulateEat(pathToFood, snake)) {
                return pathToFood[0]; // ✅ 安全！执行路径第一步
            }
        }

        // ====================================================================
        //  Layer 3: 追尾巴 (Fallback)
        //  场景：找不到去食物的路，或预演发现不安全
        //  策略：放弃食物，用 A* 追逐蛇尾拖延时间
        // ====================================================================
        const tail = snake.body[snake.body.length - 1];
        const pathToTail = this._aStar(head, tail);

        if (pathToTail) {
            return pathToTail[0];
        }

        // ====================================================================
        //  Layer 4 (绝境): 洪水填充选最大连通区域
        //  场景：连尾巴都追不上，蛇已被包围
        //  策略：对每个可行方向做 BFS 计算连通区大小，选最大的苟延残喘
        // ====================================================================
        return this._findSafestDir(head);
    }

    // ========================================================================
    //  构建障碍物地图
    //  将蛇身所有节标记为不可通行
    //  注意：边界在 _aStar 内部通过坐标范围检查实现，不在此标记
    // ========================================================================
    _buildObstacleMap(snake) {
        // 清空
        for (let x = 0; x < GRID_SIZE; x++) {
            this._obstacle[x].fill(0);
        }
        // 标记蛇身
        for (const seg of snake.body) {
            this._obstacle[seg.x][seg.y] = 1;
        }
    }

    // ========================================================================
    //  A* 寻路算法
    //
    //  输入：
    //    start — {x, y} 起点（蛇头）
    //    goal  — {x, y} 终点（食物 或 蛇尾）
    //
    //  输出：
    //    方向数组 [{dx,dy}, ...] — 从起点到终点的每一步方向
    //    或 null（无路可达）
    //
    //  启发函数 H: 曼哈顿距离 |x1-x2| + |y1-y2|
    //
    //  数据结构：
    //    visited[x][y]: Uint8Array — 0=未访问 1=open 2=closed
    //    gScore[x][y]:  Int8Array  — G 值
    //    parent[x][y]:  Int8Array  — 回溯指针编码
    //    openList:      Array      — 待处理节点（线性扫描找最小 f）
    //
    //  为什么不用二叉堆？
    //    → 网格仅 400 节点，线性扫描比堆更简单且足够快 (< 0.1ms)
    // ========================================================================
    _aStar(start, goal) {
        // ---- 清空 visited 和 gScore ----
        for (let x = 0; x < GRID_SIZE; x++) {
            this._visited[x].fill(0);
            this._gScore[x].fill(127); // 127 = "无穷大" (Int8Array 范围 -128~127)
        }

        // ---- 初始化起点 ----
        const h = Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y);
        const openList = [{ x: start.x, y: start.y, g: 0, h, f: h }];
        this._visited[start.x][start.y] = 1; // 在 open 中
        this._gScore[start.x][start.y] = 0;
        this._parent[start.x][start.y] = -1; // 起点编码为 -1

        // 四个方向向量（顺序不影响结果）
        const dirs = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
        // parent 编码: 0=UP, 1=DOWN, 2=LEFT, 3=RIGHT
        const dirCodes = [0, 1, 2, 3];

        while (openList.length > 0) {
            // ---- 线性扫描找 f 值最小的节点 ----
            let bestIdx = 0;
            let bestF = openList[0].f;
            for (let i = 1; i < openList.length; i++) {
                if (openList[i].f < bestF) {
                    bestF = openList[i].f;
                    bestIdx = i;
                }
            }

            const current = openList[bestIdx];
            const cx = current.x;
            const cy = current.y;

            // ---- 到达目标？回溯路径 ----
            if (cx === goal.x && cy === goal.y) {
                return this._reconstructPath(cx, cy);
            }

            // ---- 从 openList 移除，加入 closedSet ----
            openList.splice(bestIdx, 1);
            this._visited[cx][cy] = 2; // closed

            // ---- 遍历四个邻居 ----
            for (let d = 0; d < 4; d++) {
                const dir = dirs[d];
                const nx = cx + dir.dx;
                const ny = cy + dir.dy;

                // 边界检查
                if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;

                // 障碍物检查
                if (this._obstacle[nx][ny] === 1) continue;

                // 是否已在 closed 中
                if (this._visited[nx][ny] === 2) continue;

                // 计算 G 值
                const tentativeG = current.g + 1;

                // 如果不在 open 中，或找到更短路径
                if (this._visited[nx][ny] !== 1 || tentativeG < this._gScore[nx][ny]) {
                    this._gScore[nx][ny] = tentativeG;
                    const nh = Math.abs(nx - goal.x) + Math.abs(ny - goal.y);
                    const nf = tentativeG + nh;
                    this._parent[nx][ny] = dirCodes[d];

                    if (this._visited[nx][ny] !== 1) {
                        // 不在 open 中 → 加入
                        openList.push({ x: nx, y: ny, g: tentativeG, h: nh, f: nf });
                        this._visited[nx][ny] = 1;
                    }
                    // 如果在 open 中但路径更短 → 更新（无需修改数组，因为下次线性扫描会重新计算 f）
                    // 但我们需要找到并更新对应节点的 f 值
                    // 由于线性扫描每次都重新算 f，我们只需要确保 gScore 正确即可
                }
            }
        }

        return null; // openList 为空 → 无路可达
    }

    // ========================================================================
    //  回溯路径
    //  从目标节点沿着 parent 指针一路回溯到起点，
    //  返回从起点到终点的方向数组 [{dx,dy}, ...]
    //
    //  parent 编码: 0=UP, 1=DOWN, 2=LEFT, 3=RIGHT, -1=起点
    // ========================================================================
    _reconstructPath(tx, ty) {
        const dirs = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
        const path = [];

        let x = tx;
        let y = ty;

        while (true) {
            const code = this._parent[x][y];
            if (code === -1) break; // 到达起点

            const dir = dirs[code];
            path.push(dir);

            // 反向回溯：减去当前方向得到上一个节点
            x -= dir.dx;
            y -= dir.dy;
        }

        // path 现在是终点→起点的方向，需要反转得到起点→终点的顺序
        return path.reverse();
    }

    // ========================================================================
    //  虚拟预演 (Virtual Simulation) ⭐ 核心生存策略
    //
    //  在内存中"模拟"蛇沿 A* 路径吃掉食物的过程，然后评估存活概率。
    //
    //  步骤：
    //    1. 深拷贝蛇身数组（仅复制坐标值，避免引用）
    //    2. 沿 path 模拟：前 n-1 步正常移动（unshift 头, pop 尾）
    //       最后一步（吃食物）只 unshift 头，不 pop 尾（增长）
    //    3. 将模拟体的 body[0..n-2] 设为障碍物
    //    4. A* 检查模拟蛇头 → 模拟蛇尾 是否可达
    //
    //  为什么需要深拷贝？因为模拟不能影响真实的蛇身。
    //  深拷贝 400 个节点 ~0.01ms，远低于 150ms tick 间隔，性能无影响。
    // ========================================================================
    _simulateEat(path, snake) {
        // ---- 1. 深拷贝蛇身 ----
        const simBody = snake.body.map(s => ({ x: s.x, y: s.y }));
        const wrapMode = snake.wrapMode;

        // ---- 2. 沿路径模拟移动 ----
        for (let i = 0; i < path.length; i++) {
            const dir = path[i];
            const head = simBody[0];
            let newX = head.x + dir.dx;
            let newY = head.y + dir.dy;

            // 穿墙处理
            if (wrapMode) {
                if (newX < 0) newX = GRID_SIZE - 1;
                if (newX >= GRID_SIZE) newX = 0;
                if (newY < 0) newY = GRID_SIZE - 1;
                if (newY >= GRID_SIZE) newY = 0;
            }

            simBody.unshift({ x: newX, y: newY });

            const isLastStep = (i === path.length - 1);
            if (!isLastStep) {
                // 没吃到食物，正常 pop 尾巴
                simBody.pop();
            }
            // 最后一步不 pop → 蛇身长度 +1（吃到食物）
        }

        // ---- 3. 构建模拟状态的障碍物地图 ----
        // 蛇身 [0..n-2] 是障碍物，蛇尾 [n-1] 是目标
        // 清除障碍物地图（复用 this._obstacle 需小心）
        // 这里我们用一个局部 Set 来存储障碍物
        // 但由于 A* 内部读的是 this._obstacle，我们需要临时修改它
        // 但 _aStar 内部还会修改 visited/gScore/parent，必须保存/恢复
        // 更干净的做法：直接用局部变量构建一个全新的障碍物集合并传给 _aStar

        // 为了不影响 this._obstacle (被外部 _buildObstacleMap 填充的真实障碍物)，
        // 我们临时修改，用完恢复
        const savedObstacle = this._obstacle.map(row => new Uint8Array(row));

        // 清空并设置模拟障碍物
        for (let x = 0; x < GRID_SIZE; x++) {
            this._obstacle[x].fill(0);
        }
        // body[0..n-2] 是障碍物
        for (let i = 0; i < simBody.length - 1; i++) {
            this._obstacle[simBody[i].x][simBody[i].y] = 1;
        }

        // ---- 4. A* 检查模拟蛇头 → 模拟蛇尾 ----
        const simHead = simBody[0];
        const simTail = simBody[simBody.length - 1];

        const pathToTail = this._aStar(simHead, simTail);

        // ---- 5. 恢复原始障碍物地图 ----
        for (let x = 0; x < GRID_SIZE; x++) {
            this._obstacle[x] = savedObstacle[x];
        }

        return pathToTail !== null;
    }

    // ========================================================================
    //  绝境盲走 — 洪水填充 (Flood Fill)
    //
    //  当所有策略都失败时，对四个可行方向分别做 BFS，
    //  计算每个方向连通区域的大小，选择最大的方向移动。
    //
    //  这相当于"试探哪种死法最慢"，运气好时蛇尾移动可能打开生路。
    // ========================================================================
    _findSafestDir(head) {
        const dirs = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
        let bestDir = null;
        let bestArea = -1;

        for (const dir of dirs) {
            const nx = head.x + dir.dx;
            const ny = head.y + dir.dy;

            // 边界检查
            if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
            // 障碍物检查
            if (this._obstacle[nx][ny] === 1) continue;

            const area = this._floodFill(nx, ny);
            if (area > bestArea) {
                bestArea = area;
                bestDir = dir;
            }
        }

        // 理论上不会走到这里（如果最佳方向也没路，说明被完全包围）
        // 但兜底返回当前方向
        return bestDir || this.game.snake.direction;
    }

    /**
     * BFS 洪水填充，计算从 (sx, sy) 出发能到达的连通格子数
     */
    _floodFill(sx, sy) {
        // 清空 floodVisited
        for (let x = 0; x < GRID_SIZE; x++) {
            this._floodVisited[x].fill(0);
        }

        const dirs = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
        const queue = [{ x: sx, y: sy }];
        this._floodVisited[sx][sy] = 1;
        let count = 0;

        while (queue.length > 0) {
            const cur = queue.shift();
            count++;

            for (const dir of dirs) {
                const nx = cur.x + dir.dx;
                const ny = cur.y + dir.dy;

                if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
                if (this._floodVisited[nx][ny] === 1) continue;
                if (this._obstacle[nx][ny] === 1) continue;

                this._floodVisited[nx][ny] = 1;
                queue.push({ x: nx, y: ny });
            }
        }

        return count;
    }
}
