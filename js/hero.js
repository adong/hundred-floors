/* 100 Floors: a kid on screen. Wraps a Kit person (Kit.people.build) side-on, turned three-quarters toward the
   camera so you see his face, with this game's poses: stand, run, in the air (arms up as he drops), a head-over-heels
   flip for BIG jumps, OUCH, being carried, floating under a balloon (the buddy), and the celebration loop of the roster
   signature moves: Teddy's Mike Tyson-style boxing (💥 on each punch) and his basketball jump shot (a hoop pops up and
   the 🏀 drops through it), Tommy's Y pose with peace fingers (✌️), and a wave for everyone else.

   Hierarchy: root (feet) > flip (spins round the body's middle) > turn (yaw) > fit (scale) > person.root
   Exposes window.HFHero. */
(function () {
  'use strict';
  const T = THREE, Kit = window.Kit, people = Kit.people, gfx = Kit.gfx;

  const SCALE = 0.8; // a 2 m kit person is 1.6 m here (HFSim.PH)
  const MID = 1.0; // the body's middle in the person's own units (the flip pivot)
  const RIGHT = -Math.PI / 2 - 0.5; // facing +x, turned toward the camera so the face shows
  const LEFT = Math.PI / 2 + 0.5;
  const FACE = Math.PI; // facing the camera
  const POSE_YAW = { boxing: Math.PI - 0.75, jumpshot: null, peace: Math.PI, wave: Math.PI - 0.3 }; // null: side-on toward the hoop
  const SEG_T = { boxing: 2.2, jumpshot: 2.2, peace: 2.0, wave: 1.8 };
  const RELEASE = 0.85; // seconds into the jump shot when the ball leaves his hands
  const damp = (k, dt) => 1 - Math.exp(-k * dt);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // Kit poses like 'wave' and 'peace' stride while they pose (they were made for running buddies). Standing still,
  // the legs settle instead.
  const STRIDING = { wave: 1, peace: 1, give: 1 };
  function standPose(p, ph, mode, k) {
    people.pose(p, ph, mode, k);
    if (STRIDING[mode]) {
      p.legL.rotation.x += (0 - p.legL.rotation.x) * Math.min(1, k * 2);
      p.legR.rotation.x += (0 - p.legR.rotation.x) * Math.min(1, k * 2);
      p.hips.position.y = p.hipY;
    }
  }
  // Ease a few limbs toward exact angles (on top of a kit pose).
  function drive(p, o, k) {
    const to = (obj, prop, v) => { if (v !== undefined) obj[prop] += (v - obj[prop]) * k; };
    to(p.armL.rotation, 'x', o.la);
    to(p.armR.rotation, 'x', o.ra);
    to(p.armL.rotation, 'z', o.laz);
    to(p.armR.rotation, 'z', o.raz);
    to(p.legL.rotation, 'x', o.ll);
    to(p.legR.rotation, 'x', o.rl);
    to(p.hips.rotation, 'x', o.lean);
    to(p.head.rotation, 'x', o.head);
  }

  // The celebration loop for a character: which signature moves, in order.
  function moves(entry) {
    return entry.signature && entry.signature.length ? entry.signature.slice() : ['wave'];
  }
  function segment(seq, time) {
    const total = seq.reduce((a, m) => a + (SEG_T[m] || 2), 0);
    let t = time % total;
    for (const m of seq) {
      const d = SEG_T[m] || 2;
      if (t < d) return { mode: m, t, i: Math.floor(time / total) };
      t -= d;
    }
    return { mode: seq[0], t: 0, i: 0 };
  }

  // A balloon on a string, tied to the buddy's back (his hands stay free for his signature move).
  function balloon(color, height) {
    const g = new T.Group();
    const m = new T.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.05 });
    const ball = new T.Mesh(new T.SphereGeometry(0.55, 20, 16), m);
    ball.scale.set(1, 1.18, 1);
    ball.position.y = height + 0.62;
    ball.castShadow = true;
    g.add(ball);
    const shine = new T.Mesh(new T.SphereGeometry(0.12, 10, 8), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }));
    shine.position.set(-0.2, height + 0.85, 0.42);
    g.add(shine);
    const knot = new T.Mesh(new T.ConeGeometry(0.09, 0.14, 8), m);
    knot.position.y = height - 0.02;
    g.add(knot);
    const string = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 1, 4), new T.MeshBasicMaterial({ color: '#f4f4f4' }));
    g.add(string);
    return { group: g, ball, string, top: height + 1.3 };
  }

  // opts: scale (default SCALE), balloon (colour: he floats under a balloon), scene (for the 🏀 and emoji effects)
  function build(entry, opts = {}) {
    const scale = opts.scale || SCALE;
    const root = new T.Group();
    const flip = new T.Group();
    const turn = new T.Group();
    const fit = new T.Group();
    root.add(flip);
    flip.add(turn);
    turn.add(fit);
    flip.position.y = MID * scale;
    fit.position.y = -MID * scale;
    fit.scale.setScalar(scale);
    const p = people.build(entry.look);
    fit.add(p.root);
    p.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const height = 2.15 * scale;

    let bal = null;
    if (opts.balloon) {
      bal = balloon(opts.balloon, height + 0.5);
      root.add(bal.group);
    }

    const seq = moves(entry);
    const st = { yaw: RIGHT, phase: 0, t: 0, modeT: 0, mode: '', flipT: -1, flipDir: 1, ouchT: 0, hop: 0, ballT: -1, shot: false, lastBeat: -1, sparkT: 0, cele: null };
    turn.rotation.y = st.yaw;

    // the treat in his hand
    const treat = new T.Sprite(new T.SpriteMaterial({ depthWrite: false }));
    treat.visible = false;
    treat.scale.setScalar(0.55 / scale);
    p.armR.add(treat);
    treat.position.set(0.12, -0.82, -0.22);
    let holdT = 0;

    // Teddy's basketball
    const ball = new T.Sprite(new T.SpriteMaterial({ map: gfx.emojiTexture('🏀'), depthWrite: false }));
    ball.scale.setScalar(0.42);
    ball.visible = false;
    if (opts.scene) opts.scene.add(ball);
    const ballFrom = new T.Vector3(), ballTo = new T.Vector3(), hA = new T.Vector3(), hB = new T.Vector3();

    const fx = () => window.HFWorld && window.HFWorld.fx;

    function updateBall(t, dt) {
      const W = window.HFWorld;
      if (t < 0) {
        if (st.ballT >= 0 || ball.visible) {
          ball.visible = false;
          st.ballT = -1;
          W.hoop.hide();
        }
        return;
      }
      if (t < RELEASE) {
        // held up between the hands
        root.updateMatrixWorld(true);
        people.handWorld(p, -1, hA);
        people.handWorld(p, 1, hB);
        ball.position.copy(hA).add(hB).multiplyScalar(0.5);
        ball.position.y += 0.15;
        ball.visible = true;
        st.shot = false;
        if (t < 0.1 && st.ballT < 0) {
          // the hoop pops up beside him, on the side he faces
          const side = st.dir || 1;
          W.hoop.show(root.position.x + side * 2.3 * (scale / SCALE), root.position.y + 3.4 * (scale / SCALE), 0.4);
          st.ballT = 0;
        }
        return;
      }
      if (!st.shot) {
        st.shot = true;
        st.ballT = 0;
        ballFrom.copy(ball.position);
        W.hoop.rim(ballTo);
        try { Kit.sound.swish(); } catch (e) { /* sound is optional */ }
      }
      st.ballT += dt;
      const k = st.ballT / 0.55;
      if (k <= 1) {
        ball.position.lerpVectors(ballFrom, ballTo, k);
        ball.position.y += Math.sin(k * Math.PI) * 1.3 + 0.2 * (1 - k);
      } else {
        // through the net and down
        ball.position.set(ballTo.x, ballTo.y - (k - 1) * 0.55 * 2.5, ballTo.z);
        if (!st.swished) {
          st.swished = true;
          const f = fx();
          if (f) f.pow('SWISH!', ballTo.x, ballTo.y + 0.6, 1.1);
        }
      }
      ball.material.rotation -= dt * 9;
      if (k > 2.2) ball.visible = false;
    }

    const api = {
      entry, root, person: p, scale, height,
      get balloon() { return bal; },
      get move() { return st.cele ? st.cele.mode : null; },
      // A head-over-heels flip (UP's BIG jumps).
      flip(dir) {
        st.flipT = 0;
        st.flipDir = dir || 1;
      },
      ouch() { st.ouchT = 0.45; },
      hold(emoji, sec = 8) {
        treat.material.map = gfx.emojiTexture(emoji);
        treat.material.needsUpdate = true;
        treat.visible = true;
        holdT = sec;
      },
      get holding() { return holdT > 0; },
      handWorld(out) {
        root.updateMatrixWorld(true);
        return people.handWorld(p, 1, out);
      },
      // s: { mode, dir, speed, vy, seq (celebration moves), face }
      // modes: stand, run, air, carried, float, give, celebrate, wave, hurt
      update(dt, s) {
        st.t += dt;
        if (s.mode !== st.mode) {
          st.mode = s.mode;
          st.modeT = 0;
          st.swished = false;
        } else st.modeT += dt;
        st.dir = s.dir || st.dir || 1;
        const k = damp(16, dt);
        let yawWant = s.face ? FACE : st.dir > 0 ? RIGHT : LEFT;
        st.hop = 0;
        st.cele = null;
        let jt = -1;
        st.ouchT = Math.max(0, st.ouchT - dt);

        if (s.mode === 'celebrate' || s.mode === 'float-celebrate') {
          const sq = s.seq || seq;
          const c = (st.cele = segment(sq, st.modeT));
          const y = POSE_YAW[c.mode];
          yawWant = y === null ? (st.dir > 0 ? -Math.PI / 2 - 0.35 : Math.PI / 2 + 0.35) : y !== undefined ? y : FACE;
          if (s.mode === 'celebrate') standPose(p, c.mode === 'boxing' ? st.modeT * 6 : st.modeT * 6, c.mode, damp(12, dt));
          else {
            standPose(p, c.mode === 'boxing' ? st.modeT * 6 : st.modeT * 6, c.mode, damp(12, dt));
            drive(p, { ll: 0.3 + Math.sin(st.t * 3) * 0.12, rl: 0.1 - Math.sin(st.t * 3) * 0.12 }, k);
          }
          if (c.mode === 'jumpshot') {
            jt = c.t;
            if (s.mode === 'celebrate') st.hop = c.t > 0.55 && c.t < 1.25 ? Math.sin((Math.PI * (c.t - 0.55)) / 0.7) * 0.75 : 0;
          } else if (c.mode === 'boxing') {
            st.hop = s.mode === 'celebrate' ? Math.abs(Math.sin(st.modeT * 7)) * 0.05 : 0;
            // a 💥 on every jab and straight
            const beat = Math.floor(((st.modeT * 6) / (Math.PI * 2)) * 4);
            if (beat !== st.lastBeat) {
              st.lastBeat = beat;
              if (beat % 2 === 0 && fx()) {
                root.updateMatrixWorld(true);
                people.handWorld(p, beat % 4 === 0 ? -1 : 1, hA);
                fx().emoji('💥', hA.x + st.dir * 0.2, hA.y, { size: 0.55 * (scale / SCALE), vy: 0.3, life: 0.35 });
                try { Kit.sound.punch(); } catch (e) { /* optional */ }
              }
            }
          } else {
            if (s.mode === 'celebrate') st.hop = Math.abs(Math.sin(st.modeT * 5.5)) * 0.3; // little happy hops
            st.sparkT -= dt;
            if (st.sparkT <= 0 && fx()) {
              st.sparkT = 0.35;
              const e = c.mode === 'peace' ? gfx.pick(['✌️', '⭐', '✌️']) : gfx.pick(['👋', '⭐']);
              fx().emoji(e, root.position.x + (Math.random() - 0.5) * 1.2, root.position.y + height + 0.2, { size: 0.5, vy: 1.4, life: 1.0 });
            }
          }
        } else if (s.mode === 'run') {
          st.phase += dt * (3 + (s.speed || 0) * 1.8);
          people.pose(p, st.phase, 'run', k);
        } else if (s.mode === 'air') {
          st.phase += dt * 8;
          people.pose(p, st.phase, 'jump', k);
          if ((s.vy || 0) < 1) {
            // dropping: arms up and waving, legs together
            drive(p, { la: 2.6 + Math.sin(st.phase) * 0.25, ra: 2.6 - Math.sin(st.phase) * 0.25, laz: -0.45, raz: 0.45, ll: 0.35, rl: 0.05, lean: 0, head: -0.15 }, k);
          }
        } else if (s.mode === 'carried') {
          people.pose(p, 0, 'stand', k);
          drive(p, { la: 3.0, ra: 3.0, laz: -0.12, raz: 0.12, ll: 0.3 + Math.sin(st.t * 6) * 0.2, rl: -0.1 - Math.sin(st.t * 6) * 0.2, lean: 0 }, k);
        } else if (s.mode === 'float' || s.mode === 'give' || s.mode === 'wave-float') {
          // the buddy under his balloon: legs dangling
          const arm = s.mode === 'give' ? 'give' : s.mode === 'wave-float' ? 'wave' : 'stand';
          standPose(p, st.t * 5, arm, k);
          drive(p, { ll: 0.3 + Math.sin(st.t * 3) * 0.12, rl: 0.1 - Math.sin(st.t * 3) * 0.12 }, k);
          if (arm === 'stand') drive(p, { laz: -0.35 - Math.sin(st.t * 2) * 0.1, raz: 0.35 + Math.sin(st.t * 2) * 0.1, la: 0.2, ra: 0.2 }, k);
        } else if (s.mode === 'wave') {
          standPose(p, st.t * 6, 'wave', k);
        } else if (s.mode === 'hurt') {
          people.pose(p, 0, 'fall', k);
        } else {
          // standing: breathing, arms loose
          standPose(p, st.t * 2, 'stand', k);
          p.hips.position.y = p.hipY + Math.sin(st.t * 2.4) * 0.012;
        }
        if (st.ouchT > 0 && s.mode !== 'celebrate') {
          drive(p, { la: 2.9, ra: 2.9, laz: -0.7, raz: 0.7, head: 0.3 }, damp(25, dt));
        }
        if (bal) {
          // the string runs from his back up to the balloon, which sways a little
          const sway = Math.sin(st.t * 1.7) * 0.12;
          bal.ball.position.x = sway;
          const top = new T.Vector3(sway, bal.ball.position.y - 0.66, -0.15);
          const bottom = new T.Vector3(0, 1.25 * scale, -0.18);
          bal.string.position.copy(top).add(bottom).multiplyScalar(0.5);
          bal.string.scale.y = top.distanceTo(bottom);
          bal.string.rotation.z = Math.atan2(-(top.x - bottom.x), top.y - bottom.y);
        }

        // yaw: the short way round, which always passes in front (through the camera side)
        const d = wrap(yawWant - st.yaw);
        st.yaw += d * damp(10, dt);
        turn.rotation.y = st.yaw;
        // flip
        if (st.flipT >= 0) {
          st.flipT += dt / 0.55;
          const e = st.flipT >= 1 ? 1 : 1 - Math.pow(1 - st.flipT, 2);
          flip.rotation.z = -st.flipDir * e * Math.PI * 2;
          if (st.flipT >= 1) {
            st.flipT = -1;
            flip.rotation.z = 0;
          }
        }
        flip.position.y = MID * scale + st.hop;

        if (holdT > 0) {
          holdT -= dt;
          if (holdT <= 0) treat.visible = false;
        }
        if (s.mode === 'celebrate' || s.mode === 'float-celebrate') updateBall(jt, dt);
        else updateBall(-1, dt);
      },
      dispose() {
        if (opts.scene) opts.scene.remove(ball);
        ball.material.dispose();
        treat.material.dispose();
        root.traverse((o) => {
          if (o.isMesh && o.geometry) o.geometry.dispose();
        });
      },
    };
    return api;
  }

  window.HFHero = { build, SCALE, moves, segment, SEG_T };
})();
