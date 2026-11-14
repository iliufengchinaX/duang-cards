// Undertow — a waterfall of light in which every thread is a life.
//
// A curtain of 2,400 optical fibres hangs in the dark. Each fibre is one story, and its
// photographs flow down it as a stream. Far away the fibres are a curtain of blue light;
// closer, each thread takes its story's colour; closer still, the threads become a mosaic of
// tiny moving pictures, and finally single photographs drifting down one line. Point at a
// thread to lift it out of the curtain; touch it to open its story.
//
// The streams cost nothing extra: the fibre fragment shader works out which photograph of
// which story sits at each point of each fibre. Everything is drawn additively into a
// half-float buffer, with a mirrored, blurred copy for the floor, a mip-chain bloom, and a
// final tone-mapping pass.

import { StoryView } from './story.js';
import { clamp, smooth, damp, mulberry } from './math.js';
import { createGLHelpers } from './gl.js';
import { loadCatalog } from './catalog.js';
import { createPhotoArray, streamTextures } from './photos.js';
import { buildStories, NF, STREAM_TH, streamLayer } from './stories.js';
import { IDLE, TOUCHES, DROPS, FIBRE_VS, FIBRE_FS, FLOOR_VS, FLOOR_FS, CHILD_VS, CHILD_FS, POST_VS, DOWN_FS, UP_FS, BLUR_FS, COMPOSITE_FS } from './shaders.js';

const canvas = document.getElementById('stream');
const CAPTURE = new URLSearchParams(location.search).has('capture');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE, premultipliedAlpha: true });
const body = document.body;
const $ = s => document.querySelector(s);
const $loader = $('#loader i'), $meter = $('#meter'), $cursor = $('#cursor'), $ring = $('#ring'), $announce = $('#announce');
const $child = $('#child'), $video = $('#child-video'), $music = $('#music'), $musicBtn = $('#music-btn'), $tip = $('#tip'), $tipTitle = $('#tip b'), $tipMeta = $('#tip span'), $pause = $('#pause');

const SEG = 64;           // segments per fibre
const CH = 15;            // height of the bar the curtain hangs from
const YB = 1.05;          // height where fibres start to bend onto the floor
const F = 1.6;            // focal length (NDC)
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const QS = new URLSearchParams(location.search);
const SHOTS = { hands: 0.4, third: 2.15, two: 3.08, open: 4.9 };
const gate = { active: false, p: 0, frozen: false, open: 0, navigated: false, seeked: false };

const rng = mulberry(0x2545f491);

// ────────────────────────────────────────────────────────────── state

let W = innerWidth, H = innerHeight, DPR = Math.min(devicePixelRatio || 1, 2), PW = 1, PH = 1;
let CW = 18, SPACING = CW / NF, PHOTO_W = 0.8 * SPACING, SLOT = 1.9 * PHOTO_W;
let stories = [], photos = [], atlases = [];
const fib = {
  x0: new Float32Array(NF), seed: new Float32Array(NF), speed: new Float32Array(NF),
  o: new Float32Array(NF), v: new Float32Array(NF), py: new Float32Array(NF).fill(CH * 0.5), phase: new Float64Array(NF),
  flow: new Float64Array(NF), hold: new Float32Array(NF),   // hold: 1 while a thread is being looked at
  strand: new Float32Array(NF), cell: new Float64Array(NF),  // how lit a thread is from afar; last speck cell at the water
};
const P = {}, T = {}, vaos = {};
let RT = null, arrTex = null;
let program, dataTexture, updateTexture, target, freeTarget;

const cam = { x: 0, y: 0, ls: 0, lsT: 0, vx: 0, vy: 0 };
let anchor = null, motion = 1;
const pointer = { x: -1, y: -1, inside: false, speed: 0, reach: 0, wvx: 0, lastX: -1 };
const hover = { line: -1, t: 0 };
let kbLine = -1;
const select = { line: -1, t: 0, target: 0 };
const pluck = { line: -1, age: 99, amp: 0 };
const idle = Array.from({ length: IDLE }, () => ({ line: -1, age: 99 }));
let idleNext = 2.5;
let flow = 1, paused = false, time = 0, intro = 0, lastInput = 0;
let sleeping = false, last = performance.now(), zoomUntil = 0;
let drag = null, pinch = null;
const touches = new Map();
let view = null, lsBeforeStory = null;

// From afar the curtain fills the whole screen: its top is out of sight above, and the eye
// sits low enough that the water in front of it reads as a platform.
const FRAME_TOP = CH - 3.6, FRAME_BOTTOM = -2.9;
const HOME_Y = (FRAME_TOP + FRAME_BOTTOM) / 2;
const fitScale = () => Math.max(H / (FRAME_TOP - FRAME_BOTTOM), W / (CW - 0.8));
const LS_MIN = () => Math.log(fitScale());

