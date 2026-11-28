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
const $pull = document.createElement('video');
$pull.muted = true;
$pull.defaultMuted = true;
$pull.volume = 0;
$pull.playsInline = true;
$pull.preload = 'auto';
$pull.setAttribute('muted', '');
$pull.setAttribute('playsinline', '');
$pull.crossOrigin = 'anonymous';
$pull.src = new URL('./assets/duang-pull.mp4', document.baseURI).href;
$pull.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
document.body.appendChild($pull);

const SEG = 64;           // segments per fibre
const CH = 15;            // height of the bar the curtain hangs from
const YB = 1.05;          // height where fibres start to bend onto the floor
const F = 1.6;            // focal length (NDC)
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const QS = new URLSearchParams(location.search);
const SHOTS = { hands: 0.4, third: 2.15, two: 3.08, open: 4.9 };
const FINE = matchMedia('(hover:hover) and (pointer:fine)').matches;
const HANDS_AT = 3.02;
const BLEND_S = 0.18;
const GESTURE_IN = 0;
const PULL_DONE = 2.15;
// Hand span measured on the silent pull clip, mapped onto the local gap.
const HAND_SPAN = [[0, 0.08], [0.5, 0.22], [1.0, 0.42], [1.5, 0.66], [2.0, 0.9], [2.15, 1], [6.2, 1]];
const PULL_W = 736, PULL_H = 400, PULL_FEET_U = 0.495, PULL_FEET_V = 0.99, PULL_HEAD_V = 0.022;
const PART_S = 3.05;
const OPEN_END = 1.05;
const GLIDE_END = 2.15;
const EXPAND_DUR = 0.9;
const MAX_P = 4.6;
const gate = { active: false, p: 0, frozen: false, open: 0, glide: 0, navigated: false, seeked: false, t0: 0, hold: false, hands: false };

const rng = mulberry(0x2545f491);

// ────────────────────────────────────────────────────────────── state

const root = document.documentElement;
const MQ_COMPACT_IN = 900, MQ_COMPACT_OUT = 940;
const MQ_NARROW_IN = 640, MQ_NARROW_OUT = 680;
const LAYOUT_W_EPS = 2;       // ignore sub-pixel / 1–2px layout jitter
const LAYOUT_H_REALLOC = 100; // ignore iOS URL-bar height jitters unless significant
const RESIZE_DEBOUNCE_MS = 180;
const ORIENT_DEBOUNCE_MS = 260;

function layoutSize() {
  return {
    w: Math.max(1, Math.round(root.clientWidth || innerWidth || 1)),
    h: Math.max(1, Math.round(root.clientHeight || innerHeight || 1)),
  };
}
function isVisualZoomed() {
  const vv = window.visualViewport;
  return !!(vv && Math.abs((vv.scale || 1) - 1) > 0.02);
}

const initSize = layoutSize();
let W = initSize.w, H = initSize.h, DPR = Math.min(devicePixelRatio || 1, 2), PW = 1, PH = 1;
let isCompact = null, isNarrow = null;
let gestureActive = false;
let resizeTimer = 0, resizeDeferred = false, resizeForce = false;
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

