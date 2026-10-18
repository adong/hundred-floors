/* 100 Floors: this game's own sounds, built on Kit.sound.tone / hiss (the kit has the music and the classics).
   Exposes window.HFSfx. Every sound is a silent no-op until Kit.sound.init() runs on the first tap or key. */
(function () {
  'use strict';
  const S = window.Kit.sound;
  const tone = (o) => S.tone(o), hiss = (o) => S.hiss(o);

  window.HFSfx = {
    // a soft footstep thud for landing in DOWN
    land() { tone({ f: 150, to: 70, dur: 0.08, vol: 0.14 }); },
    // the springy platform
    boing() {
      tone({ f: 180, to: 520, dur: 0.22, vol: 0.18 });
      tone({ type: 'triangle', f: 360, to: 980, dur: 0.18, vol: 0.06, at: 0.03 });
    },
    // every bounce in UP (quiet: there are lots of them)
    bounce() { tone({ type: 'triangle', f: 330, to: 560, dur: 0.09, vol: 0.07 }); },
    // a BIG jump, and the flip that comes with it
    big() {
      S.jump();
      tone({ type: 'triangle', f: 520, to: 1250, dur: 0.24, vol: 0.06, at: 0.04 });
    },
    // a cookie platform crumbling
    crumble() {
      hiss({ filter: 'lowpass', f: 1600, to: 300, dur: 0.35, vol: 0.22 });
      tone({ f: 120, to: 60, dur: 0.18, vol: 0.12, at: 0.05 });
    },
    // a cartoon bonk: spikes or the ceiling (soft, never scary)
    ouch() {
      tone({ f: 420, to: 150, dur: 0.18, vol: 0.22 });
      tone({ type: 'square', f: 700, to: 900, dur: 0.07, vol: 0.04, at: 0.12, lp: 2000 });
      tone({ type: 'square', f: 900, to: 600, dur: 0.1, vol: 0.04, at: 0.19, lp: 2000 });
    },
    // falling off the bottom: a slide whistle
    whistle() { tone({ type: 'sine', f: 1100, to: 220, dur: 0.6, vol: 0.12 }); },
    // poof: back on a platform
    poof() { hiss({ f: 1200, to: 4000, dur: 0.3, vol: 0.12, q: 0.8 }); },
    // the buddy saves you
    saved() {
      [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'triangle', f, at: i * 0.05, dur: 0.16, vol: 0.1 }));
      hiss({ filter: 'highpass', f: 4000, dur: 0.25, vol: 0.06, at: 0.1 });
    },
    // the buddy floats in on his balloon
    balloon() {
      tone({ type: 'sine', f: 500, to: 900, dur: 0.25, vol: 0.08 });
      tone({ type: 'sine', f: 700, to: 1200, dur: 0.2, vol: 0.06, at: 0.18 });
    },
    treat(streak) { S.coin(streak); },
    heart() { [659, 880, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', f, at: i * 0.07, dur: 0.22, vol: 0.12 })); },
    // a multi-floor jump in UP: higher for longer combos
    combo(n) {
      const k = Math.pow(2, Math.min(n, 10) / 12);
      tone({ type: 'square', f: 523 * k, dur: 0.08, vol: 0.05, lp: 3000 });
      tone({ type: 'square', f: 784 * k, dur: 0.12, vol: 0.05, lp: 3000, at: 0.07 });
    },
    comboEnd() { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'square', f, at: i * 0.06, dur: 0.14, vol: 0.05, lp: 3200 })); },
    // 25, 50, 75, 100 floors
    fanfare(big) {
      const notes = big ? [523, 659, 784, 1047, 784, 1047, 1319, 1568] : [523, 659, 784, 1047, 1319];
      notes.forEach((f, i) => {
        tone({ type: 'square', f, at: i * 0.11, dur: 0.16, vol: 0.06, lp: 3500 });
        tone({ type: 'triangle', f: f / 2, at: i * 0.11, dur: 0.2, vol: 0.1 });
      });
      hiss({ filter: 'highpass', f: 5000, dur: 0.8, vol: 0.08, at: notes.length * 0.11 - 0.1 });
    },
    count(go) { tone({ type: 'square', f: go ? 1047 : 523, dur: go ? 0.35 : 0.14, vol: 0.06, lp: 3000 }); },
    // game over: three gentle steps down, then a little "oh well" wobble
    over() {
      [523, 440, 349].forEach((f, i) => tone({ type: 'triangle', f, at: i * 0.18, dur: 0.24, vol: 0.12 }));
      tone({ type: 'sine', f: 330, to: 300, at: 0.6, dur: 0.5, vol: 0.1 });
    },
    // the buddy's treat landing in your hand
    catch() { tone({ type: 'triangle', f: 880, to: 1320, dur: 0.12, vol: 0.08 }); },
  };
})();