// The child stands on the water a little in front of the curtain. He is a filmed loop (1280×720,
// on green) in which he trots across the frame and catches the light with one hand or both.
// The track below is where his feet, his hand and the top of him are in that frame, sampled
// from the film. At rest he stands on the center line.
const NARROW = innerWidth < 640;
const CHILD = { x: 0, z: 0.75, h: NARROW ? 1.9 : 2.15, feetV: 0.97, homeU: 0.496, aspect: 1280 / 720 };
CHILD.frameH = CHILD.h / 0.94;
CHILD.frameW = CHILD.frameH * CHILD.aspect;
const LOOP = 15.042;
// time, feet across, hand across, top of the figure (0 is the top of the frame)
const POSE = [
  [0.00, 0.496, 0.496, 0.036], [0.25, 0.495, 0.495, 0.036], [0.50, 0.495, 0.495, 0.036], [0.75, 0.495, 0.495, 0.036],
  [1.00, 0.496, 0.494, 0.036], [1.25, 0.496, 0.493, 0.039], [1.50, 0.496, 0.493, 0.039], [1.75, 0.496, 0.494, 0.039],
  [2.01, 0.496, 0.496, 0.039], [2.26, 0.496, 0.496, 0.039], [2.51, 0.496, 0.494, 0.039], [2.76, 0.496, 0.493, 0.039],
  [3.01, 0.495, 0.486, 0.036], [3.26, 0.490, 0.470, 0.042], [3.51, 0.413, 0.422, 0.081], [3.76, 0.382, 0.366, 0.064],
  [4.01, 0.367, 0.341, 0.039], [4.26, 0.356, 0.328, 0.044], [4.51, 0.353, 0.323, 0.058], [4.76, 0.342, 0.316, 0.064],
  [5.01, 0.303, 0.306, 0.058], [5.26, 0.310, 0.320, 0.072], [5.52, 0.316, 0.315, 0.072], [5.77, 0.328, 0.307, 0.072],
  [6.02, 0.332, 0.310, 0.072], [6.27, 0.333, 0.319, 0.078], [6.52, 0.334, 0.313, 0.078], [6.77, 0.334, 0.303, 0.072],
  [7.02, 0.333, 0.290, 0.072], [7.27, 0.342, 0.275, 0.078], [7.52, 0.360, 0.313, 0.072], [7.77, 0.432, 0.390, 0.092],
  [8.02, 0.490, 0.464, 0.075], [8.27, 0.515, 0.507, 0.081], [8.52, 0.589, 0.574, 0.089], [8.77, 0.644, 0.591, 0.069],
  [9.03, 0.672, 0.594, 0.083], [9.28, 0.678, 0.609, 0.078], [9.53, 0.676, 0.624, 0.078], [9.78, 0.676, 0.641, 0.078],
  [10.03, 0.676, 0.645, 0.081], [10.28, 0.676, 0.650, 0.081], [10.53, 0.675, 0.652, 0.081], [10.78, 0.673, 0.651, 0.081],
  [11.03, 0.662, 0.648, 0.075], [11.28, 0.641, 0.638, 0.072], [11.53, 0.633, 0.616, 0.072], [11.78, 0.618, 0.592, 0.061],
  [12.03, 0.583, 0.567, 0.053], [12.28, 0.566, 0.555, 0.053], [12.54, 0.505, 0.529, 0.047], [12.79, 0.492, 0.497, 0.042],
  [13.04, 0.494, 0.489, 0.036], [13.29, 0.496, 0.491, 0.036], [13.54, 0.497, 0.496, 0.036], [13.79, 0.497, 0.500, 0.036],
  [14.04, 0.497, 0.501, 0.036], [14.29, 0.497, 0.500, 0.036], [14.54, 0.497, 0.498, 0.036], [14.79, 0.496, 0.496, 0.036],
  [15.04, 0.496, 0.496, 0.036],
];
function childX(u) { return CHILD.x + (u - CHILD.homeU) * CHILD.frameW; }
function childY(v) { return (CHILD.feetV - v) * CHILD.frameH; }
function poseAt(t) {
  const u = ((t % LOOP) + LOOP) % LOOP;
  let i = 1;
  while (i < POSE.length - 1 && POSE[i][0] < u) i++;
  const a = POSE[i - 1], b = POSE[i];
  const k = b[0] > a[0] ? Math.min(1, (u - a[0]) / (b[0] - a[0])) : 0;
  return { feet: a[1] + (b[1] - a[1]) * k, hand: a[2] + (b[2] - a[2]) * k, top: a[3] + (b[3] - a[3]) * k };
}
let childPose = poseAt(0);
function glowX() { return childX(childPose.hand); }
// The visitor's ripples on the water, and the child's footsteps.
const touchRipples = Array.from({ length: TOUCHES }, () => ({ x: 0, z: 0, age: 99 }));
let touchNext = 0, lastTouch = { x: 0, z: 0 };
// Rings where specks land. The specks are placed by a hash in the fibre shader; this is the
// same hash, so a ring starts exactly when and where a speck reaches the water.
const drops = Array.from({ length: DROPS }, () => ({ x: 0, age: 99, amp: 0 }));
function pcg(v) {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}
const dropData = new Float32Array(DROPS * 4);
const h2 = (a, b) => pcg((Math.imul(a >>> 0, 1664525) ^ pcg((b + 1013904223) >>> 0)) >>> 0) / 4294967295;
const feet = { a: 99, b: 99, last: 0, anchor: 0.496, r0: { x: CHILD.x, z: CHILD.z }, r1: { x: CHILD.x + 0.16, z: CHILD.z } };
let show = 0, childOn = false, stillAt = -1, childW = 1280, childH = 720, childDirty = false;
let handLine = -1, glow = 0, nextReach = 3.5, heroShown = -1;
let tween = null;
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const LS_MAX = () => Math.log(Math.min(W, H) * 0.55 / PHOTO_W);
const camDist = () => F * H / (2 * Math.exp(cam.ls));
const zoomT = () => clamp((cam.ls - LS_MIN()) / (LS_MAX() - LS_MIN()), 0, 1);

function unproject(sx, sy) {
  const d = camDist();
  return { x: cam.x + (sx / W * 2 - 1) * (W / H) * d / F, y: cam.y + (1 - sy / H * 2) * d / F };
}
function project(x, y, z = 0) {
  const d = camDist() - z;
  return { x: ((x - cam.x) * F / d / (W / H) + 1) / 2 * W, y: (1 - (y - cam.y) * F / d) / 2 * H };
}
// Has a speck on thread i just reached the water? (Mirrors the speck test in FIBRE_FS.)
function landing(i, viewL, viewR) {
  const k = Math.floor(fib.flow[i] * (0.8 + fib.seed[i] * 0.5) * 5.5);
  const old = fib.cell[i];
  fib.cell[i] = k;
  if (old < 0 || k <= old || k - old > 3) return;
  const x = fib.x0[i];
  if (x < viewL || x > viewR) return;
  const thr = 0.86 - 0.1 * Math.exp(-(((x - glowX()) / 1.2) ** 2)) * glow;
  for (let c = old + 1; c <= k; c++) {
    if (h2(i, c) < thr) continue;
    const d = drops.reduce((a, b) => (b.age > a.age ? b : a));
    if (d.age < 0.5) return;
    d.x = x; d.age = 0; d.amp = fib.strand[i] === 1 ? 0.6 : 0.32;
  }
}
// Where a point on screen meets the water, if it does.
function floorAt(sx, sy) {
  const ny = 1 - sy / H * 2;
  if (ny >= -1e-3 || cam.y <= 0) return null;
  const depth = -cam.y * F / ny, z = camDist() - depth;
  if (z < -0.2 || z > 9) return null;
  return { x: cam.x + (sx / W * 2 - 1) * (W / H) * depth / F, z };
}
function touchWater(sx, sy, strong) {
  const p = floorAt(sx, sy);
  if (!p || zoomT() > 0.3) return;
  const now = performance.now();
  if (!strong && (now < touchNext || Math.hypot(p.x - lastTouch.x, p.z - lastTouch.z) < 0.12)) return;
  touchNext = now + 70; lastTouch = p;
  const r = touchRipples.reduce((a, b) => (b.age > a.age ? b : a));
  r.x = p.x; r.z = p.z; r.age = strong ? -0.0001 : 0.25;
}

// ────────────────────────────────────────────────────────────── world

function buildFibres() {
  // Wide enough to cover this window, or the whole screen should the window grow.
  const aspect = Math.max(W / H, (screen.width || W) / (screen.height || H));
  CW = clamp((FRAME_TOP - FRAME_BOTTOM) * aspect * 1.12, 8.5, 42);
  SPACING = CW / NF; PHOTO_W = 0.8 * SPACING; SLOT = 1.9 * PHOTO_W;
  const rows = Math.ceil(NF / 1024), fs = new Float32Array(1024 * rows * 4);
  for (let i = 0; i < NF; i++) {
    fib.x0[i] = -CW / 2 + (i + 0.5 + (rng() - 0.5) * 0.2) * SPACING;
    fib.seed[i] = rng(); fib.speed[i] = 0.8 + rng() * 0.45; rng(); fib.phase[i] = 0;
    fs.set([fib.x0[i], fib.seed[i], fib.speed[i], rng()], i * 4);
    const pick = h2(i, 4242);
    fib.strand[i] = pick > 0.925 ? 1 : pick > 0.78 ? 0.32 : 0;
    fib.cell[i] = -1;
  }
  T.fibS = dataTexture(1024, rows, fs);
  T.fibD = dataTexture(1024, rows, new Float32Array(1024 * rows * 4));
}

