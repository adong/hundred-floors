/* 100 Floors: the world. Canvas textures, the two settings (DOWN: a cave shaft that changes colour as you go deeper;
   UP: a tower with big windows on the sky, from the street up past the clouds into space), the platforms, the spiky
   ceiling, pickups, floor signs, the pop-up hoop, and the effects (dust, confetti, emoji, POW bursts).
   The world never decides anything: game.js tells it what the Run looks like each frame. Exposes window.HFWorld. */
(function () {
  'use strict';
  const T = THREE, Kit = window.Kit, gfx = Kit.gfx, S = window.HFSim;
  const { makeCanvas, toTexture, shade, roundRect, std } = gfx;
  const W = S.W, HALF = S.HALF;
  const DEPTH = 1.6; // platforms are 1.6 m deep (the hero walks along z = 0, their middle)
  const THICK = 0.4;
  const WALL_TILE = 8; // the walls repeat every 8 m, so they can jump along with the camera in whole tiles
  const WALL_H = 72;

  let scene, root, modeRoot = null, mode = 'down';
  const plats = new Map(); // platform id -> its view
  const geoCache = new Map();
  const tex = {}, mat = {};
  let time = 0;

  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---------------------------------------------------------------- textures

  function noise(g, w, h, n, alpha, light) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = light ? `rgba(255,255,255,${Math.random() * alpha})` : `rgba(0,0,0,${Math.random() * alpha})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
  }

  // wooden plank faces (DOWN's plain platforms): `top` runs along the plank, `side` is the plank's edge
  function woodTextures() {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = '#c98a4b';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#d29454' : '#bf8045';
      g.fillRect(0, i * 64, 256, 62);
      g.strokeStyle = 'rgba(90,50,20,0.35)';
      g.lineWidth = 2;
      for (let j = 0; j < 5; j++) {
        g.beginPath();
        const y = i * 64 + 8 + j * 11;
        g.moveTo(0, y);
        g.bezierCurveTo(80, y + 6, 170, y - 6, 256, y + 2);
        g.stroke();
      }
      g.fillStyle = '#6b3d1a';
      g.fillRect(0, i * 64 + 62, 256, 2);
    }
    const top = toTexture(c, true);
    const [c2, g2] = makeCanvas(256, 64);
    g2.fillStyle = '#a8662f';
    g2.fillRect(0, 0, 256, 64);
    g2.fillStyle = '#e0a463';
    g2.fillRect(0, 0, 256, 8);
    g2.strokeStyle = 'rgba(70,35,10,0.35)';
    g2.lineWidth = 2;
    for (let j = 0; j < 4; j++) {
      g2.beginPath();
      g2.moveTo(0, 18 + j * 11);
      g2.bezierCurveTo(90, 24 + j * 11, 160, 12 + j * 11, 256, 18 + j * 11);
      g2.stroke();
    }
    g2.fillStyle = '#5a3414';
    g2.fillRect(0, 60, 256, 4);
    for (const x of [24, 232]) {
      g2.fillStyle = '#3b2a20';
      g2.beginPath(); g2.arc(x, 34, 5, 0, Math.PI * 2); g2.fill();
      g2.fillStyle = '#b7b0a8';
      g2.beginPath(); g2.arc(x - 1, 33, 3, 0, Math.PI * 2); g2.fill();
    }
    return { top, side: toTexture(c2, true) };
  }

  // sky-stone blocks with a frosting of snow (UP's plain platforms)
  function stoneTextures() {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = '#eef6ff';
    g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, 260, 0.06);
    g.fillStyle = 'rgba(160,190,230,0.35)';
    for (let i = 0; i < 18; i++) {
      g.beginPath();
      g.arc(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 10, 0, Math.PI * 2);
      g.fill();
    }
    const top = toTexture(c, true);
    const [c2, g2] = makeCanvas(256, 64);
    g2.fillStyle = '#7f9fd6';
    g2.fillRect(0, 0, 256, 64);
    g2.strokeStyle = '#5a76b0';
    g2.lineWidth = 3;
    for (let x = 0; x <= 256; x += 64) { g2.beginPath(); g2.moveTo(x, 14); g2.lineTo(x, 64); g2.stroke(); }
    g2.beginPath(); g2.moveTo(0, 40); g2.lineTo(256, 40); g2.stroke();
    // snow along the top edge, dripping a little
    g2.fillStyle = '#ffffff';
    g2.fillRect(0, 0, 256, 13);
    for (let x = 6; x < 256; x += 22) {
      g2.beginPath();
      g2.ellipse(x + Math.random() * 6, 13, 7 + Math.random() * 4, 5 + Math.random() * 6, 0, 0, Math.PI);
      g2.fill();
    }
    return { top, side: toTexture(c2, true) };
  }

  // a conveyor belt with chevrons (the texture slides along while it runs)
  function beltTexture() {
    const [c, g] = makeCanvas(128, 128);
    g.fillStyle = '#2b2d36';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#ffd400';
    for (const y of [16, 64]) {
      g.beginPath();
      g.moveTo(98, y); g.lineTo(50, y + 24); g.lineTo(98, y + 48); g.lineTo(76, y + 24); // pointing left
      g.closePath();
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let x = 0; x < 128; x += 16) g.fillRect(x, 0, 2, 128);
    return c;
  }
  // the belt seen from the front: a dark band with yellow chevrons pointing left, and rollers' bolts
  function beltFront() {
    const [c, g] = makeCanvas(128, 64);
    g.fillStyle = '#2b2d36';
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#4a4d5a';
    g.fillRect(0, 0, 128, 7);
    g.fillRect(0, 57, 128, 7);
    g.fillStyle = '#ffd400';
    for (const x of [14, 78]) {
      g.beginPath();
      g.moveTo(x, 32); g.lineTo(x + 24, 12); g.lineTo(x + 38, 12); g.lineTo(x + 14, 32); g.lineTo(x + 38, 52); g.lineTo(x + 24, 52);
      g.closePath();
      g.fill();
    }
    return c;
  }
  function stripeTexture(a, b, n) {
    const [c, g] = makeCanvas(128, 32);
    g.fillStyle = a;
    g.fillRect(0, 0, 128, 32);
    g.fillStyle = b;
    for (let i = -1; i < n + 1; i++) {
      g.beginPath();
      const x = i * (128 / n);
      g.moveTo(x, 32); g.lineTo(x + 64 / n, 32); g.lineTo(x + 64 / n + 16, 0); g.lineTo(x + 16, 0);
      g.closePath();
      g.fill();
    }
    return toTexture(c, true);
  }

  // a big cookie (the crumbly platforms): chocolate chips and cracks
  function cookieTexture() {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = '#e2a65e';
    g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, 400, 0.12);
    noise(g, 256, 256, 200, 0.12, true);
    g.fillStyle = '#5a3216';
    for (let i = 0; i < 16; i++) {
      g.beginPath();
      g.ellipse(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 5, 5 + Math.random() * 4, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(110,60,20,0.6)';
    g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      let x = Math.random() * 256, y = Math.random() * 256;
      g.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    return toTexture(c, true);
  }

  function metalTexture(base) {
    const [c, g] = makeCanvas(256, 64);
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = shade(base, 0.25);
    g.fillRect(0, 0, 256, 6);
    g.fillStyle = shade(base, -0.35);
    g.fillRect(0, 58, 256, 6);
    for (const x of [16, 240]) {
      g.fillStyle = shade(base, -0.5);
      g.beginPath(); g.arc(x, 32, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = shade(base, 0.45);
      g.beginPath(); g.arc(x - 1, 31, 3, 0, Math.PI * 2); g.fill();
    }
    return toTexture(c, true);
  }

  // the trampoline pad on a spring platform
  function padTexture() {
    const [c, g] = makeCanvas(256, 64);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#ffffff' : '#ff3d5a';
      g.fillRect(i * 32, 0, 32, 64);
    }
    return toTexture(c, true);
  }

  // tileable cave rock (grey, tinted per depth by the material colour), 8 m a tile
  function rockTexture() {
    const [c, g] = makeCanvas(512, 512);
    g.fillStyle = '#b8b0a6';
    g.fillRect(0, 0, 512, 512);
    noise(g, 512, 512, 1200, 0.1);
    noise(g, 512, 512, 600, 0.1, true);
    // stones, wrapped around the edges so the tile repeats seamlessly
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * 512, y = Math.random() * 512, rx = 14 + Math.random() * 34, ry = 10 + Math.random() * 22, a = Math.random() * 3;
      const light = Math.random() < 0.5;
      for (const dx of [-512, 0, 512]) {
        for (const dy of [-512, 0, 512]) {
          g.fillStyle = light ? 'rgba(255,255,255,0.18)' : 'rgba(40,30,20,0.16)';
          g.beginPath(); g.ellipse(x + dx, y + dy, rx, ry, a, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(40,30,20,0.14)';
          g.lineWidth = 2;
          g.stroke();
        }
      }
    }
    // a few soil layers
    g.fillStyle = 'rgba(60,40,25,0.12)';
    for (const y of [90, 300, 440]) {
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x / 40 + y) * 8);
      g.lineTo(512, y + 26); g.lineTo(0, y + 26);
      g.closePath();
      g.fill();
    }
    return toTexture(c, true);
  }

  // UP's tower wall: bricks with two big arched windows cut out (the sky shows through)
  function towerTexture() {
    const [c, g] = makeCanvas(512, 512);
    g.fillStyle = '#e8d2b8';
    g.fillRect(0, 0, 512, 512);
    for (let y = 0, r = 0; y < 512; y += 32, r++) {
      for (let x = (r % 2) * -32; x < 512; x += 64) {
        g.fillStyle = shade('#d9b48f', (Math.random() - 0.5) * 0.18);
        g.fillRect(x + 2, y + 2, 60, 28);
      }
    }
    // window holes (alpha 0) with stone frames
    g.globalCompositeOperation = 'destination-out';
    for (const cx of [128, 384]) {
      g.beginPath();
      g.moveTo(cx - 86, 470); g.lineTo(cx - 86, 200); g.arc(cx, 200, 86, Math.PI, 0); g.lineTo(cx + 86, 470);
      g.closePath();
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = '#8f7a66';
    g.lineWidth = 12;
    for (const cx of [128, 384]) {
      g.beginPath();
      g.moveTo(cx - 92, 476); g.lineTo(cx - 92, 200); g.arc(cx, 200, 92, Math.PI, 0); g.lineTo(cx + 92, 476);
      g.stroke();
      g.fillStyle = '#a89078';
      g.fillRect(cx - 104, 470, 208, 18); // sill
    }
    return toTexture(c, true);
  }

  function brickTexture() {
    const [c, g] = makeCanvas(128, 128);
    g.fillStyle = '#6e4a3a';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0, r = 0; y < 128; y += 16, r++) {
      for (let x = (r % 2) * -16; x < 128; x += 32) {
        g.fillStyle = shade('#c0634a', (Math.random() - 0.5) * 0.25);
        g.fillRect(x + 1, y + 1, 30, 14);
      }
    }
    return toTexture(c, true);
  }

  function cloudTexture() {
    const [c, g] = makeCanvas(256, 128);
    g.fillStyle = '#ffffff';
    for (const [x, y, r] of [[70, 80, 40], [120, 60, 52], [175, 78, 40], [100, 92, 34], [150, 95, 36], [205, 92, 26], [45, 96, 24]]) {
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    return toTexture(c);
  }

  // a floor sign: the number with an arrow for the way you're going
  const signCache = {};
  function signTexture(label, big) {
    const key = label + (big ? '!' : '');
    if (signCache[key]) return signCache[key];
    const [c, g] = makeCanvas(big ? 512 : 256, big ? 256 : 128);
    const w = c.width, h = c.height;
    g.fillStyle = '#14121f';
    roundRect(g, 4, 4, w - 8, h - 8, h * 0.18);
    g.fill();
    g.fillStyle = big ? '#ffd400' : '#fff3d6';
    roundRect(g, 12, 12, w - 24, h - 24, h * 0.14);
    g.fill();
    g.fillStyle = '#14121f';
    g.font = `${big ? 132 : 70}px ${gfx.FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, w / 2, h / 2 + 6);
    if (big) {
      g.font = `48px ${gfx.EMOJI_FONT}`;
      g.fillText('⭐', 58, 70);
      g.fillText('⭐', w - 58, 70);
    }
    return (signCache[key] = toTexture(c));
  }

  // comic burst with a word (OUCH!, BOING!, SAFE!)
  const BURST = {
    'OUCH!': ['#ffd400', '#ff8a1f', '#e8203a'], 'BONK!': ['#ff5aa0', '#ffd400', '#ffffff'], 'BOING!': ['#5fe3b5', '#ffffff', '#1f6fe0'],
    'SAFE!': ['#ffb02e', '#fff3d0', '#e8203a'], 'POW!': ['#ffd400', '#ff8a1f', '#e8203a'], 'SWISH!': ['#ff8a1f', '#ffd400', '#ffffff'],
    'BIG!': ['#18d4ff', '#ffffff', '#ff3d7f'], 'YUM!': ['#ff9fd0', '#fff2a8', '#b02a8a'], 'POP!': ['#ffffff', '#fff2a8', '#ff3d7f'],
  };
  const burstCache = {};
  // the word is drawn in the current language (Kit.lang: OUCH! -> 哎哟！); each language keeps its own textures
  function burstTexture(word) {
    const label = Kit.lang ? Kit.lang.t(word) : word;
    if (burstCache[label]) return burstCache[label];
    const [c, g] = makeCanvas(256, 256);
    const [outer, inner, text] = BURST[word] || BURST['POW!'];
    const star = (r1, r2, n, fill) => {
      g.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? r2 * (0.85 + ((i * 37) % 7) / 30) : r1 * (0.88 + ((i * 53) % 5) / 25);
        g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
      }
      g.closePath();
      g.fillStyle = fill;
      g.fill();
    };
    star(124, 70, 12, '#14121f');
    star(114, 62, 12, outer);
    star(84, 52, 10, inner);
    g.translate(128, 132);
    g.rotate(-0.12);
    g.font = `${label.length > 5 ? 46 : 56}px ${gfx.FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.lineJoin = 'round';
    g.strokeStyle = '#14121f';
    g.strokeText(label, 0, 0);
    g.fillStyle = text;
    g.fillText(label, 0, 0);
    return (burstCache[label] = toTexture(c));
  }

  function buildTextures() {
    const wood = woodTextures(), stone = stoneTextures();
    tex.woodTop = wood.top; tex.woodSide = wood.side;
    tex.stoneTop = stone.top; tex.stoneSide = stone.side;
    const belt = beltTexture();
    tex.beltL = toTexture(belt, true);
    tex.beltR = toTexture(belt, true);
    tex.beltR.repeat.x = -1; // mirrored: chevrons point (and run) right
    const front = beltFront();
    tex.beltFrontL = toTexture(front, true);
    tex.beltFrontR = toTexture(front, true);
    tex.beltFrontR.repeat.x = -1; // mirrored: chevrons point right
    tex.hazard = stripeTexture('#ffd400', '#14121f', 4);
    tex.cookie = cookieTexture();
    tex.metal = metalTexture('#7d6aa8');
    tex.beltSide = metalTexture('#4a4d5a');
    tex.pad = padTexture();
    tex.rock = rockTexture();
    tex.tower = towerTexture();
    tex.brick = brickTexture();
    tex.cloud = cloudTexture();
  }

  function buildMaterials() {
    const m = (o) => new T.MeshStandardMaterial(Object.assign({ roughness: 0.8, metalness: 0 }, o));
    mat.woodTop = m({ map: tex.woodTop });
    mat.woodSide = m({ map: tex.woodSide });
    mat.woodDark = m({ color: '#7a4a24' });
    mat.stoneTop = m({ map: tex.stoneTop });
    mat.stoneSide = m({ map: tex.stoneSide });
    mat.stoneDark = m({ color: '#5a76b0' });
    mat.goldTop = m({ color: '#ffe27a', map: tex.woodTop });
    mat.goldSide = m({ color: '#ffd400', map: tex.woodSide });
    mat.beltL = m({ map: tex.beltL, roughness: 0.6 });
    mat.beltR = m({ map: tex.beltR, roughness: 0.6 });
    mat.beltSide = m({ map: tex.beltSide, roughness: 0.5, metalness: 0.3 });
    mat.beltFrontL = m({ map: tex.beltFrontL, roughness: 0.6 });
    mat.beltFrontR = m({ map: tex.beltFrontR, roughness: 0.6 });
    mat.hazard = m({ map: tex.hazard });
    mat.roller = m({ color: '#c9ccd6', roughness: 0.35, metalness: 0.6 });
    mat.cookie = m({ map: tex.cookie, roughness: 0.9 });
    mat.cookieSide = m({ map: tex.cookie, color: '#d39a55', roughness: 0.9 });
    mat.metal = m({ map: tex.metal, roughness: 0.45, metalness: 0.35 });
    mat.metalTop = m({ color: '#8a78b8', roughness: 0.45, metalness: 0.35 });
    mat.spike = m({ color: '#eef1f8', roughness: 0.25, metalness: 0.6 });
    mat.warn = m({ color: '#ff3d5a', roughness: 0.6 });
    mat.pad = m({ map: tex.pad, roughness: 0.5 });
    mat.springBase = m({ color: '#2fb36a', roughness: 0.6 });
    mat.coil = m({ color: '#d6dae3', roughness: 0.3, metalness: 0.7 });
    mat.rock = m({ map: tex.rock, roughness: 0.95 });
    mat.rockSide = m({ map: tex.rock, roughness: 0.95 });
    mat.tower = m({ map: tex.tower, alphaTest: 0.5, side: T.DoubleSide, roughness: 0.9 });
    mat.brick = m({ map: tex.brick, roughness: 0.9 });
    mat.ceiling = m({ color: '#3a3550', roughness: 0.6, metalness: 0.3 });
    mat.grass = m({ color: '#5cc26a' });
    mat.dirt = m({ color: '#8a5a3c' });
  }

  // ---------------------------------------------------------------- platforms

  // A w-wide platform box whose front and top textures repeat every metre along x (instead of stretching).
  function bodyGeo(w, h = THICK, d = DEPTH) {
    const key = `${w.toFixed(2)}|${h}|${d}`;
    if (geoCache.has(key)) return geoCache.get(key);
    const geo = new T.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    for (const f of [2, 3, 4, 5]) for (let i = 0; i < 4; i++) uv.setX(f * 4 + i, uv.getX(f * 4 + i) * w);
    geoCache.set(key, geo);
    return geo;
  }
  const coneGeo = new T.ConeGeometry(0.12, 0.34, 6).translate(0, 0.17, 0);
  const spikeGeo = new T.ConeGeometry(0.15, 0.5, 6).translate(0, 0.25, 0); // the spiky platforms' spikes: big, so they read as danger
  const coilGeo = new T.CylinderGeometry(0.1, 0.1, 0.26, 10);
  const rollerGeo = new T.CylinderGeometry(0.22, 0.22, DEPTH - 0.1, 14).rotateX(Math.PI / 2);
  const chunkGeo = new T.BoxGeometry(0.5, 0.36, 0.7);
  const postGeo = new T.BoxGeometry(0.1, 1.5, 0.1);

  function add(m, parent, x, y, z, shadow = true) {
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function buildPlatform(p) {
    const g = new T.Group();
    g.position.set(p.x, p.y, 0);
    const v = { p, group: g, body: null, pad: null, coils: [], cones: [], item: null, glow: null, squashT: 0, broken: false, defuseT: -1, sign: null, own: [] };
    const w = p.w, up = mode === 'up';
    const t = p.type;
    if (p.ground) {
      // UP's street level is drawn by the scenery
    } else if (t === 'spring') {
      add(new T.Mesh(bodyGeo(w, 0.18, DEPTH - 0.1), mat.springBase), g, 0, -0.42, 0);
      const n = Math.max(2, Math.round(w / 1.1));
      for (let i = 0; i < n; i++) {
        for (const z of [-0.4, 0.4]) v.coils.push(add(new T.Mesh(coilGeo, mat.coil), g, -w / 2 + 0.35 + ((w - 0.7) * i) / (n - 1), -0.2, z));
      }
      v.pad = add(new T.Mesh(bodyGeo(w * 0.94, 0.12, DEPTH - 0.2), [mat.pad, mat.pad, mat.pad, mat.pad, mat.pad, mat.pad]), g, 0, -0.06, 0);
      v.body = v.pad;
    } else {
      let top, side, end;
      if (t === 'convL' || t === 'convR') {
        top = t === 'convL' ? mat.beltL : mat.beltR;
        side = t === 'convL' ? mat.beltFrontL : mat.beltFrontR;
        end = mat.beltSide;
      } else if (t === 'crumble') {
        top = mat.cookie;
        side = mat.cookieSide;
        end = mat.cookieSide;
      } else if (t === 'spike') {
        top = mat.metalTop;
        side = mat.metal;
        end = mat.metal;
      } else if (p.sign) {
        top = mat.goldTop;
        side = mat.goldSide;
        end = mat.goldSide;
      } else if (up) {
        top = mat.stoneTop;
        side = mat.stoneSide;
        end = mat.stoneDark;
      } else {
        top = mat.woodTop;
        side = mat.woodSide;
        end = mat.woodDark;
      }
      v.body = add(new T.Mesh(bodyGeo(w), [end, end, top, end, side, side]), g, 0, -THICK / 2, 0);
      if (t === 'convL' || t === 'convR') {
        for (const x of [-w / 2, w / 2]) add(new T.Mesh(rollerGeo, mat.roller), g, x, -THICK / 2, 0);
      }
      if (t === 'spike') {
        const n = Math.max(3, Math.floor((w - 0.1) / 0.34));
        for (let i = 0; i < n; i++) {
          for (const z of [-0.4, 0.4]) {
            const cone = add(new T.Mesh(spikeGeo, mat.spike), g, -w / 2 + 0.17 + ((w - 0.34) * (i + (z > 0 ? 0.5 : 0))) / n, 0, z);
            v.cones.push(cone);
          }
        }
        // a red warning stripe along the front
        add(new T.Mesh(bodyGeo(w + 0.02, 0.1, DEPTH + 0.02), mat.warn), g, 0, -0.06, 0, false);
      }
    }
    if (p.sign) {
      const label = String(p.floor);
      const s = new T.Mesh(new T.PlaneGeometry(2.0, 1.0), new T.MeshBasicMaterial({ map: signTexture(label, true), transparent: true }));
      s.position.set(0, 1.9, -0.75);
      g.add(s);
      v.sign = s;
      v.own.push(s);
      for (const x of [-0.75, 0.75]) add(new T.Mesh(postGeo, mat.woodDark), g, x, 0.75, -0.8); // two posts
    }
    if (p.item) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: gfx.emojiTexture(p.item.emoji), depthWrite: false }));
      sp.scale.setScalar(p.item.kind === 'heart' ? 1.0 : 0.95);
      sp.position.set(p.item.dx, mode === 'down' ? 0.75 : 1.25, 0.3);
      g.add(sp);
      v.item = sp;
      v.own.push(sp);
      if (p.item.kind === 'heart') {
        v.glow = new T.Sprite(new T.SpriteMaterial({ map: gfx.glowTexture(), color: '#ff5a7a', transparent: true, opacity: 0.6, depthWrite: false, blending: T.AdditiveBlending }));
        v.glow.scale.setScalar(1.6);
        v.glow.position.copy(sp.position).z -= 0.05;
        g.add(v.glow);
        v.own.push(v.glow);
      }
    }
    root.add(g);
    return v;
  }

  function dropPlatform(v) {
    root.remove(v.group);
    for (const o of v.own) {
      if (o.material) o.material.dispose();
      if (o.geometry && !o.isSprite) o.geometry.dispose();
    }
  }

  // ---------------------------------------------------------------- the two settings

  // DOWN: a rocky shaft with a spiky ceiling that follows the top of the screen.
  function buildDown() {
    const g = new T.Group();
    tex.rock.repeat.set(1, 1);
    const back = new T.Mesh(new T.PlaneGeometry(W + 0.4, WALL_H), mat.rock);
    tex.rockBack = tex.rock.clone();
    tex.rockBack.needsUpdate = true;
    tex.rockBack.repeat.set((W + 0.4) / WALL_TILE, WALL_H / WALL_TILE);
    back.material = mat.rock.clone();
    back.material.map = tex.rockBack;
    back.position.z = -1.0;
    back.receiveShadow = true;
    g.add(back);
    const sideGeo = new T.BoxGeometry(18, WALL_H, 2.8);
    gfx.boxUV(sideGeo, 18, WALL_H, 2.8, WALL_TILE);
    const sideMat = mat.rockSide;
    const sides = [];
    for (const s of [-1, 1]) {
      const m = new T.Mesh(sideGeo, sideMat);
      m.position.set(s * (HALF + 9), 0, 0.4);
      m.receiveShadow = true;
      g.add(m);
      sides.push(m);
    }
    // wooden posts along the shaft edges, like a mine
    const follow = [back, ...sides];
    for (const s of [-1, 1]) {
      const post = new T.Mesh(new T.BoxGeometry(0.22, WALL_H, 0.22), mat.woodDark);
      post.position.set(s * (HALF + 0.08), 0, 1.75);
      g.add(post);
      follow.push(post);
    }
    // the spiky ceiling: a striped bar with silver spikes hanging down; tips at y = 0 of this group
    const ceil = new T.Group();
    add(new T.Mesh(new T.BoxGeometry(W + 0.6, 8, 2.4), mat.ceiling), ceil, 0, 0.45 + 0.36 + 4, 0, false);
    const stripe = add(new T.Mesh(bodyGeo(W + 0.7, 0.5, 2.5), mat.hazard), ceil, 0, 0.36 + 0.24, 0, false);
    stripe.receiveShadow = false;
    const n = Math.floor(W / 0.34);
    for (let i = 0; i < n; i++) {
      for (const z of [-0.5, 0.5]) {
        const c = add(new T.Mesh(coneGeo, mat.spike), ceil, -W / 2 + 0.17 + ((W - 0.34) * (i + (z > 0 ? 0.5 : 0))) / n, 0.38, z, false);
        c.rotation.x = Math.PI; // point down
        c.scale.set(1.3, 1.1, 1.3);
      }
    }
    g.add(ceil);
    // the pit at the bottom of the screen: a soft purple haze
    const [hc, hg] = makeCanvas(4, 128);
    const gr = hg.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(40,20,70,0)');
    gr.addColorStop(1, 'rgba(40,20,70,0.85)');
    hg.fillStyle = gr;
    hg.fillRect(0, 0, 4, 128);
    const haze = new T.Mesh(new T.PlaneGeometry(60, 3), new T.MeshBasicMaterial({ map: toTexture(hc), transparent: true, depthWrite: false }));
    haze.position.z = 2.2;
    haze.renderOrder = 4;
    g.add(haze);
    // decorations on the walls: fossils, gems, mushrooms... picked by depth
    const deco = new T.Group();
    g.add(deco);
    return { group: g, back, sides, follow, ceil, haze, deco, decoFloors: new Map() };
  }

  // UP: the inside of a tower with big windows; sky, clouds, birds and later stars behind.
  function buildUp() {
    const g = new T.Group();
    tex.towerBack = tex.tower.clone();
    tex.towerBack.needsUpdate = true;
    tex.towerBack.repeat.set((W + 0.4) / WALL_TILE, WALL_H / WALL_TILE);
    const back = new T.Mesh(new T.PlaneGeometry(W + 0.4, WALL_H), mat.tower.clone());
    back.material.map = tex.towerBack;
    back.position.z = -1.2;
    back.receiveShadow = true;
    g.add(back);
    const pillarGeo = new T.BoxGeometry(1.4, WALL_H, 3.2);
    gfx.boxUV(pillarGeo, 1.4, WALL_H, 3.2, 2);
    const sides = [];
    for (const s of [-1, 1]) {
      const m = new T.Mesh(pillarGeo, mat.brick);
      m.position.set(s * (HALF + 0.7), 0, 0.4);
      m.receiveShadow = true;
      g.add(m);
      sides.push(m);
    }
    // the street at the bottom, and a little town far behind
    const street = new T.Group();
    add(new T.Mesh(new T.BoxGeometry(120, 1, 40), mat.grass), street, 0, -0.5, -10, false);
    add(new T.Mesh(new T.BoxGeometry(120, 6, 40), mat.dirt), street, 0, -4, -10, false);
    const houseCols = ['#ff9f6b', '#ffd36b', '#8fd1ff', '#c59bff', '#7fe0b5', '#ff8fb1'];
    for (let i = 0; i < 26; i++) {
      const x = -60 + i * 4.8 + Math.random() * 2;
      if (Math.abs(x) < 8) continue;
      const hgt = 3 + Math.random() * 9;
      const b = add(new T.Mesh(new T.BoxGeometry(3.6, hgt, 3), std(houseCols[i % houseCols.length])), street, x, hgt / 2, -14 - Math.random() * 8, false);
      b.receiveShadow = false;
    }
    g.add(street);
    const clouds = new T.Group();
    g.add(clouds);
    const deco = new T.Group();
    g.add(deco);
    // stars: a field of dots that fades in high up
    const starGeo = new T.BufferGeometry();
    const pos = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 140;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 2] = -40;
    }
    starGeo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const stars = new T.Points(starGeo, new T.PointsMaterial({ size: 0.5, map: gfx.dotTexture(), transparent: true, depthWrite: false, opacity: 0, color: '#fffbe0' }));
    g.add(stars);
    return { group: g, back, sides, street, clouds, deco, stars, decoFloors: new Map(), cloudCells: new Map() };
  }

  let down = null, up = null;

  function setMode(m) {
    mode = m;
    if (!down) {
      down = buildDown();
      up = buildUp();
      root.add(down.group, up.group);
    }
    down.group.visible = m === 'down';
    up.group.visible = m === 'up';
    clearPlatforms();
  }

  function clearPlatforms() {
    for (const v of plats.values()) dropPlatform(v);
    plats.clear();
    for (const d of debris) root.remove(d.m);
    debris.length = 0;
    for (const set of [down, up]) {
      if (!set) continue;
      for (const s of set.decoFloors.values()) set.deco.remove(s);
      set.decoFloors.clear();
      if (set.cloudCells) {
        for (const s of set.cloudCells.values()) set.clouds.remove(s);
        set.cloudCells.clear();
      }
    }
    for (const s of signs.values()) root.remove(s);
    signs.clear();
  }

  // colours as you go: DOWN by depth, UP by height (sky)
  const DOWN_ROCK = [[0, '#d8b48a'], [25, '#e0956a'], [50, '#a993d8'], [75, '#7aa6dc'], [100, '#6fd0b8'], [150, '#e9a6d6'], [200, '#d8b48a']];
  const DOWN_SKY = [[0, '#3a2a22'], [50, '#2a2040'], [100, '#183038'], [200, '#3a2a22']];
  const UP_SKY = [[0, '#8fd3ff'], [20, '#9ad8ff'], [45, '#ffc08f'], [62, '#ff8fb1'], [80, '#5b4bb5'], [100, '#1d1a52'], [140, '#0b0b25']];
  const DOWN_DECO = [
    [0, ['🪨', '🐛', '🦴', '🥕']],
    [20, ['🦴', '🪨', '🦕', '🐚']],
    [45, ['💎', '🔮', '🦴', '🦕']],
    [70, ['🍄', '💎', '🐌', '🔮']],
    [95, ['💎', '👑', '🪙', '🍄']],
  ];
  const UP_DECO = [
    [2, ['🐦', '🦋', '🐝']],
    [18, ['🎈', '🐦', '🪁']],
    [40, ['✈️', '🎈', '🌈']],
    [60, ['🌙', '🦉', '⭐']],
    [85, ['🪐', '🛸', '⭐', '☄️']],
    [120, ['🚀', '🛸', '🪐', '🌟']],
  ];
  const colorAt = (stops, f, out) => {
    let i = 0;
    while (i < stops.length - 2 && f > stops[i + 1][0]) i++;
    const [f0, c0] = stops[i], [f1, c1] = stops[i + 1];
    const k = clamp((f - f0) / (f1 - f0), 0, 1);
    return out.set(c0).lerp(tmpC.set(c1), k);
  };
  const tmpC = new T.Color(), skyC = new T.Color(), rockC = new T.Color();
  const pickFor = (table, f) => {
    let set = table[0][1];
    for (const [ff, s] of table) if (f >= ff) set = s;
    return set;
  };
  // small seeded hash so decorations are the same each time you pass a floor
  const hash = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  const signs = new Map();
  function ensureSigns(run, lo, hi) {
    const sign = (f) => {
      const y = run.course.rowY(f);
      const label = mode === 'down' ? `B${f}` : `${f}F`;
      const m = new T.Mesh(new T.PlaneGeometry(1.0, 0.5), new T.MeshBasicMaterial({ map: signTexture(label), transparent: true }));
      m.position.set(-HALF + 0.65, y + 1.35, mode === 'down' ? -0.95 : -1.1);
      return m;
    };
    for (let f = Math.max(5, Math.floor(lo / 5) * 5); f <= hi; f += 5) {
      if (f % S.MILESTONE === 0 || signs.has(f)) continue;
      const m = sign(f);
      signs.set(f, m);
      root.add(m);
    }
    for (const [f, m] of signs) {
      if (f < lo - 3 || f > hi + 3) {
        root.remove(m);
        m.material.dispose();
        m.geometry.dispose();
        signs.delete(f);
      }
    }
  }

  function ensureDeco(set, run, lo, hi, table, place) {
    for (let f = Math.max(0, lo); f <= hi; f++) {
      if (set.decoFloors.has(f)) continue;
      const items = [];
      const n = hash(f * 3.1) < 0.55 ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const r1 = hash(f * 7.3 + i * 13.1), r2 = hash(f * 2.9 + i * 5.7), r3 = hash(f * 11.7 + i * 3.3);
        const choices = pickFor(table, f);
        const e = choices[Math.floor(r1 * choices.length)];
        const sp = new T.Sprite(new T.SpriteMaterial({ map: gfx.emojiTexture(e), transparent: true, depthWrite: false }));
        place(sp, f, r2, r3, run);
        items.push(sp);
      }
      const grp = new T.Group();
      items.forEach((s) => grp.add(s));
      set.deco.add(grp);
      set.decoFloors.set(f, grp);
    }
    for (const [f, grp] of set.decoFloors) {
      if (f < lo - 4 || f > hi + 4) {
        set.deco.remove(grp);
        grp.children.forEach((s) => s.material.dispose());
        set.decoFloors.delete(f);
      }
    }
  }

  // ---------------------------------------------------------------- per frame

  // view: { cy (centre y), h (visible height), w (visible width) }
  // opts.hold: keep crumbling cookies in one piece for now (while the kid celebrates on one)
  function sync(run, view, dt, opts = {}) {
    time += dt;
    const c = run.course, R = run.M.ROW;
    const lo = view.cy - view.h / 2 - 3, hi = view.cy + view.h / 2 + 3;
    const fA = Math.floor(c.mode === 'down' ? -hi / R : lo / R), fB = Math.ceil(c.mode === 'down' ? -lo / R : hi / R);
    // platforms in view
    const seen = new Set();
    for (let k = Math.max(c.low, fA - 1); k <= Math.min(c.top, fB + 1); k++) {
      for (const p of c.row(k)) {
        seen.add(p.id);
        let v = plats.get(p.id);
        if (!v) {
          v = buildPlatform(p);
          plats.set(p.id, v);
        }
        updatePlatform(v, run, dt, opts.hold);
      }
    }
    for (const [id, v] of plats) {
      if (!seen.has(id)) {
        dropPlatform(v);
        plats.delete(id);
      }
    }
    // the walls jump along with the camera in whole tiles, so their textures stay put
    const snap = Math.round(view.cy / WALL_TILE) * WALL_TILE;
    const f = Math.max(0, c.mode === 'down' ? -view.cy / R : view.cy / R);
    if (mode === 'down') {
      for (const o of down.follow) o.position.y = snap;
      down.ceil.position.y = run.ceilY();
      down.haze.position.y = view.cy - view.h / 2 + 1.5;
      colorAt(DOWN_ROCK, f, rockC);
      down.back.material.color.copy(rockC);
      mat.rockSide.color.copy(rockC).multiplyScalar(0.72);
      colorAt(DOWN_SKY, f, skyC);
      scene.background = skyC;
      ensureDeco(down, run, fA - 2, fB + 2, DOWN_DECO, (sp, fl, r2, r3) => {
        // on the side walls' faces (seen on wide screens), or now and then small on the back wall
        const onBack = r3 < 0.3;
        const y = run.course.rowY(fl) + 0.8 + r2 * 1.2;
        if (onBack) {
          sp.position.set((r2 * 2 - 1) * (HALF - 1.2), y, -0.95);
          sp.scale.setScalar(0.55);
          sp.material.color.set('#9a8f88');
        } else {
          const side = r3 < 0.65 ? -1 : 1;
          sp.position.set(side * (HALF + 0.9 + r2 * 7), y, 1.85);
          sp.scale.setScalar(0.8 + r3 * 0.6);
          sp.material.color.set('#d8ccc4');
        }
      });
    } else {
      up.back.position.y = snap;
      for (const s of up.sides) s.position.y = snap;
      colorAt(UP_SKY, f, skyC);
      scene.background = skyC;
      up.stars.position.y = view.cy;
      up.stars.material.opacity = clamp((f - 55) / 35, 0, 1);
      up.street.visible = view.cy - view.h < 30;
      ensureClouds(view, f);
      ensureDeco(up, run, fA - 2, fB + 2, UP_DECO, (sp, fl, r2, r3) => {
        const y = run.course.rowY(fl) + r2 * 2;
        const side = r3 < 0.5 ? -1 : 1;
        sp.position.set(side * (HALF + 2.5 + r2 * 12), y, -6 - r3 * 10);
        sp.scale.setScalar(0.9 + r3 * 0.8);
        if (hash(fl) < 0.35) {
          sp.position.set((r2 * 2 - 1) * 3, y, -9); // seen through a window
          sp.scale.setScalar(0.8);
        }
      });
    }
    ensureSigns(run, Math.max(0, fA - 1), fB + 1);
    // conveyor belts run
    const belt = (dt * S.MODES.down.CONV) % 1;
    tex.beltL.offset.x = (tex.beltL.offset.x + belt) % 1;
    tex.beltR.offset.x = (tex.beltR.offset.x + belt) % 1;
    tex.beltFrontL.offset.x = (tex.beltFrontL.offset.x + belt) % 1;
    tex.beltFrontR.offset.x = (tex.beltFrontR.offset.x + belt) % 1;
    updateDebris(dt);
    fx.update(dt);
  }

  function ensureClouds(view, f) {
    const cell = 7;
    const a = Math.floor((view.cy - view.h) / cell), b = Math.ceil((view.cy + view.h) / cell);
    const fade = clamp(1 - (f - 60) / 30, 0, 1);
    for (let i = a; i <= b; i++) {
      if (up.cloudCells.has(i) || i < 1) continue;
      const grp = new T.Group();
      for (let j = 0; j < 2; j++) {
        const r1 = hash(i * 3.7 + j), r2 = hash(i * 9.1 + j * 4), r3 = hash(i * 1.3 + j * 7);
        const sp = new T.Sprite(new T.SpriteMaterial({ map: tex.cloud, transparent: true, depthWrite: false, opacity: 0.9 }));
        const z = -5 - r3 * 25;
        sp.position.set((r1 * 2 - 1) * (14 + -z * 0.6), i * cell + r2 * cell, z);
        const s = 4 + r3 * 7;
        sp.scale.set(s, s / 2, 1);
        grp.add(sp);
      }
      up.clouds.add(grp);
      up.cloudCells.set(i, grp);
    }
    for (const [i, grp] of up.cloudCells) {
      if (i < a - 2 || i > b + 2) {
        up.clouds.remove(grp);
        grp.children.forEach((s) => s.material.dispose());
        up.cloudCells.delete(i);
      } else grp.children.forEach((s) => (s.material.opacity = 0.9 * fade));
    }
  }

  function updatePlatform(v, run, dt, hold) {
    const p = v.p, g = v.group;
    g.position.x = p.x;
    // a cookie shakes while you stand on it, then crumbles
    if (p.type === 'crumble' && !v.broken) {
      const on = run.hero.on === p;
      g.position.x = p.x + (on ? Math.sin(time * 70) * 0.05 : 0);
      if (p.broken && !hold) crumble(v);
    }
    if (v.squashT > 0) {
      v.squashT = Math.max(0, v.squashT - dt);
      const s = Math.sin((1 - v.squashT / 0.3) * Math.PI);
      if (v.pad) {
        v.pad.position.y = -0.06 - s * 0.14;
        for (const c of v.coils) c.scale.y = 1 - s * 0.5;
      } else g.position.y = p.y - s * 0.08;
    } else g.position.y = p.y;
    if (p.defused && v.defuseT < 0) {
      v.defuseT = 0;
      fx.sparkle(p.x, p.y + 0.3, 10);
    }
    if (v.defuseT >= 0 && v.defuseT < 1) {
      v.defuseT = Math.min(1, v.defuseT + dt / 0.35);
      for (const c of v.cones) c.scale.y = 1 - v.defuseT;
    }
    if (v.item) {
      const taken = p.item.taken;
      v.item.visible = !taken;
      if (v.glow) v.glow.visible = !taken;
      if (!taken) {
        const b = Math.sin(time * 3 + p.id) * 0.08;
        v.item.position.y = (mode === 'down' ? 0.75 : 1.25) + b;
        if (v.glow) {
          v.glow.position.y = v.item.position.y;
          v.glow.material.opacity = 0.45 + Math.sin(time * 5) * 0.15;
        }
      }
    }
  }

  // ---------------------------------------------------------------- crumbs and debris

  const debris = [];
  function crumble(v) {
    v.broken = true;
    v.body.visible = false;
    const p = v.p;
    for (let i = 0; i < 5; i++) {
      const m = new T.Mesh(chunkGeo, mat.cookie);
      m.position.set(p.x - p.w / 2 + (p.w * (i + 0.5)) / 5, p.y - 0.2, 0);
      m.scale.set(p.w / 2.5, 1, 1);
      m.castShadow = true;
      root.add(m);
      debris.push({ m, vx: (Math.random() - 0.5) * 2.5, vy: 1 + Math.random() * 2, spin: (Math.random() - 0.5) * 8, t: 0 });
    }
    fx.dust(p.x, p.y, 16, '#e2a65e', p.w * 0.5);
  }
  function updateDebris(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.t += dt;
      d.vy -= 20 * dt;
      d.m.position.x += d.vx * dt;
      d.m.position.y += d.vy * dt;
      d.m.rotation.z += d.spin * dt;
      d.m.rotation.x += d.spin * 0.5 * dt;
      if (d.t > 1.6) {
        root.remove(d.m);
        debris.splice(i, 1);
      }
    }
  }

  function squash(p) {
    const v = plats.get(p.id);
    if (v) v.squashT = 0.3;
  }

  // ---------------------------------------------------------------- effects

  // Point sprites with their own size and colour (rgba); sizes are in metres.
  function makePoints(n) {
    const geo = new T.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 4), size = new Float32Array(n);
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('rgba', new T.BufferAttribute(col, 4));
    geo.setAttribute('size', new T.BufferAttribute(size, 1));
    const material = new T.ShaderMaterial({
      uniforms: { map: { value: gfx.dotTexture() }, scale: { value: 400 } },
      vertexShader: 'uniform float scale; attribute float size; attribute vec4 rgba; varying vec4 vC; void main() { vC = rgba; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; varying vec4 vC; void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a); }',
      transparent: true,
      depthWrite: false,
    });
    const pts = new T.Points(geo, material);
    pts.frustumCulled = false;
    pts.renderOrder = 6;
    const parts = [];
    for (let i = 0; i < n; i++) parts.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, size: 0.2, r: 1, g: 1, b: 1, grav: 0, drag: 0 });
    let next = 0;
    return {
      obj: pts,
      emit(x, y, z, o) {
        const q = parts[next];
        next = (next + 1) % n;
        const c = tmpC.set(o.color || '#ffffff');
        Object.assign(q, { on: true, x, y, z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, t: 0, life: o.life || 0.8, size: o.size || 0.25, r: c.r, g: c.g, b: c.b, grav: o.grav || 0, drag: o.drag || 0 });
      },
      update(dt) {
        for (let i = 0; i < n; i++) {
          const q = parts[i];
          if (!q.on) {
            col[i * 4 + 3] = 0;
            continue;
          }
          q.t += dt;
          if (q.t >= q.life) {
            q.on = false;
            col[i * 4 + 3] = 0;
            continue;
          }
          q.vy -= q.grav * dt;
          const dk = Math.exp(-q.drag * dt);
          q.vx *= dk; q.vy *= dk; q.vz *= dk;
          q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
          pos[i * 3] = q.x; pos[i * 3 + 1] = q.y; pos[i * 3 + 2] = q.z;
          col[i * 4] = q.r; col[i * 4 + 1] = q.g; col[i * 4 + 2] = q.b;
          col[i * 4 + 3] = 1 - q.t / q.life;
          size[i] = q.size * (q.shrink === false ? 1 : 1 - (q.t / q.life) * 0.5);
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.rgba.needsUpdate = true;
        geo.attributes.size.needsUpdate = true;
      },
    };
  }

  const CONFETTI = ['#ff3d7f', '#ffd400', '#18d4ff', '#5fe3b5', '#ff8a1f', '#a77bff', '#ffffff'];
  const sprites = [];
  let points = null;
  const fx = {
    setScale(s) { if (points) points.obj.material.uniforms.scale.value = s; },
    dust(x, y, n = 8, color = '#f4e6d0', spread = 0.4) {
      for (let i = 0; i < n; i++) {
        points.emit(x + (Math.random() - 0.5) * spread * 2, y + 0.05, (Math.random() - 0.5) * 1.2, {
          vx: (Math.random() - 0.5) * 3, vy: 0.5 + Math.random() * 1.5, vz: (Math.random() - 0.5), life: 0.5 + Math.random() * 0.3, size: 0.28 + Math.random() * 0.2, color, grav: 2, drag: 2,
        });
      }
    },
    sparkle(x, y, n = 12, color) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 3;
        points.emit(x, y, 0.5, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.4, size: 0.18 + Math.random() * 0.14, color: color || gfx.pick(['#fff6b0', '#ffffff', '#ffe14d']), drag: 2.5 });
      }
    },
    confetti(x, y, n = 60) {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, s = 5 + Math.random() * 7;
        points.emit(x + (Math.random() - 0.5), y, 0.8 + Math.random(), {
          vx: Math.cos(a + Math.PI) * s * 0.6, vy: -Math.sin(a + Math.PI) * s + 3, vz: (Math.random() - 0.5) * 2, life: 1.6 + Math.random() * 0.8, size: 0.22 + Math.random() * 0.12,
          color: gfx.pick(CONFETTI), grav: 9, drag: 1.4,
        });
      }
    },
    // an emoji that floats up (or flies along vx/vy) and fades
    emoji(e, x, y, o = {}) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: gfx.emojiTexture(e), transparent: true, depthWrite: false, depthTest: false }));
      sp.position.set(x, y, o.z !== undefined ? o.z : 1.2);
      sp.scale.setScalar(o.size || 0.7);
      sp.renderOrder = 8;
      scene.add(sp);
      sprites.push({ sp, t: 0, life: o.life || 1.1, vx: o.vx || (Math.random() - 0.5) * 0.8, vy: o.vy !== undefined ? o.vy : 1.6, grav: o.grav || 0, size: o.size || 0.7, pop: false, spin: o.spin || 0 });
      return sp;
    },
    // a comic burst with a word, popping in and out
    pow(word, x, y, size = 1.3) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: burstTexture(word), transparent: true, depthWrite: false, depthTest: false }));
      sp.position.set(x, y, 1.6);
      sp.material.rotation = (Math.random() - 0.5) * 0.4;
      sp.renderOrder = 9;
      scene.add(sp);
      sprites.push({ sp, t: 0, life: 0.65, vx: 0, vy: 0.4, grav: 0, size, pop: true, spin: 0 });
      for (let i = 0; i < 4; i++) fx.emoji('⭐', x, y, { size: 0.35, vx: (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 2.5, grav: 5, life: 0.7 });
    },
    update(dt) {
      points.update(dt);
      for (let i = sprites.length - 1; i >= 0; i--) {
        const s = sprites[i];
        s.t += dt;
        const k = s.t / s.life;
        if (k >= 1) {
          scene.remove(s.sp);
          s.sp.material.dispose();
          sprites.splice(i, 1);
          continue;
        }
        s.vy -= s.grav * dt;
        s.sp.position.x += s.vx * dt;
        s.sp.position.y += s.vy * dt;
        s.sp.material.rotation += s.spin * dt;
        if (s.pop) {
          const grow = k < 0.2 ? k / 0.2 : 1;
          s.sp.scale.setScalar(s.size * (0.4 + 0.6 * grow) * (1 + Math.sin(k * Math.PI) * 0.1));
          s.sp.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        } else s.sp.material.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      }
    },
    clear() {
      for (const s of sprites) {
        scene.remove(s.sp);
        s.sp.material.dispose();
      }
      sprites.length = 0;
    },
  };

  // ---------------------------------------------------------------- the pop-up hoop (Teddy's jump shot)

  let hoop = null;
  function buildHoop() {
    const g = new T.Group();
    const [c, gc] = makeCanvas(128, 96);
    gc.fillStyle = '#ffffff';
    gc.fillRect(0, 0, 128, 96);
    gc.strokeStyle = '#e8203a';
    gc.lineWidth = 8;
    gc.strokeRect(6, 6, 116, 84);
    gc.strokeRect(38, 40, 52, 40);
    add(new T.Mesh(new T.BoxGeometry(1.3, 0.95, 0.08), [mat.coil, mat.coil, mat.coil, mat.coil, new T.MeshStandardMaterial({ map: toTexture(c) }), mat.coil]), g, 0, 0.45, -0.1, false);
    const rim = add(new T.Mesh(new T.TorusGeometry(0.32, 0.035, 8, 24), std('#ff8a1f', { metalness: 0.4, roughness: 0.4 })), g, 0, 0.05, 0.3, false);
    rim.rotation.x = Math.PI / 2;
    const net = add(new T.Mesh(new T.CylinderGeometry(0.32, 0.2, 0.45, 12, 2, true), new T.MeshBasicMaterial({ color: '#ffffff', wireframe: true })), g, 0, -0.18, 0.3, false);
    void net;
    g.visible = false;
    scene.add(g);
    return { group: g, t: -1 };
  }
  const hoopApi = {
    // where the ball should drop through: the rim's centre in world space
    rim(out) { return out.set(hoop.group.position.x, hoop.group.position.y + 0.1, hoop.group.position.z + 0.3); },
    show(x, y, z) {
      hoop.group.position.set(x, y, z);
      hoop.group.visible = true;
      hoop.t = 0;
    },
    hide() { hoop.group.visible = false; hoop.t = -1; },
    update(dt) {
      if (hoop.t < 0) return;
      hoop.t += dt;
      const k = Math.min(1, hoop.t / 0.25);
      hoop.group.scale.setScalar(0.2 + 0.8 * (1 - Math.pow(1 - k, 3)));
    },
  };

  // ---------------------------------------------------------------- setup

  function init(sc) {
    scene = sc;
    root = new T.Group();
    scene.add(root);
    buildTextures();
    buildMaterials();
    points = makePoints(500);
    scene.add(points.obj);
    hoop = buildHoop();
  }

  function reset() {
    clearPlatforms();
    fx.clear();
    hoopApi.hide();
  }

  window.HFWorld = { init, setMode, reset, sync, squash, fx, hoop: hoopApi, burstTexture, get mode() { return mode; } };
})();
