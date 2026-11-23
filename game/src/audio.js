// CALA LUNA — audio: all sound is synthesized with WebAudio. No audio files.
// Engine hum, sirens, gunshots, pickups, UI clicks and a bassline loop.

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { this.ctx = null; }
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.ctx.suspend();
    if (!this.muted) this.resume();
    return this.muted;
  }

  _tone(freq, dur, type = 'sine', vol = 0.15, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur);
  }

  _noise(dur, vol = 0.2, filterFreq = 1000) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.ctx.destination);
    src.start(t);
  }

  click() { this._tone(880, 0.06, 'square', 0.06); }
  pickup() { this._tone(660, 0.09, 'sine', 0.14); setTimeout(() => this._tone(990, 0.12, 'sine', 0.14), 70); }
  cash() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.12, 'triangle', 0.12), i * 80)); }
  shoot() { this._noise(0.14, 0.28, 2200); this._tone(160, 0.1, 'square', 0.12, 60); }
  shotgun() { this._noise(0.3, 0.4, 1200); this._tone(110, 0.2, 'square', 0.16, 45); }
  punch() { this._noise(0.08, 0.18, 700); }
  crash() { this._noise(0.35, 0.3, 500); }
  sirenBlip() { this._tone(700, 0.16, 'sine', 0.05, 950); }
  missionPass() { [392, 523, 659, 784].forEach((f, i) => setTimeout(() => this._tone(f, 0.16, 'triangle', 0.14), i * 110)); }
  missionFail() { [330, 262, 196].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 'sawtooth', 0.08), i * 150)); }
  wantedUp() { this._tone(440, 0.12, 'square', 0.08, 660); }
  horn() { this._tone(370, 0.25, 'square', 0.07); this._tone(466, 0.25, 'square', 0.07); }
  skid() { this._noise(0.25, 0.12, 900); }
  countdown() { [660, 660, 990].forEach((f, i) => setTimeout(() => this._tone(f, 0.12, 'square', 0.09), i * 200)); }

  startEngine() {
    if (!this.ctx || this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 320;
    this.engineOsc.connect(f).connect(this.engineGain).connect(this.ctx.destination);
    this.engineOsc.start();
  }

  setEngine(speedNorm, driving) {
    if (!this.engineOsc) return;
    const target = driving ? 0.05 + speedNorm * 0.05 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speedNorm * 130, this.ctx.currentTime, 0.1);
  }

  // Stop the engine hum for good (quit to title). startEngine can
  // bring it back; without this the oscillator ran forever.
  stopEngine() {
    if (!this.engineOsc) return;
    try { this.engineOsc.stop(); } catch { /* already stopped */ }
    this.engineOsc.disconnect();
    this.engineOsc = null;
    this.engineGain = null;
  }

  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    // A lazy bassline loop: A minor, one note per 0.32s.
    const bass = [110, 0, 110, 0, 130.8, 0, 98, 0, 110, 0, 110, 0, 146.8, 0, 164.8, 0];
    this.musicTimer = setInterval(() => {
      if (this.muted) return;
      const f = bass[this.musicStep % bass.length];
      if (f) this._tone(f, 0.3, 'triangle', 0.05);
      if (this.musicStep % 4 === 0) this._noise(0.05, 0.02, 4000);
      this.musicStep++;
    }, 320);
  }

  stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } }
}