function applyLayoutBreakpoints(width, force = false) {
  if (!force && (pinch || touches.size >= 2 || gestureActive || isVisualZoomed())) return;
  const nextCompact = isCompact === null
    ? width <= MQ_COMPACT_IN
    : (isCompact ? width <= MQ_COMPACT_OUT : width <= MQ_COMPACT_IN);
  const nextNarrow = isNarrow === null
    ? width <= MQ_NARROW_IN
    : (isNarrow ? width <= MQ_NARROW_OUT : width <= MQ_NARROW_IN);
  if (nextCompact !== isCompact) {
    isCompact = nextCompact;
    root.classList.toggle('mq-compact', isCompact);
  }
  if (nextNarrow !== isNarrow) {
    isNarrow = nextNarrow;
    root.classList.toggle('mq-narrow', isNarrow);
  }
}
applyLayoutBreakpoints(W, true);

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
const NARROW = W < 640;
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
let filmPose = childPose;
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
let show = 0, childOn = false, stillAt = -1, childW = 1280, childH = 720, childDirty = false, pullDirty = false;
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
let musicOn = true, filmStarted = false, restReady = false, photosStarted = false;
try { musicOn = localStorage.getItem('hd-music') !== '0'; } catch (e) { /* private mode */ }
function saveMusicPref() {
  try { localStorage.setItem('hd-music', musicOn ? '1' : '0'); } catch (e) { /* ignore */ }
}
function saveMusicTime() {
  try {
    if ($music.currentTime > 0.25) sessionStorage.setItem('hd-music-t', String($music.currentTime));
  } catch (e) { /* ignore */ }
}
function restoreMusicTime() {
  try {
    const t = Number(sessionStorage.getItem('hd-music-t'));
    if (t > 0.25 && Number.isFinite(t) && (! $music.duration || t < $music.duration - 0.3)) $music.currentTime = t;
  } catch (e) { /* ignore */ }
}
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
    // Once a frame is on screen, a seek must not throw that picture away.
    if ($video.dataset.blob || childOn) return;
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
  }, { once: true });
  if (REDUCED || gate.active) $video.pause();
  else $video.play().catch(() => {});
}
function placeStill() {
  if (!poster.naturalWidth || !T.child || childOn) return;
  uploadChild(poster);
}
function uploadTo(tex, source, trackSize) {
  try {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  } catch (e) {
    console.warn(e);
    return false;
  }
  if (trackSize) {
    childW = source.videoWidth || source.naturalWidth || 1280;
    childH = source.videoHeight || source.naturalHeight || 720;
    if (!childOn) { childOn = true; stillAt = intro; }
  }
  return true;
}
function uploadChild(source) { uploadTo(T.child, source, true); }
function ensureMusic() {
  if ($music.getAttribute('src')) return;
  $music.preload = 'auto';
  $music.src = './assets/icarus.m4a';
  $music.addEventListener('loadedmetadata', restoreMusicTime, { once: true });
}
// Play has to be called in the same turn as a tap. armMusic used to run only after the
// film could play, and its play() sat outside any gesture, so autoplay policy dropped it.
function playMusic() {
  if (!musicOn) return;
  ensureMusic();
  const attempt = $music.play();
  if (attempt) attempt.catch(() => {});
}
function onMusicGesture(e) {
  if (e.target && e.target.closest && e.target.closest('#music-btn')) return;
  startFilm();
  playMusic();
}
let photoStream = false, wantPhotos = false;
function beginRest() {
  if (!restReady || photosStarted) return;
  photosStarted = true;
  if (!photos.length) { body.classList.add('loaded'); return; }
  ensureMusic();
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
function paintMusic() {
  $musicBtn.setAttribute('aria-pressed', String(!musicOn));
  $musicBtn.setAttribute('aria-label', musicOn ? '关掉音乐 · Mute the music' : '打开音乐 · Play the music');
}
function setMusic(on) {
  musicOn = on;
  saveMusicPref();
  paintMusic();
  if (on) playMusic();
  else $music.pause();
  const frame = document.getElementById('castle-frame');
  if (frame?.contentWindow) frame.contentWindow.postMessage({ type: 'hd-music-state', on: musicOn }, location.origin);
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
paintMusic();
// Capture phase: the curtain, the cue, and the menu can swallow the bubble.
['pointerdown', 'touchend', 'click', 'keydown'].forEach(type => addEventListener(type, onMusicGesture, true));
addEventListener('pagehide', saveMusicTime);
addEventListener('visibilitychange', () => { if (document.hidden) saveMusicTime(); });
setInterval(saveMusicTime, 1000);
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
  if (body.classList.contains('castle-view')) return;
  if (a.hasAttribute('data-castle') && gl && !REDUCED) beginCastle();
  else if (a.hasAttribute('data-castle')) revealCastle();
  else {
    body.classList.add('leaving');
    setTimeout(() => { location.href = a.href; }, REDUCED ? 0 : 520);
  }
});
addEventListener('pageshow', () => body.classList.remove('leaving'));

// Suppress native browser pinch-zoom and document gestures; in-scene pinch on #stream stays active.
document.addEventListener('touchmove', e => {
  if (e.cancelable) e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', e => {
  gestureActive = true;
  if (e.cancelable) e.preventDefault();
}, { passive: false });
document.addEventListener('gesturechange', e => {
  gestureActive = true;
  if (e.cancelable) e.preventDefault();
}, { passive: false });
document.addEventListener('gestureend', e => {
  gestureActive = false;
  if (e.cancelable) e.preventDefault();
  if (resizeDeferred) scheduleResize(RESIZE_DEBOUNCE_MS, resizeForce);
}, { passive: false });

