# AI 自动驾驶 (Auto-Pilot) — 架构设计与生存保底策略方案

---

## 一、总体架构

### 新增模块：`ai.js`

```
game.js (已有)
  └─ 新增: AIPlayer 类
       ├─ decide()          — 主决策入口（每 tick 调用）
       ├─ _aStar()          — A* 寻路算法
       ├─ _simulateEat()    — 虚拟预演（核心难点）
       ├─ _findSafestDir()  — 绝境盲走（洪水填充）
       └─ _buildObstacleMap()— 构建障碍物网格
```

### 集成方式

```
Game._update():
  if (this.ai.enabled)
    dir = ai.decide()          ← AI 接管方向
  else
    dir = inputHandler.consumeDirection()  ← 玩家控制
  snake.setDirection(dir)
```

### F 键切换

- `InputHandler` 增加 F 键映射 → 调用 `onToggleAI` 回调
- `Game` 中切换 `this.ai.enabled` 并更新 UI

---

## 二、A* 寻路算法

### 核心参数

| 参数 | 值 |
|------|-----|
| 网格 | 20×20，每个格子是节点 |
| 移动 | 四方向 (UP/DOWN/LEFT/RIGHT) |
| 启发函数 H | 曼哈顿距离 `|x1-x2| + |y1-y2|` |
| 代价 G | 起点到当前节点的步数 |
| 总代价 F | `F = G + H` |
| 障碍物 | 蛇身所有节 + 边界墙壁 |

### 数据结构优化

由于网格固定为 20×20（仅 400 节点），不使用复杂的二叉堆，而是采用**线性扫描最小值**的方式：

```javascript
// 使用一个 20×20 的二维数组作为节点的"状态记录"
// 0 = 未访问, 1 = 在 openList, 2 = 在 closedSet
const visited = Array.from({length: GRID_SIZE}, () => new Uint8Array(GRID_SIZE));
// G 值和 F 值也存为二维数组
const gScore = Array.from({length: GRID_SIZE}, () => new Int8Array(GRID_SIZE));
```

**为什么不用 Set/Map？** 二维数组直接索引访问 O(1)，无哈希开销，对 400 节点网格远快于 Set。

### A* 伪代码

```
function _aStar(start, goal, obstacles):
  初始化 visited[][] = 0, gScore[][] = INF
  
  openList = [{x:start.x, y:start.y, g:0, h:曼哈顿距离, f:g+h}]
  visited[start.x][start.y] = 1  // 在 open 中
  
  while openList 不为空:
    current = openList 中 f 值最小的节点
    if current 到达 goal:
      回溯 parent 指针 → 返回路径（方向数组）
    
    visited[current] = 2  // 移入 closedSet
    从 openList 移除 current
    
    for 四个邻居 neighbor:
      if neighbor 出界 or 障碍物 or 在 closedSet: continue
      
      tentativeG = current.g + 1
      if visited[neighbor] !== 1 (不在 open 中):
        gScore[neighbor] = tentativeG
        f = tentativeG + 曼哈顿距离(neighbor, goal)
        parent[neighbor] = current
        openList.push(neighbor)
        visited[neighbor] = 1
      elif tentativeG < gScore[neighbor]:
        // 找到更短路径，更新
        gScore[neighbor] = tentativeG
        parent[neighbor] = current
        // 重新排序（线性扫描时会自动找到最小值）
  
  return null // 无路可达
```

---

## 三、核心难点：生存保底策略 (详细实现)

这是整个 AI 最关键的逻辑，分 4 层决策，逐级回退。

```
                    ┌─────────────────────────┐
                    │  1. A* 寻路到食物       │
                    │  找到路径?              │
                    └────────┬────────────────┘
                             │ 是
                    ┌────────▼────────────────┐
                    │  2. 虚拟预演 (核心)      │
                    │  "吃掉食物后还能活吗?"   │
                    └────────┬────────────────┘
                             │ 安全
                    ┌────────▼────────────────┐
                    │  执行 A* 路径的第一步    │
                    └─────────────────────────┘
                             
        无路径 ❌                    不安全 ❌
             │                          │
             └──────────┬───────────────┘
                        │
               ┌────────▼────────────────┐
               │  3. 追尾巴 (Fallback)   │
               │  A* 寻路到头→尾巴       │
               └────────┬────────────────┘
                        │ 有路径
               ┌────────▼────────────────┐
               │  执行追尾路径的第一步    │
               └─────────────────────────┘
                        │
                  无路径 ❌
                        │
               ┌────────▼────────────────┐
               │  4. 绝境盲走             │
               │  洪水填充找最大连通区域  │
               └─────────────────────────┘
```

### 第 1 层：A* 寻路到食物

```javascript
const pathToFood = this._aStar(head, foodPos, obstacles);
if (pathToFood) {
    if (this._simulateEat(pathToFood)) {
        return pathToFood[0]; // 安全！执行第一步
    }
}
// 否则 fallthrough 到第 3 层
```

### 第 2 层：虚拟预演 — `_simulateEat(path)` ⭐ 核心

