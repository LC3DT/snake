// ============================================================================
//  🐍 Snake — 入口文件
//  导入样式并启动游戏
// ============================================================================

import './style.css';
import { Game } from './Game';

// DOM 就绪后启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new Game();
  });
} else {
  new Game();
}