canvas.addEventListener('pointerdown', e => {
  if (gate.active || !view) return;
  canvas.setPointerCapture(e.pointerId); markInput();
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    pinch = { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), ls: cam.lsT };
    drag = null;
    tween = null;
    body.classList.remove('dragging');
    return;
  }
  if (touches.size > 2) return;
  const p = unproject(e.clientX, e.clientY);
  touchWater(e.clientX, e.clientY, true);
  drag = { sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, wx: p.x, wy: p.y, touch: e.pointerType !== 'mouse' };
  cam.vx = cam.vy = 0;
});
const ring = { x: -100, y: -100, tx: -100, ty: -100 };
const $dust = document.getElementById('dust');
const dustCtx = $dust?.getContext('2d', { alpha: true });
const motes = Array.from({ length: 40 }, () => ({ a: 9, life: 0.4, x: 0, y: 0, vx: 0, vy: 0, r: 2 }));
let moteI = 0;
const lastMote = { x: -999, y: -999 };
const moteSprite = document.createElement('canvas');
moteSprite.width = moteSprite.height = 16;
{
  const g = moteSprite.getContext('2d');
  const rad = g.createRadialGradient(8, 8, 0, 8, 8, 8);
  rad.addColorStop(0, 'rgba(255,248,232,.95)');
  rad.addColorStop(0.35, 'rgba(246,223,176,.7)');
  rad.addColorStop(1, 'rgba(216,168,91,0)');
  g.fillStyle = rad;
  g.beginPath();
  g.arc(8, 8, 8, 0, Math.PI * 2);
  g.fill();
}
function resizeDust() {
  if (!$dust) return;
  const w = Math.max(1, Math.round(W * DPR)), h = Math.max(1, Math.round(H * DPR));
  if ($dust.width !== w || $dust.height !== h) { $dust.width = w; $dust.height = h; }
}
function spawnMote(x, y) {
  if (!FINE || REDUCED || !dustCtx) return;
  const dx = x - lastMote.x, dy = y - lastMote.y;
  if (dx * dx + dy * dy < 12 * 12) return;
  lastMote.x = x; lastMote.y = y;
  const m = motes[moteI++ % motes.length];
  const ang = Math.random() * Math.PI * 2;
  m.x = x; m.y = y;
  m.vx = Math.cos(ang) * (3 + Math.random() * 8);
  m.vy = -5 - Math.random() * 12;
  m.r = 1.5 + Math.random() * 1.5;
  m.life = 0.36 + Math.random() * 0.12;
  m.a = 0;
}
function drawDust(dt) {
  if (!dustCtx || !$dust) return;
  dustCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  dustCtx.clearRect(0, 0, W, H);
  if (!FINE || REDUCED || !body.classList.contains('pointer') || body.classList.contains('story-open')) return;
  for (const m of motes) {
    if (m.a >= m.life) continue;
    m.a += dt;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.vy += 6 * dt;
    const k = 1 - m.a / m.life;
    dustCtx.globalAlpha = Math.min(1, k * 0.95);
    const s = m.r * 5.2;
    dustCtx.drawImage(moteSprite, m.x - s / 2, m.y - s / 2, s, s);
  }
  dustCtx.globalAlpha = 1;
}
addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || !FINE) return;
  body.classList.add('pointer');
  $cursor.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
  body.classList.toggle('over-ui', !!e.target.closest?.('a, button'));
  ring.tx = e.clientX; ring.ty = e.clientY;
  if (ring.x < -50) { ring.x = ring.tx; ring.y = ring.ty; }
  spawnMote(e.clientX, e.clientY);
  if (view && !view.isOpen) touchWater(e.clientX, e.clientY, false);
});
addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && FINE) body.classList.add('cursor-down'); });
addEventListener('pointerup', () => body.classList.remove('cursor-down'));
addEventListener('pointercancel', () => body.classList.remove('cursor-down'));
document.addEventListener('pointerleave', () => body.classList.remove('pointer'));
canvas.addEventListener('pointermove', e => {
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true;
  kbLine = -1;
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  markInput();
  if (pinch && touches.size === 2) {
    const [a, b] = [...touches.values()];
    const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const target = clamp(pinch.ls + Math.log(dist / pinch.dist), LS_MIN(), LS_MAX());
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
  if (touches.size === 0 && resizeDeferred) scheduleResize(RESIZE_DEBOUNCE_MS, resizeForce);
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
canvas.addEventListener('lostpointercapture', e => {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  if (touches.size === 0 && resizeDeferred) scheduleResize(RESIZE_DEBOUNCE_MS, resizeForce);
});
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

function resize(force = false) {
  const { w, h } = layoutSize();
  const hadRT = !!RT;
  if (hadRT) {
    if (pinch || touches.size >= 2 || gestureActive || isVisualZoomed()) {
      resizeDeferred = true;
      if (force) resizeForce = true;
      return;
    }
    const dw = Math.abs(w - W);
    const dh = Math.abs(h - H);
    if (force) {
      if (dw <= LAYOUT_W_EPS && dh <= LAYOUT_W_EPS) { resizeDeferred = false; resizeForce = false; return; }
    } else {
      if (dw <= LAYOUT_W_EPS && dh <= LAYOUT_H_REALLOC) { resizeDeferred = false; return; }
    }
  }

  const preserveZoom = hadRT && stories.length > 0;
  let prevZt = null, prevCurZt = null, prevTweenToZt = null, prevStoryZt = null;
  if (preserveZoom) {
    const oldMin = LS_MIN(), oldMax = LS_MAX(), oldSpan = oldMax - oldMin;
    if (oldSpan > 1e-6) {
      prevZt = clamp((cam.lsT - oldMin) / oldSpan, 0, 1);
      prevCurZt = clamp((cam.ls - oldMin) / oldSpan, 0, 1);
      if (tween) prevTweenToZt = clamp((tween.to - oldMin) / oldSpan, 0, 1);
      if (lsBeforeStory != null) prevStoryZt = clamp((lsBeforeStory - oldMin) / oldSpan, 0, 1);
    }
  }

  W = w;
  H = h;
  DPR = Math.min(devicePixelRatio || 1, 2);
  PW = Math.max(1, Math.round(W * DPR));
  PH = Math.max(1, Math.round(H * DPR));
  if (canvas.width !== PW || canvas.height !== PH) {
    canvas.width = PW;
    canvas.height = PH;
  }
  if (RT) { freeTarget(RT.scene); RT.refl.forEach(freeTarget); RT.bloom.forEach(freeTarget); }
  RT = {
    scene: target(PW, PH),
    refl: [target(PW / 2, PH / 2), target(PW / 2, PH / 2)],
    bloom: Array.from({ length: 6 }, (_, i) => target(PW / 2 ** (i + 1), PH / 2 ** (i + 1))),
  };
  applyLayoutBreakpoints(W, !hadRT);
  if (preserveZoom && prevZt != null) {
    const newMin = LS_MIN(), newMax = LS_MAX(), newSpan = newMax - newMin;
    cam.lsT = clamp(newMin + prevZt * newSpan, newMin, newMax);
    cam.ls = clamp(newMin + prevCurZt * newSpan, newMin, newMax);
    if (tween && prevTweenToZt != null) {
      tween.from = cam.ls;
      tween.to = clamp(newMin + prevTweenToZt * newSpan, newMin, newMax);
    }
    if (lsBeforeStory != null && prevStoryZt != null) {
      lsBeforeStory = clamp(newMin + prevStoryZt * newSpan, newMin, newMax);
    }
    if (!gate.active) anchor = null;
  }
  resizeDust();
  resizeDeferred = false;
}
function scheduleResize(delay = RESIZE_DEBOUNCE_MS, force = false) {
  if (!RT) return;
  if (force) resizeForce = true;
  if (pinch || touches.size >= 2 || gestureActive || isVisualZoomed()) {
    resizeDeferred = true;
    clearTimeout(resizeTimer);
    resizeTimer = 0;
    return;
  }
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = 0;
    const f = resizeForce;
    resizeForce = false;
    if (!RT) return;
    if (pinch || touches.size >= 2 || gestureActive || isVisualZoomed()) {
      resizeDeferred = true;
      return;
    }
    resize(f);
  }, delay);
}
addEventListener('resize', () => scheduleResize(RESIZE_DEBOUNCE_MS, false));
addEventListener('orientationchange', () => scheduleResize(ORIENT_DEBOUNCE_MS, true));
window.visualViewport?.addEventListener('resize', () => {
  if (isVisualZoomed()) {
    clearTimeout(resizeTimer);
    resizeTimer = 0;
  } else if (resizeDeferred) {
    scheduleResize(RESIZE_DEBOUNCE_MS, resizeForce);
  }
});

// ────────────────────────────────────────────────────────────── frame

function step(dt, now, rawDt) {
  intro += dt; time += dt;
  filmPose = poseAt($video.currentTime || 0);
  // Feet stay on the click. The playing film is shifted so those feet do not travel
  // while the arms move.
  childPose = gate.active && gate.holdPose ? gate.holdPose : filmPose;
  if (gate.active && gate.pulling && $pull.readyState >= 2 && !$pull.paused) pullDirty = true;
  if (gate.active) gateTick(rawDt == null ? dt : rawDt);
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
    else if (!gate.active && !tween && Math.abs(cam.ls - cam.lsT) < 0.002) anchor = null;
  } else {
    cam.x += cam.vx * dt; cam.y += cam.vy * dt;
    cam.vx *= Math.exp(-dt * 3.4); cam.vy *= Math.exp(-dt * 3.4);
  }
  const zt = zoomT(), home = 1 - smooth(0, 0.14, zt);
  if (zt > 0.12) wantPhotos = true;
  beginPhotos();
  if (!(gate.active && gate.pin)) {
    cam.x = damp(cam.x, 0, 7 * home, dt); cam.y = damp(cam.y, HOME_Y, 7 * home, dt);
  }
  cam.x = clamp(cam.x, -CW / 2 - 0.6, CW / 2 + 0.6); cam.y = clamp(cam.y, -2.5, CH + 1.2);
  holdChildPin();

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
  drawDust(dt);
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
  window.__foot = { x: base.x, y: base.y, u: childPose.feet };
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
  const portal = curtainPortal(rt.w, rt.h);
  // The reflection keeps the unbroken curtain, so the floor does not split with the veil.
  gl.uniform1f(u.uOpen, mirror ? 0 : gate.open);
  gl.uniform4f(u.uPortal, portal.cx, portal.half, portal.floor, 0);
  gl.uniform2f(u.uRes, rt.w, rt.h);
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

  // While the doorway is open he is drawn after the composite, in front of the hole.
  // The reflection still carries him, so the water under his feet stays his.
  const overlayChild = gate.active && !mirror && gate.open > 0.001;
  if (childOn && show > 0.003 && !overlayChild) drawChildLayers(mirror, show);
}

