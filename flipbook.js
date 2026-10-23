// ---------------------------------------------------------------------------
// Shared 3D flipbook. Each edition's index.html loads its own pages/pages.js and
// can override any setting below with `window.FLIPBOOK_CONFIG = { ... }`.
// Settings — the Landers (Real3D FlipBook) values are noted where they map.
// ---------------------------------------------------------------------------
const CONFIG = Object.assign({
  // Bottom-left buttons, in order. style: 'outline' gives the lighter secondary look.
  buttons: [
    { text: 'ORDER NOW', url: 'https://www.facebook.com/messages/t/1076302612237604' },   // Mori & Mill Messenger
    { text: 'RESERVE NOW', url: 'https://moriandmill.com/digitalmenu-page', style: 'outline' },
  ],
  flipDuration: 900,       // ms per page turn             (pageFlipDuration 1)
  pageBend: 0.5,           // paper curl: 0 = stiff board, 0.55 = floppy magazine (pageHardness)
  cornerPeel: 0.4,         // how far the held corner runs ahead, giving a diagonal fold; 0 = straight fold
  hoverLift: 0.14,         // how far a page corner lifts under the mouse (radians); 0 = off
  gloss: 0.62,             // page roughness: 1 = matte paper, lower = glossier magazine stock
  sound: true,             //                               (sound true)
  music: null,             // background music file, relative to the edition's index.html; null = none
  musicVolume: 0.35,
  topSpace: 58,            // px kept clear above the book (more when an edition decorates the top edge)
  clearStage: false,       // true = draw the book over a see-through stage, so an edition's backdrop shows
  ambientLight: 0.62,      // overall page brightness
  sunLight: 0.42,          // directional light that shades bends (lightIntensity 0.6)
  shadows: true,           //                               (shadows true, shadowMapSize 2048)
  spineShadow: 0.32,       // darkness of the centre fold   (pageMiddleShadow*)
  panMax: 20,              // degrees the book tilts when dragging the background (panMin/panMax ±20)
  maxZoom: 3,
  autoplayInterval: 3000,  //                               (autoplayInterval 3000)
  singlePageBelow: 768,    // portrait screens narrower than this show one page at a time (responsiveViewTreshold)
}, window.FLIPBOOK_CONFIG);

const TOP_SPACE = CONFIG.topSpace, BOTTOM_SPACE = 66, SIDE_SPACE = 70; // px kept clear of the toolbars and arrows
const SEGMENTS = 40;      // columns across a page; more = smoother curl
const ROWS = 16;          // rows down a page; lets the fold run diagonally
const SHEET_GAP = 0.002;  // depth between stacked sheets
const THICKNESS = 0.0008; // front/back separation of one sheet
const PI = Math.PI;

const $ = id => document.getElementById(id);
const stage = $('stage');

// ---------------------------------------------------------------------------
// Page loading
// ---------------------------------------------------------------------------
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}

async function loadPages() {
  await loadScript('pages/pages.js');
  const pages = window.FLIPBOOK_PAGES.map(p => ({ ...p }));
  if (location.protocol === 'file:') {
    // Browsers won't let WebGL read images straight off the disk, so use the inlined copies.
    await loadScript('pages/pages-embedded.js');
    pages.forEach((p, i) => { p.src = window.FLIPBOOK_PAGE_DATA[i]; });
  }
  let loaded = 0;
  const label = $('preloader-text').textContent.replace(/…$/, '');
  await Promise.all(pages.map(p => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      p.img = img;
      $('preloader-text').textContent = `${label}… ${Math.round(++loaded / pages.length * 100)}%`;
      resolve();
    };
    img.onerror = () => reject(new Error('Could not load ' + p.title));
    img.src = p.src;
  })));
  return pages;
}

// ---------------------------------------------------------------------------
// Book
// ---------------------------------------------------------------------------
let renderer, scene, camera, book, sun;
let pages, sheets = [], N = 0;
let LAST = 0;                 // how many sheets can be turned
let W = 1, H = 1.5;           // page size in world units (width is always 1)

