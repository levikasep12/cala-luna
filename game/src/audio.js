// CALA LUNA — audio: all sound is synthesized with WebAudio. No audio files.
// Engine hum, sirens, gunshots, pickups, UI clicks and a bassline loop.
// Two primitives do all the work — a tone (an oscillator with an
// envelope) and noise (a decaying buffer through a filter) — and the
// jingles are one table of note runs played through a single arpeggio
// helper, so every fanfare is four numbers, not four callbacks.

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.rotorOsc = null; // helicopter rotor loop (null when no heli)
    this.rotorLfo = null;
    this.rotorOn = false;
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

  // One oscillator with a decaying gain envelope, optionally sliding
  // down (or up) in pitch across its life.
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

  // A burst of filtered noise with a decaying envelope: gunshots,
  // crashes, skids, the hi-hat tick in the music loop.
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

  // A run of notes, one every stepMs, all the same shape.
  _arp(notes, stepMs, dur, type, vol) {
    notes.forEach((f, i) => setTimeout(() => this._tone(f, dur, type, vol), i * stepMs));
  }

  click() { this._tone(880, 0.06, 'square', 0.06); }
  pickup() { this._tone(660, 0.09, 'sine', 0.14); setTimeout(() => this._tone(990, 0.12, 'sine', 0.14), 70); }
  cash() { this._arp([523, 659, 784, 1047], 80, 0.12, 'triangle', 0.12); }
  shoot() { this._noise(0.14, 0.28, 2200); this._tone(160, 0.1, 'square', 0.12, 60); }
  shotgun() { this._noise(0.3, 0.4, 1200); this._tone(110, 0.2, 'square', 0.16, 45); }
  punch() { this._noise(0.08, 0.18, 700); }
  crash() { this._noise(0.35, 0.3, 500); }
  sirenBlip() { this._tone(700, 0.16, 'sine', 0.05, 950); }
  missionPass() { this._arp([392, 523, 659, 784], 110, 0.16, 'triangle', 0.14); }
  missionFail() { this._arp([330, 262, 196], 150, 0.22, 'sawtooth', 0.08); }
  wantedUp() { this._tone(440, 0.12, 'square', 0.08, 660); }
  horn() { this._tone(370, 0.25, 'square', 0.07); this._tone(466, 0.25, 'square', 0.07); }
  skid() { this._noise(0.25, 0.12, 900); }
  countdown() { this._arp([660, 660, 990], 200, 0.12, 'square', 0.09); }
  // Two low buzzes: a purchase that didn't happen (broke, plated, pouch full).
  denied() { this._tone(140, 0.12, 'square', 0.08); setTimeout(() => this._tone(110, 0.16, 'square', 0.08), 110); }

  // A looping oscillator through a lowpass filter into a gain: the
  // shared shape of the engine hum and the rotor thump.
  _filteredLoop(type, freq, filterFreq, gainVal) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = gainVal;
    o.connect(f).connect(g).connect(this.ctx.destination);
    return { osc: o, gain: g };
  }

  // Stop and unplug one oscillator. The try/catch is for a loop that
  // was already stopped — stopping twice throws.
  _stopOsc(osc) {
    try { osc.stop(); } catch { /* already stopped */ }
    osc.disconnect();
  }

  startEngine() {
    if (!this.ctx || this.engineOsc) return;
    const loop = this._filteredLoop('sawtooth', 55, 320, 0.0);
    this.engineOsc = loop.osc;
    this.engineGain = loop.gain;
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
    this._stopOsc(this.engineOsc);
    this.engineOsc = null;
    this.engineGain = null;
  }

  // Helicopter rotor: a low sawtooth chopped by an 11 Hz LFO, the
  // thump-thump of blades. Starts when the heli spawns, stops when it
  // leaves; the main loop drives it from police.heli.
  startRotor() {
    if (!this.ctx || this.rotorOsc) return;
    const loop = this._filteredLoop('sawtooth', 48, 220, 0.035);
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 11;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(loop.gain.gain);
    loop.osc.start();
    lfo.start();
    this.rotorOsc = loop.osc;
    this.rotorLfo = lfo;
    this.rotorOn = true;
  }

  stopRotor() {
    if (!this.rotorOsc) return;
    this._stopOsc(this.rotorOsc);
    this._stopOsc(this.rotorLfo);
    this.rotorOsc = null;
    this.rotorLfo = null;
    this.rotorOn = false;
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
