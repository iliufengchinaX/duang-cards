/* Hello Duang · 三时段空镜背景 + 可旋转 3D 一体浮空城堡
 * 1. 桌面(1984×992) / iPad(1200×1600) / 手机(1056×1872) 按视口比例加载对应时段空镜（empty-*）；
 * 2. 空镜背景（远山、天空、云雾、远山瀑布）保持稳定不动，绝不用 CSS 倾斜/平移整张图冒充旋转；
 * 3. 前景由 castle-3d.js 加载统一的 3D 城堡 + 浮空岛模型（assets/models/castle-island.glb），
 *    在真实 3D 空间绕竖直轴旋转（拖拽偏航、惯性、闲时轻摆、「转到背面」按钮）；
 * 4. 切换 Day / Sunset / Night 时，背景空镜、远景云雾与 3D 城堡的光照和窗灯光同步平滑过渡。
 */
(function () {
  'use strict';
  var BASE = 'assets/time-of-day/';
  var TIMES = ['day', 'sunset', 'night'];
  var LABELS = { day: 'Day', sunset: 'Sunset', night: 'Night' };
  var root = document.documentElement;
  var stage = document.getElementById('stage');
  var scene = document.getElementById('scene');
  if (!stage || !scene) return;

  var embedded = window.parent !== window;
  var reduceMq = matchMedia('(prefers-reduced-motion: reduce)');
  var FPS = matchMedia('(pointer: coarse)').matches ? 30 : 60;
  var DUR = reduceMq.matches ? 700 : 1200;
  root.style.setProperty('--tod-dur', DUR + 'ms');

  /* ---------- 三端空镜配置（仅保留背景远山瀑布，移除旧 2D 岛瀑布，由 3D 模型自带） ---------- */
  var VARIANTS = {
    desktop: {
      w: 1984, h: 992, fx: 0.50, fy: 0.50,
      imgs: {
        day: 'empty-desktop-day.webp',
        sunset: 'empty-desktop-sunset.webp',
        night: 'empty-desktop-night.webp'
      },
      skyMask: 'sky-mask.png',
      skyOpen: 'sky-open-desktop.png',
      mistMask: 'mist-mask.png',
      waterMask: 'water-flow-masks.png',
      moon: { x: 1644, y: 108, r: 105 },
      water: [
        { id: 'rfall', x: 1460, y: 352, w: 122, h: 300, ax: 478, kind: 'flow', dir: [0, 1], L: 16, T: 1.48, sv: 24, sa: 0.30, soft: true, off: { sunset: [-2, -3], night: [-1, -1] } },
        { id: 'lfall', x: 444,  y: 498, w: 54,  h: 78,  ax: 602, kind: 'flow', dir: [0, 1], L: 12, T: 1.15, sv: 20, sa: 0.52, off: { sunset: [-5, -2], night: [-3, 0] } }
      ],
      flowClouds: [
        { s: 0, x: 120,  y: 255, k: 1.05, v: 9.0, a: 0.52 },
        { s: 2, x: 760,  y: 225, k: 0.92, v: 6.8, a: 0.46 },
        { s: 1, x: 1380, y: 245, k: 0.98, v: 8.2, a: 0.48 },
        { s: 3, x: 340,  y: 155, k: 0.80, v: 6.2, a: 0.38 },
        { s: 0, x: 1120, y: 150, k: 0.84, v: 7.4, a: 0.40 },
        { s: 2, x: 1660, y: 180, k: 0.80, v: 5.8, a: 0.38 }
      ],
      cumulus: [
        { s: 0, x: 340,  y: 120, k: 0.86, v: 13.5, a: 0.82 },
        { s: 1, x: 1210, y: 148, k: 0.78, v: 11.2, a: 0.78 },
        { s: 2, x: 760,  y: 54,  k: 0.72, v: 9.8,  a: 0.72 },
        { s: 3, x: 1620, y: 215, k: 0.74, v: 15.0, a: 0.70 },
        { s: 0, x: -120, y: 225, k: 0.68, v: 12.2, a: 0.68 }
      ],
      fogs: [
        { s: 0, x: -120, y: 560, k: 1.20, v: 4.8, a: 0.66 },
        { s: 1, x: 900,  y: 610, k: 1.35, v: 3.5, a: 0.62 },
        { s: 0, x: 1500, y: 690, k: 1.10, v: 4.2, a: 0.58 },
        { s: 1, x: 300,  y: 740, k: 1.25, v: 5.6, a: 0.54 },
        { s: 0, x: 1150, y: 790, k: 1.00, v: 3.0, a: 0.48 }
      ]
    },
    ipad: {
      w: 1200, h: 1600, fx: 0.50, fy: 0.50,
      imgs: {
        day: 'empty-ipad-day.webp',
        sunset: 'empty-ipad-sunset.webp',
        night: 'empty-ipad-night.webp'
      },
      skyMask: 'sky-mask-ipad.png',
      skyOpen: 'sky-open-ipad.png',
      mistMask: 'mist-mask-ipad.png',
      waterMask: 'water-flow-ipad.png',
      moon: { x: 958, y: 212, r: 100 },
      water: [
        { id: 'rfall', x: 1000, y: 530, w: 150, h: 270, ax: 260, kind: 'flow', dir: [0, 1], L: 15, T: 1.48, sv: 22, sa: 0.28, soft: true }
      ],
      flowClouds: [
        { s: 0, x: 60,  y: 430, k: 0.90, v: 7.2, a: 0.50 },
        { s: 2, x: 680, y: 400, k: 0.78, v: 5.8, a: 0.44 },
        { s: 1, x: 260, y: 285, k: 0.68, v: 5.2, a: 0.38 },
        { s: 3, x: 860, y: 305, k: 0.66, v: 6.2, a: 0.40 }
      ],
      cumulus: [
        { s: 0, x: 110, y: 230, k: 0.78, v: 11.0, a: 0.80 },
        { s: 1, x: 740, y: 290, k: 0.68, v: 9.6,  a: 0.76 },
        { s: 2, x: 420, y: 115, k: 0.64, v: 8.4,  a: 0.70 },
        { s: 3, x: 900, y: 390, k: 0.62, v: 12.0, a: 0.68 }
      ],
      fogs: [
        { s: 0, x: -80, y: 900,  k: 0.95, v: 4.5, a: 0.62 },
        { s: 1, x: 520, y: 1030, k: 1.05, v: 3.5, a: 0.58 },
        { s: 0, x: 240, y: 1130, k: 0.90, v: 5.0, a: 0.50 }
      ]
    },
    phone: {
      w: 1056, h: 1872, fx: 0.50, fy: 0.49,
      imgs: {
        day: 'empty-phone-day.webp',
        sunset: 'empty-phone-sunset.webp',
        night: 'empty-phone-night.webp'
      },
      skyMask: 'sky-mask-phone.png',
      skyOpen: 'sky-open-phone.png',
      mistMask: 'mist-mask-phone.png',
      waterMask: 'water-flow-phone.png',
      moon: { x: 856, y: 212, r: 96 },
      water: [
        { id: 'rfall', x: 895, y: 575, w: 135, h: 310, ax: 254, kind: 'flow', dir: [0, 1], L: 15, T: 1.48, sv: 22, sa: 0.28, soft: true }
      ],
      flowClouds: [
        { s: 0, x: 40,  y: 505, k: 0.84, v: 6.8, a: 0.48 },
        { s: 2, x: 560, y: 460, k: 0.72, v: 5.5, a: 0.42 },
        { s: 1, x: 220, y: 335, k: 0.62, v: 4.8, a: 0.36 },
        { s: 3, x: 740, y: 355, k: 0.60, v: 5.8, a: 0.38 }
      ],
      cumulus: [
        { s: 0, x: 90,  y: 245, k: 0.72, v: 10.2, a: 0.80 },
        { s: 1, x: 650, y: 340, k: 0.64, v: 9.0,  a: 0.76 },
        { s: 2, x: 380, y: 120, k: 0.60, v: 7.8,  a: 0.70 },
        { s: 3, x: 780, y: 455, k: 0.58, v: 11.2, a: 0.66 }
      ],
      fogs: [
        { s: 0, x: -60, y: 1020, k: 0.88, v: 4.2, a: 0.60 },
        { s: 1, x: 460, y: 1180, k: 0.96, v: 3.3, a: 0.56 },
        { s: 0, x: 180, y: 1290, k: 0.84, v: 4.8, a: 0.48 }
      ]
    }
  };

  /* ---------- 时段参数：远景流动云 / 成形白云 / 山谷雾 / 远山瀑布 ---------- */
  var LOOK = {
    day: {
      flowTop: [244, 250, 255], flowBot: [164, 208, 244], flowMix: 0.94, flowA: 0.34,
      cumTop:  [255, 254, 252], cumBot:  [184, 206, 234], cumMix:  0.58, cumA:  0.86,
      mist:    [214, 228, 240], mistA: 0.44,
      streak:  0.32, theme: '#2f78c0', sky: '#1a6db4', ground: '#4a6d37', moonMask: 0
    },
    sunset: {
      flowTop: [252, 198, 158], flowBot: [176, 122, 152], flowMix: 0.95, flowA: 0.33,
      cumTop:  [255, 212, 168], cumBot:  [164, 112, 142], cumMix:  0.78, cumA:  0.82,
      mist:    [212, 158, 152], mistA: 0.44,
      streak:  0.26, theme: '#7c6a8e', sky: '#5b5c83', ground: '#4b4836', moonMask: 0
    },
    night: {
      flowTop: [74, 104, 148],  flowBot: [24, 46, 84],    flowMix: 0.96, flowA: 0.34,
      cumTop:  [124, 154, 196], cumBot:  [34, 58, 98],    cumMix:  0.82, cumA:  0.70,
      mist:    [66, 96, 134],   mistA: 0.32,
      streak:  0.28, theme: '#0b1b38', sky: '#03152f', ground: '#162f2c', moonMask: 1
    }
  };

  function pickVariantKey(w, h) {
    var asp = w / Math.max(1, h);
    if (asp >= 1.15) return 'desktop';
    if (asp >= 0.66) return 'ipad';
    return 'phone';
  }

  var variantKey = pickVariantKey(stage.clientWidth || innerWidth, stage.clientHeight || innerHeight);
  var V = VARIANTS[variantKey];
  var IW = V.w, IH = V.h;
  var lastW = 0, lastH = 0, boardW = 0, boardH = 0, boardX = 0, boardY = 0;

  /* ---------- 启动 3D 一体浮空城堡渲染器 ---------- */
  var castle3d = typeof window.initCastle3D === 'function'
    ? window.initCastle3D({
      onReady: function () { dirty = true; kick(); },
      onMissing: function () { dirty = true; kick(); }
    })
    : null;
  if (castle3d) castle3d.setVariant(variantKey);

  /* ---------- 资源加载器 ---------- */
  function loadImg(src) {
    return new Promise(function (res) {
      var im = new Image();
      im.decoding = 'async';
      im.onload = function () { res(im); };
      im.onerror = function () { res(null); };
      im.src = BASE + src;
    });
  }

  var A = { flowSprites: [], cumulusSprites: [], fogs: [], streaks: null, foam: null };
  var variantCache = {};

  function loadVariantAssets(key) {
    if (variantCache[key]) return variantCache[key];
    var cfg = VARIANTS[key];
    variantCache[key] = Promise.all([
      loadImg(cfg.waterMask),
      loadImg(cfg.skyMask),
      loadImg(cfg.skyOpen),
      loadImg(cfg.mistMask)
    ]).then(function (r) {
      var data = { waterMask: r[0], skyMask: r[1], skyOpen: r[2], mistMask: r[3], maskData: null };
      if (data.waterMask) {
        try {
          var c = document.createElement('canvas');
          c.width = data.waterMask.width; c.height = data.waterMask.height;
          var cx = c.getContext('2d');
          cx.drawImage(data.waterMask, 0, 0);
          data.maskData = cx.getImageData(0, 0, c.width, c.height);
        } catch (e) { data.maskData = null; }
      }
      return data;
    });
    return variantCache[key];
  }

  var VA = null;
  var sharedReady = Promise.all([
    loadImg('streaks.png'),
    loadImg('foam.png'),
    loadImg('cloud-1.webp'), loadImg('cloud-2.webp'), loadImg('cloud-3.webp'), loadImg('cloud-4.webp'), loadImg('cloud-wisp.webp'),
    loadImg('cumulus-1.webp'), loadImg('cumulus-2.webp'), loadImg('cumulus-3.webp'), loadImg('cumulus-4.webp'),
    loadImg('fog-1.webp'), loadImg('fog-2.webp')
  ]).then(function (r) {
    A.streaks = r[0];
    A.foam = r[1];
    A.flowSprites = r.slice(2, 7).filter(Boolean);
    A.cumulusSprites = r.slice(7, 11).filter(Boolean);
    A.fogs = r.slice(11, 13).filter(Boolean);
    tintCache = null;
    dirty = true;
  });

  /* ---------- 空镜图层管理 ---------- */
  var layers = {};
  TIMES.forEach(function (t) {
    var el = scene.querySelector('.tod-layer[data-time="' + t + '"]');
    var img = el.querySelector('.tod-img');
    layers[t] = {
      t: t, el: el, img: img, board: el.querySelector('.tod-board'),
      ready: null, loadedKey: '', water: [], on: el.classList.contains('is-on'), fading: false
    };
  });

  function clearLayerWater(L) {
    for (var i = 0; i < L.water.length; i++) {
      if (L.water[i].c && L.water[i].c.parentNode) L.water[i].c.parentNode.removeChild(L.water[i].c);
    }
    L.water = [];
  }

  function loadLayer(t) {
    var L = layers[t];
    var targetSrc = BASE + V.imgs[t];
    if (L.ready && L.loadedKey === variantKey) return L.ready;
    L.loadedKey = variantKey;
    clearLayerWater(L);
    var img = L.img;
    var myKey = variantKey, myW = V.w, myH = V.h;
    L.ready = new Promise(function (res) {
      function commit() {
        if (myKey !== variantKey) { res(L); return; }
        img.width = myW; img.height = myH;
        if (img.getAttribute('src') !== targetSrc) {
          img.removeAttribute('data-src');
          img.src = targetSrc;
        }
        var p = img.decode ? img.decode().catch(function () {}) : Promise.resolve();
        p.then(function () {
          if (myKey === variantKey) buildWater(L);
          res(L);
        });
      }
      if (img.getAttribute('src') === targetSrc && img.complete && img.naturalWidth === myW) {
        commit();
      } else {
        var pre = new Image();
        pre.decoding = 'async';
        pre.onload = commit;
        pre.onerror = commit;
        pre.src = targetSrc;
      }
    });
    return L.ready;
  }

  /* ---------- 画板与多端切换（空镜 cover 铺满，不倾斜、不旋转背景） ---------- */
  var fx = scene.querySelector('.tod-fx');
  var cvF = fx.querySelector('.tod-flow');
  var cvC = fx.querySelector('.tod-clouds');
  var cvM = fx.querySelector('.tod-mist');
  var gF = cvF.getContext('2d');
  var gC = cvC.getContext('2d');
  var gM = cvM.getContext('2d');
  var CW = Math.round(IW / 2), CH = Math.round(IH / 2), KS = CW / IW;
  cvF.width = cvC.width = cvM.width = CW;
  cvF.height = cvC.height = cvM.height = CH;

  function syncCanvasSize() {
    CW = Math.round(IW / 2); CH = Math.round(IH / 2); KS = CW / IW;
    if (cvF.width !== CW || cvF.height !== CH) {
      cvF.width = cvC.width = cvM.width = CW;
      cvF.height = cvC.height = cvM.height = CH;
    }
  }

  function switchVariant(nextKey) {
    if (nextKey === variantKey) return;
    variantKey = nextKey;
    V = VARIANTS[variantKey];
    IW = V.w; IH = V.h;
    syncCanvasSize();
    if (castle3d) castle3d.setVariant(variantKey);
    TIMES.forEach(function (t) { layers[t].ready = null; clearLayerWater(layers[t]); });
    VA = null;
    Promise.all([loadVariantAssets(variantKey), loadLayer(current)]).then(function (r) {
      if (variantKey !== nextKey) return;
      VA = r[0];
      buildWater(layers[current]);
      dirty = true; kick();
      var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 500); };
      idle(function () {
        if (variantKey === nextKey) TIMES.forEach(function (t) { loadLayer(t); });
      });
    });
  }

  function layout() {
    var W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return;
    var wantKey = pickVariantKey(W, H);
    if (wantKey !== variantKey) switchVariant(wantKey);
    if (W === lastW && H === lastH && boardW) return;
    lastW = W; lastH = H;
    // Desktop / landscape (1984x992): fit full plate width (scaleX = W / IW) so side mountains
    // are never cropped, and stretch height independently (scaleY = H / IH) to fill viewport
    // without top/bottom letterbox bars; portrait iPad / phone keep uniform cover fit.
    var isDesktop = variantKey === 'desktop' && (W / Math.max(1, H) >= 1.15);
    var scaleX, scaleY, bw, bh, bx, by;
    if (isDesktop) {
      scaleX = W / IW;
      scaleY = H / IH;
      bw = W;
      bh = H;
      bx = 0;
      by = 0;
    } else {
      scaleX = scaleY = Math.max(W / IW, H / IH);
      bw = Math.ceil(IW * scaleX);
      bh = Math.ceil(IH * scaleY);
      bx = Math.round((W - bw) * V.fx);
      by = Math.round((H - bh) * V.fy);
    }
    boardW = bw; boardH = bh; boardX = bx; boardY = by;
    var st = stage.style;
    st.setProperty('--bx', bx + 'px');
    st.setProperty('--by', by + 'px');
    st.setProperty('--bw', bw + 'px');
    st.setProperty('--bh', bh + 'px');
    st.setProperty('--sx', scaleX.toFixed(4));
    st.setProperty('--sy', scaleY.toFixed(4));
    st.setProperty('--s', Math.min(scaleX, scaleY).toFixed(4));
    dirty = true; kick();
  }

  /* ---------- 背景远山瀑布（双相位 flow-map + 底部溶进山谷雾气） ---------- */
  function buildWater(L) {
    if (L.water.length || !VA || !VA.waterMask || !L.img.naturalWidth) return;
    V.water.forEach(function (R) {
      var o = (R.off && R.off[L.t]) || [0, 0];
      var c = document.createElement('canvas');
      c.className = 'tod-water';
      c.width = R.w; c.height = R.h;
      c.style.left = ((R.x + o[0]) / IW * 100) + '%';
      c.style.top = ((R.y + o[1]) / IH * 100) + '%';
      c.style.width = (R.w / IW * 100) + '%';
      c.style.height = (R.h / IH * 100) + '%';
      L.board.appendChild(c);
      L.water.push({ R: R, c: c, ctx: c.getContext('2d'), src: makeSource(L.img, R, o), pat: null });
    });
  }

  function makeSource(img, R, o) {
    var P = Math.max(4, R.L + 2), pw = R.w + 2 * P, ph = R.h + 2 * P;
    var c = document.createElement('canvas'); c.width = pw; c.height = ph;
    var cx = c.getContext('2d');
    cx.drawImage(img, R.x - P + o[0], R.y - P + o[1], pw, ph, 0, 0, pw, ph);
    c.P = P;
    if (R.kind !== 'flow' || !VA || !VA.maskData) return c;
    try {
      var id = cx.getImageData(0, 0, pw, ph), d = id.data, M = VA.maskData, MW = M.width;
      var sx = Math.abs(R.dir[0]) > 0.38 ? (R.dir[0] > 0 ? 1 : -1) : 0;
      var sy = Math.abs(R.dir[1]) > 0.38 ? (R.dir[1] > 0 ? 1 : -1) : 0;
      var wet = new Uint8Array(pw * ph), x, y;
      for (y = 0; y < R.h; y++) for (x = 0; x < R.w; x++) {
        if (M.data[(y * MW + R.ax + x) * 4 + 3] > 80) wet[(y + P) * pw + x + P] = 1;
      }
      var y0 = sy > 0 ? ph - 1 : 0, y1 = sy > 0 ? -1 : ph, dy = sy > 0 ? -1 : 1;
      var x0 = sx > 0 ? pw - 1 : 0, x1 = sx > 0 ? -1 : pw, dx = sx > 0 ? -1 : 1;
      for (y = y0; y !== y1; y += dy) {
        for (x = x0; x !== x1; x += dx) {
          var i = y * pw + x;
          if (wet[i]) continue;
          var qx = x + sx, qy = y + sy;
          if (qx < 0 || qy < 0 || qx >= pw || qy >= ph) continue;
          var j = qy * pw + qx;
          if (!wet[j]) continue;
          d[i * 4] = d[j * 4]; d[i * 4 + 1] = d[j * 4 + 1]; d[i * 4 + 2] = d[j * 4 + 2];
          wet[i] = 1;
        }
      }
      cx.putImageData(id, 0, 0);
    } catch (e) {}
    return c;
  }

  function drawWater(L, t, look) {
    if (!VA || !VA.waterMask) return;
    for (var k = 0; k < L.water.length; k++) {
      var W = L.water[k], R = W.R, g = W.ctx, P = W.src.P;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.clearRect(0, 0, R.w, R.h);
      var p1 = (t / R.T) % 1, p2 = (p1 + 0.5) % 1;
      var w2 = 0.5 - 0.5 * Math.cos(p2 * Math.PI * 2);
      var d1 = p1 * R.L, d2 = p2 * R.L;
      var sway1 = R.soft ? Math.sin(t * 1.15) * 0.9 : 0;
      var sway2 = R.soft ? Math.cos(t * 0.95) * 0.9 : 0;
      g.drawImage(W.src, P - R.dir[0] * d1 + sway1, P - R.dir[1] * d1, R.w, R.h, 0, 0, R.w, R.h);
      g.globalAlpha = w2;
      g.drawImage(W.src, P - R.dir[0] * d2 + sway2, P - R.dir[1] * d2, R.w, R.h, 0, 0, R.w, R.h);
      if (A.streaks) {
        if (!W.pat) W.pat = g.createPattern(A.streaks, 'repeat');
        var ang = Math.atan2(R.dir[1], R.dir[0]) - Math.PI / 2, off = (t * R.sv) % 256;
        g.globalCompositeOperation = R.soft ? 'soft-light' : 'overlay';
        g.globalAlpha = look.streak * R.sa;
        g.translate(R.w / 2, R.h / 2); g.rotate(ang); g.translate(0, off);
        g.fillStyle = W.pat;
        var big = R.w + R.h;
        g.fillRect(-big, -big - off, big * 2, big * 2);
        g.setTransform(1, 0, 0, 1, 0, 0);
      }
      if (R.soft) {
        var mr = Math.round(look.mist[0]), mg = Math.round(look.mist[1]), mb = Math.round(look.mist[2]);
        var mistPulse = 0.48 + 0.14 * Math.sin(t * 0.9);
        var mgGrad = g.createLinearGradient(0, R.h * 0.50, 0, R.h);
        mgGrad.addColorStop(0, 'rgba(' + mr + ',' + mg + ',' + mb + ',0)');
        mgGrad.addColorStop(0.55, 'rgba(' + mr + ',' + mg + ',' + mb + ',' + (mistPulse * 0.55).toFixed(3) + ')');
        mgGrad.addColorStop(1, 'rgba(' + mr + ',' + mg + ',' + mb + ',' + mistPulse.toFixed(3) + ')');
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.fillStyle = mgGrad;
        g.fillRect(0, R.h * 0.48, R.w, R.h * 0.52);

        var puffX = R.w * 0.5 + Math.sin(t * 0.65) * 6;
        var puffY = R.h * 0.84 + Math.cos(t * 0.85) * 3;
        var rad = g.createRadialGradient(puffX, puffY, 4, puffX, puffY, R.w * 0.68);
        rad.addColorStop(0, 'rgba(' + mr + ',' + mg + ',' + mb + ',0.42)');
        rad.addColorStop(0.6, 'rgba(' + mr + ',' + mg + ',' + mb + ',0.16)');
        rad.addColorStop(1, 'rgba(' + mr + ',' + mg + ',' + mb + ',0)');
        g.fillStyle = rad;
        g.fillRect(0, R.h * 0.52, R.w, R.h * 0.48);
      }
      g.globalCompositeOperation = 'destination-in'; g.globalAlpha = 1;
      g.drawImage(VA.waterMask, R.ax, 0, R.w, R.h, 0, 0, R.w, R.h);
      if (R.soft) {
        var fadeV = g.createLinearGradient(0, 0, 0, R.h);
        fadeV.addColorStop(0.0, 'rgba(0,0,0,0.0)');
        fadeV.addColorStop(0.06, 'rgba(0,0,0,1.0)');
        fadeV.addColorStop(0.58, 'rgba(0,0,0,1.0)');
        fadeV.addColorStop(0.82, 'rgba(0,0,0,0.42)');
        fadeV.addColorStop(0.97, 'rgba(0,0,0,0.0)');
        g.fillStyle = fadeV;
        g.fillRect(0, 0, R.w, R.h);
      }
      g.globalCompositeOperation = 'source-over';
    }
  }

  /* ---------- 天空双层云 + 山谷雾 ---------- */
  var tintCache = null, tintKey = '';
  function lerp(a, b, k) { return a + (b - a) * k; }
  function lerp3(a, b, k) { return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
  function rgb(c) { return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }

  function tinted(look) {
    var key = rgb(look.flowTop) + rgb(look.flowBot) + rgb(look.cumTop) + rgb(look.cumBot) + rgb(look.mist);
    if (tintCache && key === tintKey) return tintCache;
    tintKey = key;
    if (!tintCache) {
      tintCache = {
        flow: A.flowSprites.map(function () { return document.createElement('canvas'); }),
        cumulus: A.cumulusSprites.map(function () { return document.createElement('canvas'); }),
        fogs: A.fogs.map(function () { return document.createElement('canvas'); })
      };
    }
    function paint(c, im, fill) {
      if (c.width !== im.width) c.width = im.width;
      if (c.height !== im.height) c.height = im.height;
      var g = c.getContext('2d');
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(im, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      fill(g, c);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    A.flowSprites.forEach(function (im, i) {
      paint(tintCache.flow[i], im, function (g, c) {
        var gr = g.createLinearGradient(0, 0, 0, c.height);
        gr.addColorStop(0.1, rgb(look.flowTop));
        gr.addColorStop(0.92, rgb(look.flowBot));
        g.globalAlpha = look.flowMix; g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
      });
    });
    A.cumulusSprites.forEach(function (im, i) {
      paint(tintCache.cumulus[i], im, function (g, c) {
        var gr = g.createLinearGradient(0, 0, 0, c.height);
        gr.addColorStop(0.18, rgb(look.cumTop));
        gr.addColorStop(0.92, rgb(look.cumBot));
        g.globalAlpha = look.cumMix; g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
      });
    });
    A.fogs.forEach(function (im, i) {
      paint(tintCache.fogs[i], im, function (g, c) {
        g.globalAlpha = 1; g.fillStyle = rgb(look.mist); g.fillRect(0, 0, c.width, c.height);
      });
    });
    return tintCache;
  }

  function driftX(it, w, t) {
    var span = IW + w * 2;
    return (((it.x + w + it.v * t) % span) + span) % span - w;
  }

  function eraseMoonHalo(g, strength) {
    if (strength <= 0.02 || !V.moon) return;
    var mx = V.moon.x * KS, my = V.moon.y * KS, mr = V.moon.r * KS;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-out';
    var rg = g.createRadialGradient(mx, my, mr * 0.35, mx, my, mr);
    rg.addColorStop(0, 'rgba(0,0,0,' + (0.92 * strength).toFixed(3) + ')');
    rg.addColorStop(0.65, 'rgba(0,0,0,' + (0.45 * strength).toFixed(3) + ')');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    g.restore();
  }

  function drawSky(t, look) {
    if (!A.flowSprites.length || !VA) return;
    var T = tinted(look);

    gF.setTransform(1, 0, 0, 1, 0, 0);
    gF.globalCompositeOperation = 'source-over'; gF.globalAlpha = 1;
    gF.clearRect(0, 0, CW, CH);
    gF.setTransform(KS, 0, 0, KS, 0, 0);
    V.flowClouds.forEach(function (it) {
      var im = T.flow[it.s % T.flow.length], w = im.width * it.k, h = im.height * it.k;
      gF.globalAlpha = it.a * look.flowA;
      gF.drawImage(im, driftX(it, w, t), it.y, w, h);
    });
    gF.setTransform(1, 0, 0, 1, 0, 0);
    gF.globalAlpha = 1;
    var openMask = VA.skyOpen || VA.skyMask;
    if (openMask) {
      gF.globalCompositeOperation = 'destination-in';
      gF.drawImage(openMask, 0, 0, CW, CH);
      gF.globalCompositeOperation = 'source-over';
    }
    eraseMoonHalo(gF, look.moonMask);

    gC.setTransform(1, 0, 0, 1, 0, 0);
    gC.globalCompositeOperation = 'source-over'; gC.globalAlpha = 1;
    gC.clearRect(0, 0, CW, CH);
    if (T.cumulus.length) {
      gC.setTransform(KS, 0, 0, KS, 0, 0);
      V.cumulus.forEach(function (it) {
        var im = T.cumulus[it.s % T.cumulus.length], w = im.width * it.k, h = im.height * it.k;
        gC.globalAlpha = it.a * look.cumA;
        gC.drawImage(im, driftX(it, w, t), it.y, w, h);
      });
      gC.setTransform(1, 0, 0, 1, 0, 0);
      gC.globalAlpha = 1;
      if (VA.skyMask) {
        gC.globalCompositeOperation = 'destination-in';
        gC.drawImage(VA.skyMask, 0, 0, CW, CH);
        gC.globalCompositeOperation = 'source-over';
      }
      eraseMoonHalo(gC, look.moonMask);
    }

    gM.setTransform(1, 0, 0, 1, 0, 0);
    gM.globalCompositeOperation = 'source-over'; gM.globalAlpha = 1;
    gM.clearRect(0, 0, CW, CH);
    if (T.fogs.length) {
      gM.setTransform(KS, 0, 0, KS, 0, 0);
      V.fogs.forEach(function (it) {
        var im = T.fogs[it.s % T.fogs.length], w = im.width * it.k, h = im.height * it.k;
        gM.globalAlpha = it.a * look.mistA;
        gM.drawImage(im, driftX(it, w, t), it.y - h / 2, w, h);
      });
      gM.setTransform(1, 0, 0, 1, 0, 0);
      gM.globalAlpha = 1;
      if (VA.mistMask) {
        gM.globalCompositeOperation = 'destination-in';
        gM.drawImage(VA.mistMask, 0, 0, CW, CH);
        gM.globalCompositeOperation = 'source-over';
      }
    }
  }

  /* ---------- 单按钮纯英文时段循环：Day → Sunset → Night → Day ---------- */
  var current = 'day', want = 'day', zTop = 3, offTimer = 0;
  var look = clone(LOOK.day), tw = null;
  function clone(o) {
    return {
      flowTop: o.flowTop.slice(), flowBot: o.flowBot.slice(), flowMix: o.flowMix, flowA: o.flowA,
      cumTop: o.cumTop.slice(), cumBot: o.cumBot.slice(), cumMix: o.cumMix, cumA: o.cumA,
      mist: o.mist.slice(), mistA: o.mistA, streak: o.streak, moonMask: o.moonMask
    };
  }
  function ease(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }

  var cycleBtn = document.getElementById('tod-cycle');
  var cycleLabel = cycleBtn ? cycleBtn.querySelector('.tod-label') : null;
  var themeMeta = document.querySelector('meta[name="theme-color"]');

  function paintButton(t) {
    var next = TIMES[(TIMES.indexOf(t) + 1) % TIMES.length];
    if (cycleBtn) {
      cycleBtn.setAttribute('data-time', t);
      cycleBtn.setAttribute('aria-label', 'Time of day: ' + LABELS[t] + '. Switch to ' + LABELS[next]);
    }
    if (cycleLabel) cycleLabel.textContent = LABELS[t];
    scene.setAttribute('data-time', t);
    stage.setAttribute('data-time', t);
    scene.style.background = 'linear-gradient(180deg,' + LOOK[t].sky + ' 0%,' + LOOK[t].sky + ' 55%,' + LOOK[t].ground + ' 100%)';
    if (themeMeta) themeMeta.setAttribute('content', LOOK[t].theme);
  }

  function setTime(t) {
    if (TIMES.indexOf(t) < 0 || t === want) return;
    want = t;
    paintButton(t);
    if (castle3d) castle3d.setTime(t, false, DUR);
    loadLayer(t).then(function () {
      if (want !== t) return;
      var L = layers[t];
      if (L.on) {
        var z = +L.el.style.zIndex || 1;
        TIMES.forEach(function (k) {
          var O = layers[k];
          if (O !== L && O.on && (+O.el.style.zIndex || 1) > z) {
            O.el.classList.remove('is-on'); O.fading = true;
          }
        });
      } else {
        L.el.style.zIndex = String(++zTop);
        void L.el.offsetWidth;
        L.el.classList.add('is-on'); L.on = true;
      }
      current = t;
      tw = { from: clone(look), to: LOOK[t], t0: performance.now() };
      dirty = true; kick();
      clearTimeout(offTimer);
      offTimer = setTimeout(function () {
        TIMES.forEach(function (k) {
          var O = layers[k];
          if (k === current) return;
          O.el.classList.add('snap'); O.el.classList.remove('is-on'); O.on = false; O.fading = false;
          void O.el.offsetWidth; O.el.classList.remove('snap');
        });
      }, DUR + 80);
    });
  }

  function cycleTime() {
    var next = TIMES[(TIMES.indexOf(want) + 1) % TIMES.length];
    setTime(next);
  }
  if (cycleBtn) cycleBtn.addEventListener('click', cycleTime);

  /* ---------- 主循环：驱动空镜云雾 + 3D 城堡旋转渲染 ---------- */
  var running = false, dirty = true, animT = 0, prevT = 0, lastDraw = 0, sleeping = false, inView = true;
  function moving() {
    return !reduceMq.matches && !root.classList.contains('paused-scene') && !sleeping && inView && !document.hidden;
  }
  function kick() {
    if (running || sleeping) return;
    running = true; prevT = performance.now(); lastDraw = 0;
    requestAnimationFrame(loop);
  }
  function loop(now) {
    if (sleeping) { running = false; return; }
    var paused = root.classList.contains('paused-scene');
    var mov = moving(), tweening = !!tw;
    var active3d = !!(castle3d && castle3d.isLoaded() && inView && !document.hidden);
    if (!mov && !tweening && !active3d && !dirty) { running = false; return; }
    if (!active3d && lastDraw && now - lastDraw < 1000 / FPS - 3) { requestAnimationFrame(loop); return; }
    var dt = Math.min(0.05, Math.max(0.001, (now - prevT) / 1000));
    prevT = now; lastDraw = now;

    if (mov) animT += dt;
    if (tw) {
      var k = Math.min(1, (now - tw.t0) / DUR), e = ease(k), F = tw.from, To = tw.to;
      look = {
        flowTop: lerp3(F.flowTop, To.flowTop, e), flowBot: lerp3(F.flowBot, To.flowBot, e),
        flowMix: lerp(F.flowMix, To.flowMix, e), flowA: lerp(F.flowA, To.flowA, e),
        cumTop: lerp3(F.cumTop, To.cumTop, e), cumBot: lerp3(F.cumBot, To.cumBot, e),
        cumMix: lerp(F.cumMix, To.cumMix, e), cumA: lerp(F.cumA, To.cumA, e),
        mist: lerp3(F.mist, To.mist, e), mistA: lerp(F.mistA, To.mistA, e),
        streak: lerp(F.streak, To.streak, e), moonMask: lerp(F.moonMask, To.moonMask, e)
      };
      if (k >= 1) { look = clone(To); tw = null; }
    }
    if (A.flowSprites.length && VA && (mov || tweening || dirty)) {
      drawSky(animT, look);
      if (!reduceMq.matches) {
        TIMES.forEach(function (t) {
          var L = layers[t];
          if ((L.on || L.fading) && L.water.length) drawWater(L, animT, LOOK[t]);
        });
      }
    }
    if (castle3d) {
      castle3d.render(now, dt, paused);
    }
    dirty = false;
    requestAnimationFrame(loop);
  }

  new MutationObserver(function () { dirty = true; kick(); }).observe(root, { attributes: true, attributeFilter: ['class'] });
  if (reduceMq.addEventListener) reduceMq.addEventListener('change', function () {
    root.classList.toggle('calm', reduceMq.matches); dirty = true; kick();
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { inView = es[0].isIntersecting; if (inView) kick(); }).observe(stage);
  }
  addEventListener('resize', layout);
  if ('ResizeObserver' in window) new ResizeObserver(layout).observe(stage);

  /* ---------- 与首页过场的约定（hd-castle-ready / show-ui / sleep / wake） ---------- */
  var state = {
    time: function () { return current; },
    setTime: setTime,
    cycleTime: cycleTime,
    variant: function () { return variantKey; },
    angles: function () { return castle3d ? castle3d.angles() : { yaw: 0, pitch: 0, zoom: 1 }; },
    turnBack: function () { if (castle3d) castle3d.turnBack(); },
    resetView: function () { if (castle3d) castle3d.resetView(); },
    modelStatus: function () { return castle3d ? castle3d.status() : 'disabled'; },
    scene: 'empty-plate-3d'
  };
  window.__castle = state;
  window.__setCastleTime = setTime;
  addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.type === 'hd-show-ui') root.classList.add('show-ui');
    if (e.data.type === 'hd-sleep') { sleeping = true; root.classList.remove('show-ui'); }
    if (e.data.type === 'hd-wake') { sleeping = false; dirty = true; kick(); }
  });
  window.__snapCastle = function () {
    var L = layers[current], im = L.img;
    if (!im || !im.naturalWidth) return '';
    var w = 960, h = Math.max(1, Math.round(w * lastH / Math.max(1, lastW)));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'), k = w / Math.max(1, lastW);
    var bgGrad = g.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, LOOK[current].sky);
    bgGrad.addColorStop(0.55, LOOK[current].sky);
    bgGrad.addColorStop(1, LOOK[current].ground);
    g.fillStyle = bgGrad; g.fillRect(0, 0, w, h);
    g.drawImage(im, boardX * k, boardY * k, boardW * k, boardH * k);
    var c3d = castle3d && castle3d.getCanvas();
    if (c3d && c3d.width && c3d.height) {
      try { g.drawImage(c3d, 0, 0, w, h); } catch (e) {}
    }
    try { return c.toDataURL('image/jpeg', 0.72); } catch (err) { return ''; }
  };

  /* ---------- 启动 ---------- */
  layout();
  var q = new URLSearchParams(location.search).get('time');
  var first = TIMES.indexOf(q) >= 0 ? q : 'day';
  if (first !== 'day') {
    TIMES.forEach(function (t) {
      layers[t].el.classList.add('snap');
      layers[t].el.classList.toggle('is-on', t === first);
      layers[t].on = t === first;
    });
    current = want = first; look = clone(LOOK[first]);
    paintButton(first);
    if (castle3d) castle3d.setTime(first, true);
    void scene.offsetWidth;
    TIMES.forEach(function (t) { layers[t].el.classList.remove('snap'); });
  } else {
    paintButton('day');
    if (castle3d) castle3d.setTime('day', true);
  }

  Promise.all([loadVariantAssets(variantKey), sharedReady, loadLayer(first)]).then(function (r) {
    VA = r[0];
    TIMES.forEach(function (t) { if (layers[t].ready && layers[t].loadedKey === variantKey) buildWater(layers[t]); });
    dirty = true; kick();
    var hold = document.getElementById('arrive-poster');
    if (hold) hold.classList.add('gone');
    stage.classList.add('built');
    if (embedded) { try { parent.postMessage({ type: 'hd-castle-ready' }, location.origin); } catch (err) {} }
    var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 600); };
    idle(function () { TIMES.forEach(function (t) { loadLayer(t); }); });
  });
})();