function uploadStories() {
  const data = new Float32Array(1024 * Math.ceil(NF * 3 / 1024) * 4);
  stories.forEach((s, i) => {
    const L = s.chapters.map(c => c.layer);
    data.set([s.chapters.length, ...s.col], i * 12);
    data.set([L[0] ?? 0, L[1] ?? 0, L[2] ?? 0, L[3] ?? 0, L[4] ?? 0, L[5] ?? 0, L[6] ?? 0, L[7] ?? 0], i * 12 + 4);
  });
  T.story = dataTexture(1024, Math.ceil(NF * 3 / 1024), data);
  T.layers = dataTexture(photos.length, 1, new Float32Array(photos.flatMap(p => [p.aspect, 0, 0, 0])));
}

function disp(i, y) { // mirrors disp() in the shaders, for picking threads
  const x0 = fib.x0[i];
  const hang = clamp((CH - y) / CH, 0, 1), anchorF = smooth(0, 0.18, hang);
  const wind = (Math.sin(time * 0.55 + x0 * 0.9 + y * 0.21) * 0.035 + Math.sin(time * 0.31 - x0 * 0.37 + y * 0.07) * 0.05) * hang * motion * (i === hover.line ? 1 - hover.t : 1);
  const d = (y - fib.py[i]) / motion;
  const push = fib.o[i] * Math.exp(-d * d / (d > 0 ? 3 : 10));
  let pl = 0;
  if (i === pluck.line) {
    const dist = (CH - y) / motion, front = pluck.age * 10;
    pl = pluck.amp * Math.exp(-pluck.age * 1.4) * Math.sin(dist * 2.2 - pluck.age * 14) * smooth(front + 0.1, front - 2.5, dist);
  }
  return (wind + push + pl) * anchorF;
}
// The thread nearest a point on screen, with a little stickiness so hovering feels calm.
function pickLine(sx, sy) {
  const p = unproject(sx, sy);
  if (p.y < -0.4 || p.y > CH + 0.25 || Math.abs(p.x) > CW / 2 + 1.4) return -1;
  const y = clamp(p.y, YB, CH), scale = Math.exp(cam.ls);
  const tol = Math.max(10 / scale, SPACING * 0.6);
  const est = Math.round((p.x + CW / 2) / SPACING - 0.5), K = Math.min(80, Math.ceil(tol / SPACING) + 3);
  let best = -1, bd = Infinity;
  for (let k = Math.max(0, est - K); k <= Math.min(NF - 1, est + K); k++) {
    const d = Math.abs(fib.x0[k] + disp(k, y) - p.x);
    if (d < bd) { bd = d; best = k; }
  }
  if (bd > tol) return -1;
  if (hover.line >= 0 && hover.line !== best && Math.abs(hover.line - best) < K) {
    const dh = Math.abs(fib.x0[hover.line] + disp(hover.line, y) - p.x);
    if (dh < bd + 2.5 / scale) return hover.line;
  }
  return best;
}
// Which moment of a thread's story sits at height y (only meaningful once photographs are visible).
function chapterAt(i, y) {
  const n = stories[i].chapters.length, slot = Math.floor(((CH - y) - fib.phase[i]) / SLOT);
  return ((slot % n) + n) % n;
}

// ────────────────────────────────────────────────────────────── stories

function openStory(i, { chapter = null, x = null } = {}) {
  if (!photos.length || gate.active) return;
  if (i < 0 || view.isOpen) return;
  const sx = x ?? project(fib.x0[i], CH * 0.5).x;
  pluck.line = i; pluck.age = 0; pluck.amp = 0.12 * motion;
  view.open(i, { chapter, x: clamp(sx, 0, W) });
}
function onStoryShow(i) {
  select.line = i; select.target = 1;
  if (lsBeforeStory == null) lsBeforeStory = cam.lsT;
  hideLabel();
}
function onStoryCovered() { sleeping = true; }
function onStoryHide() {
  sleeping = false; last = performance.now();
  select.target = 0;
  if (lsBeforeStory != null) { cam.lsT = lsBeforeStory; lsBeforeStory = null; }
  canvas.focus({ preventScroll: true });
}

// ────────────────────────────────────────────────────────────── input

function markInput() { lastInput = performance.now(); }
function showMeter() { zoomUntil = performance.now() + 1100; }
function zoomBy(delta, sx, sy) {
  wantPhotos = true;
  const p = unproject(sx, sy);
  anchor = { wx: p.x, wy: p.y, sx, sy };
  cam.lsT = clamp(cam.lsT + delta, LS_MIN(), LS_MAX());
  showMeter();
}
function hideLabel() { body.classList.remove('over-line'); }
function announce(i) {
  if (!photos.length) return;
  const s = stories[i];
  $announce.textContent = `${s.title}. ${s.chapters.length} 张 / moments. 按回车展开 / Press Enter to open.`;
}

