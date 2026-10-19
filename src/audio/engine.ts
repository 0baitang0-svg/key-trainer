/**
 * Web Audio 引擎：单例 AudioContext + master GainNode。
 * - warmup()：手势内 resume + 零增益 0.1s 短音，消除首音延迟
 * - visibilitychange：切后台 suspend、回前台 resume
 * - 机型兜底：triangle 异常时降级 sine / PeriodicWave（按 ctx.sampleRate 实算泛音）
 */

/** 三角波异常时的兜底策略 */
type WavePlan = 'triangle' | 'periodic';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume = 0.8;
  private muted = false;
  private wavePlan: WavePlan = 'triangle';
  private periodicWave: PeriodicWave | null = null;
  private visibilityInstalled = false;

  /** 是否可用（无 AudioContext 环境为 false） */
  get available(): boolean {
    try {
      this.ensure();
      return true;
    } catch {
      return false;
    }
  }

  /** 懒创建单例 AudioContext */
  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const g = globalThis as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctor) throw new Error('当前环境不支持 Web Audio');
    this.ctx = new Ctor();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.volume;
    this.masterGain.connect(this.ctx.destination);
    this.installVisibility();
    return this.ctx;
  }

  /** AudioContext（不可用时抛中文错误） */
  get context(): AudioContext {
    return this.ensure();
  }

  /** master GainNode（音量 / 静音都作用在它上面） */
  get master(): GainNode {
    this.ensure();
    if (!this.masterGain) throw new Error('音频引擎尚未初始化');
    return this.masterGain;
  }

  /** 实际采样率（兜底波形构造用） */
  get sampleRate(): number {
    return this.ensure().sampleRate;
  }

  /** 当前时间（秒） */
  now(): number {
    return this.ensure().currentTime;
  }

  /** 手势内调用：resume + 零增益短音预热 */
  warmup(): void {
    const ctx = this.ensure();
    void ctx.resume();
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      osc.frequency.value = 440;
      osc.connect(g);
      g.connect(this.masterGain ?? ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      // 预热失败不影响后续播放
    }
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private installVisibility(): void {
    if (this.visibilityInstalled) return;
    const doc = (globalThis as unknown as { document?: Document }).document;
    if (!doc || typeof doc.addEventListener !== 'function') return;
    doc.addEventListener('visibilitychange', () => {
      if (doc.hidden) this.suspend();
      else this.resume();
    });
    this.visibilityInstalled = true;
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.masterGain && !this.muted) this.masterGain.gain.value = this.volume;
  }

  getVolume(): number {
    return this.volume;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.masterGain) this.masterGain.gain.value = m ? 0 : this.volume;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** 按 sampleRate 实算的兜底泛音波（三角波衰减 1/k²） */
  fallbackWave(): PeriodicWave {
    const ctx = this.ensure();
    if (this.periodicWave) return this.periodicWave;
    const maxH = Math.max(2, Math.floor(ctx.sampleRate / 2 / 220)); // 220Hz 基频下的奈奎斯特上限
    const real = new Float32Array(maxH + 1);
    const imag = new Float32Array(maxH + 1);
    for (let k = 1; k <= maxH; k += 2) {
      imag[k] = (1 / (k * k)) * (k % 4 === 1 ? 1 : -1);
    }
    this.periodicWave = ctx.createPeriodicWave(real, imag);
    return this.periodicWave;
  }

  /**
   * 创建发声体：优先 triangle，异常时降级 sine / PeriodicWave。
   */
  createOsc(freq: number): OscillatorNode {
    const ctx = this.ensure();
    const osc = ctx.createOscillator();
    if (this.wavePlan === 'triangle') {
      try {
        osc.type = 'triangle';
      } catch {
        this.wavePlan = 'periodic';
      }
    }
    if (this.wavePlan === 'periodic') {
      try {
        osc.setPeriodicWave(this.fallbackWave());
      } catch {
        osc.type = 'sine';
      }
    }
    osc.frequency.value = freq;
    return osc;
  }
}

/** 全局单例 */
export const audioEngine = new AudioEngine();