// One filmed body. The hands-up frame was shot on the center line, so its quad is
// shifted until those feet sit on the feet he had when Castle was clicked.
// The previous frame fades out on the same feet, so he never travels and never doubles.
function pullFrame() {
  const idleBody = (CHILD.feetV - 0.036) * CHILD.frameH;
  const gh = idleBody / (PULL_FEET_V - PULL_HEAD_V);
  const gw = gh * (PULL_W / PULL_H);
  const anchorX = childX(gate.holdPose ? gate.holdPose.feet : childPose.feet);
  return [anchorX - PULL_FEET_U * gw, -(1 - PULL_FEET_V) * gh, gw, gh];
}
function drawOneChild(tex, shift, alpha, mirror, cut = 0.08, rect = null) {
  if (!tex || alpha < 0.004) return;
  const direct = !mirror && gate.active && gate.open > 0.001;
  const box = rect || [childX(0) + shift, -(1 - CHILD.feetV) * CHILD.frameH, CHILD.frameW, CHILD.frameH];
  const c = P.child, cu = c.u;
  gl.useProgram(c.p);
  gl.uniform3f(cu.uCam, cam.x, cam.y, camDist());
  gl.uniform1f(cu.uF, F);
  gl.uniform1f(cu.uAspect, W / H);
  gl.uniform1f(cu.uMirror, mirror ? 1 : 0);
  gl.uniform1f(cu.uZ, CHILD.z);
  gl.uniform4f(cu.uRect, box[0], box[1], box[2], box[3]);
  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(cu.uTex, 5);
  gl.uniform2f(cu.uTexel, rect ? 1 / PULL_W : 1 / childW, rect ? 1 / PULL_H : 1 / childH);
  gl.uniform1f(cu.uAlpha, alpha);
  gl.uniform1f(cu.uH, CHILD.h);
  gl.uniform1f(cu.uDirect, direct ? 1 : 0);
  gl.uniform1f(cu.uCut, cut);
  gl.bindVertexArray(vaos.unit);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
function drawChildLayers(mirror, alpha) {
  const blend = gate.pulling && gate.seeked ? (gate.blend || 0) : 0;
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  if (gate.pulling && gate.seeked && T.pullReady) {
    if (gate.snapped && blend < 1) drawOneChild(T.childPrev, 0, alpha * (1 - blend), mirror);
    drawOneChild(T.pull, 0, alpha * (blend < 1 && gate.snapped ? blend : 1), mirror, 0.2, pullFrame());
  } else {
    drawOneChild(gate.snapped && gate.hands ? T.childPrev : T.child, 0, alpha, mirror);
  }
  if (!mirror) gl.disable(gl.BLEND);
}

// The film's newest frame, uploaded only when there is one.
function updateChild() {
  if ($video.readyState < 2 || !$video.videoWidth) return;
  // Keep the frame already on screen until the hands-up seek actually lands.
  if (gate.active && gate.hands && !gate.seeked) return;
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
  if (pullDirty && $pull.readyState >= 2 && $pull.videoWidth) {
    if (!T.pull) { T.pull = gl.createTexture(); prepTex(T.pull); }
    if (uploadTo(T.pull, $pull, false)) T.pullReady = true;
    pullDirty = false;
  }
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
    const portal = curtainPortal(PW, PH);
    gl.uniform4f(u.uPortal, portal.cx, portal.half, portal.floor, 0);
  });

  if (gate.active && childOn && show > 0.003 && gate.open > 0.001) {
    drawChildLayers(false, show * (1 - (gate.expand || 0)));
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.max(0, (now - last) / 1000);
  last = now;
  if (sleeping || document.hidden) return;
  // The rain sim stays on a short step. The doorway hears the real gap, and caps it itself.
  step(Math.min(0.05, raw), now, raw);
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
// CASTLE parts only the rain in front of Duang, then glides through that doorway.
// The rain never freezes. Seeking his hands-up frame does not block the cloth.

function curtainPortal(rtW, rtH) {
  const poseX = childX(childPose.feet);
  const horizon = project(poseX, 0, 0);
  const expand = gate.expand || 0;
  if (gate.active) {
    if (!gate.floorLock) gate.floorLock = horizon.y;
    horizon.y = gate.floorLock + (H + 64 - gate.floorLock) * expand;
  }
  const head = project(poseX, childY(Math.min(childPose.top, 0.12)), CHILD.z);
  const feet = project(poseX, 0, CHILD.z);
  const bodyH = Math.max(64, Math.abs(feet.y - head.y));
  const baseHalf = clamp(Math.max(bodyH * 1.05, W * 0.12), 76, W * 0.19);
  // The arch is narrowest at the floor and the top (0.62 of the middle). Grow from
  // his feet until that narrow edge still reaches both sides of the screen.
  const cover = Math.max(horizon.x, W - horizon.x) / 0.62 + 32;
  const handK = clamp(gate.handOpen || 0, 0, 1);
  const reach = pullFrame()[2] * (0.094 + 0.16 * handK);
  const handPx = Math.abs(project(poseX + reach, 0, CHILD.z).x - horizon.x);
  const grown = Math.max(baseHalf, handPx);
  const half = grown + (Math.max(cover, grown) - grown) * expand;
  const sx = (rtW || W) / Math.max(W, 1);
  const sy = (rtH || H) / Math.max(H, 1);
  return {
    cx: horizon.x * sx,
    half: half * sx,
    floor: Math.max(0, (H - horizon.y) * sy),
    css: { x: horizon.x, y: horizon.y, half },
  };
}
function publishPortal() {
  const portal = curtainPortal(PW, PH);
  const open = gate.open;
  const approach = Math.max(gate.glide || 0, gate.expand || 0);
  const scale = 1.08 - 0.08 * approach;
  const w = portal.css.half * 2 * Math.max(open, 0.02);
  body.style.setProperty('--door-x', `${portal.css.x.toFixed(1)}px`);
  body.style.setProperty('--door-b', `${Math.max(0, portal.css.y).toFixed(1)}px`);
  body.style.setProperty('--door-w', `${w.toFixed(1)}px`);
  body.style.setProperty('--open', open.toFixed(3));
  body.style.setProperty('--glide', (gate.glide || 0).toFixed(3));
  body.style.setProperty('--castle-scale', scale.toFixed(4));
  canvas.style.opacity = gate.active ? String(1 - (gate.expand || 0)) : '';
  window.__portal = {
    x: portal.css.x,
    floorY: portal.css.y,
    width: portal.css.half * 2,
    openWidth: w,
    open,
    glide: gate.glide || 0,
    expand: gate.expand || 0,
    scale,
    vw: W,
    vh: H,
  };
  return portal;
}
function prefetchCastle() {
  if (gate.active) return;
  const files = [
    ['../castle/', 'document'],
    ['../castle/castle.js', 'script'],
    ['../castle/style.css', 'style'],
    ['../castle/assets/world.svg', 'image'],
    ['../castle/assets/arrive-front.jpg', 'image'],
    ['../castle/assets/arrive-front-phone.jpg', 'image'],
    ['../castle/assets/duang-sprites.webp', 'image'],
    ['../castle/assets/logo-line.svg', 'image'],
  ];
  for (const [href, as] of files) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = as;
    link.href = new URL(href, document.baseURI).href;
    document.head.appendChild(link);
  }
  const meadow = new Image();
  meadow.decoding = 'async';
  meadow.src = new URL('../castle/assets/world.svg', document.baseURI).href;
}
function handOpenAt(t) {
  if (t < 0) return 0;
  let a = HAND_SPAN[0], b = HAND_SPAN[HAND_SPAN.length - 1];
  for (let i = 1; i < HAND_SPAN.length; i++) {
    if (t < HAND_SPAN[i][0]) { b = HAND_SPAN[i]; break; }
    a = HAND_SPAN[i];
  }
  const k = b[0] > a[0] ? clamp((t - a[0]) / (b[0] - a[0]), 0, 1) : 1;
  return a[1] + (b[1] - a[1]) * k;
}
function playGesture() {
  // Play the silent two-hand pull. The idle film stays on the frame he had at the click.
  if (gate.hands) return;
  gate.hands = true;
  gate.pulling = true;
  try { $video.pause(); } catch (e) { /* hold the pose we just snapped */ }
  const startPlay = () => {
    if (!gate.active || gate.seeked) return;
    gate.seeked = true;
    gate.playedGesture = true;
    gate.blendT0 = performance.now();
    $pull.muted = true;
    $pull.volume = 0;
    try { $pull.currentTime = 0; } catch (e) { /* start at the first frame */ }
    $pull.play().catch(() => {});
    pullDirty = true;
  };
  if ($pull.readyState >= 2) startPlay();
  else {
    $pull.addEventListener('loadeddata', startPlay, { once: true });
    $pull.load();
  }
}
function prepTex(tex) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
function snapshotChild() {
  try {
    if (!gl || !$video.videoWidth || $video.readyState < 2) return;
    if (!T.childPrev) T.childPrev = gl.createTexture();
    const snap = gate.snap || (gate.snap = document.createElement('canvas'));
    if (snap.width !== $video.videoWidth || snap.height !== $video.videoHeight) {
      snap.width = $video.videoWidth;
      snap.height = $video.videoHeight;
    }
    snap.getContext('2d').drawImage($video, 0, 0);
    prepTex(T.childPrev);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, snap);
    gate.snapped = true;
  } catch (e) { /* the hands frame still lands on the saved feet */ }
}
function pinChild() {
  const wx = childX(childPose.feet);
  const scr = project(wx, 0, CHILD.z);
  // The shared zoom anchor is for the curtain plane (z = 0). His feet are in front of it,
  // so the pin is solved at his own depth and applied after the camera zoom.
  gate.pin = { sx: scr.x, sy: scr.y, wx, wy: 0 };
}
function holdChildPin() {
  if (!gate.active || !gate.pin) return;
  const d = camDist() - CHILD.z;
  const { sx, sy, wx, wy } = gate.pin;
  cam.x = wx - (sx / W * 2 - 1) * (W / H) * d / F;
  cam.y = wy - (1 - sy / H * 2) * d / F;
}
function liveCastleOk() {
  return layoutSize().w >= 800 && matchMedia('(hover: hover) and (pointer: fine)').matches;
}
function warmCastle() {
  if (!liveCastleOk() || gate.active) return;
  const frame = castleFrame();
  if (!frame || frame.getAttribute('src')) return;
  const u = new URL('../castle/', document.baseURI);
  u.searchParams.set('arrived', '1');
  u.searchParams.set('veil', '1');
  frame.src = u.href;
}
function castleFrame() {
  return document.getElementById('castle-frame');
}
function armCastleView() {
  const still = document.getElementById('castle-still');
  const frame = castleFrame();
  gate.live = liveCastleOk();
  if (still) still.src = new URL(gate.live ? '../castle/assets/arrive-front.jpg' : '../castle/assets/arrive-front-phone.jpg', document.baseURI).href;
  if (!gate.live) {
    gate.castleReady = true;
    gate.useStill = true;
    return;
  }
  if (frame?.contentWindow?.__castle) {
    gate.castleReady = true;
    body.classList.add('castle-live');
    frame.contentWindow.postMessage({ type: 'hd-wake' }, location.origin);
    return;
  }
  if (!frame || frame.getAttribute('src')) return;
  const u = new URL('../castle/', document.baseURI);
  u.searchParams.set('arrived', '1');
  u.searchParams.set('veil', '1');
  frame.src = u.href;
}
function tellCastle(message) {
  const frame = castleFrame();
  if (frame?.contentWindow) frame.contentWindow.postMessage(message, location.origin);
}
function revealCastle() {
  if (gate.shelled) return;
  gate.navigated = true;
  gate.shelled = true;
  const frame = castleFrame();
  // The homepage document, and its one audio element, stay. The castle view is the iframe.
  if (!gate.live && frame && !frame.getAttribute('src')) {
    sleeping = true;
    const u = new URL('../castle/', document.baseURI);
    u.searchParams.set('arrived', '1');
    u.searchParams.set('veil', '1');
    frame.src = u.href;
  } else {
    sleeping = true;
    tellCastle({ type: 'hd-show-ui' });
    tellCastle({ type: 'hd-music-state', on: musicOn });
  }
  body.classList.add('castle-view');
  const page = new URL(location.href);
  let path = page.pathname;
  if (path.endsWith('/index.html')) path = path.slice(0, -'/index.html'.length);
  if (!path.endsWith('/')) path += '/';
  const shown = new URL('preview/castle/', page.origin + path);
  shown.searchParams.set('arrived', '1');
  if (!history.state || history.state.hd !== 'castle') {
    history.pushState({ hd: 'castle' }, '', `${shown.pathname}${shown.search}`);
  }
  if (window.__parting) window.__parting.navMs = performance.now() - gate.t0;
}
function hideCastleView() {
  if (!body.classList.contains('castle-view')) return;
  const frame = castleFrame();
  if (!liveCastleOk()) {
    if (frame) {
      frame.src = 'about:blank';
      frame.removeAttribute('src');
    }
  } else {
    tellCastle({ type: 'hd-sleep' });
  }
  body.classList.remove('castle-view', 'parting', 'castle-live');
  sleeping = false;
  gate.active = false;
  gate.shelled = false;
  gate.navigated = false;
  gate.seeked = false;
  gate.hands = false;
  gate.ui = false;
  gate.snapped = false;
  gate.open = 0;
  gate.glide = 0;
  gate.expand = 0;
  gate.expandT0 = null;
  gate.blend = 0;
  gate.holdPose = null;
  gate.pin = null;
  gate.pulling = false;
  try { $pull.pause(); $pull.currentTime = 0; } catch (e) { /* clip can restart next time */ }
  anchor = null;
  canvas.style.opacity = '';
  const back = gate.holdTime;
  if (back != null && $video && Math.abs(($video.currentTime || 0) - back) > 0.08) {
    const resume = () => { if (!REDUCED && !gate.active) $video.play().catch(() => {}); };
    $video.addEventListener('seeked', resume, { once: true });
    try { $video.currentTime = back; } catch (e) { resume(); }
  } else if (!REDUCED) {
    $video.play().catch(() => {});
  }
}
function finishCastle(force) {
  if (gate.navigated) return;
  if (!force && (gate.hold || window.__holdNav)) {
    if (window.__parting) window.__parting.readyToGo = performance.now() - gate.t0;
    return;
  }
  revealCastle();
}
window.__finishCastle = () => finishCastle(true);
addEventListener('message', e => {
  const frame = castleFrame();
  if (e.origin !== location.origin || !frame || e.source !== frame.contentWindow || !e.data) return;
  if (e.data.type === 'hd-castle-ready') {
    gate.castleReady = true;
    body.classList.add('castle-live');
    tellCastle({ type: 'hd-music-state', on: musicOn });
    if (gate.shelled) tellCastle({ type: 'hd-show-ui' });
    if (window.__parting) window.__parting.readyMs = performance.now() - window.__parting.t0;
  } else if (e.data.type === 'hd-music-toggle') {
    setMusic(!musicOn);
  } else if (e.data.type === 'hd-home') {
    if (history.state && history.state.hd === 'castle') history.back();
    else hideCastleView();
  }
});
addEventListener('popstate', () => {
  const showing = history.state && history.state.hd === 'castle';
  if (showing) {
    body.classList.add('castle-view');
    sleeping = true;
    tellCastle({ type: 'hd-wake' });
    tellCastle({ type: 'hd-show-ui' });
  } else {
    hideCastleView();
  }
});
function beginCastle() {
  if (gate.active || body.classList.contains('castle-view')) return;
  const now = performance.now();
  gate.active = true;
  gate.t0 = now;
  gate.p = 0;
  gate.floorLock = 0;
  gate.hold = gate.hold || QS.has('hold');
  gate.open = 0.045;
  gate.glide = 0;
  gate.expand = 0;
  gate.expandT0 = null;
  gate.seeked = false;
  gate.hands = false;
  gate.blend = 0;
  gate.playedGesture = false;
  gate.handOpen = 0;
  gate.gestureP = null;
  gate.navigated = false;
  gate.shelled = false;
  gate.holdPose = { feet: childPose.feet, hand: childPose.hand, top: childPose.top };
  gate.holdTime = $video.currentTime || 0;
  pinChild();
  snapshotChild();
  body.classList.add('parting');
  if (body.classList.contains('menu-open')) setMenu(false);
  playGesture();
  armCastleView();
  publishPortal();
  window.__parting = { t0: now, classMs: performance.now() - now, litMs: 0, navMs: 0, readyMs: gate.castleReady ? 0 : 0, totalMs: PART_S * 1000, live: !!gate.live };
  $announce.textContent = '端端拨开面前的光帘，走进城堡。 Duang parts the rain in front of him and the castle shows through.';
}
function gateTick(rawDt) {
  // One late frame used to spend the whole glide and the whole opening, so the rain
  // cut straight to the castle. A step stays under a third of that opening.
  const step = gate.frozen ? 0 : Math.min(Math.max(rawDt || 0, 0), 0.16);
  const p = (gate.p || 0) + step;
  if (!gate.frozen) gate.p = p;
  const openT = clamp(p / OPEN_END, 0, 1);
  const timeOpen = 1 - Math.pow(1 - openT, 1.55);
  const vt = gate.pulling ? ($pull.currentTime || 0) : 0;
  if (gate.pulling && $pull.readyState >= 2 && !$pull.paused) {
    gate.playedGesture = true;
    gate.seeked = true;
    gate.handOpen = Math.max(gate.handOpen || 0, handOpenAt(vt));
  }
  const handsMoved = !!(gate.playedGesture && vt >= PULL_DONE);
  gate.open = handsMoved ? Math.max(gate.handOpen || 0, timeOpen) : Math.max(0.04, gate.handOpen || 0);
  if (!gate.gestureP && (handsMoved || p >= MAX_P)) gate.gestureP = p;
  const gp = gate.gestureP == null ? 0 : Math.max(0, p - gate.gestureP);
  gate.glide = smooth(0, 1.1, gp);
  if (gate.seeked && gate.blendT0) gate.blend = clamp((performance.now() - gate.blendT0) / (BLEND_S * 1000), 0, 1);
  if (!gate.castleReady && p >= 3.4) gate.castleReady = true;
  if (gate.castleReady && gp >= 1.1 && gate.expandT0 == null) gate.expandT0 = p;
  gate.expand = gate.expandT0 == null ? 0 : smooth(gate.expandT0, gate.expandT0 + EXPAND_DUR, p);
  gate.p = p;
  // Zoom toward the door, but keep the pinned foot on the same screen pixel.
  if (gate.glide > 0 && (gate.expand || 0) < 0.2) {
    cam.lsT = LS_MIN() + gate.glide * 0.16;
    tween = null;
  }
  if (gate.expand > 0.12 && gate.live && !gate.ui) {
    gate.ui = true;
    tellCastle({ type: 'hd-show-ui' });
  }
  publishPortal();
  window.__gesture = {
    vt: Math.round(($pull.currentTime || 0) * 1000) / 1000,
    open: Math.round((gate.open || 0) * 1000) / 1000,
    paused: !!$pull.paused,
    filmFeet: Math.round((filmPose.feet || 0) * 1000) / 1000,
    filmHand: Math.round((filmPose.hand || 0) * 1000) / 1000,
  };
  if (window.__parting) {
    window.__parting.p = p;
    window.__parting.expand = gate.expand;
    if (!window.__parting.litMs && gate.open > 0.08) window.__parting.litMs = performance.now() - gate.t0;
  }
  if (!gate.navigated && gate.expand > 0.985 && gate.gestureP != null) finishCastle(false);
  else if (!gate.navigated && p >= 7) finishCastle(false);
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
  prepTex(T.child);
  T.childPrev = gl.createTexture();
  prepTex(T.childPrev);
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
  if (QS.has('play') || SHOTS[QS.get('shot')] != null) beginCastle();
  else {
    const warm = () => { prefetchCastle(); warmCastle(); };
    if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 2000 });
    else setTimeout(warm, 1400);
  }
}
boot().catch(err => {
  console.error(err);
  body.classList.add('ready');
  const message = document.getElementById('error');
  message.textContent = err.message;
  message.hidden = false;
});
