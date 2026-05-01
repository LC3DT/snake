// ============================================================================
//  🐍 Snake — 有限状态机 (FSM)
//
//  合法流转：
//    MENU     ──(Space)──→  PLAYING
//    PLAYING  ──(P/Esc)──→  PAUSED
//    PLAYING  ──(碰撞)──→   GAME_OVER
//    PAUSED   ──(P/Esc)──→  PLAYING
//    GAME_OVER ──(Space)──→ PLAYING  (重新开始)
// ============================================================================

import { GameState } from './types';

/** 状态变更回调 */
export type StateListener = (newState: GameState, prevState: GameState) => void;

/** 状态流转表（只读，编译期保证完整性） */
const TRANSITIONS: Record<GameState, readonly GameState[]> = {
  [GameState.MENU]:      [GameState.PLAYING],
  [GameState.PLAYING]:   [GameState.PAUSED, GameState.GAME_OVER],
  [GameState.PAUSED]:    [GameState.PLAYING],
  [GameState.GAME_OVER]: [GameState.PLAYING],
};

export class GameStateMachine {
  private _state: GameState;
  private _listeners = new Set<StateListener>();

  constructor(initial: GameState = GameState.MENU) {
    this._state = initial;
  }

  /** 获取当前状态（只读） */
  get state(): GameState {
    return this._state;
  }

  /** 注册状态变更监听；返回取消注册的函数 */
  onTransition(fn: StateListener): () => void {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  }

  /** 核心流转方法 */
  private transition(to: GameState): boolean {
    const from = this._state;
    if (from === to) return false;

    const allowed = TRANSITIONS[from];
    if (!allowed.includes(to)) {
      console.warn(`[FSM] 非法流转: ${from} → ${to}`);
      return false;
    }

    this._state = to;
    this._listeners.forEach(fn => fn(to, from));
    return true;
  }

  // ---- 公开的状态变更方法 ----

  /** MENU → PLAYING */
  start(): boolean {
    return this.transition(GameState.PLAYING);
  }

  /** PLAYING → PAUSED */
  pause(): boolean {
    return this.transition(GameState.PAUSED);
  }

  /** PAUSED → PLAYING */
  resume(): boolean {
    return this.transition(GameState.PLAYING);
  }

  /** PLAYING → GAME_OVER */
  gameOver(): boolean {
    return this.transition(GameState.GAME_OVER);
  }

  /** GAME_OVER / MENU → PLAYING（重新开始） */
  restart(): boolean {
    return this.transition(GameState.PLAYING);
  }

  /** 切换暂停/继续（方便按键处理） */
  togglePause(): boolean {
    if (this._state === GameState.PLAYING) return this.pause();
    if (this._state === GameState.PAUSED)  return this.resume();
    return false;
  }
}