// A slow, eased glide of the zoom, used by the buttons rather than the wheel.
function glideTo(ls, sx, sy, ms) {
  const p = unproject(sx, sy);
  anchor = { wx: p.x, wy: p.y, sx, sy, glide: true };
  tween = { from: cam.lsT, to: clamp(ls, LS_MIN(), LS_MAX()), t0: performance.now(), ms: REDUCED ? 1 : ms };
  showMeter();
}
function enter() {
  wantPhotos = true;
  if (!view || view.isOpen) return;
  markInput();
  const hand = project(glowX(), childY(childPose.top));
  glideTo(LS_MIN() + 0.5 * (LS_MAX() - LS_MIN()), hand.x, hand.y, 2600);
}
function goHome() {
  if (!view) return;
  if (view.isOpen) { view.close(); return; }
  kbLine = -1;
  glideTo(LS_MIN(), W / 2, H / 2, 1600);
}
let musicOn = true, filmStarted = false, musicArmed = false, restReady = false, photosStarted = false;
const poster = new Image();
poster.crossOrigin = 'anonymous';
poster.decoding = 'async';
poster.onload = () => { placeStill(); startFilmFile(); };
poster.onerror = () => startFilmFile();
poster.src = './assets/duang-poster.jpg';
// The still is tiny. If it stalls, start the film anyway; photographs wait until he can move.
setTimeout(() => startFilmFile(), 1500);
setTimeout(() => { restReady = true; beginRest(); }, 8000);
function startFilmFile() {
  if (filmStarted) return;
  filmStarted = true;
  $video.crossOrigin = 'anonymous';
  $video.preload = 'auto';
  $video.addEventListener('error', () => {
    // A preview host may redirect the mp4 and label it application/octet-stream.
    // A same-origin blob with an explicit video type still plays, and the poster stays if it cannot.
    if ($video.dataset.blob) return;
    $video.dataset.blob = '1';
    fetch('./assets/duang.mp4').then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); }).then(b => {
      $video.src = URL.createObjectURL(new Blob([b], { type: 'video/mp4' }));
      if (!REDUCED && !gate.active) $video.play().catch(() => {});
    }).catch(() => {});
  });
  $video.src = './assets/duang.mp4?v=color';
  const onFrame = () => { childDirty = true; $video.requestVideoFrameCallback?.(onFrame); };
  if ($video.requestVideoFrameCallback) $video.requestVideoFrameCallback(onFrame);
  else $video.addEventListener('timeupdate', () => { childDirty = true; });
  $video.addEventListener('loadeddata', () => { if ($video.videoWidth) childDirty = true; });
  $video.addEventListener('playing', () => { childDirty = true; });
  $video.addEventListener('canplay', () => {
    childDirty = true; restReady = true; beginRest();
    if (gate.active) holdHands();
  }, { once: true });
  if (REDUCED || gate.active) $video.pause();
  else $video.play().catch(() => {});
}
function placeStill() {
  if (!poster.naturalWidth || !T.child || childOn) return;
  uploadChild(poster);
}
function uploadChild(source) {
  try {
    gl.bindTexture(gl.TEXTURE_2D, T.child);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  } catch (e) {
    console.warn(e);
    return;
  }
  childW = source.videoWidth || source.naturalWidth || 1280;
  childH = source.videoHeight || source.naturalHeight || 720;
  if (!childOn) { childOn = true; stillAt = intro; }
}
function armMusic() {
  if (musicArmed) return;
  musicArmed = true;
  $music.preload = 'auto';
  $music.src = './assets/icarus.mp3';
  if (musicOn) $music.play().catch(() => {});
}
let photoStream = false, wantPhotos = false;
function beginRest() {
  if (!restReady || photosStarted) return;
  photosStarted = true;
  if (!photos.length) { body.classList.add('loaded'); return; }
  armMusic();
}
// Atlases stay off the first paint. They start only after the visitor walks into the curtain.
function beginPhotos() {
  if (photoStream || !wantPhotos || !arrTex || !photos.length) return;
  photoStream = true;
  streamTextures(gl, arrTex, photos, atlases, progress => $loader.style.setProperty('--p', progress.toFixed(3)))
    .then(() => body.classList.add('loaded'))
    .catch(err => console.warn(err));
}
function startFilm() {
  $video.muted = true;
  $video.playsInline = true;
  if (!filmStarted) startFilmFile();
  else if ($video.paused && !REDUCED) $video.play().catch(() => {});
}
function startMusic() {
  startFilm();
  if (!musicOn || !musicArmed) return;
  $music.play().catch(() => {});
}
function setMusic(on) {
  musicOn = on;
  $musicBtn.setAttribute('aria-pressed', String(!on));
  $musicBtn.setAttribute('aria-label', on ? '关掉音乐 · Mute the music' : '打开音乐 · Play the music');
  if (on) $music.play().catch(() => {});
  else $music.pause();
}
function setPaused(v) {
  paused = v;
  $pause.setAttribute('aria-pressed', String(v));
  body.classList.toggle('paused', v);
}

// Scrolling down walks into the curtain; a trackpad pinch zooms the way the fingers move.
addEventListener('wheel', e => {
  if (gate.active) { e.preventDefault(); return; }
  if (view?.isOpen || e.target.closest?.('#story, #menu')) return;
  e.preventDefault(); markInput();
  if (!view) return;
  tween = null;
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1;
  zoomBy((e.ctrlKey ? -e.deltaY * 0.014 : e.deltaY * 0.0026) * unit, e.clientX, e.clientY);
}, { passive: false });

$('#scroll-cue').addEventListener('click', enter);
$('#home-link').addEventListener('click', e => { e.preventDefault(); goHome(); });
$('#wordmark').addEventListener('click', e => { e.preventDefault(); goHome(); });
$pause.addEventListener('click', () => setPaused(!paused));
$musicBtn.addEventListener('click', () => setMusic(!musicOn));
$music.volume = 0.7;
addEventListener('pointerdown', startMusic);
addEventListener('keydown', startMusic);
$child.addEventListener('click', () => { if (handLine >= 0) openStory(handLine, { x: project(glowX(), CH * 0.5).x }); });
$child.addEventListener('pointerenter', () => body.classList.add('over-child'));
$child.addEventListener('pointerleave', () => body.classList.remove('over-child'));

// The menu: a full-screen sheet; the curtain keeps falling behind it.
const $menu = $('#menu'), $menuBtn = $('#menu-btn');
function setMenu(open) {
  $menuBtn.setAttribute('aria-expanded', String(open));
  body.classList.toggle('menu-open', open);
  $menu.inert = !open;
  if (open) $menu.querySelector('a')?.focus({ preventScroll: true });
  else $menuBtn.focus({ preventScroll: true });
}
$menu.inert = true;
$menuBtn.addEventListener('click', () => setMenu(!body.classList.contains('menu-open')));
$menu.addEventListener('click', e => {
  if (e.target.closest('.menu-home')) { e.preventDefault(); setMenu(false); goHome(); }
  else if (e.target === $menu || e.target.closest('.menu-close')) setMenu(false);
});
addEventListener('keydown', e => { if (e.key === 'Escape' && body.classList.contains('menu-open')) { e.stopImmediatePropagation(); setMenu(false); } }, true);

// CASTLE opens the curtain. Anything else still leaves by dimming.
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-castle], a[data-leave]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
  e.preventDefault();
  if (a.hasAttribute('data-castle') && gl && !REDUCED) beginCastle();
  else {
    body.classList.add('leaving');
    setTimeout(() => { location.href = a.href; }, REDUCED ? 0 : 520);
  }
});
addEventListener('pageshow', () => body.classList.remove('leaving'));