function pageTexture(page, spineSide) {
  const iw = page ? page.img.naturalWidth : 1024;
  const c = document.createElement('canvas');
  c.width = Math.min(2048, iw);
  c.height = Math.round(c.width * H / W);
  const g = c.getContext('2d');
  g.fillStyle = '#f6f1e7';
  g.fillRect(0, 0, c.width, c.height);
  if (page) {
    // contain, so a page with a different shape is never cropped
    const s = Math.min(c.width / page.img.naturalWidth, c.height / page.img.naturalHeight);
    const dw = page.img.naturalWidth * s, dh = page.img.naturalHeight * s;
    g.drawImage(page.img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
  }
  // fold shadow along the spine edge
  const w = c.width * 0.1;
  const x0 = spineSide === 'left' ? 0 : c.width;
  const grad = g.createLinearGradient(x0, 0, spineSide === 'left' ? w : c.width - w, 0);
  grad.addColorStop(0, `rgba(0,0,0,${CONFIG.spineShadow})`);
  grad.addColorStop(0.25, `rgba(0,0,0,${CONFIG.spineShadow * 0.45})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(spineSide === 'left' ? 0 : c.width - w, 0, w, c.height);

  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// One physical sheet: front = a right-hand page, back = the left-hand page after it.
// It hinges on the spine (x = 0) and turns through `angle` 0 (lying right) .. PI (lying left).
// The page is a grid of columns × rows; every row bends a little differently so the paper
// peels from a corner and curls like a magazine page instead of swinging like a board.
class Sheet {
  constructor(index, front, back) {
    this.index = index;
    this.angle = 0;
    this.dir = 1;         // +1 turning forward, -1 turning back
    this.grabTop = false; // which corner is held: the bottom one unless the reader grabbed the top
    this.peek = 0;        // hover lift (radians), eased toward peekTarget
    this.peekTarget = 0;
    this.anim = null;

    const cols = SEGMENTS + 1, side = cols * (ROWS + 1);
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(side * 2 * 3);
    this.nrm = new Float32Array(side * 2 * 3);
    this.front = new Float32Array(side * 3);   // scratch: front surface before thickness
    const uv = new Float32Array(side * 2 * 2);
    const idx = [];
    for (let r = 0; r <= ROWS; r++) {
      for (let j = 0; j <= SEGMENTS; j++) {
        const i = r * cols + j;
        uv[i * 2] = j / SEGMENTS;                 uv[i * 2 + 1] = r / ROWS;
        uv[(side + i) * 2] = 1 - j / SEGMENTS;    uv[(side + i) * 2 + 1] = r / ROWS;
      }
    }
    for (let s = 0; s < 2; s++) {
      for (let r = 0; r < ROWS; r++) {
        for (let j = 0; j < SEGMENTS; j++) {
          const a = s * side + r * cols + j, b = a + 1, c = a + cols + 1, d = a + cols;
          if (s === 0) idx.push(a, b, c, a, c, d);
          else idx.push(a, c, b, a, d, c);
        }
      }
    }
    const faces = SEGMENTS * ROWS * 6;
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.addGroup(0, faces, 0);
    geo.addGroup(faces, faces, 1);
    this.geo = geo;

    const mat = tex => new THREE.MeshStandardMaterial({ map: tex, roughness: CONFIG.gloss, metalness: 0 });
    this.mesh = new THREE.Mesh(geo, [mat(pageTexture(front, 'left')), mat(pageTexture(back, 'right'))]);
    this.mesh.castShadow = this.mesh.receiveShadow = CONFIG.shadows;
    this.mesh.frustumCulled = false;
    this.update();
  }

  // Turn angle including any hover lift, which always lifts away from the side the sheet rests on.
  get turn() { return this.angle + (this.angle >= PI / 2 ? -this.peek : this.peek); }

  update() {
    const a0 = this.turn, s = Math.sin(a0);
    const q = this.dir > 0 ? a0 / PI : 1 - a0 / PI;   // progress of this turn: 0 lifting .. 1 landed
    // Curl: the pulled edge leads while the page rises, then trails behind as air catches it on the way down.
    const curl = CONFIG.pageBend * s * (1 - 1.8 * q) * this.dir;
    // Peel: the held corner runs ahead of the far one, so the fold line is diagonal.
    const peel = CONFIG.cornerPeel * s * this.dir;
    // (Every offset above is a fraction of sin(a0) below 1, which keeps the page between 0 and PI: it never dips into the book.)

    const t = a0 / PI;
    const zOff = ((N - this.index) * (1 - t) + (this.index + 1) * t) * SHEET_GAP;
    const cols = SEGMENTS + 1, side = cols * (ROWS + 1), ds = W / SEGMENTS;
    const f = this.front, p = this.pos, n = this.nrm;

    for (let r = 0; r <= ROWS; r++) {
      const v = r / ROWS;
      const held = this.grabTop ? v : 1 - v;           // 1 along the held corner's edge, 0 at the far one
      const base = a0 + peel * (held - 0.5);
      const rowCurl = curl * (0.55 + 0.9 * held);      // the held corner also curls most
      const y = (v - 0.5) * H;
      let x = 0, z = 0;
      for (let j = 0; j <= SEGMENTS; j++) {
        if (j > 0) {
          const um = (j - 0.5) / SEGMENTS, am = base + rowCurl * um * um;
          x += Math.cos(am) * ds;
          z += Math.sin(am) * ds;
        }
        const i = (r * cols + j) * 3;
        f[i] = x; f[i + 1] = y; f[i + 2] = z + zOff;
      }
    }

    // Normals from neighbouring points, then offset the back face by the paper's thickness.
    for (let r = 0; r <= ROWS; r++) {
      const r0 = Math.max(0, r - 1), r1 = Math.min(ROWS, r + 1);
      for (let j = 0; j <= SEGMENTS; j++) {
        const j0 = Math.max(0, j - 1), j1 = Math.min(SEGMENTS, j + 1);
        const a = (r * cols + j0) * 3, b = (r * cols + j1) * 3, c = (r0 * cols + j) * 3, d = (r1 * cols + j) * 3;
        const ux = f[b] - f[a], uy = f[b + 1] - f[a + 1], uz = f[b + 2] - f[a + 2];
        const vx = f[d] - f[c], vy = f[d + 1] - f[c + 1], vz = f[d + 2] - f[c + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        const i = (r * cols + j) * 3, k = (side + r * cols + j) * 3;
        p[i] = f[i]; p[i + 1] = f[i + 1]; p[i + 2] = f[i + 2];
        n[i] = nx; n[i + 1] = ny; n[i + 2] = nz;
        p[k] = f[i] - nx * THICKNESS; p[k + 1] = f[i + 1] - ny * THICKNESS; p[k + 2] = f[i + 2] - nz * THICKNESS;
        n[k] = -nx; n[k + 1] = -ny; n[k + 2] = -nz;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }
}

function buildScene() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: CONFIG.clearStage });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), CONFIG.clearStage ? 0 : 1);
  renderer.shadowMap.enabled = CONFIG.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);

  scene.add(new THREE.AmbientLight(0xffffff, CONFIG.ambientLight));
  sun = new THREE.DirectionalLight(0xffffff, CONFIG.sunLight);
  sun.position.set(-0.9, 1.2, 2.3);   // high and to the left, so a lifted page drops a visible shadow
  sun.castShadow = CONFIG.shadows;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -2.2, right: 2.2, top: 1.8, bottom: -1.8, near: 0.5, far: 6 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.004;
  sun.shadow.radius = 6;
  scene.add(sun, sun.target);

  book = new THREE.Group();
  scene.add(book);
}

function buildBook() {
  const first = pages[0].img;
  H = W * first.naturalHeight / first.naturalWidth;
  document.documentElement.style.setProperty('--page-aspect', `${first.naturalWidth} / ${first.naturalHeight}`);
  N = Math.ceil(pages.length / 2);
  // With an odd page count the last page stays on the right; turning it would only show a blank back.
  LAST = pages.length % 2 ? N - 1 : N;
  for (let i = 0; i < N; i++) {
    const s = new Sheet(i, pages[i * 2], pages[i * 2 + 1] || null);
    sheets.push(s);
    book.add(s.mesh);
  }
}

// ---------------------------------------------------------------------------
// State: `current` sheets have been turned. Left page = back of sheet current-1,
// right page = front of sheet current. In single-page view `focus` picks the side shown.
// ---------------------------------------------------------------------------
let current = 0;
let focus = 'right';
let single = false;
let zoom = 1, zoomTarget = 1;
let yaw = 0;
const pan = { x: 0, y: 0 }, cam = { x: 0, y: 0 };
let needsRender = true;

// A hand-turned page: eases off the stack, swings through the middle, then settles softly.
const easeTurn = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);

// Fold a hover lift into the real angle so a turn continues from where the corner already is.
function absorbPeek(sheet) {
  if (!sheet.peek) return false;
  sheet.angle = sheet.turn;
  sheet.peek = sheet.peekTarget = 0;
  return true;
}

function animateSheet(sheet, to, ease = easeTurn) {
  const lifted = absorbPeek(sheet);
  const from = sheet.angle;
  if (from === to) { sheet.anim = null; return; }
  // Only pick the curl direction when starting flat; changing it mid-turn would make the page jump.
  // A page lifted by hover already has its direction and held corner.
  if (from === 0 || from === PI) { sheet.dir = to > from ? 1 : -1; sheet.grabTop = false; }
  else if (lifted && Math.sign(to - from) !== sheet.dir) sheet.dir = -sheet.dir;
  sheet.anim = { from, to, start: performance.now(), dur: Math.max(250, CONFIG.flipDuration * Math.abs(to - from) / PI), ease };
  playFlipSound();
  needsRender = true;
}

function next() {
  if (single && focus === 'left' && current < N) { focus = 'right'; return changed(); }
  if (current >= LAST) return;
  animateSheet(sheets[current], PI);
  current++;
  focus = 'left';
  changed();
}

function prev() {
  if (single && focus === 'right' && current > 0) { focus = 'left'; return changed(); }
  if (current <= 0) return;
  current--;
  animateSheet(sheets[current], 0);
  focus = 'right';
  changed();
}

// page is 1-based
function goToPage(page) {
  page = Math.max(1, Math.min(pages.length, page));
  const target = Math.floor(page / 2);
  focus = page % 2 === 0 ? 'left' : 'right';
  if (target > current) {
    for (let i = current; i < target - 1; i++) { sheets[i].anim = null; sheets[i].angle = PI; sheets[i].update(); }
    animateSheet(sheets[target - 1], PI);
  } else if (target < current) {
    for (let i = target + 1; i < current; i++) { sheets[i].anim = null; sheets[i].angle = 0; sheets[i].update(); }
    animateSheet(sheets[target], 0);
  }
  current = target;
  changed();
}

function visiblePages() {
  const left = current > 0 ? current * 2 : null;          // page numbers, 1-based
  const right = current < N && current * 2 + 1 <= pages.length ? current * 2 + 1 : null;
  if (single) return focus === 'left' ? [left || right] : [right || left];
  return [left, right].filter(Boolean);
}

function changed() {
  if (current === 0) focus = 'right';
  if (current === N) focus = 'left';
  const shown = visiblePages();
  $('counter').textContent = `${shown.join('-')} / ${pages.length}`;
  $('btn-prev').disabled = current === 0;
  $('btn-next').disabled = current >= LAST && (!single || focus === 'right' || LAST === N);
  document.querySelectorAll('.thumb').forEach((t, i) => t.classList.toggle('active', shown.includes(i + 1)));
  $('announce').textContent = shown.map(n => `Page ${n}: ${pages[n - 1].title}`).join(', ');
  needsRender = true;
}

// ---------------------------------------------------------------------------
// Layout + render loop
// ---------------------------------------------------------------------------
let vw = 0, vh = 0;

function layout() {
  vw = window.innerWidth; vh = window.innerHeight;
  const wasSingle = single;
  single = vw < CONFIG.singlePageBelow && vw < vh;
  renderer.setSize(vw, vh);
  camera.aspect = vw / vh;
  camera.updateProjectionMatrix();
  if (wasSingle !== single) changed();
  // lets an edition's decorations redraw around the book
  window.dispatchEvent(new CustomEvent('flipbook:layout', { detail: bookScreenRect() }));
  needsRender = true;
}

// The world-height the camera must see so the book fits between the toolbars.
function fitHeight() {
  const needW = single ? W : 2 * W;
  const availW = Math.max(100, vw - 2 * (single ? 36 : SIDE_SPACE));
  const availH = Math.max(100, vh - TOP_SPACE - BOTTOM_SPACE);
  return Math.max(H * vh / availH, needW * vh / availW) * 1.04;
}

// Where the open book sits on screen at normal zoom, in CSS pixels.
function bookScreenRect() {
  const s = vh / fitHeight();
  const w = (single ? W : 2 * W) * s, h = H * s;
  const cy = vh / 2 + (TOP_SPACE - BOTTOM_SPACE) / 2;
  return { left: (vw - w) / 2, top: cy - h / 2, width: w, height: h, vw, vh };
}

// Closed book sits centred: cover alone shifts left by half a page, back cover alone shifts right.
function bookOffset() {
  if (!N) return 0;
  return -W / 2 * (1 - sheets[0].angle / PI) + W / 2 * (sheets[N - 1].angle / PI);
}

let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  let busy = dragging;

  const kPeek = 1 - Math.exp(-dt * 14);
  for (const s of sheets) {
    let moved = false;
    if (s.anim) {
      const t = Math.min(1, (now - s.anim.start) / s.anim.dur);
      s.angle = s.anim.from + (s.anim.to - s.anim.from) * s.anim.ease(t);
      if (t >= 1) { s.angle = s.anim.to; s.anim = null; }
      moved = true;
    }
    if (s.peek !== s.peekTarget) {
      s.peek += (s.peekTarget - s.peek) * kPeek;
      if (Math.abs(s.peekTarget - s.peek) < 0.002) s.peek = s.peekTarget;
      moved = true;
    }
    if (moved) { s.update(); busy = true; }
  }

  // Only the top sheet of each stack (plus any sheet in motion or lifted) needs drawing.
  let rightTop = -1, leftTop = -1;
  sheets.forEach((s, i) => {
    if (s.peek) return;
    if (s.angle === 0 && rightTop < 0) rightTop = i;
    if (s.angle === PI) leftTop = i;
  });
  sheets.forEach((s, i) => { s.mesh.visible = (s.angle > 0 && s.angle < PI) || s.peek > 0 || i === rightTop || i === leftTop; });

  const offset = bookOffset();
  book.position.x = offset;

  if (zoomTarget <= 1.001) { pan.x = 0; pan.y = 0; }
  const k = 1 - Math.exp(-dt * 9);
  const focusX = single ? offset + (focus === 'right' ? W / 2 : -W / 2) : 0;
  const prevZoom = zoom, prevX = cam.x, prevY = cam.y;
  zoom += (zoomTarget - zoom) * k;
  cam.x += (focusX + pan.x - cam.x) * k;
  cam.y += (pan.y - cam.y) * k;
  if (Math.abs(zoom - prevZoom) + Math.abs(cam.x - prevX) + Math.abs(cam.y - prevY) > 1e-5) busy = true;

  const visH = fitHeight() / zoom;
  const dist = visH / (2 * Math.tan(camera.fov * PI / 360));
  const lift = (TOP_SPACE - BOTTOM_SPACE) / 2 * visH / vh;    // centre the book between the toolbars
  const ty = cam.y + lift, yr = yaw * PI / 180;
  camera.position.set(cam.x + Math.sin(yr) * dist, ty, Math.cos(yr) * dist);
  camera.lookAt(cam.x, ty, 0);
  sun.target.position.set(cam.x, 0, 0);

  if (busy || needsRender) {
    renderer.render(scene, camera);
    needsRender = false;
  }
}

// ---------------------------------------------------------------------------
// Pointer: drag a page to turn it, tap to turn, drag the background to tilt,
// drag to pan when zoomed, wheel / pinch to zoom.
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
let dragging = false;
let drag = null;
const pointers = new Map();
let pinch = null;

function toWorld(clientX, clientY) {
  const ndc = new THREE.Vector2(clientX / vw * 2 - 1, -(clientY / vh) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, hit) ? hit : null;
}

// Which page (if any) is under the pointer: 'left' | 'right' | null
function pageAt(clientX, clientY) {
  const p = toWorld(clientX, clientY);
  if (!p || Math.abs(p.y) > H / 2) return null;
  const x = p.x - book.position.x;
  if (x >= 0 && x <= W && current < LAST) return 'right';
  if (x < 0 && x >= -W && current > 0) return 'left';
  return null;
}

// Mouse near a page's outer corner lifts that corner a little, the way a reader thumbs a page.
let peeking = null;
function hoverCorner(clientX, clientY) {
  let sheet = null, top = false;
  const p = CONFIG.hoverLift > 0 && zoomTarget <= 1.01 && !dragging ? toWorld(clientX, clientY) : null;
  if (p && Math.abs(p.y) <= H / 2) {
    const x = p.x - book.position.x;
    const nearEdge = Math.abs(x) > W * 0.78 && Math.abs(x) <= W;
    const nearCorner = Math.abs(p.y) > H * 0.28;
    if (nearEdge && nearCorner) {
      const s = x > 0 ? (current < LAST ? sheets[current] : null) : (current > 0 ? sheets[current - 1] : null);
      if (s && !s.anim && (s.angle === 0 || s.angle === PI)) { sheet = s; top = p.y > 0; }
    }
  }
  if (peeking && peeking !== sheet) peeking.peekTarget = 0;
  if (sheet) {
    if (!sheet.peek) { sheet.dir = sheet.angle === 0 ? 1 : -1; sheet.grabTop = top; }
    sheet.peekTarget = CONFIG.hoverLift;
  }
  peeking = sheet;
  needsRender = true;
}

function setZoom(z, clientX, clientY) {
  z = Math.max(1, Math.min(CONFIG.maxZoom, z));
  if (clientX != null && z > 1) {
    // keep the point under the pointer roughly still
    const p = toWorld(clientX, clientY);
    if (p) {
      const f = 1 - zoomTarget / z;
      pan.x += (p.x - cam.x) * f;
      pan.y += (p.y - cam.y) * f;
    }
  }
  zoomTarget = z;
  clampPan();
  $('btn-zoom-out').disabled = z <= 1;
  $('btn-zoom-in').disabled = z >= CONFIG.maxZoom;
  needsRender = true;
}

function clampPan() {
  const mx = (single ? W / 2 : W) * (1 - 1 / zoomTarget) + 0.1, my = H / 2 * (1 - 1 / zoomTarget) + 0.1;
  pan.x = Math.max(-mx, Math.min(mx, pan.x));
  pan.y = Math.max(-my, Math.min(my, pan.y));
}

stage.addEventListener('pointerdown', e => {
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  closeOverlays();
  if (pointers.size === 2) {
    // second finger: switch to pinch zoom, cancel any page drag
    cancelDrag();
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: zoomTarget };
    return;
  }
  if (pointers.size > 2) return;
  const side = pageAt(e.clientX, e.clientY);
  const p = toWorld(e.clientX, e.clientY);
  drag = {
    id: e.pointerId, x0: e.clientX, y0: e.clientY, lastX: e.clientX, lastT: performance.now(), v: 0,
    moved: false, side, wx0: p ? p.x : 0, wy0: p ? p.y : 0,
    mode: zoomTarget > 1.01 ? 'pan' : side ? 'page' : 'tilt',
    sheet: null, startAngle: 0, panX: pan.x, panY: pan.y, yaw0: yaw,
  };
});

stage.addEventListener('pointermove', e => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    setZoom(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
    return;
  }
  if (!drag || drag.id !== e.pointerId) {
    if (e.pointerType === 'mouse') {
      stage.classList.toggle('over-page', !!pageAt(e.clientX, e.clientY) && zoomTarget <= 1.01);
      hoverCorner(e.clientX, e.clientY);
    }
    return;
  }
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (!drag.moved && Math.hypot(dx, dy) < 6) return;
  if (!drag.moved) {
    drag.moved = true;
    dragging = true;
    stage.classList.add('dragging');
    if (drag.mode === 'page') {
      drag.sheet = drag.side === 'right' ? sheets[current] : sheets[current - 1];
      drag.sheet.anim = null;
      absorbPeek(drag.sheet);
      if (drag.sheet.angle === 0 || drag.sheet.angle === PI) drag.sheet.dir = drag.side === 'right' ? 1 : -1;
      // the corner nearest where the page was grabbed leads the fold
      if (drag.sheet.angle < 0.3 || drag.sheet.angle > PI - 0.3) drag.sheet.grabTop = drag.wy0 > 0;
      drag.startAngle = drag.sheet.angle;
      playFlipSound();
    }
  }
  const now = performance.now();
  drag.v = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT);   // px per ms
  drag.lastX = e.clientX; drag.lastT = now;

  if (drag.mode === 'page') {
    const p = toWorld(e.clientX, e.clientY);
    if (!p) return;
    // dragging across both pages (2W) turns the sheet fully; a little extra so it needn't go edge to edge
    const a = drag.startAngle + (drag.wx0 - p.x) / (2 * W) * PI * 1.3;
    drag.sheet.angle = Math.max(0, Math.min(PI, a));
    drag.sheet.update();
  } else if (drag.mode === 'pan') {
    const perPx = fitHeight() / zoom / vh;
    pan.x = drag.panX - dx * perPx;
    pan.y = drag.panY + dy * perPx;
    clampPan();
  } else {
    yaw = Math.max(-CONFIG.panMax, Math.min(CONFIG.panMax, drag.yaw0 - dx * 0.12));
  }
  needsRender = true;
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; return; }
  if (!drag || drag.id !== e.pointerId) return;
  const d = drag;
  drag = null;
  dragging = false;
  stage.classList.remove('dragging');

  if (!d.moved) {
    if (e.type === 'pointercancel') return;
    // tap / click: right side goes forward, left side goes back
    if (single) (d.x0 > vw / 2 ? next : prev)();
    else if (d.side === 'right') next();
    else if (d.side === 'left') prev();
    return;
  }
  if (d.mode !== 'page') return;
  // finish the turn if it is past halfway or was flicked that way
  const forward = d.side === 'right';
  const flick = (forward ? -d.v : d.v) * 0.45;   // px/ms in the turning direction
  const progress = forward ? d.sheet.angle / PI : 1 - d.sheet.angle / PI;
  const complete = progress + flick > 0.5;
  if (forward) {
    animateSheet(d.sheet, complete ? PI : 0, easeOut);
    if (complete) { current++; focus = 'left'; }
  } else {
    animateSheet(d.sheet, complete ? 0 : PI, easeOut);
    if (complete) { current--; focus = 'right'; }
  }
  changed();
}

function cancelDrag() {
  if (drag && drag.sheet) animateSheet(drag.sheet, drag.side === 'right' ? 0 : PI, easeOut);
  drag = null;
  dragging = false;
  stage.classList.remove('dragging');
}

stage.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !dragging) hoverCorner(-1e4, -1e4); });
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('wheel', e => {
  e.preventDefault();
  setZoom(zoomTarget * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
}, { passive: false });

// ---------------------------------------------------------------------------
// Sound — a short paper swish, synthesised so there is no audio file to ship.
// ---------------------------------------------------------------------------
let soundOn = CONFIG.sound, audioCtx = null;
function playFlipSound() {
  if (!soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx, dur = 0.42;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length;
      d[i] = (Math.random() * 2 - 1) * Math.pow(Math.sin(PI * Math.min(1, t * 1.4)), 2) * (1 - t * 0.6);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(3200, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + dur);
    const gain = ctx.createGain();
    gain.gain.value = 0.22;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  } catch (_) { /* audio is optional */ }
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Background music — an edition opts in with CONFIG.music. Browsers only allow sound after the
// reader interacts, so it fades in on their first tap, click or key press unless they muted it.
// ---------------------------------------------------------------------------
const NOTE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>';
const NOTE_OFF_ICON = NOTE_ICON.replace('</svg>', '<path d="M3 3l18 18"/></svg>');

function setupMusic() {
  if (!CONFIG.music) return;
  const audio = new Audio(CONFIG.music);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0;

  let on = true;                       // the reader's choice; remembered between visits
  try { on = localStorage.getItem('flipbook-music') !== 'off'; } catch (_) {}
  let fadeTimer = null;

  const btn = document.createElement('button');
  btn.className = 'icon-btn';
  btn.id = 'btn-music';
  document.querySelector('.bottombar').prepend(btn);

  const render = () => {
    const playing = !audio.paused;
    btn.innerHTML = playing ? NOTE_ICON : NOTE_OFF_ICON;
    btn.setAttribute('aria-label', playing ? 'Mute music' : 'Play music');
    btn.setAttribute('aria-pressed', String(playing));
    btn.classList.toggle('waiting', on && !playing);   // nudges the reader that music is waiting for a tap
  };

  const fadeTo = (target, ms, done) => {
    clearInterval(fadeTimer);
    const from = audio.volume, start = performance.now();
    fadeTimer = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / ms);
      audio.volume = from + (target - from) * t;
      if (t >= 1) { clearInterval(fadeTimer); if (done) done(); }
    }, 40);
  };

  const start = () => {
    if (!on || !audio.paused) return;
    audio.play().then(() => { fadeTo(CONFIG.musicVolume, 1500); render(); }).catch(() => { /* not allowed yet */ });
  };
  const stop = () => fadeTo(0, 350, () => { audio.pause(); render(); });

  btn.addEventListener('click', e => {
    e.stopPropagation();
    on = audio.paused;
    try { localStorage.setItem('flipbook-music', on ? 'on' : 'off'); } catch (_) {}
    on ? start() : stop();
    render();
  });

  // First interaction anywhere else unlocks audio. Touch counts on release, mouse on press.
  const unlock = e => {
    if (e.target.closest && e.target.closest('#btn-music')) return;
    start();
  };
  ['pointerdown', 'pointerup', 'keydown'].forEach(type => document.addEventListener(type, unlock, true));
  audio.addEventListener('play', () => {
    ['pointerdown', 'pointerup', 'keydown'].forEach(type => document.removeEventListener(type, unlock, true));
  }, { once: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (!audio.paused) { clearInterval(fadeTimer); audio.pause(); audio.volume = 0; } }
    else if (on && audio.currentTime > 0) start();
  });
  audio.addEventListener('pause', render);
  audio.addEventListener('play', render);
  render();
}

let autoplayTimer = null;
function setAutoplay(on) {
  clearInterval(autoplayTimer);
  autoplayTimer = on ? setInterval(() => ($('btn-next').disabled ? goToPage(1) : next()), CONFIG.autoplayInterval) : null;
  $('icon-play').innerHTML = on ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M7 4.5v15l13-7.5z"/>';
  $('btn-play').setAttribute('aria-label', on ? 'Pause autoplay' : 'Autoplay');
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}

function closeOverlays() {
  $('thumbs-panel').classList.remove('open');
  $('btn-thumbs').setAttribute('aria-expanded', 'false');
  $('menu').classList.remove('open');
  $('btn-more').setAttribute('aria-expanded', 'false');
}

function buildUI() {
  CONFIG.buttons.forEach(btn => {
    const a = document.createElement('a');
    a.className = 'cta-btn' + (btn.style === 'outline' ? ' outline' : '');
    a.textContent = btn.text;
    a.href = btn.url;
    a.target = '_blank';
    a.rel = 'noopener';
    $('cta').appendChild(a);
  });

  const thumbs = $('thumbs');
  pages.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'thumb';
    b.innerHTML = `<img alt="" loading="lazy"><span></span>`;
    b.querySelector('img').src = p.src;
    b.querySelector('span').textContent = `${i + 1}. ${p.title}`;
    b.addEventListener('click', () => { goToPage(i + 1); closeOverlays(); });
    thumbs.appendChild(b);
  });

  $('btn-prev').addEventListener('click', prev);
  $('btn-next').addEventListener('click', next);
  $('btn-zoom-in').addEventListener('click', () => setZoom(zoomTarget * 1.5));
  $('btn-zoom-out').addEventListener('click', () => setZoom(zoomTarget / 1.5));
  $('btn-play').addEventListener('click', () => setAutoplay(!autoplayTimer));
  $('btn-thumbs').addEventListener('click', e => {
    e.stopPropagation();
    const open = !$('thumbs-panel').classList.contains('open');
    closeOverlays();
    $('thumbs-panel').classList.toggle('open', open);
    $('btn-thumbs').setAttribute('aria-expanded', String(open));
  });
  $('thumbs-close').addEventListener('click', closeOverlays);
  $('btn-more').addEventListener('click', e => {
    e.stopPropagation();
    const open = !$('menu').classList.contains('open');
    closeOverlays();
    $('menu').classList.toggle('open', open);
    $('btn-more').setAttribute('aria-expanded', String(open));
  });
  $('menu-first').addEventListener('click', () => { goToPage(1); closeOverlays(); });
  $('menu-last').addEventListener('click', () => { goToPage(pages.length); closeOverlays(); });
  $('menu-sound').addEventListener('click', () => {
    soundOn = !soundOn;
    $('menu-sound').textContent = `Sound: ${soundOn ? 'on' : 'off'}`;
  });
  // Inside a frame (e.g. a shared viewer) our own URL isn't the one people should get, so leave sharing to the host.
  if (window.self !== window.top) $('btn-share').hidden = true;
  $('btn-share').addEventListener('click', async () => {
    const url = location.href.split('#')[0];
    try {
      if (navigator.share) await navigator.share({ title: document.title, url });
      else { await navigator.clipboard.writeText(url); toast('Link copied'); }
    } catch (_) { /* share sheet dismissed */ }
  });

  const root = document.documentElement;
  const fsSupported = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!fsSupported) $('btn-full').hidden = true;
  $('btn-full').addEventListener('click', () => {
    try {
      const req = document.fullscreenElement || document.webkitFullscreenElement
        ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
        : (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
      if (req && req.catch) req.catch(() => toast('Fullscreen isn’t available here'));
    } catch (_) { toast('Fullscreen isn’t available here'); }
  });

  document.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') next();
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev();
    else if (e.key === 'Home') goToPage(1);
    else if (e.key === 'End') goToPage(pages.length);
    else if (e.key === '+' || e.key === '=') setZoom(zoomTarget * 1.5);
    else if (e.key === '-') setZoom(zoomTarget / 1.5);
    else if (e.key === 'Escape') closeOverlays();
    else return;
    e.preventDefault();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.menu, .panel, #btn-more, #btn-thumbs')) closeOverlays();
  });
  window.addEventListener('resize', layout);
  setupMusic();
  setZoom(1);
}

// ---------------------------------------------------------------------------
(async function start() {
  try {
    buildScene();
  } catch (err) {
    $('preloader-text').textContent = 'This browser can’t show the 3D menu. Please try Chrome, Edge, Safari or Firefox.';
    $('preloader').querySelector('.ring').remove();
    return;
  }
  try {
    pages = await loadPages();
  } catch (err) {
    $('preloader-text').textContent = err.message;
    $('preloader').querySelector('.ring').remove();
    return;
  }
  buildBook();
  buildUI();
  layout();
  changed();
  const startPage = parseInt(new URLSearchParams(location.search).get('page'), 10);
  if (startPage > 1) goToPage(startPage);
  requestAnimationFrame(frame);
  $('preloader').classList.add('done');
})();
