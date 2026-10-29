/**
 * Per-board Piezo Speaker Synthesizer (Web Audio API)
 * Emulates GPIO 25 piezo speaker / DAC1 audio output on VIDI X.
 */
export class PiezoSpeakerEngine {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private muted = false;
  private volume = 60; // 0..100
  private currentFreq = 0;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.noTone();
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(100, vol));
    if (this.gain && this.ctx) {
      const targetGain = this.muted ? 0 : (this.volume / 100) * 0.12;
      this.gain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.01);
    }
  }

  public tone(frequency: number, durationMs?: number, onEnd?: () => void): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }

    const freq = Math.max(20, Math.min(20000, Number(frequency) || 0));
    this.currentFreq = freq;

    if (!this.muted && this.volume > 0) {
      const ctx = this.ensureContext();
      if (ctx) {
        if (!this.osc || !this.gain) {
          this.osc = ctx.createOscillator();
          this.gain = ctx.createGain();
          this.osc.type = 'square';
          this.osc.frequency.setValueAtTime(freq, ctx.currentTime);
          this.gain.gain.setValueAtTime((this.volume / 100) * 0.12, ctx.currentTime);
          this.osc.connect(this.gain);
          this.gain.connect(ctx.destination);
          this.osc.start();
        } else {
          this.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.005);
          this.gain.gain.setTargetAtTime((this.volume / 100) * 0.12, ctx.currentTime, 0.005);
        }
      }
    }

    if (durationMs && durationMs > 0) {
      this.stopTimer = setTimeout(() => {
        this.noTone();
        onEnd?.();
      }, durationMs);
    }
  }

  public noTone(): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.currentFreq = 0;
    if (this.osc) {
      try {
        this.osc.stop();
        this.osc.disconnect();
      } catch {
        // ignore
      }
      this.osc = null;
    }
    if (this.gain) {
      try {
        this.gain.disconnect();
      } catch {
        // ignore
      }
      this.gain = null;
    }
  }

  public getFrequency(): number {
    return this.currentFreq;
  }

  public destroy(): void {
    this.noTone();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
