// ============================================================================
//  🐍 Snake — 网络层
//  职责：封装 fetch 请求，处理排行榜 API 数据交互
// ============================================================================

import {
  type LeaderboardEntry,
  type ScoreSubmitResponse,
  type ApiError,
} from './types';

export class Network {
  private readonly baseUrl: string;

  constructor() {
    // 通过 HTTP 访问时（Vite dev / Nginx 反向代理），使用相对路径
    // 直接打开 file:// 时，fallback 到 localhost:3001
    this.baseUrl = window.location.protocol.startsWith('http')
      ? '/api'
      : 'http://localhost:3001/api';
  }

  /** 获取 Top 10 排行榜 */
  async fetchLeaderboard(): Promise<LeaderboardEntry[]> {
    const res = await fetch(`${this.baseUrl}/leaderboard`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json() as Promise<LeaderboardEntry[]>;
  }

  /** 提交分数 */
  async submitScore(playerName: string, score: number): Promise<ScoreSubmitResponse> {
    const res = await fetch(`${this.baseUrl}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName, score }),
    });

    if (!res.ok) {
      const errData = await res.json().catch<ApiError>(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(errData.error ?? `HTTP ${res.status}`);
    }

    return res.json() as Promise<ScoreSubmitResponse>;
  }

  /** 健康检查 */
  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