canvas.addEventListener('pointerdown', e => {
  if (gate.active || !view) return;
  canvas.setPointerCapture(e.pointerId); markInput();
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), ls: cam.lsT }; drag = null;
    return;
  }
  const p = unproject(e.clientX, e.clientY);
  touchWater(e.clientX, e.clientY, true);
  drag = { sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, wx: p.x, wy: p.y, touch: e.pointerType !== 'mouse' };
  cam.vx = cam.vy = 0;
});
const ring = { x: -100, y: -100, tx: -100, ty: -100 };
addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  body.classList.add('pointer');
  $cursor.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
  body.classList.toggle('over-ui', !!e.target.closest?.('a, button'));
  ring.tx = e.clientX; ring.ty = e.clientY;
  if (ring.x < -50) { ring.x = ring.tx; ring.y = ring.ty; }
  if (view && !view.isOpen) touchWater(e.clientX, e.clientY, false);
});
document.addEventListener('pointerleave', () => body.classList.remove('pointer'));
canvas.addEventListener('pointermove', e => {
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true;
  kbLine = -1;
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  markInput();
  if (pinch && touches.size === 2) {
    const [a, b] = [...touches.values()];
    const target = clamp(pinch.ls + Math.log(Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist), LS_MIN(), LS_MAX());
    zoomBy(target - cam.lsT, (a.x + b.x) / 2, (a.y + b.y) / 2);
    return;
  }
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) { drag.moved = true; tween = null; body.classList.add('dragging'); }
  if (drag.moved) anchor = { wx: drag.wx, wy: drag.wy, sx: e.clientX, sy: e.clientY, drag: true };
});
function endPointer(e) {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  body.classList.remove('dragging');
  if (!drag) return;
  const d = drag; drag = null;
  if (d.moved) { anchor = null; return; }
  if (e.type === 'pointercancel' || performance.now() - d.t > 600 || view.isOpen) return;
  const i = pickLine(e.clientX, e.clientY);
  if (i < 0) return;
  // A tap on a touch screen first lifts the thread out; a second tap on it opens the story.
  if (d.touch && hover.line !== i) { kbLine = i; announce(i); return; }
  const p = unproject(e.clientX, e.clientY);
  const readable = SLOT * Math.exp(cam.ls) > 40 && p.y > YB && p.y < CH;
  openStory(i, { chapter: readable ? chapterAt(i, p.y) : null, x: e.clientX });
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { pointer.inside = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

addEventListener('keydown', e => {
  if (gate.active || !view || view.isOpen) return;
  markInput();
  const k = e.key;
  if (e.target.closest?.('a, button') && (k === 'Enter' || k === ' ')) return;
  if (k === 'ArrowRight' || k === 'ArrowLeft') {
    e.preventDefault();
    const from = kbLine >= 0 ? kbLine : hover.line >= 0 ? hover.line : clamp(Math.round((unproject(W / 2, H / 2).x + CW / 2) / SPACING), 0, NF - 1);
    kbLine = clamp(from + (k === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 25 : 1), 0, NF - 1);
    announce(kbLine);
  } else if (k === 'Enter' && (kbLine >= 0 || hover.line >= 0)) {
    openStory(kbLine >= 0 ? kbLine : hover.line);
  } else if (k === '+' || k === '=') zoomBy(0.7, W / 2, H / 2);
  else if (k === '-' || k === '_') zoomBy(-0.7, W / 2, H / 2);
  else if (k === 'Escape') goHome();
  else if (k === ' ') { e.preventDefault(); setPaused(!paused); }
});

function resize() {
  W = innerWidth; H = innerHeight; DPR = Math.min(devicePixelRatio || 1, 2);
  PW = Math.round(W * DPR); PH = Math.round(H * DPR);
  canvas.width = PW; canvas.height = PH;
  if (RT) { freeTarget(RT.scene); RT.refl.forEach(freeTarget); RT.bloom.forEach(freeTarget); }
  RT = {
    scene: target(PW, PH),
    refl: [target(PW / 2, PH / 2), target(PW / 2, PH / 2)],
    bloom: Array.from({ length: 6 }, (_, i) => target(PW / 2 ** (i + 1), PH / 2 ** (i + 1))),
  };
  if (stories.length) cam.lsT = clamp(cam.lsT, LS_MIN(), LS_MAX());
}
addEventListener('resize', () => { if (RT) resize(); });

// ────────────────────────────────────────────────────────────── frame

function step(dt, now) {
  intro += dt; time += dt;
  if (gate.active) gateTick(dt);
  childPose = poseAt($video.currentTime || 0);
  const lsMin = LS_MIN(), lsMax = LS_MAX();
  if (tween) {
    const t = clamp((now - tween.t0) / tween.ms, 0, 1);
    cam.lsT = tween.from + (tween.to - tween.from) * ease(t);
    if (t >= 1) tween = null;
    showMeter();
  }
  cam.lsT = clamp(cam.lsT, lsMin, lsMax);
  cam.ls = damp(cam.ls, cam.lsT, tween ? 9 : 5.5, dt);
  if (anchor) {
    const p = unproject(anchor.sx, anchor.sy);
    const ox = anchor.wx - p.x, oy = anchor.wy - p.y;
    cam.x += ox; cam.y += oy;
    if (anchor.drag) { cam.vx = damp(cam.vx, ox / Math.max(dt, 1e-3), 18, dt); cam.vy = damp(cam.vy, oy / Math.max(dt, 1e-3), 18, dt); }
    else if (!tween && Math.abs(cam.ls - cam.lsT) < 0.002) anchor = null;
  } else {
    cam.x += cam.vx * dt; cam.y += cam.vy * dt;
    cam.vx *= Math.exp(-dt * 3.4); cam.vy *= Math.exp(-dt * 3.4);
  }
  const zt = zoomT(), home = 1 - smooth(0, 0.14, zt);
  if (zt > 0.12) wantPhotos = true;
  beginPhotos();
  cam.x = damp(cam.x, 0, 7 * home, dt); cam.y = damp(cam.y, HOME_Y, 7 * home, dt);
  cam.x = clamp(cam.x, -CW / 2 - 0.6, CW / 2 + 0.6); cam.y = clamp(cam.y, -2.5, CH + 1.2);

  // Time dilation: a waterfall far away, a slow drift up close, almost still behind an open story.
  const scale = Math.exp(cam.ls);
  motion = Math.min(1, 40 / scale);
  select.t = damp(select.t, select.target, select.target ? 3.2 : 4, dt);
  flow = damp(flow, paused ? 0 : 1 - 0.85 * select.t, 2.2, dt);
  // The resting rain (zoom under 0.4) keeps the old pace. Across the photograph
  // grid the same drift runs at twice that pace, eased in so it does not jump.
  const stream = smooth(0.4, 0.74, zt);
  const rate = 55 * Math.pow(0.4, zt) * (1 + stream) / scale * flow;

  // What is under the hand.
  let line = -1;
  if (!view.isOpen) {
    if (kbLine >= 0) line = kbLine;
    else if (pointer.inside && !drag?.moved && !pinch) line = pickLine(pointer.x, pointer.y);
  }
  if (line >= 0) hover.line = line;
  hover.t = line >= 0 ? damp(hover.t, 1, 9, dt) : damp(hover.t, 0, 5, dt);
  if (hover.t < 0.01 && line < 0) hover.line = -1;

  // The hand in the curtain: threads part around the one being pointed at and swing back.
  const moved = pointer.lastX < 0 ? 0 : (pointer.x - pointer.lastX);
  pointer.lastX = pointer.x;
  pointer.speed = damp(pointer.speed, Math.abs(moved) / Math.max(dt, 1e-3), 10, dt);
  const wp = pointer.x >= 0 ? unproject(pointer.x, pointer.y) : { x: 0, y: -99 };
  pointer.wvx = damp(pointer.wvx, moved / Math.max(dt, 1e-3) / scale, 12, dt);
  const active = (pointer.inside || kbLine >= 0) && !pinch && !view.isOpen && (kbLine >= 0 || (wp.y > -0.5 && wp.y < CH + 0.3));
  pointer.reach = damp(pointer.reach, active ? (line >= 0 ? 0.2 : 0.08) + Math.min(pointer.speed / 900, 0.6) : 0, 4, dt);
  const cx = line >= 0 ? fib.x0[line] : wp.x, cy = kbLine >= 0 ? CH * 0.55 : wp.y;
  const R = 46 / scale, R2 = R * 1.8;
  // The child's hand, seen against the curtain: the strands just above it lean aside and
  // come back as the fingers open and close.
  const d0 = camDist(), lift = d0 / (d0 - CHILD.z);
  const handX = cam.x + (glowX() - cam.x) * lift, handY = cam.y + (childY(childPose.top) - cam.y) * lift;
  const reaching = 1 - smooth(0.12, 0.2, childPose.top);
  const handAmt = (1 - smooth(0, 0.15, zt)) * (0.3 + 0.9 * reaching) * (body.classList.contains('over-child') ? 1.6 : 1);
  const RH = 0.16 + 0.16 * reaching;
  for (const d of drops) d.age += dt;
  const rainOn = zt < 0.35 && flow > 0.05;
  const viewL = unproject(-40, 0).x, viewR = unproject(W + 40, 0).x;
  const dyn = T.fibD.data, kHold = 1 - Math.exp(-dt * 7);
  for (let i = 0; i < NF; i++) {
    const dx = fib.x0[i] - cx, ad = Math.abs(dx);
    let target = 0;
    if (active && ad < R2 && i !== line) {
      if (ad < R) target = (dx < 0 ? -1 : 1) * (R - ad) * 0.9 * pointer.reach;
      fib.v[i] += pointer.wvx * (1 - ad / R2) * 2 * dt;
      fib.py[i] = cy;
    } else if (handAmt > 0.01) {
      const hx = fib.x0[i] - handX, ah = Math.abs(hx);
      if (ah < RH) { target = (hx < 0 ? -1 : 1) * (RH - ah) * 0.45 * handAmt; fib.py[i] = handY; }
    }
    const a = 60 * (target - fib.o[i]) - 7.2 * fib.v[i];
    fib.v[i] += a * dt; fib.o[i] += fib.v[i] * dt;
    // The thread under the hand eases to a stop: its photographs and its light hold still.
    fib.hold[i] += ((i === line ? 1 : 0) - fib.hold[i]) * kHold;
    const go = dt * rate * (1 - fib.hold[i]);
    // One shared pace, so neighbouring threads stay in the same 14-slot block.
    const period = SLOT * STREAM_TH;
    fib.phase[i] = (fib.phase[i] + go) % period;
    fib.flow[i] = (fib.flow[i] + go) % 4000;
    if (fib.strand[i] && rainOn) landing(i, viewL, viewR);
    dyn[i * 4] = fib.o[i]; dyn[i * 4 + 1] = fib.py[i]; dyn[i * 4 + 2] = fib.phase[i]; dyn[i * 4 + 3] = fib.flow[i];
  }
  pluck.age += dt;

  body.classList.toggle('over-line', line >= 0);

  // Now and then a life glimmers by itself somewhere in view.
  idleNext -= dt;
  for (const g of idle) g.age += dt;
  if (!REDUCED && idleNext <= 0 && hover.t < 0.05 && zoomT() > 0.06 && now - lastInput > 1500) {
    const g = idle.find(g => g.age > 3.4);
    if (g) {
      const x = unproject(W * (0.15 + rng() * 0.7), H / 2).x;
      g.line = clamp(Math.round((x + CW / 2) / SPACING), 0, NF - 1); g.age = 0;
    }
    idleNext = 0.9 + rng() * 1.6;
  }

  // Now and then, while the page is at rest, the child's thread trembles as if just touched.
  nextReach -= dt;
  if (!REDUCED && nextReach <= 0 && zt < 0.05 && !view.isOpen && hover.line !== handLine) {
    pluck.line = handLine; pluck.age = 0; pluck.amp = 0.05 * motion;
    nextReach = 6 + rng() * 4;
  }

  body.classList.toggle('zooming', now < zoomUntil);
  $meter.style.setProperty('--z', zt.toFixed(4));
  stage(dt, zt);
}

// Everything in the page that lives in the same space as the curtain.
function stage(dt, zt) {
  const hero = 1 - smooth(0, 0.09, zt);
  if (Math.abs(hero - heroShown) > 0.001) {
    heroShown = hero;
    body.style.setProperty('--hero', hero.toFixed(3));
    body.classList.toggle('away', hero < 0.02);
  }
  glow = damp(glow, (1 - smooth(0, 0.5, zt)) * (body.classList.contains('over-child') ? 1.6 : 1), 3, dt);

  // The child is drawn in the scene; this button only follows him so he can be pointed at.
  const born = stillAt < 0 ? 0 : smooth(0, 0.28, intro - stillAt);
  show = (1 - smooth(0.03, 0.2, zt)) * born;
  const bx = childX(childPose.feet);
  const top = project(bx, childY(childPose.top), CHILD.z), base = project(bx, 0, CHILD.z);
  const ch = base.y - top.y, cw = ch * 0.7;
  $child.style.transform = `translate3d(${(base.x - cw / 2).toFixed(1)}px,${top.y.toFixed(1)}px,0)`;
  $child.style.width = `${cw.toFixed(1)}px`; $child.style.height = `${ch.toFixed(1)}px`;
  $child.style.visibility = show < 0.3 ? 'hidden' : 'visible';

  // The water: his footsteps keep time with the film, ours with the hand.
  for (const r of touchRipples) r.age += dt;
  feet.a += dt; feet.b += dt;
  const vt = $video.currentTime || 0;
  if (vt + 0.05 < feet.last) feet.anchor = childPose.feet;
  if (Math.abs(childPose.feet - feet.anchor) > 0.035) {
    const spot = childX(childPose.feet);
    if (feet.a > feet.b) { feet.a = 0; feet.r0.x = spot; }
    else { feet.b = 0; feet.r1.x = spot; }
    feet.anchor = childPose.feet;
  }
  feet.last = vt;

  // The trailing ring and, over a thread, the name of its story.
  ring.x = damp(ring.x, ring.tx, 13, dt);
  ring.y = damp(ring.y, ring.ty, 13, dt);
  const rt = `translate3d(${ring.x.toFixed(1)}px,${ring.y.toFixed(1)}px,0)`;
  $ring.style.transform = rt; $tip.style.transform = rt;
  const overChild = body.classList.contains('over-child') && show > 0.5;
  const tipLine = overChild ? handLine : hover.line;
  const tipOn = photos.length && !gate.active && !view.isOpen && (overChild || (hover.line >= 0 && hover.t > 0.5 && (zt > 0.04 || hover.line === handLine)));
  if (tipOn && $tip.dataset.line !== String(tipLine)) {
    const st = stories[tipLine];
    $tip.dataset.line = tipLine;
    $tipTitle.textContent = st.title;
    $tipMeta.textContent = `${st.chapters.length} 张照片 · ${st.chapters.length} photographs`;
  }
  body.classList.toggle('tip', tipOn);
}

function bindCommon(p, hpx, mirror) {
  const u = p.u;
  gl.uniform3f(u.uCam, cam.x, cam.y, camDist());
  gl.uniform1f(u.uF, F); gl.uniform1f(u.uAspect, W / H); gl.uniform1f(u.uHpx, hpx);
  gl.uniform1f(u.uCW, CW); gl.uniform1f(u.uCH, CH); gl.uniform1f(u.uYB, YB);
  gl.uniform1f(u.uTime, time); gl.uniform1f(u.uMotion, motion);
  gl.uniform4f(u.uPluck, pluck.line, pluck.age, pluck.amp, 0);
  gl.uniform1f(u.uMirror, mirror ? 1 : 0); gl.uniform1f(u.uIntro, REDUCED ? 99 : intro);
  gl.uniform1i(u.uFibS, 0); gl.uniform1i(u.uFibD, 1);
}

function drawWorld(rt, mirror) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fb);
  gl.viewport(0, 0, rt.w, rt.h);
  // Alpha of the scene carries the water's ripple slope to the composite (0.5 = flat).
  if (mirror) gl.clearColor(0, 0, 0, 1); else gl.clearColor(0.016, 0.011, 0.006, 0.5);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  const zt = zoomT();

  if (!mirror) {
    gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ZERO);
    const { p, u } = P.floor; gl.useProgram(p);
    gl.uniform3f(u.uCam, cam.x, cam.y, camDist()); gl.uniform1f(u.uF, F); gl.uniform1f(u.uAspect, W / H);
    gl.uniform1f(u.uCW, CW); gl.uniform1f(u.uTime, time); gl.uniform1f(u.uGain, 1 - 0.6 * select.t); gl.uniform1f(u.uIntro, REDUCED ? 99 : intro);
    gl.uniform2f(u.uGlow, glowX(), glow);
    gl.uniform4f(u.uFeet, childX(childPose.feet), CHILD.z, feet.a, feet.b);
    gl.uniform4f(u.uStep, feet.r0.x, feet.r0.z, feet.r1.x, feet.r1.z);
    gl.uniform3fv(u.uTouch, touchRipples.flatMap(r => [r.x, r.z, r.age]));
    dropData.forEach((_, j) => { const d = drops[j >> 2], k = j & 3; dropData[j] = k === 0 ? d.x : k === 1 ? 0.015 : k === 2 ? d.age : d.amp; });
    gl.uniform4fv(u.uDrop, dropData);
    gl.bindVertexArray(vaos.quad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);

  const pr = P.fibre, u = pr.u; gl.useProgram(pr.p); bindCommon(pr, rt.h, mirror);
  gl.uniform1f(u.uOpen, gate.open); gl.uniform2f(u.uRes, rt.w, rt.h);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, T.story.t); gl.uniform1i(u.uStory, 2);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, T.layers.t); gl.uniform1i(u.uLayers, 3);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D_ARRAY, arrTex); gl.uniform1i(u.uArr, 4);
  gl.uniform1f(u.uMinPx, mirror ? 1.6 : 1.0);
  gl.uniform1f(u.uSpacing, SPACING); gl.uniform1f(u.uW, PHOTO_W); gl.uniform1f(u.uS, SLOT);
  gl.uniform1f(u.uCount, photos.length);
  gl.uniform1f(u.uGain, (mirror ? 0.55 : 0.78) * (1.05 - 0.2 * zt));
  gl.uniform4f(u.uHover, hover.line, hover.t, 0, 0);
  gl.uniform1f(u.uDim, 0.22 * hover.t);
  gl.uniform2f(u.uSelect, select.line, select.t);
  gl.uniform2f(u.uGlow, glowX(), glow);
  gl.uniform1fv(u.uIdleL, idle.map(g => g.line)); gl.uniform1fv(u.uIdleA, idle.map(g => g.age));
  gl.bindVertexArray(vaos.fibre);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, (SEG + 1) * 2, NF);

  // The child stands in the curtain. As it opens he is carried away with the rain;
  // he is not drawn again on top of the bright scene.
  if (childOn && show > 0.003) {
    const c = P.child, cu = c.u; gl.useProgram(c.p);
    gl.uniform3f(cu.uCam, cam.x, cam.y, camDist()); gl.uniform1f(cu.uF, F); gl.uniform1f(cu.uAspect, W / H);
    gl.uniform1f(cu.uMirror, mirror ? 1 : 0); gl.uniform1f(cu.uZ, CHILD.z);
    gl.uniform4f(cu.uRect, childX(0), -(1 - CHILD.feetV) * CHILD.frameH, CHILD.frameW, CHILD.frameH);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, T.child); gl.uniform1i(cu.uTex, 5);
    gl.uniform2f(cu.uTexel, 1 / childW, 1 / childH);
    gl.uniform1f(cu.uAlpha, show); gl.uniform1f(cu.uH, CHILD.h); gl.uniform1f(cu.uDirect, 0);
    gl.bindVertexArray(vaos.unit); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

