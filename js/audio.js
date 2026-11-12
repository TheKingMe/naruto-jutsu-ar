(function (global) {
  'use strict';

  const Shinobi = (global.Shinobi = global.Shinobi || {});

  class ShinobiAudio {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.noiseBuf = null;
      this.muted = false;
      this.channels = new Map();
    }

    unlock() {
      if (this.muted) return false;
      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return false;

      if (!this.ctx) {
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.32;
        this.master.connect(this.ctx.destination);
        this.noiseBuf = this._makeNoiseBuffer(2.0);
      }

      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx.state === 'running';
    }

    setMuted(muted) {
      this.muted = muted;
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(muted ? 0 : 0.32, this.ctx.currentTime, 0.04);
      }
    }

    _makeNoiseBuffer(seconds) {
      const length = Math.floor(this.ctx.sampleRate * seconds);
      const buf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      return buf;
    }

    _createChannel(key) {
      const ctx = this.ctx;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.master);

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 140;
      const oscGain = ctx.createGain();
      oscGain.gain.value = 0.25;
      osc.connect(oscGain);
      oscGain.connect(gain);

      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuf;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 700;
      filter.Q.value = 2.2;

      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.5;

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(gain);

      osc.start();
      noise.start();

      const ch = { gain, osc, oscGain, filter, noiseGain };
      this.channels.set(key, ch);
      return ch;
    }

    setContinuous(key, jutsuId, intensity) {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const ch = this.channels.get(key) || this._createChannel(key);
      const now = this.ctx.currentTime;
      const level = Math.max(0, Math.min(1, intensity));

      if (level < 0.02 || !jutsuId) {
        ch.gain.gain.setTargetAtTime(0, now, 0.06);
        return;
      }

      const profiles = {
        rasengan:       { freq: 145, type: 'sine',     filt: 'bandpass',  fHz: 580,  q: 3.0, oMix: 0.28, nMix: 0.38, vol: 0.28 },
        odama_rasengan: { freq: 98,  type: 'triangle', filt: 'bandpass',  fHz: 420,  q: 2.4, oMix: 0.36, nMix: 0.45, vol: 0.38 },
        rasenshuriken:  { freq: 390, type: 'sawtooth', filt: 'highpass',  fHz: 1500, q: 3.5, oMix: 0.24, nMix: 0.55, vol: 0.32 },
        chidori:        { freq: 860, type: 'square',   filt: 'bandpass',  fHz: 2400, q: 4.5, oMix: 0.14, nMix: 0.60, vol: 0.26 },
        fireball:       { freq: 88,  type: 'sawtooth', filt: 'lowpass',   fHz: 460,  q: 1.2, oMix: 0.15, nMix: 0.72, vol: 0.34 },
        amaterasu:      { freq: 74,  type: 'sawtooth', filt: 'bandpass',  fHz: 320,  q: 4.0, oMix: 0.25, nMix: 0.48, vol: 0.28 },
        bijudama:       { freq: 62,  type: 'sine',     filt: 'lowpass',   fHz: 260,  q: 3.2, oMix: 0.55, nMix: 0.35, vol: 0.40 }
      };

      const p = profiles[jutsuId] || profiles.rasengan;
      if (ch.osc.type !== p.type) ch.osc.type = p.type;
      if (ch.filter.type !== p.filt) ch.filter.type = p.filt;

      // Subtle lightning chirp jitter for Chidori
      const jitter = jutsuId === 'chidori' ? (Math.random() - 0.5) * 420 : 0;
      ch.osc.frequency.setTargetAtTime(p.freq + jitter + level * 45, now, 0.04);
      ch.filter.frequency.setTargetAtTime(p.fHz + jitter * 1.5, now, 0.05);
      ch.filter.Q.setTargetAtTime(p.q, now, 0.05);
      ch.oscGain.gain.setTargetAtTime(p.oMix, now, 0.05);
      ch.noiseGain.gain.setTargetAtTime(p.nMix, now, 0.05);
      ch.gain.gain.setTargetAtTime(level * p.vol, now, 0.05);
    }

    playBurst(type) {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      if (type === 'clone_poof') {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(1400, now);
        filt.frequency.exponentialRampToValueAtTime(180, now + 0.35);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.45, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

        src.connect(filt);
        filt.connect(g);
        g.connect(this.master);
        src.start(now);
        src.stop(now + 0.38);
      } else if (type === 'summoning_boom') {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(34, now + 0.55);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.75, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

        osc.connect(g);
        g.connect(this.master);
        osc.start(now);
        osc.stop(now + 0.68);
        this.playBurst('clone_poof');
      } else if (type === 'sharingan_ding') {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(980, now);
        osc.frequency.exponentialRampToValueAtTime(1560, now + 0.14);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.26, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(g);
        g.connect(this.master);
        osc.start(now);
        osc.stop(now + 0.48);
      } else if (type === 'mode_powerup') {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(330, now + 0.32);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.32, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(g);
        g.connect(this.master);
        osc.start(now);
        osc.stop(now + 0.48);
      } else if (type === 'jutsu_throw') {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const filt = ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(420, now);
        filt.frequency.exponentialRampToValueAtTime(2200, now + 0.22);
        filt.Q.value = 1.6;

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.4, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

        src.connect(filt);
        filt.connect(g);
        g.connect(this.master);
        src.start(now);
        src.stop(now + 0.28);
      } else if (type === 'jutsu_impact') {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(210, now);
        osc.frequency.exponentialRampToValueAtTime(42, now + 0.36);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.6, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

        osc.connect(g);
        g.connect(this.master);
        osc.start(now);
        osc.stop(now + 0.44);
        this.playBurst('clone_poof');
      }
    }
  }

  Shinobi.Audio = ShinobiAudio;
})(window);
