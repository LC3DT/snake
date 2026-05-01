// ============================================================================
//  🐍 Snake — 音频管理器
//  职责：Web Audio API 8-bit 音效合成，零外部文件
// ============================================================================

import { ItemType } from './types';

export class AudioManager {
  private ctx: AudioContext | null = null;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /** 播放一个音调 */
  private playTone(
    type: OscillatorType,
    frequencies: number[],
    duration: number,
    volume = 0.3,
  ): void {
    try {
      const ctx = this.ensureContext();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.05);
        osc.connect(gain);
        osc.start(ctx.currentTime + i * 0.05);
        osc.stop(ctx.currentTime + i * 0.05 + duration);
      });
    } catch {
      // 静默失败 — 音频非关键功能
    }
  }

  playNormalEat(): void {
    this.playTone('square', [440], 0.1, 0.2);
  }

  playGoldenEat(): void {
    this.playTone('triangle', [660, 880, 1100], 0.25, 0.25);
  }

  playBlueEat(): void {
    this.playTone('sawtooth', [330, 220], 0.2, 0.2);
  }

  playPurpleEat(): void {
    this.playTone('sawtooth', [550, 220, 110], 0.4, 0.25);
  }

  playSpeedUp(): void {
    this.playTone('square', [440, 554, 659, 880], 0.35, 0.2);
  }

  playDeath(): void {
    this.playTone('sawtooth', [200, 100, 50], 0.5, 0.3);
  }

  playShieldEat(): void {
    this.playTone('sine', [880, 1100, 1320], 0.3, 0.25);
  }

  playGhostEat(): void {
    this.playTone('sine', [440, 660, 880], 0.35, 0.2);
  }

  /** 根据道具类型播放对应音效 */
  playItemEat(type: ItemType): void {
    switch (type) {
      case ItemType.NORMAL: this.playNormalEat(); break;
      case ItemType.GOLDEN: this.playGoldenEat(); break;
      case ItemType.BLUE:   this.playBlueEat();   break;
      case ItemType.PURPLE: this.playPurpleEat();  break;
      case ItemType.SHIELD: this.playShieldEat();  break;
      case ItemType.GHOST:  this.playGhostEat();   break;
    }
  }
}