// The film's newest frame, uploaded only when there is one.
function updateChild() {
  if ($video.readyState < 2 || !$video.videoWidth) return;
  uploadChild($video);
}

function post(prog, dst, setup) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
  gl.viewport(0, 0, dst ? dst.w : PW, dst ? dst.h : PH);
  gl.useProgram(prog.p); setup(prog.u);
  gl.bindVertexArray(vaos.empty);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function render() {
  const zt = zoomT();
  if (childDirty) { updateChild(); childDirty = false; }
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.fibS.t);
  gl.activeTexture(gl.TEXTURE1); updateTexture(T.fibD);

  const floorV = 0.5 + 0.5 * ((0 - cam.y) * F / camDist());
  const hasRefl = floorV > -0.02;
  if (hasRefl) {
    drawWorld(RT.refl[0], true);
    gl.disable(gl.BLEND);
    const [a, b] = RT.refl;
    post(P.blur, b, u => { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex); gl.uniform1i(u.uSrc, 0); gl.uniform2f(u.uDir, 0, 2.2 / a.h); });
    post(P.blur, a, u => { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, b.tex); gl.uniform1i(u.uSrc, 0); gl.uniform2f(u.uDir, 1.1 / a.w, 0); });
    post(P.blur, b, u => { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex); gl.uniform1i(u.uSrc, 0); gl.uniform2f(u.uDir, 0, 5 / a.h); });
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.fibS.t);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.fibD.t);
  }

  drawWorld(RT.scene, false);

  // Bloom: a chain of progressively smaller, softer copies added back together.
  gl.disable(gl.BLEND);
  let src = RT.scene;
  for (const dst of RT.bloom) {
    const s = src;
    post(P.down, dst, u => { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.tex); gl.uniform1i(u.uSrc, 0); gl.uniform2f(u.uTexel, 1 / s.w, 1 / s.h); });
    src = dst;
  }
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  for (let i = RT.bloom.length - 1; i > 0; i--) {
    const s = RT.bloom[i];
    post(P.up, RT.bloom[i - 1], u => { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.tex); gl.uniform1i(u.uSrc, 0); gl.uniform2f(u.uTexel, 1 / s.w, 1 / s.h); });
  }
  gl.disable(gl.BLEND);

  post(P.composite, null, u => {
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, RT.scene.tex); gl.uniform1i(u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, RT.bloom[0].tex); gl.uniform1i(u.uBloom, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, RT.refl[1].tex); gl.uniform1i(u.uRefl, 2);
    gl.uniform1f(u.uBloomK, 0.24 - 0.2 * smooth(0.15, 0.6, zt));
    gl.uniform1f(u.uReflK, 1);
    gl.uniform1f(u.uHasRefl, hasRefl ? 1 : 0);
    gl.uniform1f(u.uFloorV, floorV);
    gl.uniform1f(u.uTime, time);
    gl.uniform2f(u.uRes, PW, PH);
    gl.uniform1f(u.uOpen, gate.open);
  });
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (sleeping || document.hidden) return;
  step(dt, now);
  render();
}
window.__tick = (n = 1) => {
  for (let i = 0; i < n; i++) {
    const now = last + 1000 / 30;
    last = now;
    if (!sleeping) { step(1 / 30, now); render(); }
  }
  gl.finish();
};

