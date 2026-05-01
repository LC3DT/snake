# Snake Game — Architecture Design Plan

## 1. Project Structure

```
snake/
├── index.html       # HTML skeleton (Canvas + UI containers)
├── style.css        # All visual styles (Dark Neon theme)
├── game.js          # Core game logic (OOP classes)
└── plans/
    └── architecture-plan.md  # This document
```

**Zero external dependencies** — works by double-clicking `index.html`.

---

## 2. Class Design (game.js)

### 2.1 `Game` (Orchestrator)
| Responsibility | Detail |
|---|---|
| **Game Loop** | Uses `requestAnimationFrame` with a fixed-step accumulator (e.g. 150ms per tick) to control snake speed independent of frame rate. |
| **State Machine** | Manages 4 states: `IDLE` (start screen), `PLAYING`, `PAUSED`, `GAME_OVER`. |
| **Score** | Tracks `currentScore` and `highScore` (persisted via `localStorage`). |
| **Rendering** | Clears canvas each frame, delegates drawing to `Snake` and `Food`. |
| **Lifecycle** | `init()` → `start()` → `update()` / `render()` loop → `gameOver()` → `restart()`. |

### 2.2 `Snake`
| Responsibility | Detail |
|---|---|
| **Data** | Array of `{x, y}` grid coordinates; head is index `0`. |
| **Movement** | Each tick, prepend new head position based on `direction`, pop tail (unless growing). |
| **Direction** | Stores `currentDirection` and `nextDirection`. On tick, apply `nextDirection → currentDirection` to prevent mid-tick direction flips. |
| **Anti-reverse** | `setDirection(newDir)` checks `(currentDirection + newDir) % 4 !== 2` → if the new direction is opposite, ignore. |
| **Growth** | `grow()` flag set on food collision; tail not popped on next tick. |
| **Collision** | `checkWallCollision()` — head outside grid bounds. `checkSelfCollision()` — head overlaps any body segment. |

### 2.3 `Food`
| Responsibility | Detail |
|---|---|
| **Position** | Random `{x, y}` within grid bounds (0–19). |
| **Respawn** | `spawn(snakeBody)` — brute-force random position that does not overlap snake; extremely fast on 20×20 grid. |
| **Drawing** | Renders a glowing red circle / square on canvas. |

### 2.4 `InputHandler`
| Responsibility | Detail |
|---|---|
| **Keyboard** | Listens to `keydown` on `document`. |
| **Mapping** | Maps `W/↑ → UP`, `A/← → LEFT`, `S/↓ → DOWN`, `D/→ → RIGHT`. Maps `Space` → start / restart. Maps `P / Esc` → toggle pause. |
| **Delegation** | Calls `snake.setDirection(dir)` during gameplay; calls `game.start()`, `game.togglePause()`, etc. |

---

## 3. Dark Neon Visual Theme

| Element | Colour / Style |
|---|---|
| Page background | `#0a0a0a` (near-black) |
| Canvas background | `#111` with subtle grid lines (`#222`) |
| Snake head | `#00ff41` (bright neon green), slightly larger glow |
| Snake body | `#00cc33` with gradient segments |
| Food | `#ff0044` (neon red) with pulsing glow effect |
| Score panel | Retro-styled text, `#00ff41` for score, `#ff0044` for high score |
| Game-over overlay | Semi-transparent dark backdrop, centred panel with neon border |
| Start screen | "Press SPACE or Click to Start" with subtle glow animation |

---

## 4. Data Flow (per tick)

```
requestAnimationFrame callback
  └─ deltaTime accumulator
       └─ if accumulator >= TICK_INTERVAL (150ms)
            ├─ snake.setDirection(nextDir)  ← from InputHandler buffer
            ├─ newHead = computeNewHead()
            ├─ collision? ─yes──→ game.gameOver()
            ├─ food eaten? ─yes──→ score += 10, snake.grow(), food.respawn()
            ├─ move snake (prepend head, pop tail if not growing)
            └─ accumulator -= TICK_INTERVAL
       └─ render()
            ├─ clear canvas
            ├─ draw grid
            ├─ draw food
            ├─ draw snake
            └─ draw UI overlays (if game state requires)
```

---

## 5. Key Design Decisions

1. **`requestAnimationFrame` + fixed timestep** — smoother than `setInterval`, and ensures consistent game speed across different monitors (60 Hz vs 144 Hz).
2. **Grid-based logic** — all coordinates are integers 0–19; rendering multiplies by `CELL_SIZE` (20px). This makes collision detection trivially exact.
3. **Input buffering** — `InputHandler` stores last valid direction; `Game.update()` applies it at tick boundary. This prevents bugs where rapid key presses cause the snake to "reverse" within a single tick.
4. **Canvas size** — `400×400` pixels (20 × 20 cells × 20 px), with additional space for the score panel above.

---

## 6. UI Layout (ASCII sketch)

```
┌──────────────────────────────────────┐
│  🐍 SCORE: 000    HIGH: 000         │  ← Score panel (outside canvas)
├──────────────────────────────────────┤
│                                      │
│          ┌─── 400px ───┐             │
│          │   Canvas    │             │
│          │  20×20 grid │             │
│          │             │             │
│          └─────────────┘             │
│                                      │
└──────────────────────────────────────┘
```

The game container is flexbox-centered on the page. The score panel sits above the canvas. Overlays (start, pause, game-over) are absolutely positioned over the canvas area.

---

## 7. Next Steps

1. ✅ Confirm the architecture above (approve / request changes)
2. I will write `index.html` and `style.css`
3. I will write `game.js` with full Chinese comments on critical logic
4. Final review & test