```javascript
_simulateEat(path) {
    // 1. 浅拷贝蛇身（只拷贝坐标值，不拷贝对象引用）
    //    用 .map(s => ({x:s.x, y:s.y})) 深拷贝
    const simBody = this.snake.body.map(s => ({x: s.x, y: s.y}));
    const growing = this.snake.growing;

    // 2. 沿 path 一步一步模拟移动
    //    path.length - 1 步：正常移动（unshift 头 + pop 尾）
    //    最后一步（吃食物）：unshift 头，不 pop 尾（增长）
    for (let i = 0; i < path.length; i++) {
        const dir = path[i];
        const head = simBody[0];
        const newHead = { x: head.x + dir.dx, y: head.y + dir.dy };
        
        // 处理穿墙模式
        if (this.snake.wrapMode) {
            if (newHead.x < 0) newHead.x = GRID_SIZE - 1;
            if (newHead.x >= GRID_SIZE) newHead.x = 0;
            if (newHead.y < 0) newHead.y = GRID_SIZE - 1;
            if (newHead.y >= GRID_SIZE) newHead.y = 0;
        }
        
        simBody.unshift(newHead);
        
        const isLastStep = (i === path.length - 1);
        if (!isLastStep) {
            simBody.pop(); // 没吃到食物，正常 pop
        }
        // 最后一步不 pop → 蛇身+1
    }

    // 3. 构建模拟后的障碍物地图
    //    蛇身 [0..n-2] 是障碍物，蛇尾 [n-1] 是目标
    //    为什么排除蛇尾？因为蛇尾会随着移动而"让开"
    const simObstacles = new Set();
    for (let i = 0; i < simBody.length - 1; i++) {
        simObstacles.add(`${simBody[i].x},${simBody[i].y}`);
    }
    // 边界也是障碍（如果是非穿墙模式）
    // （A* 内部会处理边界）

    // 4. 从模拟后的蛇头 → 模拟后的蛇尾 跑 A*
    const simHead = simBody[0];
    const simTail = simBody[simBody.length - 1];
    
    const pathToTail = this._aStar(simHead, simTail, simObstacles);
    
    // 如果能找到通向尾巴的路 → 安全！否则不安全
    return pathToTail !== null;
}
```

**关键设计决策说明：**

> **为什么模拟体只把 body[0..n-2] 设为障碍物，而 body[n-1]（尾巴）作为目标？**
>
> 因为真实的蛇每 tick 移动时，尾巴会消失（pop），从而"让出"一个格子。所以即使模拟体中蛇尾被蛇身包围，只要有一条路能到达蛇尾的"当前坐标"，real 蛇在移动过程中蛇尾会让开，这条路就是可行的。
>
> 但如果把全部 body 都设为障碍物，则蛇尾总是被"自己"包围，A* 永远找不到路，导致 AI 过于保守，永远不敢去吃食物。

### 第 3 层：追尾巴 (Fallback)

```javascript
// 放弃食物，改为追逐尾巴
const tail = this.snake.body[this.snake.body.length - 1];
// 注意：追尾时，所有蛇身 [0..n-2] 是障碍物，蛇尾 [n-1] 是目标
const tailObstacles = new Set();
for (let i = 0; i < this.snake.body.length - 1; i++) {
    tailObstacles.add(`${this.snake.body[i].x},${this.snake.body[i].y}`);
}
const pathToTail = this._aStar(head, tail, tailObstacles);
if (pathToTail) {
    return pathToTail[0];
}
```

### 第 4 层：绝境盲走 (洪水填充)

```javascript
_findSafestDir(head) {
    let bestDir = null;
    let bestArea = -1;
    
    for (const dir of [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT]) {
        const nx = head.x + dir.dx;
        const ny = head.y + dir.dy;
        
        // 检查是否可通行
        if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
        if (this.snake.occupies(nx, ny)) continue;
        
        // 洪水填充计算该方向连通区域大小
        const area = this._floodFill(nx, ny);
        if (area > bestArea) {
            bestArea = area;
            bestDir = dir;
        }
    }
    
    return bestDir || DIR.UP; // 实在没路就向上（反正都要死了）
}

_floodFill(x, y) {
    // BFS/DFS 计算从 (x,y) 出发能到达的格子数
    const visited = new Set();
    const queue = [{x, y}];
    visited.add(`${x},${y}`);
    let count = 0;
    
    while (queue.length > 0) {
        const cur = queue.shift();
        count++;
        
        for (const dir of [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT]) {
            const nx = cur.x + dir.dx;
            const ny = cur.y + dir.dy;
            const key = `${nx},${ny}`;
            
            if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
            if (visited.has(key)) continue;
            if (this.snake.occupies(nx, ny)) continue;
            
            visited.add(key);
            queue.push({x: nx, y: ny});
        }
    }
    
    return count;
}
```

---

## 四、性能优化

| 策略 | 说明 |
|------|------|
| **二维数组替代 Set** | `visited[][]` 用 `Uint8Array` 存储，O(1) 访问 |
| **深拷贝限制** | 仅在虚拟预演时深拷贝蛇身（400 节点，~0.01ms） |
| **A* 提前终止** | 一旦找到目标立即返回，不遍历全部节点 |
| **方向数组回溯** | parent 指针存储为 `parent[x][y]` 二维数组 |
| **最多 3 次 A*** | 食物路径 + 预演追尾 + 回退追尾，最坏情况 3 次 |

对于 20×20 网格，即使最坏情况（3 次 A* + 1 次洪水填充），总耗时也远小于 1ms，远低于 150ms 的 tick 间隔。

---

## 五、文件变更清单

| 文件 | 变更 |
|------|------|
| [`ai.js`](ai.js) | 🟢 **新增** — AIPlayer 类 (约 250 行) |
| [`game.js`](game.js) | 🟡 修改 — Game 构造函数集成 AI、_update 分支、F 键回调 |
| [`index.html`](index.html) | 🟡 修改 — 添加 `<script src="ai.js">` + AI 状态指示器 |
| [`style.css`](style.css) | 🟢 微改 — AI 指示器样式 |

---

## 六、请求确认

请确认此方案是否符合您的预期？如获批准，我将立即切换到 Code 模式实现。