// ────────────────────────────────────────────────────────────── castle gate
// CASTLE holds the hands-up moment, then draws the rain apart. Duang fades with the cloth.
// The castle, including its flying sprite, is already playing behind it.

function curtainOpen(p) {
  return smooth(0, 1, clamp((p - 0.55) / 4.15, 0, 1));
}
function armCastleFrame() {
  const frame = document.getElementById('castle-frame');
  if (!frame || frame.getAttribute('src')) return;
  frame.src = '../castle/?veil=1';
}
function holdHands() {
  // Play forward to the hands-up moment and hold it. Some browsers report this
  // file as seekable only at 0, so a currentTime assignment never lands.
  if (gate._holding) return;
  gate._holding = true;
  sleeping = true;
  const watch = setInterval(() => {
    if (!gate.active) { clearInterval(watch); return; }
    if ($video.readyState < 2) return;
    const now = $video.currentTime || 0;
    if (now >= 2.02 && now < 2.55) {
      $video.pause();
      clearInterval(watch);
      sleeping = false;
      childDirty = true;
      gate.seeked = true;
      return;
    }
    if ($video.paused) {
      $video.playbackRate = 1;
      $video.muted = true;
      $video.play().catch(() => { sleeping = false; gate.seeked = true; clearInterval(watch); });
    }
  }, 30);
  setTimeout(() => {
    if (!gate.seeked) { sleeping = false; gate.seeked = true; clearInterval(watch); }
  }, 4000);
}
function beginCastle() {
  if (gate.active) return;
  gate.active = true;
  body.classList.add('parting');
  if (body.classList.contains('menu-open')) setMenu(false);
  armCastleFrame();
  holdHands();
  $announce.textContent = '幕布拉开，走进城堡。 The curtain is opening onto the castle.';
}
function gateTick(dt) {
  if (gate.seeked && !$video.paused) $video.pause();
  if (!gate.frozen) gate.p += dt;
  gate.open = curtainOpen(gate.p);
  cam.lsT = LS_MIN();
  tween = null;
  anchor = null;
  if (!gate.frozen && !gate.navigated && gate.p > 5.05) {
    gate.navigated = true;
    const u = new URL('../castle/', location.href);
    u.searchParams.set('arrived', '1');
    location.href = u.href;
  }
}

