/* 100 Floors: the rules, with no Three.js in them.
   - Course: the platform generator for each mode (DOWN rows go down, UP rows go up). It checks every row it adds with
     the planner below and retries until every platform has a way on that isn't spiky.
   - stepDown / stepUp: the hero's physics, one fixed step at a time.
   - planDown / planUp: try simple inputs (walk this way, steer that way, switch at some moment) with the real physics
     and report where the hero lands. The title-screen autopilot and the fairness check both use them.
   - Run: one game, the rules around the physics: the scrolling view, the spiky ceiling, falling off the bottom,
     hearts, pickups, floors, milestones and UP-mode combos. The game draws a Run; check() and soak() run it headless.
   The game, the autopilot and `node tools/check.js` all run this same file. Exposes window.HFSim (or module.exports). */
(function () {
  'use strict';

  const W = 10, HALF = W / 2; // the shaft is 10 m wide
  const PW = 0.25; // half-width of the hero's feet when landing on (or walking off) a platform
  const PH = 1.6; // the hero's height: a 2 m kit person at 0.8
  const XLIM = HALF - 0.32; // how close the hero's middle gets to a wall
  const DT = 1 / 120; // one physics step, everywhere
  const MILESTONE = 25; // a celebration every 25 floors
  const MAX_TRIES = 14; // tries per row before the generator lays a full-width floor instead
  const MAX_HEARTS = 5;

  const MODES = {
    down: {
      ROW: 2.6, G: 26, FALL: 13, RUN: 5.5, CONV: 2.2, SPRING_V: 9.5, CRUMBLE_T: 0.5,
      // how fast the view sinks (m/s), from floor 0 to floor RAMP and beyond
      speed: { normal: [1.6, 2.8], easy: [1.2, 2.0] }, RAMP: 120,
      width: { normal: [2.5, 3.4], easy: [3.1, 4.1] },
      weights: {
        normal: { normal: 46, spring: 10, convL: 9, convR: 9, crumble: 12, spike: 14 },
        easy: { normal: 58, spring: 11, convL: 8, convR: 8, crumble: 9, spike: 6 },
      },
      extra: { normal: 0.18, easy: 0.35 }, // chance of a second platform in a row
      hearts: { normal: 3, easy: 5 },
      noSpikeBefore: { normal: 6, easy: 10 },
    },
    up: {
      ROW: 2.4, G: 30, FALL: 20, RUN: 7.5, ACC: 9, JUMP_V: 15, SPEED_BONUS: 2.5, BIG: 1.35, SPRING_V: 24, CONV_KICK: 3,
      // how fast the bottom of the view rises (m/s) once it starts, from floor 0 to floor RAMP and beyond
      rise: { normal: [0.5, 1.6], easy: [0.35, 1.0] }, RAMP: 100, RISE_AFTER: 4,
      width: { normal: [2.2, 3.2], easy: [2.8, 3.8] },
      // the main platform of a row (never spiky: spikes only come as a second platform)
      weights: {
        normal: { normal: 56, spring: 8, convL: 9, convR: 9, crumble: 18 },
        easy: { normal: 66, spring: 8, convL: 8, convR: 8, crumble: 10 },
      },
      extra: { normal: 0.4, easy: 0.45 },
      spikeExtra: { normal: 0.45, easy: 0.25 }, // how often that second platform is spiky (after noSpikeBefore)
      hearts: { normal: 3, easy: 5 },
      noSpikeBefore: { normal: 8, easy: 12 },
      COMBO_T: 3, // seconds to make the next multi-floor jump and keep a combo going
    },
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clampX = (x) => clamp(x, -XLIM, XLIM);
  const NONE = [];

  // A small seeded random generator (mulberry32), so a course can be replayed from its seed.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const TREAT_EMOJI = ['🍪', '🍓', '🍩', '🧁', '🍭', '🍬'];
  const isSpiky = (p) => p.type === 'spike' && !p.defused;

  // ---------------------------------------------------------------- the course

  class Course {
    // opts: seed, easy, broken (no checking at all: proves the fairness check can fail)
    constructor(mode, opts = {}) {
      this.mode = mode;
      this.M = MODES[mode];
      this.level = opts.easy ? 'easy' : 'normal';
      this.broken = !!opts.broken;
      this.seed = opts.seed !== undefined ? opts.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
      this.rand = rng(this.seed);
      this.rows = []; // rows[floor] = [platform, ...]
      this.low = 0; // rows below this floor have been forgotten
      this.top = -1; // highest floor generated so far
      this.nextId = 1;
      this.fallbacks = 0;
      this.ensure(4);
    }

    rowY(k) { return this.mode === 'down' ? -k * this.M.ROW : k * this.M.ROW; }
    row(k) { return (k >= this.low && k <= this.top && this.rows[k]) || NONE; }
    ensure(k) { while (this.top < k) this.addRow(); }
    // Forget rows below floor k (they're off screen behind the hero).
    prune(k) {
      while (this.low < k && this.low < this.top - 4) {
        this.rows[this.low] = undefined;
        this.low++;
      }
    }
    // Every platform still remembered, in floor order.
    list() {
      const out = [];
      for (let k = this.low; k <= this.top; k++) for (const p of this.row(k)) out.push(p);
      return out;
    }

    plat(k, x, w, type, extra) {
      return Object.assign({ id: this.nextId++, floor: k, x, y: this.rowY(k), w, type, item: null, ok: false, broken: false, defused: false }, extra);
    }

    pickType(k, safer) {
      const r = this.rand();
      if (safer || k <= 3) return 'normal';
      const wts = this.M.weights[this.level];
      let total = 0;
      for (const t in wts) if (this.allowed(t, k)) total += wts[t];
      let x = r * total;
      for (const t in wts) {
        if (!this.allowed(t, k)) continue;
        x -= wts[t];
        if (x <= 0) return t;
      }
      return 'normal';
    }
    allowed(t, k) {
      if (t === 'spike') return k > this.M.noSpikeBefore[this.level];
      if (k <= 6) return t === 'normal' || t === 'convL' || t === 'convR';
      return true;
    }

    width(k) {
      const [a, b] = this.M.width[this.level];
      return (a + this.rand() * (b - a)) * (1 - 0.12 * Math.min(1, k / 150)); // a little narrower the further you go
    }

    // Find a spot for a second platform in a row, at least `gap` away from the ones already there.
    placeExtra(row, w, gap) {
      for (let i = 0; i < 8; i++) {
        const x = clamp((this.rand() * 2 - 1) * HALF, -HALF + w / 2, HALF - w / 2);
        if (row.every((q) => Math.abs(q.x - x) >= (q.w + w) / 2 + gap)) return x;
      }
      return null;
    }

    addItems(k, row) {
      const r = this.rand;
      for (const p of row) {
        if (p.type === 'spike' || p.type === 'spring') continue;
        const heart = p.main && k % (this.mode === 'down' ? 13 : 12) === 6;
        if (heart || r() < 0.28) {
          p.item = {
            kind: heart ? 'heart' : 'treat',
            emoji: heart ? '❤️' : TREAT_EMOJI[Math.floor(r() * TREAT_EMOJI.length)],
            dx: (r() * 2 - 1) * Math.max(0, p.w / 2 - 0.5),
            taken: false,
          };
        }
      }
    }

    makeRow(k, attempt) {
      const r = this.rand, M = this.M, down = this.mode === 'down';
      if (k === 0) return down ? [this.plat(0, 0, 5.2, 'normal', { main: true })] : [this.plat(0, 0, W, 'normal', { main: true, ground: true })];
      if (attempt >= MAX_TRIES) {
        // Nothing random worked. UP: a full-width floor always does. DOWN: a wide ledge with room to drop off either
        // end (you can't walk off a full-width one), and spikes just above it go blunt.
        this.fallbacks++;
        if (!down) return [this.plat(k, 0, W, 'normal', { main: true, wide: true })];
        for (const q of this.row(k - 1)) if (q.type === 'spike') q.type = 'normal';
        return [this.plat(k, 0, 7, 'normal', { main: true, wide: true })];
      }
      const prev = this.row(k - 1);
      // aim near the platforms the hero can be standing on: the row before (DOWN: its non-spiky ones, or the row
      // before that if it was all spikes)
      let ref = prev;
      if (down) {
        ref = prev.filter((q) => q.type !== 'spike');
        if (!ref.length) ref = this.row(k - 2).filter((q) => q.type !== 'spike');
        if (!ref.length) ref = prev;
      }
      const mid = ref.reduce((a, q) => a + q.x, 0) / ref.length;
      const safer = attempt >= 6;
      if (k % MILESTONE === 0) {
        const w = down ? 6 : 7;
        const row = [this.plat(k, clamp(mid + (r() * 2 - 1) * 1.2, -HALF + w / 2, HALF - w / 2), w, 'normal', { main: true, wide: true, sign: true })];
        this.addItems(k, row);
        return row;
      }
      let type = this.pickType(k, safer);
      if (type === 'spike' && prev.every((q) => q.type === 'spike' || q.type === 'crumble')) type = 'normal';
      const w = this.width(k);
      const spread = safer ? 1.6 : down ? 4.2 : 3.6;
      // late tries look anywhere across the shaft
      const x = attempt >= 10 ? (r() * 2 - 1) * HALF : mid + (r() * 2 - 1) * spread;
      const row = [this.plat(k, clamp(x, -HALF + w / 2, HALF - w / 2), w, type, { main: true })];
      if (!safer && r() < M.extra[this.level]) {
        const w2 = this.width(k) * 0.9;
        const x2 = this.placeExtra(row, w2, 1.0);
        if (x2 !== null) {
          let t2 = this.pickType(k, false);
          if (down && t2 === 'spike') t2 = 'normal'; // DOWN: spikes are only ever the main platform
          if (!down) t2 = k > M.noSpikeBefore[this.level] && r() < M.spikeExtra[this.level] ? 'spike' : t2 === 'spring' ? 'normal' : t2;
          row.push(this.plat(k, x2, w2, t2));
        }
      }
      this.addItems(k, row);
      return row;
    }

    addRow() {
      const k = this.top + 1;
      for (let attempt = 0; ; attempt++) {
        const row = this.makeRow(k, attempt);
        this.rows[k] = row;
        this.top = k;
        if (k === 0 || this.broken || attempt >= MAX_TRIES) return;
        const marked = [];
        if (this.verify(k, marked)) return;
        for (const q of marked) q.ok = false; // that row didn't work: forget what it proved, try another
        this.top = k - 1;
      }
    }

    // After adding row k: every platform must have a way on that isn't spiky.
    // DOWN: within 2 rows below (rows k-1 and k-2 are checked; k-2 gets no more chances).
    // UP: above, with a plain bounce. Row k-1 is checked, and so is every lower platform whose bounce reaches row k,
    // because a new row up there can get in the way of a path that worked before (a spiky platform to fall onto).
    verify(k, marked) {
      if (this.mode === 'down') {
        for (let j = k - 2; j < k; j++) {
          for (const q of this.row(j)) {
            if (q.ok) continue;
            if (planDown(this, startOn(q), q, { first: true })) {
              q.ok = true;
              marked.push(q);
            } else if (j === k - 2) return false;
          }
        }
        return true;
      }
      const yk = this.rowY(k);
      for (let j = Math.max(this.low, k - 4); j < k; j++) {
        for (const q of this.row(j)) {
          if (j < k - 1 && apexUp(q) < yk - 0.1) continue;
          if (!upOk(this, q)) return false;
          if (!q.ok) {
            q.ok = true;
            marked.push(q);
          }
        }
      }
      return true;
    }
  }

  // ---------------------------------------------------------------- the hero's physics

  const hero = (x, y) => ({ x, y, vx: 0, vy: 0, on: null, onT: 0, airT: 0, ignore: null, lands: 0, lastLand: null });
  const copyHero = (h) => ({ x: h.x, y: h.y, vx: h.vx, vy: h.vy, on: h.on, onT: h.onT, airT: h.airT, ignore: h.ignore, lands: 0, lastLand: h.lastLand });

  // The first platform whose top the hero's feet crossed on the way down from y0 to h.y, or null.
  function landing(c, h, y0) {
    const R = c.M.ROW;
    if (c.mode === 'down') {
      const k0 = Math.max(c.low, Math.ceil(-y0 / R - 1e-6)), k1 = Math.min(c.top, Math.floor(-h.y / R + 1e-6));
      for (let k = k0; k <= k1; k++) {
        const p = hit(c.row(k), h, y0);
        if (p) return p;
      }
    } else {
      const k0 = Math.max(c.low, Math.ceil(h.y / R - 1e-6)), k1 = Math.min(c.top, Math.floor(y0 / R + 1e-6));
      for (let k = k1; k >= k0; k--) {
        const p = hit(c.row(k), h, y0);
        if (p) return p;
      }
    }
    return null;
  }
  function hit(row, h, y0) {
    for (const p of row) {
      if (p.broken || p === h.ignore) continue;
      if (p.y <= y0 + 1e-6 && p.y >= h.y - 1e-6 && Math.abs(h.x - p.x) <= p.w / 2 + PW) return p;
    }
    return null;
  }

  // DOWN: walk on platforms, fall between them. Conveyors carry you, springs bounce you, crumbling platforms give way.
  // Returns the platform landed on this step (or null). ev, if given, collects { type, p } events.
  function stepDown(h, c, move, dt, ev) {
    const M = MODES.down;
    if (h.on) {
      const p = h.on;
      h.onT += dt;
      if (p.broken || (p.type === 'crumble' && h.onT >= M.CRUMBLE_T)) {
        if (ev && !p.broken) ev.push({ type: 'break', p });
        h.on = null;
        h.ignore = p;
        h.vy = 0;
        h.airT = 0;
      } else {
        const belt = p.type === 'convL' ? -M.CONV : p.type === 'convR' ? M.CONV : 0;
        h.vx = move * M.RUN + belt;
        h.x = clampX(h.x + h.vx * dt);
        h.y = p.y;
        if (Math.abs(h.x - p.x) <= p.w / 2 + PW) return null;
        h.on = null; // walked (or was carried) off the edge
        h.vy = 0;
        h.airT = 0;
      }
    }
    h.vx = move * M.RUN;
    h.vy = Math.max(h.vy - M.G * dt, -M.FALL);
    const y0 = h.y;
    h.x = clampX(h.x + h.vx * dt);
    h.y += h.vy * dt;
    h.airT += dt;
    if (h.vy > 0) return null;
    const p = landing(c, h, y0);
    if (!p) return null;
    h.y = p.y;
    h.vy = 0;
    h.ignore = null;
    h.airT = 0;
    h.lands++;
    h.lastLand = p;
    if (p.type === 'spring') {
      h.vy = M.SPRING_V;
      if (ev) ev.push({ type: 'spring', p });
    } else {
      h.on = p;
      h.onT = 0;
      if (ev) ev.push({ type: 'land', p });
    }
    return p;
  }

  // UP: always in the air, bouncing off every platform you land on (one-way: you jump up through them).
  // Running fast bounces a little higher; holding jump as you land bounces much higher (a BIG jump).
  function stepUp(h, c, move, jump, dt, ev) {
    const M = MODES.up;
    h.vx += (move * M.RUN - h.vx) * Math.min(1, M.ACC * dt);
    h.vy = Math.max(h.vy - M.G * dt, -M.FALL);
    const y0 = h.y;
    h.x += h.vx * dt;
    if (h.x < -XLIM) {
      h.x = -XLIM;
      if (h.vx < 0) h.vx = -h.vx * 0.3;
    } else if (h.x > XLIM) {
      h.x = XLIM;
      if (h.vx > 0) h.vx = -h.vx * 0.3;
    }
    h.y += h.vy * dt;
    h.airT += dt;
    if (h.vy > 0) return null;
    const p = landing(c, h, y0);
    if (!p) return null;
    h.y = p.y;
    h.airT = 0;
    h.lands++;
    h.lastLand = p;
    let kind = 'bounce';
    if (p.type === 'spring') {
      h.vy = M.SPRING_V;
      kind = 'spring';
    } else {
      h.vy = M.JUMP_V + M.SPEED_BONUS * Math.min(1, Math.abs(h.vx) / M.RUN);
      if (isSpiky(p)) kind = 'spike';
      else if (jump) {
        h.vy *= M.BIG;
        kind = 'big';
      }
    }
    if (p.type === 'convL') h.vx -= M.CONV_KICK;
    else if (p.type === 'convR') h.vx += M.CONV_KICK;
    if (ev) {
      ev.push({ type: kind, p });
      if (p.type === 'crumble') ev.push({ type: 'break', p });
    }
    return p;
  }

  // ---------------------------------------------------------------- planning (the autopilot and the fairness check)

  // DOWN plans: walk one way while standing, then steer a1 in the air, switching to a2 after `sw` seconds of air time.
  const SWITCH_DOWN = [0.1, 0.25, 0.45];
  const DOWN_PLANS = [];
  for (const walk of [-1, 1, 0]) {
    for (const a1 of [walk || -1, 0, -(walk || -1)]) {
      DOWN_PLANS.push({ walk, a1, sw: 99, a2: a1 });
      for (const sw of SWITCH_DOWN) for (const a2 of [-1, 0, 1]) if (a2 !== a1) DOWN_PLANS.push({ walk, a1, sw, a2 });
    }
  }
  const SWITCH_UP = [0.15, 0.35, 0.6];
  const UP_PLANS = [];
  for (const a1 of [0, -1, 1]) {
    UP_PLANS.push({ a1, sw: 99, a2: a1 });
    for (const sw of SWITCH_UP) for (const a2 of [-1, 0, 1]) if (a2 !== a1) UP_PLANS.push({ a1, sw, a2 });
  }

  // A hero just about to land on q (for planning from a platform).
  function startOn(q) {
    const h = hero(q.x, q.y + 0.001);
    h.vy = -0.01;
    return h;
  }

  // DOWN: from state h0 (leaving platform `from`, or null), find inputs that land on a non-spiky platform below,
  // within opts.rows rows (default 2). Returns { plan, p, t } (the best by default, the first with opts.first) or null.
  function planDown(c, h0, from, opts = {}) {
    const M = MODES.down;
    const y0 = from ? from.y : h0.y;
    const limit = y0 - (opts.rows || 2) * M.ROW - 0.5;
    // standing still on solid ground goes nowhere, so don't bother trying it
    const solid = from && from.type !== 'crumble' && from.type !== 'spring' && (h0.on === from || (!h0.on && Math.abs(h0.y - from.y) < 0.01));
    let best = null;
    for (const plan of DOWN_PLANS) {
      if (plan.walk === 0 && solid) continue;
      const h = copyHero(h0);
      let res = null;
      for (let t = 0; t < 4; t += DT) {
        const move = h.on ? plan.walk : h.airT < plan.sw ? plan.a1 : plan.a2;
        const p = stepDown(h, c, move, DT, null);
        if (p) {
          if (p === from || p.y >= y0 - 1e-6) {
            if (p !== from && isSpiky(p)) break;
            continue; // back where we started (or a spring): keep going
          }
          if (isSpiky(p)) break;
          res = { plan, p, t };
          break;
        }
        if (h.y < limit) break;
      }
      if (!res) continue;
      if (opts.first) return res;
      if (!best || scoreDown(res, y0) < scoreDown(best, y0)) best = res;
    }
    return best;
  }
  // lower is better: the nearest solid platform, quickly
  const scoreDown = (r, y0) => (y0 - r.p.y) + r.t + (r.p.type === 'crumble' ? 6 : 0) + (r.p.type === 'spring' ? 3 : 0) + (r.p.item && r.p.item.kind === 'heart' && !r.p.item.taken ? -2 : 0);

  // UP: from state h0 (just bounced off `from`), find air steering that lands on a non-spiky platform. With
  // opts.higher only landings above `from` count. Returns { plan, p, t }: the first with opts.first, else the highest.
  function planUp(c, h0, from, opts = {}) {
    const M = MODES.up;
    const fromY = from ? from.y : h0.y;
    let best = null;
    for (const plan of UP_PLANS) {
      const h = copyHero(h0);
      let res = null;
      for (let t = 0; t < 3; t += DT) {
        const move = h.airT < plan.sw ? plan.a1 : plan.a2;
        const p = stepUp(h, c, move, false, DT, null);
        if (p) {
          if (!isSpiky(p) && (!opts.higher || p.y > fromY + 0.01)) res = { plan, p, t };
          break;
        }
        if (h.y < fromY - 2 * M.ROW) break;
      }
      if (!res) continue;
      if (opts.first) return res;
      if (!best || res.p.y > best.p.y + 0.01 || (Math.abs(res.p.y - best.p.y) < 0.01 && scoreUp(res) < scoreUp(best))) best = res;
    }
    return best;
  }
  const scoreUp = (r) => r.t + (r.p.type === 'crumble' ? 1 : 0) - (r.p.item && !r.p.item.taken ? 0.5 : 0);

  // The bounce off platform q at x, moving at vx (for planning from a platform).
  function bounceOff(q, x, vx) {
    const M = MODES.up;
    const h = hero(clampX(x), q.y);
    h.vx = vx;
    h.vy = q.type === 'spring' ? M.SPRING_V : M.JUMP_V + M.SPEED_BONUS * Math.min(1, Math.abs(vx) / M.RUN);
    return h;
  }
  // UP: wherever you bounce off q (either end or the middle) and however you were moving, a non-spiky platform above
  // is in reach of a plain bounce.
  function upStarts(q) {
    const M = MODES.up, out = [];
    for (const x of [q.x - q.w / 2 + 0.05, q.x, q.x + q.w / 2 - 0.05]) for (const vx of [0, -M.RUN, M.RUN]) out.push([x, vx]);
    return out;
  }
  // The highest a bounce off q can go.
  function apexUp(q) {
    const M = MODES.up, v = q.type === 'spring' ? M.SPRING_V : M.JUMP_V + M.SPEED_BONUS;
    return q.y + (v * v) / (2 * M.G);
  }
  function upOk(c, q) {
    for (const [x, vx] of upStarts(q)) if (!planUp(c, bounceOff(q, x, vx), q, { first: true, higher: true })) return false;
    return true;
  }

  // ---------------------------------------------------------------- one game

  class Run {
    // opts: seed, easy, attract (the title screen: nothing costs a heart), broken (unchecked course), viewH, band
    constructor(mode, opts = {}) {
      this.mode = mode;
      this.M = MODES[mode];
      this.level = opts.easy ? 'easy' : 'normal';
      this.course = new Course(mode, opts);
      this.attract = !!opts.attract;
      const start = this.course.row(0)[0];
      this.hero = Object.assign(hero(0, start.y), { invT: 0, carryT: 0, carryDur: 0, carryFrom: { x: 0, y: 0 }, lastFloor: 0, dir: 1 });
      if (mode === 'down') this.hero.on = start;
      this.hearts = this.M.hearts[this.level];
      this.maxHearts = MAX_HEARTS;
      this.floor = 0;
      this.treats = 0;
      this.bonus = 0; // UP combo stars
      this.bestCombo = 0;
      this.combo = { n: 0, floors: 0, t: 0 };
      this.t = 0;
      this.playT = 0; // time since the start (the view starts moving)
      this.started = false;
      this.over = false;
      this.guard = false; // the buddy is here: nothing costs a heart
      this.events = [];
      this.stepEv = [];
      this.lost = { spike: 0, ceiling: 0, fall: 0 };
      this.saves = 0;
      this.view = { h: 17, band: 1.6 };
      this.cam = 0; // bottom of the view, in world metres
      this.setView(opts.viewH || 17, opts.band || 1.6, true);
    }

    // The game tells the run how much of the shaft the screen shows (h) and how tall the spiky ceiling band is.
    setView(h, band, init) {
      if (this.mode === 'down') {
        const top = init ? this.hero.y + PH + 3.6 + band : this.cam + this.view.h; // keep the ceiling where it is
        this.view.h = h;
        this.view.band = band;
        this.cam = top - h;
      } else {
        this.view.h = h;
        this.view.band = band;
        if (init) this.cam = -1.2;
      }
    }

    ceilY() { return this.cam + this.view.h - this.view.band; }
    speed() {
      const [a, b] = this.M.speed[this.level];
      return a + (b - a) * Math.min(1, this.floor / this.M.RAMP);
    }
    rise() {
      const [a, b] = this.M.rise[this.level];
      return a + (b - a) * Math.min(1, this.floor / this.M.RAMP);
    }
    // Where a pickup floats, in world metres.
    itemPos(p) { return { x: p.x + p.item.dx, y: p.y + (this.mode === 'down' ? 0.75 : 1.25) }; }

    tick(dt, inp) {
      if (this.over) return;
      const h = this.hero, M = this.M, c = this.course;
      this.t += dt;
      if (this.started) this.playT += dt;
      // the view
      if (this.mode === 'down') {
        if (this.started) {
          let v = this.speed() * Math.min(1, 0.35 + this.playT / 4); // eases in over the first seconds
          // catch up a little when the hero stands low on the screen, so running ahead isn't punished
          const low = this.cam + this.view.h * 0.3 - h.y;
          if (low > 0 && (h.on || h.carryT > 0)) v += Math.min(4, low * 1.5);
          this.cam -= v * dt;
        }
        c.ensure(Math.ceil(-(this.cam - 8) / M.ROW));
        c.prune(Math.floor(-(this.cam + this.view.h + 6) / M.ROW));
      } else {
        if (this.started && this.playT > M.RISE_AFTER) this.cam += this.rise() * dt;
        const want = h.y - this.view.h * 0.55; // follow the hero up, never down
        if (want > this.cam) this.cam += (want - this.cam) * Math.min(1, 8 * dt);
        c.ensure(Math.ceil((this.cam + this.view.h + 8) / M.ROW));
        c.prune(Math.floor((this.cam - 6) / M.ROW));
      }
      if (!this.started) return;
      h.invT = Math.max(0, h.invT - dt);
      if (h.carryT > 0) {
        h.carryT -= dt;
        if (h.carryT <= 0) {
          h.carryT = 0;
          if (this.mode === 'up') h.vy = M.JUMP_V;
        }
      } else {
        const move = clamp(inp ? inp.move : 0, -1, 1);
        if (Math.abs(move) > 0.15) h.dir = move > 0 ? 1 : -1;
        if (this.mode === 'down') stepDown(h, c, move, dt, this.stepEv);
        else stepUp(h, c, move, !!(inp && inp.jump), dt, this.stepEv);
        for (const e of this.stepEv) this.onStep(e);
        this.stepEv.length = 0;
        if (this.over) return;
        if (this.mode === 'down' && h.y + PH > this.ceilY()) this.bumpCeiling();
        if (h.y + PH < this.cam) this.fell();
        if (this.over) return;
        this.pickups();
      }
      if (this.combo.n > 0) {
        this.combo.t -= dt;
        if (this.combo.t <= 0) this.endCombo();
      }
    }

    onStep(e) {
      const p = e.p;
      if (e.type === 'break') {
        p.broken = true;
        this.events.push(e);
        return;
      }
      this.events.push(e);
      this.reach(p);
      if (this.mode === 'up') this.comboStep(p);
      if (isSpiky(p)) this.hurt('spike', p);
    }

    // A new deepest (or highest) floor.
    reach(p) {
      if (p.floor <= this.floor) return;
      const before = this.floor;
      this.floor = p.floor;
      this.events.push({ type: 'floor', floor: p.floor });
      if (Math.floor(p.floor / MILESTONE) > Math.floor(before / MILESTONE)) this.events.push({ type: 'milestone', floor: Math.floor(p.floor / MILESTONE) * MILESTONE });
    }

    // UP: two floors or more in one jump is a multi-floor jump; keep doing them (each within COMBO_T s) for a combo.
    comboStep(p) {
      const h = this.hero, jump = p.floor - h.lastFloor;
      h.lastFloor = p.floor;
      if (jump >= 2) {
        const cb = this.combo;
        cb.n++;
        cb.floors += jump;
        cb.t = this.M.COMBO_T;
        this.events.push({ type: 'combo', n: cb.n, jump, floors: cb.floors });
      } else this.endCombo();
    }
    endCombo() {
      const cb = this.combo;
      if (cb.n >= 2) {
        this.bonus += cb.floors;
        this.bestCombo = Math.max(this.bestCombo, cb.floors);
        this.events.push({ type: 'comboEnd', n: cb.n, floors: cb.floors });
      }
      cb.n = 0;
      cb.floors = 0;
      cb.t = 0;
    }

    // Spikes and the ceiling: a heart, unless the buddy is here (or it's the title screen).
    hurt(kind, p) {
      const h = this.hero;
      if (h.invT > 0 || h.carryT > 0) return false;
      if (this.guard || this.attract) {
        h.invT = 0.9;
        if (p && p.type === 'spike') p.defused = true;
        if (this.guard) this.saves++;
        this.events.push({ type: 'saved', kind, p, quiet: !this.guard });
        return false;
      }
      this.hearts--;
      this.lost[kind]++;
      h.invT = 1.6;
      this.events.push({ type: 'hurt', kind, p, hearts: this.hearts });
      if (this.hearts <= 0) {
        this.over = true;
        this.events.push({ type: 'over' });
      }
      return true;
    }

    // DOWN: the ceiling pushes you down through the platform you're on.
    bumpCeiling() {
      const h = this.hero;
      h.y = this.ceilY() - PH - 0.01;
      if (h.on) {
        h.ignore = h.on;
        h.on = null;
      }
      h.vy = Math.min(h.vy, -2);
      h.airT = 0;
      this.events.push({ type: 'ceiling' });
      this.hurt('ceiling');
    }

    // Fell off the bottom: a heart, then back onto a safe platform (the buddy carries you there instead).
    fell() {
      const h = this.hero;
      const saved = this.guard || this.attract;
      if (saved) {
        if (this.guard) this.saves++;
        this.events.push({ type: 'saved', kind: 'fall', quiet: !this.guard });
      } else {
        this.hearts--;
        this.lost.fall++;
        this.events.push({ type: 'hurt', kind: 'fall', hearts: this.hearts });
        if (this.hearts <= 0) {
          this.over = true;
          this.events.push({ type: 'over' });
          return;
        }
      }
      const dest = this.safeSpot();
      h.carryFrom = { x: h.x, y: h.y };
      h.carryDur = h.carryT = saved && !this.attract ? 1.0 : 0.7;
      h.x = dest ? clampX(dest.x) : 0;
      h.y = dest ? dest.y : this.cam + this.view.h * 0.5;
      h.vx = h.vy = 0;
      h.on = this.mode === 'down' ? dest : null;
      h.onT = 0;
      h.airT = 0;
      h.ignore = null;
      h.invT = h.carryDur + 1.4;
      if (dest) {
        h.lastLand = dest;
        h.lands++;
        if (this.mode === 'up') h.lastFloor = dest.floor;
      }
      this.endCombo();
      this.events.push({ type: 'respawn', p: dest, from: h.carryFrom, saved });
    }

    // A plain, solid platform in a comfortable spot on screen.
    safeSpot() {
      const c = this.course, h = this.view.h;
      const lo = this.mode === 'down' ? this.cam + h * 0.25 : this.cam + 1.5;
      const hi = this.mode === 'down' ? this.ceilY() - PH - 3 : this.cam + h * 0.6;
      const aim = this.mode === 'down' ? this.cam + h * 0.42 : this.cam + h * 0.3;
      let best = null, bestD = 1e9, any = null, anyD = 1e9;
      for (const p of c.list()) {
        if (p.broken || isSpiky(p)) continue;
        const d = Math.abs(p.y - aim);
        if (p.y > this.cam + 0.5 && p.y < this.cam + h - 1 && d < anyD) {
          any = p;
          anyD = d;
        }
        if (p.type === 'crumble' || p.type === 'spring' || p.y < lo || p.y > hi) continue;
        if (d < bestD) {
          best = p;
          bestD = d;
        }
      }
      return best || any;
    }

    pickups() {
      const h = this.hero, c = this.course;
      const cx = h.x, cy = h.y + PH * 0.5;
      const k0 = Math.round((this.mode === 'down' ? -h.y : h.y) / this.M.ROW);
      for (let k = k0 - 1; k <= k0 + 1; k++) {
        for (const p of c.row(k)) {
          if (!p.item || p.item.taken) continue;
          const q = this.itemPos(p);
          const dx = q.x - cx, dy = q.y - cy;
          if (dx * dx + dy * dy > 0.9 * 0.9) continue;
          p.item.taken = true;
          if (p.item.kind === 'heart') this.hearts = Math.min(this.maxHearts, this.hearts + 1);
          else this.treats++;
          this.events.push({ type: 'pickup', p, kind: p.item.kind, emoji: p.item.emoji, x: q.x, y: q.y });
        }
      }
    }
  }

  // ---------------------------------------------------------------- the autopilot (title screen, soak test)

  class Bot {
    constructor() {
      this.plan = null;
      this.lands = -1;
      this.out = { move: 0, jump: false };
    }
    input(run) {
      const h = run.hero, out = this.out;
      out.move = 0;
      out.jump = false;
      if (h.carryT > 0 || run.over) {
        this.lands = -1;
        return out;
      }
      if (h.lands !== this.lands) {
        // landed somewhere new (or bounced): think again
        this.lands = h.lands;
        this.plan = null;
        this.waiting = run.mode === 'down' && !!h.on;
      }
      return run.mode === 'down' ? this.down(run, h, out) : this.up(run, h, out);
    }
    down(run, h, out) {
      const M = MODES.down;
      if (h.on && this.waiting) {
        // wait while the platform is low on the screen and the ceiling is far, holding still against a conveyor
        const p = h.on;
        const room = run.ceilY() - (h.y + PH);
        const height = (h.y - run.cam) / run.view.h;
        if (p.type !== 'crumble' && room > 3.4 && height < 0.5) {
          out.move = p.type === 'convL' ? M.CONV / M.RUN : p.type === 'convR' ? -M.CONV / M.RUN : 0;
          return out;
        }
        this.waiting = false;
      }
      if (!this.plan) {
        const res = planDown(run.course, h, h.on || h.lastLand, { rows: 3 });
        this.plan = res ? res.plan : { walk: h.x < 0 ? 1 : -1, a1: 0, sw: 99, a2: 0 };
      }
      out.move = h.on ? this.plan.walk : h.airT < this.plan.sw ? this.plan.a1 : this.plan.a2;
      return out;
    }
    up(run, h, out) {
      if (!this.plan) {
        const res = planUp(run.course, h, h.lastLand, {});
        this.plan = res ? res.plan : { a1: 0, sw: 99, a2: 0 };
      }
      out.move = h.airT < this.plan.sw ? this.plan.a1 : this.plan.a2;
      return out;
    }
  }

  // ---------------------------------------------------------------- checks

  // Fairness check: every platform of many courses has a way on that isn't spiky, tested with the real physics.
  // DOWN: from standing on it, a non-spiky platform within 2 rows below. UP: from bouncing off either end or the
  // middle, still or at full speed either way, a non-spiky platform above.
  function check(opts = {}) {
    const mode = opts.mode || 'down', seeds = opts.seeds || 20, floors = opts.floors || 200;
    let platforms = 0, fallbacks = 0;
    const failures = [];
    for (let i = 0; i < seeds; i++) {
      const seed = (opts.seed0 || 1) + i;
      const c = new Course(mode, { seed, easy: opts.easy, broken: opts.broken });
      c.ensure(floors + 3);
      fallbacks += c.fallbacks;
      for (let k = 0; k <= floors; k++) {
        for (const q of c.row(k)) {
          platforms++;
          let ok;
          if (mode === 'down') ok = !!planDown(c, startOn(q), q, { first: true });
          else ok = upOk(c, q);
          if (!ok) failures.push({ seed, floor: k, type: q.type, x: +q.x.toFixed(2), w: +q.w.toFixed(2) });
        }
      }
    }
    return { mode, easy: !!opts.easy, broken: !!opts.broken, seeds, floors, platforms, fallbacks, failures: failures.length, examples: failures.slice(0, 5) };
  }

  // Soak: whole games with the autopilot (or nobody, opts.bot = false) under the real rules: the moving view, the
  // ceiling, the bottom, spikes. Reports hearts lost and how far each run got.
  function soak(opts = {}) {
    const mode = opts.mode || 'down', runs = opts.runs || 5, floors = opts.floors || 150, maxT = opts.maxT || 600;
    const out = [];
    for (let i = 0; i < runs; i++) {
      const seed = (opts.seed0 || 1) + i;
      const run = new Run(mode, { seed, easy: opts.easy, broken: opts.broken });
      run.started = true;
      const bot = new Bot();
      const idle = { move: 0, jump: false };
      while (!run.over && run.floor < floors && run.t < maxT) {
        run.tick(DT, opts.bot === false ? idle : bot.input(run));
        run.events.length = 0;
      }
      out.push({ seed, floor: run.floor, t: +run.t.toFixed(1), hearts: run.hearts, over: run.over, lost: Object.assign({}, run.lost), fallbacks: run.course.fallbacks });
    }
    const lost = out.reduce((a, r) => a + r.lost.spike + r.lost.ceiling + r.lost.fall, 0);
    return { mode, easy: !!opts.easy, bot: opts.bot !== false, runs, floors, heartsLost: lost, gameOvers: out.filter((r) => r.over).length, runsOut: out };
  }

  const api = { W, HALF, PW, PH, XLIM, DT, MILESTONE, MAX_HEARTS, MODES, Course, Run, Bot, stepDown, stepUp, planDown, planUp, startOn, bounceOff, upOk, check, soak, isSpiky, rng };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.HFSim = api;
})();
