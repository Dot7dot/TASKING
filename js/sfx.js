// 用 Web Audio 即時合成的音效（不需要音檔）
let ctx = null;
let enabled = true;
let noiseBuf = null;

export function setSound(on) { enabled = on; }

function ac() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** 在使用者第一次點擊時解鎖音效（iOS 需要） */
export function unlockAudio() { ac(); }

function noise(c) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

function env(c, t0, peak, attack, decay) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  return g;
}

function tone(c, freq, t0, dur, type = 'sine', peak = 0.2, to = null) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = env(c, t0, peak, 0.01, dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export const sfx = {
  tap() {
    const c = ac(); if (!c) return;
    tone(c, 660, c.currentTime, 0.08, 'triangle', 0.12, 880);
  },
  coin() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    tone(c, 988, t, 0.08, 'square', 0.06);
    tone(c, 1319, t + 0.07, 0.22, 'square', 0.06);
  },
  /** 開包前的蓄力聲（持續時間 ms） */
  charge(ms) {
    const c = ac(); if (!c) return;
    const t = c.currentTime, d = ms / 1000;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(320, t + d);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(2200, t + d);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + d * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.05);
    o.connect(lp).connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + d + 0.1);
  },
  /** 撕開的聲音 */
  tear() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const n = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(4500, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.38);
    // 撕紙是一段一段的：用快速抖動的音量模擬
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 14; i++) g.gain.setValueAtTime(0.25 + Math.random() * 0.45, t + i * 0.026);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    n.connect(bp).connect(g).connect(c.destination);
    n.start(t);
    n.stop(t + 0.5);
    tone(c, 140, t, 0.3, 'sine', 0.35, 50);
  },
  whoosh() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const n = noise(c);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(3000, t + 0.15);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.35);
    const g = env(c, t, 0.25, 0.08, 0.3);
    n.connect(lp).connect(g).connect(c.destination);
    n.start(t);
    n.stop(t + 0.45);
  },
  flip() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const n = noise(c);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2000;
    const g = env(c, t, 0.3, 0.005, 0.07);
    n.connect(hp).connect(g).connect(c.destination);
    n.start(t);
    n.stop(t + 0.1);
  },
  /** 依稀有度的音效：base / gold / rainbow */
  reveal(tier) {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    if (tier === 'base') { tone(c, 523, t, 0.18, 'triangle', 0.12); return; }
    const notes = tier === 'rainbow' ? [523, 659, 784, 1047, 1319, 1568, 2093] : [523, 659, 784, 1047];
    notes.forEach((fq, i) => {
      tone(c, fq, t + i * 0.07, 0.5, 'triangle', 0.13);
      tone(c, fq * 2, t + i * 0.07, 0.3, 'sine', 0.04);
    });
  },
  /** 撕開瞬間的爆發光 */
  burst(tier) {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    if (tier === 'base') return;
    const chord = tier === 'rainbow' ? [262, 330, 392, 523, 659, 784] : [294, 370, 440, 587];
    chord.forEach((fq) => tone(c, fq, t, 1.4, 'sawtooth', 0.03));
    tone(c, 1568, t + 0.05, 1.2, 'sine', 0.06);
  },
};