// ────────────────────────────────────────────────────────────── boot

async function boot() {
  if (!gl) throw new Error('WebGL 2 is not available');
  ({ program, dataTexture, updateTexture, target, freeTarget } = createGLHelpers(gl));
  P.fibre = program(FIBRE_VS, FIBRE_FS);
  P.floor = program(FLOOR_VS, FLOOR_FS);
  P.down = program(POST_VS, DOWN_FS);
  P.up = program(POST_VS, UP_FS);
  P.blur = program(POST_VS, BLUR_FS);
  P.composite = program(POST_VS, COMPOSITE_FS);
  P.child = program(CHILD_VS, CHILD_FS);
  T.child = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, T.child);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  placeStill();

  const strip = new Float32Array((SEG + 1) * 4);
  for (let k = 0; k <= SEG; k++) {
    const u = k <= 40 ? 0.86 * k / 40 : 0.86 + 0.14 * (k - 40) / (SEG - 40);
    strip.set([u, -1, u, 1], k * 4);
  }
  vaos.fibre = gl.createVertexArray(); gl.bindVertexArray(vaos.fibre);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, strip, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  vaos.quad = gl.createVertexArray(); gl.bindVertexArray(vaos.quad);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  vaos.unit = gl.createVertexArray(); gl.bindVertexArray(vaos.unit);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  vaos.empty = gl.createVertexArray();
  gl.bindVertexArray(null);

  resize();
  const catalog = await loadCatalog();
  photos = catalog.photos;
  atlases = catalog.atlases;
  arrTex = createPhotoArray(gl, Math.max(photos.length, 1));
  buildFibres();
  // The family's own story hangs on the thread the child is reaching for.
  handLine = clamp(Math.round((CHILD.x + CW / 2) / SPACING - 0.5), 0, NF - 1);
  const own = catalog.authored.find(s => s.hand);
  if (own) {
    const taken = catalog.authored.find(s => s !== own && s.line === handLine);
    if (taken) taken.line = own.line;
    own.line = handLine;
  }
  stories = buildStories(photos, catalog.authored, catalog.journal);
  uploadStories();
  if (photos.length) {
    $('#count').textContent = `${photos.length} 张照片 · ${NF} 缕光 — ${photos.length} photographs, ${NF} threads of light`;
  } else {
    body.classList.add('no-album');
    $('#count').textContent = `${NF} 缕光 — ${NF} threads of light`;
  }

  cam.x = 0; cam.y = HOME_Y; cam.lsT = LS_MIN(); cam.ls = cam.lsT + 0.16;
  view = new StoryView({ stories, onShow: onStoryShow, onCovered: onStoryCovered, onHide: onStoryHide });
  body.classList.add('ready');
  if (QS.has('settled') || SHOTS[QS.get('shot')] != null) intro = 5;
  last = performance.now();
  requestAnimationFrame(frame);
  view.route(); // a shared link opens straight into its story
  beginRest();
  window.__undertow = { cam, stories, fib, photos, streamLayer, get hover() { return hover; }, get handLine() { return handLine; }, pickLine, chapterAt, project, unproject, openStory, zoomBy, enter, LS_MIN, LS_MAX, get slot() { return SLOT; }, get spacing() { return SPACING; } };
  window.__gate = gate;
  const shot = SHOTS[QS.get('shot')];
  if (QS.has('play') || shot != null) {
    armCastleFrame();
    beginCastle();
    if (shot != null) { gate.frozen = true; gate.p = shot; gate.open = curtainOpen(shot); }
  } else {
    setTimeout(armCastleFrame, 1200);
  }
}
boot().catch(err => {
  console.error(err);
  body.classList.add('ready');
  const message = document.getElementById('error');
  message.textContent = err.message;
  message.hidden = false;
});
