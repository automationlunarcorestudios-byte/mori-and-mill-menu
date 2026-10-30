// ---------------------------------------------------------------------------
// Christmas decorations drawn around the flipbook: a pine garland with warm string
// lights along the top, ornament clusters in the top corners, bells and baubles
// hanging in the space beside the book, and soft bokeh behind it all.
// Everything is drawn in code (no image files), redrawn whenever the layout changes.
// ---------------------------------------------------------------------------
(function () {
  const PI = Math.PI;
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PINE = {
    back:  { stem: '#0a2a1f', needles: ['#0b2e22', '#0f3a2b', '#123f30'] },
    mid:   { stem: '#123a2b', needles: ['#16513b', '#1a5c43', '#1e6a4b'] },
    front: { stem: '#1b4d38', needles: ['#2a7a55', '#2f8a5f', '#3a9867', '#5fae7d'] },
  };
  const BAUBLE = {
    gold: ['#fff1c2', '#e3b558', '#8a5d1a'],
    teal: ['#8fe0ee', '#0a7d97', '#03323f'],
    red:  ['#ff8a8f', '#c3232f', '#4d0a10'],
  };

  // seeded random, so the decorations look the same on every redraw
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function makeCanvas(cls) {
    const c = document.createElement('canvas');
    c.className = 'decor ' + cls;
    c.setAttribute('aria-hidden', 'true');
    return c;
  }
  const back = makeCanvas('back');     // bokeh behind the book
  const front = makeCanvas('front');   // garland and corner clusters
  const live = makeCanvas('front');    // twinkling lights and swaying ornaments
  const stage = document.getElementById('stage');
  document.body.insertBefore(back, stage);
  stage.after(front, live);

  let W = 0, H = 0, u = 1, dpr = 1, rect = null;
  let bulbs = [], hangers = [];

  function size(c) {
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    c.style.width = W + 'px'; c.style.height = H + 'px';
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    return g;
  }

  // ---- drawing pieces ------------------------------------------------------
  function branch(g, x, y, ang, len, shade, r, s) {
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    g.lineCap = 'round';
    g.strokeStyle = shade.stem; g.lineWidth = 1.8 * s;
    g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
    const steps = Math.max(5, Math.floor(len / (3 * s)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, px = x + (ex - x) * t, py = y + (ey - y) * t;
      const nl = (12 + r() * 6) * s * (1 - 0.5 * t);
      for (const side of [-1, 1]) {
        const a = ang + side * (0.7 + r() * 0.4);
        g.strokeStyle = shade.needles[(r() * shade.needles.length) | 0];
        g.lineWidth = (1.1 + r() * 0.7) * s;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * nl, py + Math.sin(a) * nl); g.stroke();
      }
    }
  }

  // a branch plus a couple of side shoots, like a real pine sprig
  function sprig(g, x, y, ang, len, shade, r, s) {
    branch(g, x, y, ang, len, shade, r, s);
    const n = 1 + (r() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const t = 0.35 + r() * 0.35, side = r() < 0.5 ? -1 : 1;
      branch(g, x + Math.cos(ang) * len * t, y + Math.sin(ang) * len * t, ang + side * (0.5 + r() * 0.3), len * (0.4 + r() * 0.2), shade, r, s);
    }
  }

  function bauble(g, x, y, rad, kind) {
    const [hi, base, dark] = BAUBLE[kind];
    const gr = g.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.08, x, y, rad * 1.05);
    gr.addColorStop(0, hi); gr.addColorStop(0.45, base); gr.addColorStop(1, dark);
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, rad, 0, PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.beginPath(); g.ellipse(x - rad * 0.38, y - rad * 0.42, rad * 0.18, rad * 0.1, -0.7, 0, PI * 2); g.fill();
    // cap and loop
    const cg = g.createLinearGradient(x - rad * 0.3, 0, x + rad * 0.3, 0);
    cg.addColorStop(0, '#7a5418'); cg.addColorStop(0.5, '#f5d98a'); cg.addColorStop(1, '#7a5418');
    g.fillStyle = cg;
    g.fillRect(x - rad * 0.26, y - rad * 1.16, rad * 0.52, rad * 0.26);
    g.strokeStyle = '#c9a050'; g.lineWidth = Math.max(1, rad * 0.08);
    g.beginPath(); g.arc(x, y - rad * 1.24, rad * 0.14, PI, 0); g.stroke();
  }

  function star(g, x, y, rad, rot) {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? rad * 0.42 : rad, a = -PI / 2 + i * PI / 5;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    const gr = g.createLinearGradient(-rad, -rad, rad, rad);
    gr.addColorStop(0, '#fff0bd'); gr.addColorStop(0.5, '#dcae4e'); gr.addColorStop(1, '#8c6220');
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(90,60,15,.6)'; g.lineWidth = 0.8; g.stroke();
    g.restore();
  }

  function cone(g, x, y, len, ang, r) {
    g.save(); g.translate(x, y); g.rotate(ang);
    const rows = 7;
    for (let i = rows; i >= 0; i--) {
      const t = i / rows, cy = t * len, w = len * 0.32 * Math.sin(PI * (0.12 + 0.8 * t));
      for (let k = -2; k <= 2; k++) {
        const sx = k * w * 0.42 + (i % 2 ? w * 0.2 : 0);
        if (Math.abs(sx) > w) continue;
        g.fillStyle = ['#6b4423', '#7d522b', '#5a3819'][(r() * 3) | 0];
        g.beginPath(); g.ellipse(sx, cy, w * 0.32, len * 0.09, 0, 0, PI * 2); g.fill();
        g.fillStyle = 'rgba(30,15,5,.55)';
        g.beginPath(); g.ellipse(sx, cy - len * 0.035, w * 0.26, len * 0.04, 0, 0, PI); g.fill();
      }
    }
    g.restore();
  }

  function berries(g, x, y, s, r) {
    const n = 3 + (r() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const bx = x + (r() - 0.5) * 14 * s, by = y + (r() - 0.5) * 12 * s, br = (3.2 + r() * 1.4) * s;
      const gr = g.createRadialGradient(bx - br * 0.3, by - br * 0.3, br * 0.1, bx, by, br);
      gr.addColorStop(0, '#ff6b6b'); gr.addColorStop(0.6, '#b51c28'); gr.addColorStop(1, '#5a0810');
      g.fillStyle = gr; g.beginPath(); g.arc(bx, by, br, 0, PI * 2); g.fill();
    }
  }

  // two gold bells under a red bow, hanging from their top centre
  function bells(g, h) {
    const one = (dx, rot) => {
      g.save(); g.translate(dx, 0); g.rotate(rot);
      const w = h * 0.95;
      g.beginPath();
      g.moveTo(-0.16 * w, 0.04 * h);
      g.bezierCurveTo(-0.36 * w, 0.06 * h, -0.30 * w, 0.58 * h, -0.5 * w, 0.86 * h);
      g.quadraticCurveTo(0, 0.98 * h, 0.5 * w, 0.86 * h);
      g.bezierCurveTo(0.30 * w, 0.58 * h, 0.36 * w, 0.06 * h, 0.16 * w, 0.04 * h);
      g.quadraticCurveTo(0, -0.06 * h, -0.16 * w, 0.04 * h);
      const gr = g.createLinearGradient(-0.5 * w, 0, 0.5 * w, 0);
      gr.addColorStop(0, '#6e4a12'); gr.addColorStop(0.3, '#f8e3a0'); gr.addColorStop(0.55, '#d4a442'); gr.addColorStop(1, '#5e3d0e');
      g.fillStyle = gr; g.fill();
      g.fillStyle = '#5a3b0c';
      g.beginPath(); g.ellipse(0, 0.87 * h, 0.47 * w, 0.07 * h, 0, 0, PI * 2); g.fill();
      g.fillStyle = '#e8c062';
      g.beginPath(); g.arc(0, 0.95 * h, 0.09 * w, 0, PI * 2); g.fill();
      g.restore();
    };
    one(-h * 0.26, 0.22);
    one(h * 0.26, -0.22);
    // bow
    const red = (x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, '#e2404b'); gr.addColorStop(1, '#7c0f19'); return gr; };
    g.fillStyle = red(-h * 0.5, -h * 0.2, h * 0.1, h * 0.1);
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, -h * 0.02);
      g.bezierCurveTo(side * h * 0.55, -h * 0.42, side * h * 0.62, h * 0.12, 0, -h * 0.02);
      g.fill();
      g.beginPath();   // tail
      g.moveTo(side * h * 0.04, 0);
      g.bezierCurveTo(side * h * 0.16, h * 0.25, side * h * 0.05, h * 0.42, side * h * 0.2, h * 0.62);
      g.lineTo(side * h * 0.28, h * 0.56);
      g.bezierCurveTo(side * h * 0.14, h * 0.4, side * h * 0.24, h * 0.22, side * h * 0.1, -h * 0.01);
      g.fill();
    }
    g.fillStyle = '#9c1520';
    g.beginPath(); g.ellipse(0, -h * 0.02, h * 0.09, h * 0.08, 0, 0, PI * 2); g.fill();
  }

  // ---- layout --------------------------------------------------------------
  const sagAt = x => {
    const P = Math.max(260, 330 * u);
    return 16 * u * Math.sin(PI * (((x % P) + P) % P) / P);
  };
  const garlandY = x => 26 * u + sagAt(x);

  function drawBackdrop() {
    const g = size(back);
    const cx = W / 2, cy = rect ? rect.top + rect.height / 2 : H / 2;
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.65);
    glow.addColorStop(0, 'rgba(255, 214, 140, 0.10)');
    glow.addColorStop(1, 'rgba(255, 214, 140, 0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    const r = rng(7);
    for (let i = 0; i < 46; i++) {
      const x = r() * W, y = r() * H, rad = (10 + r() * 34) * u;
      const warm = r() < 0.8, a = 0.05 + r() * 0.1;
      const col = warm ? '255, 205, 120' : '120, 210, 220';
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${col}, ${a})`); gr.addColorStop(0.7, `rgba(${col}, ${a * 0.6})`); gr.addColorStop(1, `rgba(${col}, 0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, PI * 2); g.fill();
    }
  }

  function drawGarland(g) {
    const r = rng(11);
    for (const [layer, len, step] of [['back', 62, 11], ['mid', 52, 13], ['front', 40, 16]]) {
      for (let x = -30; x < W + 30; x += step * u) {
        const y = garlandY(x) + (r() - 0.5) * 10 * u;
        const dir = r() < 0.5 ? 0 : PI;
        const ang = dir + (r() - 0.35) * 1.1 * (dir ? -1 : 1);
        sprig(g, x, y, ang, (len + r() * 22) * u, PINE[layer], r, u);
      }
      if (layer === 'mid') {
        // light wire, tucked between the needle layers
        g.strokeStyle = 'rgba(20, 30, 20, .8)'; g.lineWidth = 1.2 * u;
        g.beginPath();
        for (let x = 0; x <= W; x += 6) g.lineTo(x, garlandY(x) + 8 * u + 5 * u * Math.sin(x / (60 * u)));
        g.stroke();
      }
    }
  }

  function drawCorner(g, mirror, seed) {
    const r = rng(seed), R = 200 * u;
    g.save();
    if (mirror) { g.translate(W, 0); g.scale(-1, 1); }
    for (const [layer, n, minL, maxL] of [['back', 26, 0.55, 1], ['mid', 22, 0.45, 0.85], ['front', 16, 0.3, 0.65]]) {
      for (let i = 0; i < n; i++) {
        const a = -0.15 + r() * (PI / 2 + 0.3);
        const ox = r() * 18 * u, oy = r() * 18 * u;
        sprig(g, ox, oy, a, R * (minL + r() * (maxL - minL)), PINE[layer], r, u);
      }
    }
    // ornaments nestled in the greenery
    const at = (rad, ang) => [Math.cos(ang) * rad * R, Math.sin(ang) * rad * R];
    cone(g, ...at(0.55, 0.95), 34 * u, 0.5, r);
    cone(g, ...at(0.7, 0.32), 28 * u, -0.6, r);
    berries(g, ...at(0.42, 0.55), u, r);
    berries(g, ...at(0.78, 1.15), u, r);
    berries(g, ...at(0.62, 0.12), u, r);
    star(g, ...at(0.5, 0.2), 13 * u, 0.2);
    star(g, ...at(0.82, 0.75), 10 * u, -0.3);
    bauble(g, ...at(0.36, 0.95), 19 * u, 'gold');
    bauble(g, ...at(0.6, 0.62), 15 * u, 'teal');
    bauble(g, ...at(0.3, 0.3), 12 * u, 'red');
    bauble(g, ...at(0.88, 0.45), 11 * u, 'gold');
    g.restore();
  }

  function planLights() {
    const r = rng(23);
    bulbs = [];
    for (let x = 8 * u; x < W; x += 24 * u) {
      bulbs.push({
        x: x + (r() - 0.5) * 6 * u,
        y: garlandY(x) + 8 * u + 5 * u * Math.sin(x / (60 * u)) + (r() - 0.5) * 5 * u,
        speed: 1.2 + r() * 2.2, phase: r() * PI * 2,
      });
    }
  }

  // bells and baubles on gold thread, only where there's room beside the book
  function planHangers() {
    hangers = [];
    if (!rect) return;
    const gutter = rect.left;
    if (gutter < 110 * Math.min(1, u)) return;
    const maxDrop = Math.max(0, H / 2 - 70 - 40 * u);
    if (maxDrop < 90) return;
    const left = [
      { x: gutter * 0.42, drop: maxDrop * 0.55, kind: 'bells', size: 46 * u },
      { x: gutter * 0.78, drop: maxDrop * 0.92, kind: 'teal', size: 17 * u },
    ];
    const right = [
      { x: W - gutter * 0.42, drop: maxDrop * 0.8, kind: 'gold', size: 20 * u },
      { x: W - gutter * 0.75, drop: maxDrop * 0.48, kind: 'star', size: 15 * u },
    ];
    hangers = left.concat(right).map((h, i) => Object.assign(h, { top: garlandY(h.x) + 10 * u, phase: i * 1.7 }));
  }

  function drawLive(t) {
    const g = live.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    for (const h of hangers) {
      const sway = reduceMotion ? 0 : 0.05 * Math.sin(t * 0.0011 + h.phase);
      const ex = h.x + Math.sin(sway) * h.drop, ey = h.top + Math.cos(sway) * h.drop;
      g.strokeStyle = 'rgba(232, 201, 122, .85)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(h.x, h.top); g.lineTo(ex, ey); g.stroke();
      g.save(); g.translate(ex, ey); g.rotate(-sway);
      if (h.kind === 'bells') bells(g, h.size);
      else if (h.kind === 'star') star(g, 0, h.size, h.size, 0);
      else bauble(g, 0, h.size * 1.25, h.size, h.kind);
      g.restore();
    }
    for (const b of bulbs) {
      const a = reduceMotion ? 0.85 : 0.55 + 0.45 * Math.sin(t * 0.001 * b.speed + b.phase);
      const glow = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, 13 * u);
      glow.addColorStop(0, `rgba(255, 214, 130, ${0.55 * a})`);
      glow.addColorStop(1, 'rgba(255, 214, 130, 0)');
      g.fillStyle = glow; g.beginPath(); g.arc(b.x, b.y, 13 * u, 0, PI * 2); g.fill();
      g.fillStyle = `rgba(255, 244, 205, ${0.5 + 0.5 * a})`;
      g.beginPath(); g.arc(b.x, b.y, 2.4 * u, 0, PI * 2); g.fill();
    }
  }

  function redraw() {
    W = window.innerWidth; H = window.innerHeight;
    // a window with no size yet (hidden tab, mid-resize) gets drawn on the next layout instead
    if (!W || !H) return;
    if (rect && !['left', 'top', 'width', 'height'].every(k => Number.isFinite(rect[k]))) rect = null;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    u = Math.max(0.5, Math.min(1.15, Math.min(W / 1280, H / 800)));
    drawBackdrop();
    const g = size(front);
    drawGarland(g);
    drawCorner(g, false, 31);
    drawCorner(g, true, 47);
    // nothing may hang over the pages: trim greenery where the open book sits
    if (rect) g.clearRect(rect.left - 2, rect.top - 2, rect.width + 4, rect.height + 4);
    size(live);
    planLights();
    planHangers();
    drawLive(performance.now());
  }

  let last = 0;
  function tick(t) {
    requestAnimationFrame(tick);
    if (document.hidden || t - last < 33) return;   // ~30 fps is plenty for twinkles
    last = t;
    drawLive(t);
  }

  window.addEventListener('flipbook:layout', e => { rect = e.detail; redraw(); });
  redraw();
  if (!reduceMotion) requestAnimationFrame(tick);
})();
