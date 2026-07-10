/**
 * 三层音效(开火/命中/击杀)+ 辅助音,全部 Web Audio 实时合成——
 * 零素材、零版权(WP1.5 硬性约束)。AudioContext 须在用户首次交互后创建/恢复。
 */
export class Sfx {
  private ctx: AudioContext | null = null;

  /** 在任意用户手势里调用,解锁音频 */
  unlock(): void {
    if (typeof AudioContext === 'undefined') {
      return;
    }
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private tone(
    type: OscillatorType,
    freqFrom: number,
    freqTo: number,
    durS: number,
    gain: number,
  ): void {
    if (!this.ctx || this.ctx.state !== 'running') {
      return;
    }
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), t0 + durS);
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
    osc.connect(amp).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durS + 0.02);
  }

  private noise(durS: number, gain: number, filterHz: number): void {
    if (!this.ctx || this.ctx.state !== 'running') {
      return;
    }
    const t0 = this.ctx.currentTime;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * durS));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1; // 表现层噪声,与模拟确定性无关
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterHz;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
    src.connect(filter).connect(amp).connect(this.ctx.destination);
    src.start(t0);
  }

  fire(): void {
    this.tone('square', 840, 620, 0.05, 0.04);
  }

  hit(): void {
    this.noise(0.05, 0.09, 1800);
  }

  kill(): void {
    this.tone('sawtooth', 480, 90, 0.16, 0.12);
    this.noise(0.12, 0.1, 900);
  }

  enemyFire(): void {
    this.tone('triangle', 300, 240, 0.06, 0.03);
  }

  playerHit(): void {
    this.tone('sine', 140, 55, 0.22, 0.16);
    this.noise(0.08, 0.08, 400);
  }

  orb(): void {
    this.tone('sine', 620, 990, 0.08, 0.05);
  }

  death(): void {
    this.tone('sawtooth', 260, 36, 0.5, 0.18);
  }

  respawn(): void {
    this.tone('triangle', 330, 660, 0.12, 0.06);
  }
}
