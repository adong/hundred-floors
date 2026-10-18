/* 100 Floors: the game. States (title with the autopilot playing behind it, 3-2-1, play, celebration, pause, over),
   the camera, input (keys, the two halves of a touch screen, tilt, the jump button), the buddy on his balloon, the
   HUD, saving bests, and the console hooks used for testing (window.floors).
   The rules themselves are in js/sim.js; this file turns a Run's events into pictures and sounds. */
(function () {
  'use strict';
  const T = THREE, Kit = window.Kit, S = window.HFSim, World = window.HFWorld, Hero = window.HFHero, SFX = window.HFSfx, TITLE = window.HF_TITLE;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const damp = (k, dt) => 1 - Math.exp(-k * dt);
  const lerp = (a, b, k) => a + (b - a) * k;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const FOV = 32; // degrees, vertical
  const BASE_H = 17; // metres of shaft the screen shows at least (more on tall screens)
  const TREATS = [['🍦', 'ICE CREAM'], ['💧', 'WATER'], ['🧃', 'JUICE BOX'], ['🍪', 'COOKIE'], ['🍉', 'WATERMELON'], ['🍌', 'BANANA']];
  const GUARD_UNTIL = 9.6; // seconds into the buddy's visit when he stops guarding and floats off
  const LEAVE_AT = 12.5;

  // ---------------------------------------------------------------- saving (per browser, per way of opening)

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('hundredFloors.' + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try { localStorage.setItem('hundredFloors.' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ }
    },
  };
  const bestKey = (mode, kid, easy) => `best.${mode}.${kid}${easy ? '.easy' : ''}`;

  // ---------------------------------------------------------------- state

  const G = {
    state: 'loading', mode: store.get('mode', 'down'), easy: false, run: null, bot: new S.Bot(),
    auto: false, frozen: false, keepAwake: false, countT: 0, countN: 0, cele: null, overT: 0, overShown: false,
    shake: 0, zoom: 0, t: 0, newBest: false, lastMove: 0, treatStreak: 0, hintT: 0,
  };
  let renderer, scene, camera, sun, hemi, lamp;
  let ROSTER = [], faces = {}, entry = null, hero = null, BUDDY = null, buddyHero = null;
  const view = { cy: 0, h: BASE_H, w: 10, dist: 30, band: 1.6 };
  const heroPos = new T.Vector3();
  const ui = {};

  // ---------------------------------------------------------------- the run

  function newRun(mode, attract) {
    G.mode = mode;
    document.body.classList.toggle('up', mode === 'up');
    G.run = new S.Run(mode, { easy: G.easy, attract, viewH: view.h, band: view.band });
    G.bot = new S.Bot();
    World.setMode(mode);
    World.reset();
    G.cele = null;
    G.zoom = 0;
    setBanner('');
    hero.root.visible = true;
    ui.floorArrow.textContent = mode === 'down' ? '⬇' : '⬆';
    ui.floorLabel.textContent = mode === 'down' ? 'FLOORS DOWN' : 'FLOORS UP';
  }

  function startAttract() {
    G.state = 'title';
    newRun(G.mode, true);
    G.run.started = true;
    show('title', true);
    show('hud', false);
    show('over', false);
    show('pause', false);
    setBanner('');
    updateTitle();
    Kit.sound.music('title');
  }

  function startGame(mode) {
    Kit.sound.init();
    if (mode) G.mode = mode;
    store.set('mode', G.mode);
    newRun(G.mode, false);
    G.state = 'count';
    G.countT = 2.4;
    G.countN = 4;
    G.overShown = false;
    G.newBest = false;
    G.treatStreak = 0;
    show('title', false);
    show('over', false);
    show('pause', false);
    show('hud', true);
    hudCache.hearts = hudCache.floor = null;
    if (document.body.classList.contains('touch') && !store.get('hinted', false)) {
      G.hintT = 4;
      store.set('hinted', true);
    }
    Kit.sound.music('play');
  }

  // ---------------------------------------------------------------- per tick (fixed steps)

  function tick(dt) {
    G.t += dt;
    input.jumpT += dt;
    const r = G.run;
    if (G.goT > 0 && (G.goT -= dt) <= 0) countdown(''); // GO! is gone
    switch (G.state) {
      case 'title': {
        r.guard = true;
        r.tick(dt, G.bot.input(r));
        handleEvents(true);
        if (r.floor > 90 || r.over) startAttract();
        break;
      }
      case 'count': {
        G.countT -= dt;
        const n = Math.ceil(G.countT / 0.6);
        if (n !== G.countN) {
          G.countN = n;
          countdown(n > 0 && n <= 3 ? String(n) : n <= 0 ? 'GO!' : '');
        }
        if (G.countT <= 0) {
          G.state = 'play';
          r.started = true;
          G.goT = 0.85;
        }
        break;
      }
      case 'play': {
        const inp = G.auto ? G.bot.input(r) : { move: moveInput(), jump: jumpInput() };
        G.lastMove = inp.move;
        r.guard = buddyGuarding();
        r.tick(dt, inp);
        handleEvents(false);
        break;
      }
      case 'celebrate':
        G.cele.t += dt;
        if (G.cele.t >= G.cele.dur) endCelebration();
        break;
      case 'over':
        G.overT += dt;
        if (G.overT > 1.1 && !G.overShown) showOver();
        break;
    }
    if (G.state !== 'paused') tickBuddy(dt);
  }

  function handleEvents(quiet) {
    const r = G.run, h = r.hero, fx = World.fx;
    for (const e of r.events) {
      switch (e.type) {
        case 'land':
          if (!quiet) SFX.land();
          fx.dust(h.x, e.p.y, 6);
          G.treatStreak = 0;
          break;
        case 'spring':
          World.squash(e.p);
          fx.dust(h.x, e.p.y, 5);
          if (!quiet) {
            SFX.boing();
            fx.pow('BOING!', h.x, e.p.y + 1.2, 1.0);
          }
          break;
        case 'bounce':
        case 'spike':
          World.squash(e.p);
          fx.dust(h.x, e.p.y, 4);
          if (!quiet) SFX.bounce();
          break;
        case 'big':
          World.squash(e.p);
          hero.flip(h.dir);
          fx.dust(h.x, e.p.y, 8);
          if (!quiet) SFX.big();
          break;
        case 'break':
          if (!quiet) SFX.crumble();
          break;
        case 'ceiling':
          fx.sparkle(h.x, h.y + S.PH, 6);
          break;
        case 'hurt':
          if (e.kind === 'fall') SFX.whistle();
          else {
            SFX.ouch();
            fx.pow(e.kind === 'ceiling' ? 'BONK!' : 'OUCH!', h.x, h.y + (e.kind === 'ceiling' ? 1.4 : 1.0), 1.3);
            hero.ouch();
          }
          G.shake = 0.35;
          bumpEl(ui.hearts);
          if (r.hearts === 1 && !r.over) toast('LAST HEART!', 'bad');
          break;
        case 'saved':
          if (e.quiet) break;
          toast(`${BUDDY.name} SAVED YOU!`, 'save');
          SFX.saved();
          buddy.cheerT = 1.4;
          if (e.kind !== 'fall') fx.pow('SAFE!', h.x, h.y + 1.2, 1.3);
          else buddy.carrying = true;
          break;
        case 'respawn':
          if (!e.saved || quiet) {
            if (!quiet) SFX.poof();
          }
          break;
        case 'pickup':
          if (e.kind === 'heart') {
            if (!quiet) {
              SFX.heart();
              toast('+1 ❤️', 'small');
            }
            fx.sparkle(e.x, e.y, 14, '#ff8fb1');
          } else {
            if (!quiet) SFX.treat(G.treatStreak++);
            fx.emoji(e.emoji, e.x, e.y, { size: 0.7, vy: 2.2, life: 0.8 });
            fx.sparkle(e.x, e.y, 6);
          }
          break;
        case 'floor':
          if (!quiet) bumpEl(ui.floor);
          break;
        case 'milestone':
          if (!quiet) startCelebration(e.floor);
          break;
        case 'combo':
          if (quiet) break;
          SFX.combo(e.n);
          toast(e.n >= 2 ? `COMBO ×${e.n}!` : `${e.jump} FLOORS!`, 'small');
          break;
        case 'comboEnd':
          if (quiet) break;
          SFX.comboEnd();
          toast(`⭐ +${e.floors} COMBO STARS!`);
          fx.sparkle(h.x, h.y + 1, 16);
          break;
        case 'over':
          gameOver();
          break;
      }
    }
    r.events.length = 0;
  }

  // ---------------------------------------------------------------- milestones: 25, 50, 75, 100 floors

  function celebrationMoves(floor) {
    const seq = Hero.moves(entry);
    // Teddy has two moves: boxing at 25 and 75, the jump shot at 50, both at 100 (and every 100 after)
    if (seq.length > 1 && floor % 100 !== 0) return [seq[(floor / S.MILESTONE) % 2 === 1 ? 0 : 1]];
    return seq;
  }

  function startCelebration(floor) {
    const big = floor % 100 === 0;
    const seq = celebrationMoves(floor);
    const dur = seq.reduce((a, m) => a + (Hero.SEG_T[m] || 2), 0) * (big && seq.length === 1 ? 2 : 1) + 0.2;
    G.cele = { floor, t: 0, dur, seq };
    G.state = 'celebrate';
    setBanner(big ? `${floor} FLOORS!<small>YOU DID IT, ${entry.name}! 🎉</small>` : `★ ${floor} FLOORS! ★`);
    SFX.fanfare(big);
    World.fx.confetti(heroPos.x, heroPos.y + 3.5, big ? 150 : 80);
    if (buddy.on) buddy.cheerT = Math.max(buddy.cheerT, 1.6);
  }

  function endCelebration() {
    G.state = 'play';
    G.cele = null;
    setBanner('');
  }

  function setBanner(html) {
    ui.banner.innerHTML = html;
    ui.banner.classList.toggle('on', !!html);
  }

  // ---------------------------------------------------------------- game over

  function gameOver() {
    const r = G.run;
    G.state = 'over';
    G.overT = 0;
    G.overShown = false;
    const key = bestKey(G.mode, entry.id, G.easy);
    const best = store.get(key, 0);
    G.newBest = r.floor > best && r.floor > 0;
    if (G.newBest) store.set(key, r.floor);
    // if the last heart went off the bottom, stand the kid somewhere you can see him for the results
    const h = r.hero;
    if (h.y + S.PH < r.cam + 1) {
      const p = r.safeSpot();
      if (p) {
        h.x = p.x;
        h.y = p.y;
      }
    }
    h.carryT = 0;
    h.invT = 0;
    if (G.newBest) {
      SFX.fanfare(false);
      World.fx.confetti(h.x, h.y + 3.5, 90);
    } else SFX.over();
    Kit.sound.music('over');
    setBanner('');
  }

  function showOver() {
    const r = G.run;
    G.overShown = true;
    const best = store.get(bestKey(G.mode, entry.id, G.easy), 0);
    ui.ovTitle.textContent = G.newBest ? 'YAY!' : r.floor >= 100 ? 'WOW!' : 'PHEW!';
    ui.ovTitle.className = 'bonk' + (G.newBest || r.floor >= 100 ? ' yay' : '');
    ui.ovFloor.textContent = r.floor;
    ui.ovTreats.textContent = r.treats;
    ui.ovStars.textContent = r.bonus;
    ui.ovBest.textContent = best;
    ui.ovBestLabel.textContent = `${entry.name}'S BEST${G.easy ? ' 🐣' : ''}`;
    ui.newBest.classList.toggle('on', G.newBest);
    show('over', true);
    show('hud', false);
  }

  // ---------------------------------------------------------------- pause

  function togglePause(force) {
    if (G.state === 'paused' && force !== true) {
      G.state = G.paused;
      show('pause', false);
      show('hud', true);
      Kit.sound.music('play');
      return;
    }
    if (!['play', 'count', 'celebrate'].includes(G.state)) return;
    G.paused = G.state;
    G.state = 'paused';
    input.ptr.clear();
    show('pause', true);
    Kit.sound.music('pause');
  }

  // ---------------------------------------------------------------- the buddy (Tommy, or Teddy when Tommy plays)
  // Tap his button or press T and he floats in on his balloon for ~10 s. He says hi with his signature move, hands
  // over a treat, then says bye and floats off. While he's here, spikes, the ceiling and falling cost no hearts:
  // he catches you (and carries you back up if you fall).

  const buddy = { on: false, t: 0, x: 0, y: 0, refY: 0, side: 1, given: false, cheerT: 0, carrying: false };
  const treat = { sprite: null, flyT: -1, emoji: '', from: new T.Vector3() };

  function setBuddy(id) {
    if (BUDDY && BUDDY.id === id && buddyHero) return;
    if (buddyHero) {
      scene.remove(buddyHero.root);
      buddyHero.dispose();
    }
    BUDDY = Kit.roster.get(id);
    buddyHero = Hero.build(BUDDY, { scale: Hero.SCALE * (BUDDY.buddyScale || 0.8), balloon: BUDDY.tag || '#ffb02e', scene });
    const tag = Kit.gfx.nameTag(BUDDY.name, BUDDY.tag || '#ffb02e');
    tag.position.y = buddyHero.balloon.top + 0.35;
    tag.scale.multiplyScalar(0.85);
    buddyHero.root.add(tag);
    buddyHero.root.visible = buddy.on;
    scene.add(buddyHero.root);
    const nice = BUDDY.name[0] + BUDDY.name.slice(1).toLowerCase();
    ui.buddyFace.src = ui.pwBuddyFace.src = faces[BUDDY.id];
    ui.buddyName.textContent = BUDDY.name;
    ui.buddyKeyName.textContent = ui.buddyTouchName.textContent = nice;
    ui.buddyBtn.title = `Call ${nice} (T)`;
    const card = $('buddyCard');
    if (card) {
      card.querySelector('img').src = faces[BUDDY.id];
      card.querySelector('.nm').textContent = BUDDY.name;
    }
  }

  const buddyGuarding = () => buddy.on && buddy.t < GUARD_UNTIL;

  // Every tap brings him. Once he's handed over his treat, another tap makes him say hi again and bring another.
  function callBuddy() {
    if (!['play', 'count', 'celebrate', 'title'].includes(G.state)) return;
    Kit.sound.init();
    if (!buddy.on) return summonBuddy();
    if (buddy.t > 4.8) {
      buddy.t = 1.0;
      buddy.given = false;
      SFX.balloon();
    }
  }

  function summonBuddy() {
    buddy.on = true;
    buddy.t = 0;
    buddy.given = false;
    buddy.carrying = false;
    buddy.cheerT = 0;
    buddy.side = heroPos.x > 0 ? -1 : 1;
    buddy.x = heroPos.x + buddy.side * 2.3;
    buddy.y = view.cy + view.h / 2 + 2;
    buddy.refY = heroPos.y;
    buddyHero.root.visible = true;
    if (G.state !== 'title') toast(`${BUDDY.name}'S HERE!`, 'small');
    SFX.balloon();
  }

  function dismissBuddy() {
    buddy.on = false;
    buddy.carrying = false;
    buddyHero.root.visible = false;
  }

  function tickBuddy(dt) {
    if (!buddy.on) return;
    buddy.t += dt;
    buddy.cheerT = Math.max(0, buddy.cheerT - dt);
    if (!buddy.given && buddy.t > 4.3) giveTreat();
    if (buddy.t > LEAVE_AT) dismissBuddy();
  }

  function giveTreat() {
    buddy.given = true;
    const [emoji, label] = pick(TREATS);
    treat.emoji = emoji;
    treat.sprite.material.map = Kit.gfx.emojiTexture(emoji);
    treat.sprite.material.needsUpdate = true;
    buddyHero.handWorld(treat.from);
    treat.sprite.position.copy(treat.from);
    treat.sprite.visible = true;
    treat.flyT = 0;
    if (G.state !== 'title') {
      toast(`${emoji} ${label} FROM ${BUDDY.name}!`);
      Kit.sound.powerup();
    }
  }

  const handPos = new T.Vector3();
  function drawTreat(dt) {
    if (treat.flyT < 0) return;
    treat.flyT += dt / 0.6;
    hero.handWorld(handPos);
    const k = Math.min(1, treat.flyT);
    treat.sprite.position.lerpVectors(treat.from, handPos, k);
    treat.sprite.position.y += Math.sin(k * Math.PI) * 1.2;
    treat.sprite.position.z = 1.2;
    if (k >= 1) {
      treat.flyT = -1;
      treat.sprite.visible = false;
      hero.hold(treat.emoji, 8);
      World.fx.sparkle(handPos.x, handPos.y, 10);
      if (G.state !== 'title') SFX.catch();
    }
  }

  function drawBuddy(dt) {
    drawTreat(dt);
    if (!buddy.on) return;
    const t = buddy.t, r = G.run, h = r.hero;
    const carry = buddy.carrying && h.carryT > 0;
    if (buddy.carrying && h.carryT <= 0) buddy.carrying = false;
    // stay on the side toward the middle of the shaft, at about the kid's height (in UP, the middle of his bounces)
    if (heroPos.x > 1.5) buddy.side = -1;
    else if (heroPos.x < -1.5) buddy.side = 1;
    buddy.refY += (heroPos.y - buddy.refY) * damp(r.mode === 'up' ? 1.6 : 4, dt);
    let tx = heroPos.x + buddy.side * 2.3;
    let ty = buddy.refY + (r.mode === 'up' ? 1.6 : 1.1) + Math.sin(G.t * 2.1) * 0.15;
    if (carry) {
      // right above the kid, holding him up by the hands
      tx = heroPos.x;
      ty = heroPos.y + S.PH + 0.25;
    }
    tx = clamp(tx, -S.HALF + 0.6, S.HALF - 0.6);
    const top = view.cy + view.h / 2 + 2.5;
    ty = Math.min(ty, top - 1.5 - buddyHero.balloon.top);
    if (t < 1.2) ty = lerp(top, ty, 1 - Math.pow(1 - t / 1.2, 3)); // floating in from above
    if (t > GUARD_UNTIL) ty += Math.pow(t - GUARD_UNTIL, 2) * 1.6; // and away again
    const k = carry ? 1 : damp(t < 1.2 ? 30 : 3.5, dt);
    buddy.x += (tx - buddy.x) * k;
    buddy.y += (ty - buddy.y) * k;
    buddyHero.root.position.set(buddy.x, buddy.y, carry ? 0.3 : 1.0);
    const hello = (t > 1.2 && t < 2.8) || buddy.cheerT > 0;
    const giving = t > 3.8 && t < 4.6;
    const bye = t > 8.0 && t < GUARD_UNTIL + 0.4;
    let mode = 'float', seq = null;
    if (carry) mode = 'carry';
    else if (giving) mode = 'give';
    else if (hello) {
      mode = 'float-celebrate';
      seq = [Kit.roster.signature(BUDDY, 'hello')];
    } else if (bye) {
      mode = 'float-celebrate';
      seq = [Kit.roster.signature(BUDDY, 'goodbye')];
    } else if (t > GUARD_UNTIL) mode = 'wave-float';
    const dir = heroPos.x >= buddy.x ? 1 : -1;
    buddyHero.update(dt, { mode: mode === 'carry' ? 'float' : mode, dir, seq, face: mode === 'float' || mode === 'wave-float' });
    if (carry) {
      // arms straight down to the kid's hands
      const p = buddyHero.person;
      p.armL.rotation.x = p.armR.rotation.x = 0.15;
      p.armL.rotation.z = -0.1;
      p.armR.rotation.z = 0.1;
    }
  }

  // ---------------------------------------------------------------- drawing (once per frame)

  function render(dt) {
    const r = G.run, h = r.hero;
    // the kid
    let mode = 'stand';
    let x = h.x, y = h.y;
    if (h.carryT > 0) {
      const k = 1 - h.carryT / h.carryDur;
      if (buddy.carrying) {
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        x = lerp(h.carryFrom.x, h.x, e);
        y = lerp(Math.max(h.carryFrom.y, r.cam - 2), h.y, e);
        mode = 'carried';
      } else mode = 'stand';
    } else if (G.state === 'celebrate') mode = 'celebrate';
    else if (G.state === 'over') mode = G.newBest ? 'celebrate' : 'wave';
    else if (G.state === 'count' || !r.started) mode = 'stand';
    else if (r.mode === 'down') mode = h.on ? (Math.abs(G.lastMove) > 0.15 ? 'run' : 'stand') : 'air';
    else mode = 'air';
    heroPos.set(x, y, 0);
    hero.root.position.copy(heroPos);
    // blink while protected after a bump; hidden for the first half of a poof back onto a platform
    let vis = true;
    if (h.carryT > 0 && !buddy.carrying) vis = h.carryT < h.carryDur * 0.5;
    else if (h.invT > 0 && h.carryT <= 0 && G.state === 'play') vis = Math.floor(G.t * 12) % 2 === 0;
    if (h.carryT > 0 && !buddy.carrying && vis && !G.poofDone) {
      G.poofDone = true;
      World.fx.sparkle(h.x, h.y + 0.8, 18);
    }
    if (h.carryT <= 0) G.poofDone = false;
    hero.root.visible = vis;
    // celebrating, the kid turns toward the middle of the shaft (where the hoop pops up)
    const dir = mode === 'celebrate' || mode === 'wave' ? (x > 0.3 ? -1 : 1) : h.dir;
    hero.update(dt, {
      mode, dir, speed: Math.abs(G.lastMove) * 5.5, vy: h.vy,
      seq: G.cele ? G.cele.seq : null, face: mode === 'wave',
    });
    drawBuddy(dt);
    // camera: the run's view, zooming in on the kid while he celebrates
    const celebrating = G.state === 'celebrate' || (G.state === 'over' && G.overT > 0.3);
    G.zoom += ((celebrating ? 1 : 0) - G.zoom) * damp(3.5, dt);
    let cy = r.cam + view.h / 2, cx = 0, dist = view.dist;
    if (G.zoom > 0.001) {
      const z = G.zoom * G.zoom * (3 - 2 * G.zoom);
      cx = lerp(0, clamp(x + dir * 1.1, -3, 3), z);
      cy = lerp(cy, y + 1.6, z);
      dist = lerp(dist, Math.min(dist, 13), z);
    }
    if (G.peek) {
      // test hook: a close-up on the kid (floors.peek)
      cx = clamp(x, -3, 3);
      cy = y + G.peek.dy;
      dist = G.peek.d;
    }
    view.cy = cy;
    G.shake = Math.max(0, G.shake - dt);
    const sk = G.shake * G.shake * 1.2;
    camera.position.set(cx + (Math.random() - 0.5) * sk, cy + (Math.random() - 0.5) * sk, dist);
    camera.lookAt(cx, cy, 0);
    camera.updateMatrixWorld();
    sun.position.set(cx - 5, cy + 12, 14);
    sun.target.position.set(cx, cy - 2, 0);
    lamp.position.set(x, y + 1.4, 2.4);
    lamp.intensity = G.mode === 'down' ? 0.7 : 0;
    World.sync(r, { cy: r.cam + view.h / 2, h: view.h * 1.15, w: view.w }, dt, { hold: G.state === 'celebrate' });
    World.hoop.update(dt);
    updateHud();
    if (G.hintT > 0) G.hintT -= dt;
    ui.hintL.classList.toggle('on', G.hintT > 0 && G.state === 'play');
    ui.hintR.classList.toggle('on', G.hintT > 0 && G.state === 'play');
    renderer.render(scene, camera);
  }

  // ---------------------------------------------------------------- HUD

  const hudCache = {};
  function setText(el, key, v) {
    if (hudCache[key] !== v) {
      hudCache[key] = v;
      el.textContent = v;
    }
  }
  function updateHud() {
    if (!['play', 'count', 'celebrate', 'paused'].includes(G.state)) return;
    const r = G.run;
    if (hudCache.floor !== r.floor) {
      hudCache.floor = r.floor;
      ui.floor.lastChild.textContent = r.floor;
    }
    const base = r.M.hearts[r.level];
    const key = r.hearts + '/' + base;
    if (hudCache.hearts !== key) {
      hudCache.hearts = key;
      const slots = Math.max(base, r.hearts);
      let html = '';
      for (let i = 0; i < slots; i++) html += i < r.hearts ? '<span>❤️</span>' : '<span class="empty">❤️</span>';
      ui.hearts.innerHTML = html;
    }
    setText(ui.treats, 'treats', String(r.treats));
    setText(ui.stars, 'stars', String(r.bonus));
    const cb = r.combo;
    ui.combo.classList.toggle('on', cb.n > 0);
    if (cb.n > 0) {
      setText(ui.comboN, 'comboN', String(cb.n));
      ui.comboFill.style.transform = `scaleX(${clamp(cb.t / r.M.COMBO_T, 0, 1)})`;
    }
    const guarding = buddyGuarding();
    ui.pwBuddy.classList.toggle('on', guarding);
    ui.buddyBtn.classList.toggle('guarding', guarding);
    if (guarding) ui.pwFill.style.transform = `scaleX(${clamp(1 - buddy.t / GUARD_UNTIL, 0, 1)})`;
  }

  function bumpEl(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  function toast(text, cls) {
    if (G.state === 'title' || G.silent) return;
    const el = document.createElement('div');
    el.className = 'toast' + (cls ? ' ' + cls : '');
    el.textContent = text;
    ui.toasts.appendChild(el);
    setTimeout(() => el.remove(), 1500);
    while (ui.toasts.children.length > 3) ui.toasts.firstChild.remove();
  }

  function countdown(text) {
    ui.count.className = '';
    ui.count.textContent = text;
    if (!text) return;
    void ui.count.offsetWidth;
    ui.count.className = text === 'GO!' ? 'go' : 'tick';
    SFX.count(text === 'GO!');
  }

  const show = (id, on) => $(id).classList.toggle('hidden', !on);

  // ---------------------------------------------------------------- title screen

  function buildPicker() {
    const row = ui.picker;
    row.innerHTML = '';
    for (const c of ROSTER) {
      const b = document.createElement('button');
      b.className = 'avatar';
      b.dataset.id = c.id;
      b.setAttribute('role', 'radio');
      b.innerHTML = `<img alt="" src="${faces[c.id]}"><span class="nm">${c.name}</span><span class="bs"></span>`;
      b.addEventListener('click', () => {
        Kit.sound.init();
        Kit.sound.click();
        pickCharacter(c.id, true);
        b.blur();
      });
      row.appendChild(b);
    }
    // the buddy card: tap it and he floats in behind the menu right away
    const b = document.createElement('button');
    b.className = 'avatar buddy';
    b.id = 'buddyCard';
    b.innerHTML = '<img alt=""><span class="nm"></span><span class="bs">BUDDY · TAP ME!</span>';
    b.addEventListener('click', () => {
      callBuddy();
      b.blur();
    });
    row.appendChild(b);
  }

  function pickCharacter(id, restart) {
    const e = Kit.roster.get(id) || ROSTER[0];
    store.set('kid', e.id);
    G.easy = store.get('easy.' + e.id, e.id === 'tommy');
    if (!entry || entry.id !== e.id) {
      entry = e;
      if (hero) {
        scene.remove(hero.root);
        hero.dispose();
      }
      hero = Hero.build(entry, { scene });
      scene.add(hero.root);
      setBuddy(Kit.roster.buddyFor(entry.id));
    }
    for (const b of ui.picker.querySelectorAll('.avatar:not(.buddy)')) b.setAttribute('aria-checked', String(b.dataset.id === entry.id));
    updateTitle();
    if (restart && G.state === 'title') startAttract();
  }

  function setEasy(on) {
    G.easy = !!on;
    store.set('easy.' + entry.id, G.easy);
    updateTitle();
    if (G.state === 'title') startAttract();
  }

  function setMode(mode, restart) {
    if (mode !== 'down' && mode !== 'up') return;
    G.mode = mode;
    store.set('mode', mode);
    updateTitle();
    if (restart && G.state === 'title') startAttract();
  }

  function updateTitle() {
    if (!entry) return;
    const tag = G.easy ? ' 🐣' : '';
    ui.bestDown.textContent = `${entry.name}'S BEST ${store.get(bestKey('down', entry.id, G.easy), 0)}${tag}`;
    ui.bestUp.textContent = `${entry.name}'S BEST ${store.get(bestKey('up', entry.id, G.easy), 0)}${tag}`;
    ui.modeDown.setAttribute('aria-pressed', String(G.mode === 'down'));
    ui.modeUp.setAttribute('aria-pressed', String(G.mode === 'up'));
    ui.easyBtn.setAttribute('aria-pressed', String(G.easy));
    ui.easyBtn.querySelector('b').textContent = G.easy ? 'EASY ON' : 'EASY OFF';
    for (const b of ui.picker.querySelectorAll('.avatar:not(.buddy)')) {
      const d = store.get(bestKey('down', b.dataset.id, false), 0), u = store.get(bestKey('up', b.dataset.id, false), 0);
      b.querySelector('.bs').textContent = d || u ? `⬇${d} ⬆${u}` : '';
    }
  }

  // ---------------------------------------------------------------- input

  const input = { left: false, right: false, jumpKey: false, jumpBtn: false, jumpT: 9, ptr: new Map(), tilt: false, tiltMove: 0 };

  function moveInput() {
    let m = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    for (const d of input.ptr.values()) m += d;
    if (input.tilt) m += input.tiltMove;
    return clamp(m, -1, 1);
  }
  const jumpInput = () => input.jumpKey || input.jumpBtn || input.jumpT < 0.25;
  const playing = () => G.state === 'play' || G.state === 'count' || G.state === 'celebrate';

  function bindInput() {
    const tap = (id, fn) => {
      $(id).addEventListener('pointerdown', (e) => e.stopPropagation());
      $(id).addEventListener('click', (e) => {
        Kit.sound.init();
        fn(e);
        e.currentTarget.blur();
      });
    };
    tap('modeDown', () => startGame('down'));
    tap('modeUp', () => startGame('up'));
    tap('easyBtn', () => { Kit.sound.click(); setEasy(!G.easy); });
    tap('tiltBtn', toggleTilt);
    tap('muteBtn', toggleMute);
    tap('muteTitle', toggleMute);
    tap('pauseBtn', () => togglePause());
    tap('resumeBtn', () => togglePause());
    tap('quitBtn', () => startAttract());
    tap('againBtn', () => startGame(G.mode));
    tap('menuBtn', () => startAttract());
    const bb = $('buddyBtn');
    bb.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      callBuddy();
    });
    const jb = $('jumpBtn');
    jb.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      Kit.sound.init();
      input.jumpBtn = true;
      input.jumpT = 0;
      jb.classList.add('down');
    });
    const jumpUp = () => {
      input.jumpBtn = false;
      jb.classList.remove('down');
    };
    jb.addEventListener('pointerup', jumpUp);
    jb.addEventListener('pointercancel', jumpUp);
    jb.addEventListener('pointerleave', jumpUp);

    // the two halves of the screen steer (with tilt on, a tap is a big jump in UP)
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') document.body.classList.add('touch');
      Kit.sound.init();
      if (!playing() || e.target.closest('button') || e.target.closest('.screen:not(.hidden)')) return;
      if (input.tilt) {
        if (G.mode === 'up') input.jumpT = 0;
        return;
      }
      input.ptr.set(e.pointerId, e.clientX < window.innerWidth / 2 ? -1 : 1);
      try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointers can't be captured */ }
    });
    window.addEventListener('pointermove', (e) => {
      if (input.ptr.has(e.pointerId)) input.ptr.set(e.pointerId, e.clientX < window.innerWidth / 2 ? -1 : 1);
    });
    const up = (e) => input.ptr.delete(e.pointerId);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', () => {
      input.ptr.clear();
      input.left = input.right = input.jumpKey = false;
    });

    window.addEventListener('keydown', (e) => {
      Kit.sound.init();
      const k = e.code;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(k)) e.preventDefault();
      if (e.repeat && !['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(k)) return;
      if (k === 'KeyM') return toggleMute();
      if (k === 'KeyT') return callBuddy();
      if (G.state === 'title') {
        if (k === 'ArrowLeft' || k === 'KeyA' || k === 'ArrowRight' || k === 'KeyD') {
          const i = ROSTER.findIndex((c) => c.id === entry.id);
          const d = k === 'ArrowLeft' || k === 'KeyA' ? -1 : 1;
          pickCharacter(ROSTER[(i + d + ROSTER.length) % ROSTER.length].id, true);
          Kit.sound.click();
        } else if (k === 'ArrowDown' || k === 'KeyS') setMode('down', true);
        else if (k === 'ArrowUp' || k === 'KeyW') setMode('up', true);
        else if (k === 'Enter' || k === 'Space') startGame(G.mode);
        else if (k === 'KeyE') setEasy(!G.easy);
        return;
      }
      if (G.state === 'over') {
        if ((k === 'Enter' || k === 'Space') && G.overShown && G.overT > 1.6) startGame(G.mode);
        else if (k === 'Escape') startAttract();
        return;
      }
      if (G.state === 'paused') {
        if (k === 'KeyP' || k === 'Escape' || k === 'Space' || k === 'Enter') togglePause();
        return;
      }
      if (k === 'KeyP' || k === 'Escape') return togglePause();
      if (k === 'ArrowLeft' || k === 'KeyA') input.left = true;
      else if (k === 'ArrowRight' || k === 'KeyD') input.right = true;
      else if (k === 'ArrowUp' || k === 'KeyW' || k === 'Space') {
        input.jumpKey = true;
        input.jumpT = 0;
      }
    });
    window.addEventListener('keyup', (e) => {
      const k = e.code;
      if (k === 'ArrowLeft' || k === 'KeyA') input.left = false;
      else if (k === 'ArrowRight' || k === 'KeyD') input.right = false;
      else if (k === 'ArrowUp' || k === 'KeyW' || k === 'Space') input.jumpKey = false;
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (playing() && !G.keepAwake) togglePause(true);
        if (!G.keepAwake) Kit.sound.suspend();
      } else Kit.sound.resume();
    });
    window.addEventListener('resize', fitView);
  }

  function toggleMute() {
    Kit.sound.init();
    const m = Kit.sound.toggleMute();
    ui.muteBtn.textContent = ui.muteTitle.textContent = m ? '🔇' : '🔊';
  }

  // Tilt to steer (phones and iPads). iOS asks for permission the first time.
  function toggleTilt() {
    const on = !input.tilt;
    const set = (v) => {
      input.tilt = v;
      input.tiltMove = 0;
      document.body.classList.toggle('tilt', v);
      ui.tiltBtn.setAttribute('aria-pressed', String(v));
      ui.tiltBtn.querySelector('b').textContent = v ? 'TILT ON' : 'TILT OFF';
    };
    if (!on) return set(false);
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      D.requestPermission().then((s) => set(s === 'granted')).catch(() => set(false));
    } else set(true);
  }
  function onTilt(e) {
    if (!input.tilt || e.gamma === null) return;
    const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    let a = e.gamma;
    if (angle === 90) a = e.beta;
    else if (angle === -90 || angle === 270) a = -e.beta;
    const dead = 3;
    input.tiltMove = Math.abs(a) < dead ? 0 : clamp((a - Math.sign(a) * dead) / 16, -1, 1);
  }

  // ---------------------------------------------------------------- view

  function fitView() {
    const w = window.innerWidth || 800, h = window.innerHeight || 600;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    view.h = clamp(Math.max(BASE_H, (S.W + 1.4) / aspect), BASE_H, 30);
    view.w = view.h * aspect;
    view.dist = view.h / (2 * Math.tan((FOV * Math.PI) / 360));
    view.band = clamp(((w < 560 ? 132 : 118) / h) * view.h, 1.3, 3.6); // the spiky ceiling sits under the HUD
    camera.aspect = aspect;
    camera.far = view.dist + 260;
    camera.updateProjectionMatrix();
    if (G.run) G.run.setView(view.h, view.band);
    World.fx.setScale((h * renderer.getPixelRatio()) / (2 * Math.tan((FOV * Math.PI) / 360)));
  }

  // ---------------------------------------------------------------- main loop

  let last = 0, acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (G.frozen) return;
    acc += dt;
    while (acc >= S.DT) {
      tick(S.DT);
      acc -= S.DT;
    }
    render(dt);
  }

  // ---------------------------------------------------------------- boot

  async function boot() {
    try {
      await Promise.race([document.fonts.load('64px Bungee'), new Promise((r) => setTimeout(r, 1500))]);
    } catch (e) { /* fall back to system fonts */ }
    document.title = `${TITLE.NAME} · Teddy & Tommy`;
    const [l1, ...rest] = TITLE.NAME.split(' ');
    $('logo').innerHTML = `<span class="l1">${l1}</span><span class="l2">${rest.join(' ')}</span>`;
    $('logo').setAttribute('aria-label', TITLE.NAME);
    if (matchMedia('(hover: none) and (pointer: coarse)').matches) document.body.classList.add('touch');
    if (window.DeviceOrientationEvent) {
      $('tiltBtn').classList.add('can');
      window.addEventListener('deviceorientation', onTilt);
    }

    const canvas = $('game');
    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      $('loading').textContent = `This browser can’t run WebGL, so ${TITLE.NAME} can’t start.`;
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    scene = new T.Scene();
    camera = new T.PerspectiveCamera(FOV, 1, 0.5, 400);
    hemi = new T.HemisphereLight('#fff6e8', '#6a5a7a', 0.85);
    scene.add(hemi);
    sun = new T.DirectionalLight('#fff1d6', 1.0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 20, bottom: -20, near: 1, far: 60 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    lamp = new T.PointLight('#ffd9a0', 0.7, 9, 1.6); // a warm glow around the kid in the cave
    scene.add(lamp);
    World.init(scene);
    treat.sprite = new T.Sprite(new T.SpriteMaterial({ depthWrite: false, depthTest: false }));
    treat.sprite.scale.setScalar(0.6);
    treat.sprite.renderOrder = 8;
    treat.sprite.visible = false;
    scene.add(treat.sprite);

    for (const id of ['title', 'hud', 'over', 'pause', 'floor', 'floorArrow', 'floorLabel', 'hearts', 'treats', 'stars', 'combo', 'comboN', 'count', 'banner', 'toasts', 'picker',
      'easyBtn', 'tiltBtn', 'muteBtn', 'muteTitle', 'modeDown', 'modeUp', 'bestDown', 'bestUp', 'buddyBtn', 'buddyFace', 'buddyName', 'buddyKeyName', 'buddyTouchName',
      'pwBuddy', 'pwBuddyFace', 'ovTitle', 'ovFloor', 'ovTreats', 'ovStars', 'ovBest', 'ovBestLabel', 'newBest', 'hintL', 'hintR']) ui[id] = $(id);
    ui.pwFill = document.querySelector('#pwBuddy b');
    ui.comboFill = document.querySelector('#combo b');

    ROSTER = Kit.roster.list.slice(); // Teddy and Tommy first
    faces = Kit.portraits(ROSTER, { size: 160 });
    buildPicker();
    const muted = Kit.sound.isMuted();
    ui.muteBtn.textContent = ui.muteTitle.textContent = muted ? '🔇' : '🔊';

    fitView();
    pickCharacter(store.get('kid', 'teddy'));
    bindInput();
    startAttract();
    $('loading').remove();
    last = performance.now();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- console hooks for testing

  window.floors = {
    get state() { return G.state; },
    get run() { return G.run; },
    G,
    get hero() { return hero; },
    start(mode, kid) {
      if (kid) pickCharacter(kid);
      startGame(mode || G.mode);
      return G.state;
    },
    menu() { startAttract(); return G.state; },
    pick(id) { pickCharacter(id, true); return entry.id; },
    easy(on) { setEasy(on); return G.easy; },
    mode(m) { setMode(m, true); return G.mode; },
    pause: () => togglePause(),
    // Stop real-time ticking (drawing stops too), so only step() moves time: for screenshots from a hidden pane.
    hold(on = true) { G.frozen = on; return on; },
    // Don't pause when the tab is hidden.
    keepAwake(on = true) { G.keepAwake = on; return on; },
    // Let the autopilot play the real game (bests don't count... they do; use for screenshots only).
    auto(on = true) { G.auto = on; return on; },
    // Advance `seconds` of game time and draw, synchronously.
    step(seconds = 1) {
      const n = Math.max(1, Math.round(seconds * 60));
      for (let i = 0; i < n; i++) {
        tick(S.DT);
        tick(S.DT);
        render(1 / 60);
      }
      return this.info();
    },
    // Fast-forward with the autopilot (no drawing, no celebrations) until the run reaches `floor`.
    warp(floor) {
      const r = G.run;
      if (G.state !== 'play' && G.state !== 'count') return 'start a game first';
      G.state = 'play';
      r.started = true;
      G.silent = true;
      for (let i = 0; i < 120 * 600 && r.floor < floor && !r.over; i++) {
        r.guard = true;
        r.tick(S.DT, G.bot.input(r));
        r.events.length = 0;
      }
      G.silent = false;
      render(1 / 60);
      return this.info();
    },
    // Call the buddy like his button, and report.
    buddy(call = true) {
      if (call) callBuddy();
      return { who: BUDDY.id, on: buddy.on, t: +buddy.t.toFixed(2), guarding: buddyGuarding(), given: buddy.given, carrying: buddy.carrying, x: +buddy.x.toFixed(2), y: +buddy.y.toFixed(2), move: buddyHero.move, holding: hero.holding };
    },
    // Force a hazard: 'spike', 'ceiling' or 'fall'.
    hurt(kind) {
      const r = G.run;
      if (kind === 'ceiling') r.bumpCeiling();
      else if (kind === 'fall') r.fell();
      else r.hurt('spike', null);
      handleEvents(false);
      return { hearts: r.hearts, guard: r.guard };
    },
    celebrate(floor = 25) { startCelebration(floor); return G.cele.seq; },
    // Park the camera close to the kid (d metres away, looking dy above his feet); floors.peek(0) puts it back.
    peek(d, dy = 1.4) {
      G.peek = d ? { d, dy } : null;
      render(0);
      return !!G.peek;
    },
    // Turn CSS animations off (the hidden Browser pane freezes them half-way, which spoils screenshots).
    calm(on = true) { document.body.classList.toggle('calm', on); return on; },
    info() {
      const r = G.run, h = r.hero;
      return { state: G.state, mode: r.mode, kid: entry.id, floor: r.floor, hearts: r.hearts, treats: r.treats, x: +h.x.toFixed(2), y: +h.y.toFixed(2), on: h.on ? h.on.type : null, cam: +r.cam.toFixed(2), buddy: buddy.on, move: hero.move };
    },
    check: (o) => S.check(o),
    soak: (o) => S.soak(o),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
