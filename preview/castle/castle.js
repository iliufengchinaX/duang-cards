/* Hello Duang · 像素方块城堡（第三版 v3：方形堡垒，按三视图；主堡加高）
   自写的极小 WebGL 体素渲染器：城堡、地形、远山都由代码在浏览器里生成，不下载模型文件。
   三个端端用原设定图抠出来的立绘（assets/duang-sprites.webp，一张图集），面向镜头、和城堡做深度遮挡。
   城堡+场景 1 次 draw call；端端每人 1~3 次。无第三方库、无 CDN。 */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search);
  var STILL = Q.has('still');
  var REDUCED = STILL || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FB_YAW = 0.2, FB_PITCH = 0.24;

  /* ---------- 颜色与随机 ---------- */
  function hex(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  function hash3(x, y, z) { var h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function pal(list) { var c = list.map(hex), f = function (x, y, z) { return c[Math.floor(hash3(x, y, z) * c.length) % c.length]; }; f.cs = c; return f; }
  function one(h) { var c = hex(h); return function () { return c; }; }
  var P = {
    stone: pal(['#DCCAA6', '#D4C19B', '#E2D2B0', '#CDB990', '#D8C6A0', '#DFCDA9']),
    trim: pal(['#F1E5C9', '#ECDFC0', '#F4EAD2']),
    deep: pal(['#C2AB82', '#BCA47B', '#C7B089']),
    red: pal(['#B9583C', '#C2664A', '#AA4D33', '#C9704F']),
    teal: pal(['#3F7D87', '#4A8A92', '#376F79', '#5395A0']),
    grass: pal(['#8AAA5E', '#7E9F55', '#93B266', '#86A85B']),
    grass2: pal(['#7C9C52', '#86A65A', '#739449']),
    dirt: pal(['#9A7553', '#8D6A4A', '#A47F5B', '#94704E']),
    rock: pal(['#9A8F80', '#8C8273', '#A39A8B', '#857B6D']),
    path: pal(['#CFC3AA', '#C6B99F', '#D6CBB4']),
    wood: pal(['#7D4F2E', '#734829', '#865634']),
    plank: pal(['#9C6B43', '#A7764C', '#91623C']),
    trunk: pal(['#6E4A2E', '#644329', '#795234']),
    leaf: pal(['#6E9A50', '#5F8C47', '#7FA85A', '#668F49', '#86AE60']),
    bush: pal(['#5F8C47', '#6E9A50', '#557F40']),
    water: pal(['#8CC3C6', '#83BCC0', '#95CACC']),
    glass: pal(['#8FC2CF', '#86B9C8']),
    iron: pal(['#4A4540']),
    gold: pal(['#E0AE45']),
    warm: pal(['#F4C978', '#F0BE66'])
  };

  /* ---------- 体素模型 ---------- */
  // 体素：[x,y,z,color,group,kind,extra]
  // 城堡 group：0 普通 1/2 门扇 3..8 栏目热区发光 10 旗 11 蝴蝶   kind：0 方块 1 玻璃 2 自发光 3 水
  function Model() { this.m = new Map(); }
  Model.prototype.k = function (x, y, z) { return x + ',' + y + ',' + z; };
  Model.prototype.set = function (x, y, z, c, g, kind, ex) { var v = [x, y, z, typeof c === 'function' ? c(x, y, z) : c, g || 0, kind || 0, ex || 0]; this.m.set(this.k(x, y, z), v); return v; };
  Model.prototype.del = function (x, y, z) { this.m.delete(this.k(x, y, z)); };
  Model.prototype.has = function (x, y, z) { return this.m.has(this.k(x, y, z)); };
  Model.prototype.get = function (x, y, z) { return this.m.get(this.k(x, y, z)); };
  Model.prototype.box = function (x0, x1, y0, y1, z0, z1, c, g, kind) {
    for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) for (var z = z0; z <= z1; z++) this.set(x, y, z, c, g, kind);
  };
  Model.prototype.carve = function (x0, x1, y0, y1, z0, z1) {
    for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) for (var z = z0; z <= z1; z++) this.del(x, y, z);
  };
  Model.prototype.crenel = function (x0, x1, z0, z1, y, c) {
    for (var x = x0; x <= x1; x++) for (var z = z0; z <= z1; z++) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
      var side = (x === x0 || x === x1), edge = side ? z - z0 : x - x0;
      this.set(x, y, z, c);
      if (edge % 2 === 0 || (side && (z === z0 || z === z1))) this.set(x, y + 1, z, c);
    }
  };
  Model.prototype.roof = function (x0, x1, z0, z1, y, c, perStep) {
    var i = 0;
    while (x0 <= x1 && z0 <= z1) {
      for (var s = 0; s < perStep && x0 <= x1 && z0 <= z1; s++, i++) this.box(x0, x1, y + i, y + i, z0, z1, c);
      x0++; x1--; z0++; z1--;
    }
    return y + i;
  };

  /* ---------- 天圆地方 logo 像素化 ---------- */
  // 原稿几何（viewBox 18 28 274 226）：圆 (86.4,96.7) r57.8；方 165.3,38.5 116.5×116.3；两根立柱到地平线 y243.5
  function logoGrid(W, H, stroke) {
    var g = [], s = Math.min(W / 274, H / 226), ox = (W - 274 * s) / 2, oy = (H - 226 * s) / 2;
    function segD(px, py, ax, ay, bx, by) { var dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); }
    for (var j = 0; j < H; j++) { var row = []; for (var i = 0; i < W; i++) {
      var X = (i + 0.5 - ox) / s + 18, Y = (j + 0.5 - oy) / s + 28;
      var d = Math.abs(Math.hypot(X - 86.4, Y - 96.7) - 57.8);
      var rx0 = 165.3, rx1 = 281.8, ry0 = 38.5, ry1 = 154.8;
      d = Math.min(d, segD(X, Y, rx0, ry0, rx1, ry0), segD(X, Y, rx1, ry0, rx1, ry1), segD(X, Y, rx1, ry1, rx0, ry1), segD(X, Y, rx0, ry1, rx0, ry0));
      d = Math.min(d, segD(X, Y, 86.47, 154.5, 86.47, 243.5), segD(X, Y, 223.5, 154.8, 223.5, 243.5), segD(X, Y, 25.5, 243.5, 284.5, 243.5));
      row.push(d * s < stroke / 2);
    } g.push(row); }
    return g;
  }
  // 端端胸口 / 盾牌上的 6×5 小 logo

  /* ---------- 场景：浮空岛 + 方形堡垒（1 单位方块；严格按三视图 spec：外框 23×23） ----------
     世界坐标：x 向东，z 向南（正面朝 +z），格子 -11..11，几何中心 (0.5, 0.5)。
     角楼 A 西南(-11..-7, 7..11) B 东南(7..11, 7..11) C 西北(-11..-7, -11..-7) D 东北(7..11, -11..-7)
     角楼墙高 12，红色阶梯尖顶；围墙厚 3、高 10 + 垛口；主堡 9×9(-4..4) 墙高 17，红色 5 阶屋顶；
     南正门 3×4 拱门（南墙正中），北后门 2×3（北墙正中，普通门）。 */
  var RING = { rx: 16.5, rz: 15, cz: 0.5 };          // 冒险端端绕城堡跑的方圆形小路（超椭圆，避开四角楼）
  function ringR(x, z) { var a = Math.abs(x / RING.rx), b = Math.abs((z - RING.cz) / RING.rz); return Math.pow(a * a * a * a + b * b * b * b, 0.25); }
  function ringPos(th) { var c = Math.cos(th), s = Math.sin(th); return [RING.rx * Math.sign(s) * Math.sqrt(Math.abs(s)), 0, RING.cz + RING.rz * Math.sign(c) * Math.sqrt(Math.abs(c))]; }
  function streamZ(x) { return 19 + Math.round(Math.sin(x * 0.21 + 1.2) * 1.2); }
  var TOWERS = [
    { id: 'eng', x0: -11, z0: 7 }, { id: 'cn', x0: 7, z0: 7 },
    { id: 'math', x0: -11, z0: -11 }, { id: 'works', x0: 7, z0: -11 }
  ];
  var TOWER_TOP = 17, KEEP_TOP = 34;   // v3：主堡加高到 25 格（原 17），围墙 8、角楼 11，让主堡更挺拔

  function buildCastle(tops) {
    var M = new Model(), x, y, z;
    // 浮空草地岛：上面三层台地，下面泥土、岩石逐层收进去
    for (x = -25; x <= 25; x++) for (z = -20; z <= 26; z++) {
      var n = hash3(x, 7, z);
      var ex = Math.max(Math.abs(x) - 19.5, 0), ez = Math.max(Math.abs(z - 3) - 18.5, 0);
      var d = Math.sqrt(ex * ex + ez * ez) + n * 0.9;
      if (d < 3.6) M.set(x, -3, z, P.dirt);
      if (d < 2.2) M.set(x, -2, z, P.dirt);
      if (d < 0.9) M.set(x, -1, z, P.grass);
      if (d < 2.6) M.set(x, -4, z, P.dirt);
      if (d < 1.2 + n) M.set(x, -5, z, P.rock);
      if (d < -0.6 + n * 1.4) M.set(x, -6, z, P.rock);
      if (d < -2.6 + n * 1.8) M.set(x, -7, z, P.rock);
      if (d < -5 + n * 2.2) M.set(x, -8, z, P.rock);
      if (d < -8 + n * 2.6) M.set(x, -9, z, P.rock);
    }
    M.m.forEach(function (v) { if (!M.has(v[0], v[1] + 1, v[2]) && v[1] < -1 && v[1] > -4) v[3] = P.grass2(v[0], v[1], v[2]); });
    M.m.forEach(function (v) { if (v[1] === -3 && M.has(v[0], -2, v[2]) && hash3(v[0], 2, v[2]) > 0.5) v[3] = P.rock(v[0], v[1], v[2]); });
    // 小溪：从岛前横穿，两端从岛边落下
    for (x = -25; x <= 25; x++) {
      var zc = streamZ(x);
      for (z = zc - 1; z <= zc + 1; z++) {
        if (M.has(x, -1, z)) M.del(x, -1, z);
        if (M.has(x, -2, z)) M.set(x, -2, z, P.water, 0, 3);
      }
    }
    // 大门石板路 + 木桥
    for (z = 12; z <= 26; z++) for (x = -1; x <= 1; x++) {
      for (y = -3; y <= -1; y++) if (M.has(x, y, z) && !M.has(x, y + 1, z) && M.get(x, y, z)[5] !== 3) M.set(x, y, z, P.path);
    }
    for (x = -2; x <= 2; x++) { var zb = streamZ(x); for (z = zb - 1; z <= zb + 1; z++) M.set(x, -1, z, P.plank); }
    // 环形小路：踏脚石
    for (x = -22; x <= 22; x++) for (z = -18; z <= 20; z++) {
      var rr = ringR(x + 0.5, z + 0.5);
      if (Math.abs(rr - 1) < 0.05 && M.has(x, -1, z) && !M.has(x, 0, z) && M.get(x, -1, z)[5] === 0 && hash3(x, 5, z) > 0.4) M.set(x, -1, z, P.path);
    }
    // 内院地面铺石
    for (x = -8; x <= 8; x++) for (z = -8; z <= 8; z++) M.set(x, -1, z, hash3(x, 4, z) > 0.8 ? P.grass(x, -1, z) : P.path(x, -1, z));

    var S = P.stone;
    function merlons(x0, x1, z0, z1, yy, c, onlyEdge) { // 外圈隔一格一个垛
      for (var xx = x0; xx <= x1; xx++) for (var zz = z0; zz <= z1; zz++) {
        if (xx !== x0 && xx !== x1 && zz !== z0 && zz !== z1) continue;
        var corner = (xx === x0 || xx === x1) && (zz === z0 || zz === z1);
        var k = (xx === x0 || xx === x1) ? zz - z0 : xx - x0;
        if (corner || k % 2 === 0) M.set(xx, yy, zz, c);
      }
      void onlyEdge;
    }
    // 围墙：厚 3，高 8（y0..7），顶面浅色，内外两侧各一排垛口
    var WH = 8;
    M.box(-6, 6, 0, WH - 1, 9, 11, S); M.box(-6, 6, 0, WH - 1, -11, -9, S);
    M.box(-11, -9, 0, WH - 1, -6, 6, S); M.box(9, 11, 0, WH - 1, -6, 6, S);
    for (x = -6; x <= 6; x++) {
      M.set(x, WH - 1, 11, P.trim); M.set(x, WH - 1, -11, P.trim);
      if (x % 2 === 0) { M.set(x, WH, 11, P.trim); M.set(x, WH, -11, P.trim); M.set(x, WH, 9, P.trim); M.set(x, WH, -9, P.trim); }
    }
    for (z = -6; z <= 6; z++) {
      M.set(-11, WH - 1, z, P.trim); M.set(11, WH - 1, z, P.trim);
      if (z % 2 === 0) { M.set(-11, WH, z, P.trim); M.set(11, WH, z, P.trim); M.set(-9, WH, z, P.trim); M.set(9, WH, z, P.trim); }
    }
    // 四座角楼：5×5，墙高 11，檐口外挑一圈 + 垛口，红色阶梯尖顶（无旗）
    TOWERS.forEach(function (t) {
      var x0 = t.x0, x1 = t.x0 + 4, z0 = t.z0, z1 = t.z0 + 4;
      M.box(x0, x1, 0, 10, z0, z1, S);
      M.box(x0 - 1, x1 + 1, 10, 10, z0 - 1, z1 + 1, P.trim);
      merlons(x0 - 1, x1 + 1, z0 - 1, z1 + 1, 11, P.trim);
      // 阶梯尖顶 5→3→3→1→1（4 阶）
      M.box(x0, x1, 11, 11, z0, z1, P.red);
      M.box(x0 + 1, x1 - 1, 12, 13, z0 + 1, z1 - 1, P.red);
      M.box(x0 + 2, x0 + 2, 14, 15, z0 + 2, z0 + 2, P.red);
      M.set(x0 + 2, 16, z0 + 2, P.gold);
    });
    // 主堡：9×9，墙高 25（v3 加高），中段一圈腰檐，檐口外挑 + 垛口，红色 5 阶屋顶
    M.box(-4, 4, 0, 24, -4, 4, S);
    M.box(-5, 5, 12, 12, -5, 5, P.trim);
    M.box(-5, 5, 24, 24, -5, 5, P.trim);
    merlons(-5, 5, -5, 5, 25, P.trim);
    M.box(-4, 4, 25, 25, -4, 4, P.red);
    M.box(-3, 3, 26, 27, -3, 3, P.red);
    M.box(-2, 2, 28, 29, -2, 2, P.red);
    M.box(-1, 1, 30, 31, -1, 1, P.red);
    M.box(0, 0, 32, 33, 0, 0, P.red);
    tops.keep = KEEP_TOP;
    // 墙脚一圈深色石
    M.m.forEach(function (v) { if (v[1] === 0 && v[5] === 0 && P.stone.cs.indexOf(v[3]) >= 0) v[3] = P.deep(v[0], v[1], v[2]); });
    // 石块深浅：零星深色砖，更有方块世界的质感
    M.m.forEach(function (v) { if (v[1] > 0 && v[1] < 25 && Math.abs(v[0]) <= 11 && Math.abs(v[2]) <= 11 && hash3(v[0], v[1] + 31, v[2]) > 0.86 && P.stone.cs.indexOf(v[3]) >= 0) v[3] = P.deep(v[0], v[1], v[2]); });

    // 窗：表面挖一格，里面一格放玻璃，下沿外挑窗台（g = 发光组）
    function win(x, z, y0, y1, nx, nz, g) {
      for (var yy = y0; yy <= y1; yy++) { M.del(x, yy, z); M.set(x - nx, yy, z - nz, P.glass, g, 1); }
      M.set(x + nx, y0 - 1, z + nz, P.trim);
      M.set(x, y1 + 1, z, P.trim);
    }
    // 主堡：四面 × 3 列 × 7 排（1×2 窗），顶上两排属于“家庭相册”发光组 8
    [[-2], [0], [2]].forEach(function (c) {
      [1, 4, 7, 10, 14, 17, 20].forEach(function (y0) {
        var g = y0 >= 17 ? 8 : 0;
        win(c[0], 4, y0, y0 + 1, 0, 1, g); win(c[0], -4, y0, y0 + 1, 0, -1, g);
        win(4, c[0], y0, y0 + 1, 1, 0, g); win(-4, c[0], y0, y0 + 1, -1, 0, g);
      });
    });
    // 角楼：两个朝外的面各 3 扇窗；朝内院的面 1 扇
    var TG = { eng: 3, cn: 4, math: 5, works: 6 };
    TOWERS.forEach(function (t) {
      var cx = t.x0 + 2, cz = t.z0 + 2, sx = t.x0 < 0 ? -1 : 1, sz = t.z0 < 0 ? -1 : 1, g = TG[t.id];
      [2, 5].forEach(function (y0) {
        win(cx, cz + 2 * sz, y0, y0 + 1, 0, sz, g);
        win(cx + 2 * sx, cz, y0, y0 + 1, sx, 0, g);
      });
      win(cx, cz + 2 * sz, 8, 8, 0, sz, g); win(cx + 2 * sx, cz, 8, 8, sx, 0, g);
    });
    // 围墙外侧的箭窗
    [-4, 4].forEach(function (k) {
      [[k, 11, 0, 1], [k, -11, 0, -1], [11, k, 1, 0], [-11, k, -1, 0]].forEach(function (a) {
        M.del(a[0], 4, a[1]); M.del(a[0], 5, a[1]); M.set(a[0] - a[2], 4, a[1] - a[3], P.iron); M.set(a[0] - a[2], 5, a[1] - a[3], P.iron);
      });
    });
    // 南正门：3×4 拱门，穿过 3 格厚的墙；门扇在半格模型里（会开）
    M.carve(-1, 1, 0, 2, 9, 11); M.carve(0, 0, 3, 3, 9, 11);
    for (y = 0; y <= 4; y++) { M.set(-2, y, 11, P.trim); M.set(2, y, 11, P.trim); }
    M.box(-1, 1, 4, 4, 11, 11, P.trim); M.set(-1, 3, 11, P.trim); M.set(1, 3, 11, P.trim);
    M.box(-2, 2, 5, 5, 11, 11, P.trim);
    M.box(-1, 1, -1, -1, 9, 11, P.path);
    M.set(0, 4, 12, P.gold);                                     // 门楣上的小金块
    // 北后门：2×3，普通木门
    M.carve(-1, 0, 0, 2, -11, -11); M.box(-1, 0, 0, 2, -10, -10, P.wood);
    M.set(0, 1, -11, P.gold); M.box(-2, 1, 3, 3, -11, -11, P.trim);

    // 方块树
    function tree(tx, tz, h, r) {
      if (!M.has(tx, -1, tz) || M.has(tx, 0, tz)) return;
      for (var i = 0; i < h; i++) M.set(tx, i, tz, P.trunk);
      for (var a = -3; a <= 3; a++) for (var b = -1; b <= 4; b++) for (var c = -3; c <= 3; c++) {
        var dd = (a * a) / (r * r) + ((b - r * 0.4) * (b - r * 0.4)) / (r * r * 0.8) + (c * c) / (r * r);
        if (dd < 1 - 0.22 * hash3(tx + a, b, tz + c)) M.set(tx + a, Math.round(h - 1 + b), tz + c, P.leaf);
      }
    }
    tree(-20, -14, 4, 2.6); tree(20, -13, 5, 2.8); tree(-20, 10, 3, 2.3); tree(20, 12, 4, 2.5);
    tree(-14, -18, 3, 2.1); tree(13, -18, 3, 2.2); tree(-21, -3, 3, 2.0); tree(21, 2, 3, 2.1); tree(-10, 23, 3, 2.0); tree(11, 23, 4, 2.2);
    // 灌木
    [[-14, 13], [-7, 13], [6, 13], [13, 13], [-18, 4], [18, -4], [-15, 21], [15, 21], [-5, 22], [5, 23], [-13, -13], [13, -13]].forEach(function (b, i) {
      var bx = b[0], bz = b[1];
      if (!M.has(bx, -1, bz) || M.has(bx, 0, bz) || Math.abs(ringR(bx + .5, bz + .5) - 1) < 0.1) return;
      M.set(bx, 0, bz, P.bush); if (i % 2 === 0) M.set(bx + 1, 0, bz, P.bush);
      if (i % 3 === 0 && M.has(bx, -1, bz + 1)) M.set(bx, 0, bz + 1, P.bush);
    });
    return M;
  }

  /* ---------- 远山：三层方块山（近 2 / 中 3 / 远 4 单位方块），灰蓝石 + 松林带 + 白雾；旋转时三层视差不同 ---------- */
  var ROCK = [pal(['#8C98A4', '#96A1AC', '#84909C', '#9EA8B2', '#8A95A0']), pal(['#9AA5B0', '#A3ADB7', '#939FAA', '#AAB3BC']), pal(['#A9B3BC', '#B0B9C1', '#A4AEB8'])];
  var ROCK_TOP = [pal(['#B3BCC4', '#AEB8C0', '#BAC2C9']), pal(['#B9C1C8', '#C0C7CD']), pal(['#C3CAD0', '#C8CED3'])];
  var PINE = [pal(['#4E7A4D', '#5A8656', '#456F47', '#64905B', '#3F6843']), pal(['#5E8661', '#678E66', '#57805B', '#6F9469']), pal(['#7F9C83', '#86A188', '#7A977F'])];
  var FAR_LAYERS = [   // [x, z, 峰顶高度, 半径]；山脚沉在岛下面的云雾里；主堡背后留出天空
    { g: 12, cell: 2, list: [[-38, -40, 12, 22], [40, -46, 15, 22], [-58, -2, 2, 16], [60, 0, 4, 16]] },
    { g: 13, cell: 3, list: [[-58, -96, 22, 30], [62, -100, 26, 30], [-100, -56, 12, 26], [102, -58, 14, 26], [-26, -118, 12, 22], [30, -124, 16, 22]] },
    { g: 14, cell: 4, list: [[-84, -168, 38, 42], [90, -172, 42, 42], [-140, -120, 26, 36], [142, -124, 28, 36], [0, -210, 14, 40]] }
  ];
  function buildFarLayer(L, li) {
    // 高度场：每组山 = 主峰 + 两座侧峰（尖顶、台阶状收窄），连成一片山体；不会有悬空的小方块
    var M = new Model(), cs = L.cell, BASE = -20, peaks = [];
    L.list.forEach(function (k, ki) {
      peaks.push([k[0], k[1], k[2], k[3], ki]);
      peaks.push([k[0] + k[3] * 0.55, k[1] + k[3] * 0.25, BASE + (k[2] - BASE) * 0.78, k[3] * 0.62, ki + 20]);
      peaks.push([k[0] - k[3] * 0.5, k[1] + k[3] * 0.2, BASE + (k[2] - BASE) * 0.7, k[3] * 0.6, ki + 40]);
    });
    var x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    peaks.forEach(function (p) { x0 = Math.min(x0, p[0] - p[3]); x1 = Math.max(x1, p[0] + p[3]); z0 = Math.min(z0, p[1] - p[3]); z1 = Math.max(z1, p[1] + p[3]); });
    var cx0 = Math.floor(x0 / cs), cx1 = Math.ceil(x1 / cs), cz0 = Math.floor(z0 / cs), cz1 = Math.ceil(z1 / cs), yb = Math.floor(BASE / cs);
    for (var cx = cx0; cx <= cx1; cx++) for (var cz = cz0; cz <= cz1; cz++) {
      var wx = (cx + 0.5) * cs, wz = (cz + 0.5) * cs, best = -1e9, frac = 0;
      peaks.forEach(function (p) {
        var d = Math.hypot(wx - p[0], (wz - p[1]) * 1.15) / p[3];
        if (d >= 1) return;
        var n = Math.sin(wx * 0.21 + p[4]) * Math.cos(wz * 0.17 - p[4] * 0.7);
        var hv = BASE + (p[2] - BASE) * Math.pow(1 - d, 1.25) * (0.95 + 0.05 * n);
        if (hv > best) { best = hv; frac = p[2] - BASE; }
      });
      if (best < BASE + cs) continue;
      var top = Math.floor(best / cs);
      for (var y = yb; y <= top; y++) {
        var t = (y * cs - BASE) / Math.max(1, frac);       // 0 山脚 .. 1 峰顶
        var n2 = hash3(Math.floor(cx / 2) + li * 31, Math.floor(y / 2), Math.floor(cz / 2)) * 0.6 + hash3(cx, y, cz) * 0.4;
        var c = (t < 0.5 && n2 > 0.22) || (t < 0.72 && n2 > 0.55) ? PINE[li] : (t > 0.86 || (y === top && n2 > 0.6)) ? ROCK_TOP[li] : ROCK[li];
        M.set(cx, y, cz, c, L.g);
      }
    }
    return M;
  }

  /* ---------- 半格小件：门扇、花、蘑菇、草、栅栏、路灯、桥栏、蝴蝶（0.5 单位） ---------- */
  function buildDetails(C) {
    var D = new Model();
    function freeTop(wx, wz) {
      var v = C.get(wx, -1, wz);
      return v && v[5] === 0 && !C.has(wx, 0, wz) && P.path.cs.indexOf(v[3]) < 0 && Math.abs(ringR(wx + .5, wz + .5) - 1) > 0.1 &&
        !(Math.abs(wx) <= 12 && Math.abs(wz) <= 12) && !(wx > -3 && wx < 3 && wz > 11);
    }
    // 正门两扇木门（group 1 / 2，着色器里绕门轴转开）：门洞世界坐标 x -1..2，y 0..4（拱顶只在中间）
    for (var X = -2; X <= 3; X++) for (var Y = 0; Y <= 7; Y++) {
      if (Y >= 6 && (X < 0 || X > 1)) continue;
      var left = X <= 0, gg = left ? 1 : 2;
      var edge = left ? X === -2 : X === 3;
      var c = (Y === 1 || Y === 5) ? P.iron : (edge ? P.wood : P.plank);
      D.set(X, Y, 21, c, gg); D.set(X, Y, 20, P.wood, gg);
    }
    D.set(0, 3, 22, P.gold, 1); D.set(1, 3, 22, P.gold, 2);
    var flowers = [pal(['#E9A3AE', '#F0B7BE']), pal(['#F2CF5B', '#F5D96E']), pal(['#F7F2E6']), pal(['#B9A1D9', '#C7B2E2']), pal(['#E58B6B'])];
    var stem = pal(['#5E8B44', '#6A9A4C']);
    var clusters = [[-14, 15, 0], [13, 15, 1], [-18, 0, 2], [18, -2, 3], [-8, -15, 1], [9, -15, 0], [-16, 22, 3], [16, 22, 2], [-9, 23, 1], [8, 22, 4], [-20, 16, 0], [20, 7, 1], [-5, 14, 2], [5, 15, 3], [-16, -9, 4], [17, -9, 2]];
    clusters.forEach(function (c, ci) {
      for (var i = 0; i < 10; i++) {
        var a = hash3(ci, i, 1) * 6.283, r = Math.sqrt(hash3(ci, i, 2)) * 2.4;
        var wx = Math.round(c[0] + Math.cos(a) * r), wz = Math.round(c[1] + Math.sin(a) * r);
        if (!freeTop(wx, wz)) continue;
        var X = wx * 2 + (hash3(i, ci, 3) > .5 ? 1 : 0), Z = wz * 2 + (hash3(i, ci, 4) > .5 ? 1 : 0);
        var tall = hash3(ci, i, 5) > 0.6 ? 1 : 0;
        D.set(X, 0, Z, stem); if (tall) D.set(X, 1, Z, stem);
        D.set(X, 1 + tall, Z, flowers[(c[2] + (i % 3 === 0 ? 1 : 0)) % flowers.length]);
      }
    });
    // 内院小花圃
    [[-6, -6], [6, -6], [-6, 6], [6, 6]].forEach(function (p, i) {
      for (var k = 0; k < 4; k++) { var X = p[0] * 2 + (k & 1), Z = p[1] * 2 + (k >> 1); D.set(X, 0, Z, stem); D.set(X, 1, Z, flowers[(i + k) % 5]); }
    });
    for (var wx = -22; wx <= 22; wx++) for (var wz = -18; wz <= 24; wz++) {
      if (hash3(wx, 9, wz) > 0.08 || !freeTop(wx, wz)) continue;
      var X2 = wx * 2 + (hash3(wx, 1, wz) > .5 ? 1 : 0), Z2 = wz * 2 + (hash3(wx, 2, wz) > .5 ? 1 : 0);
      D.set(X2, 0, Z2, P.grass); if (hash3(wx, 3, wz) > 0.5) D.set(X2, 1, Z2, pal(['#9CBB6C'])(0, 0, 0));
    }
    var cap = pal(['#C8503A', '#BF4A35']), dot = one('#F6EFE2'), stalk = one('#EFE4CC');
    [[-19, -7], [-16, -16], [17, -16], [20, -6], [-19, 13], [19, 16]].forEach(function (m, i) {
      if (!freeTop(m[0], m[1])) return;
      var X = m[0] * 2, Z = m[1] * 2, big = i % 2 === 0;
      D.set(X, 0, Z, stalk); if (big) D.set(X, 1, Z, stalk);
      var y = big ? 2 : 1;
      D.box(X - 1, X + 1, y, y, Z - 1, Z + 1, cap); D.set(X, y + 1, Z, cap);
      D.set(X - 1, y, Z + 1, dot); D.set(X + 1, y, Z - 1, dot); D.set(X, y + 1, Z, big ? dot : cap);
    });
    // 栅栏：小溪北岸两段
    var post = P.wood, rail = P.plank;
    function fence(x0, x1, wz) {
      for (var X = x0 * 2; X <= x1 * 2; X++) {
        var wxx = Math.floor(X / 2);
        if (!C.has(wxx, -1, wz) || C.has(wxx, 0, wz)) continue;
        var Z = wz * 2 + 1;
        if (X % 3 === 0) { D.box(X, X, 0, 3, Z, Z, post); D.set(X, 4, Z, rail); }
        D.set(X, 1, Z, rail); D.set(X, 3, Z, rail);
      }
    }
    fence(-19, -5, 17); fence(5, 19, 17);
    function lamp(wx, wz) {
      var X = wx * 2, Z = wz * 2;
      D.box(X, X, 0, 7, Z, Z, P.iron); D.box(X - 1, X + 1, 0, 0, Z - 1, Z + 1, P.iron);
      D.box(X - 1, X + 1, 8, 9, Z - 1, Z + 1, P.warm, 0, 2);
      D.box(X - 1, X + 1, 10, 10, Z - 1, Z + 1, P.iron); D.set(X, 11, Z, P.iron);
    }
    lamp(3, 15); lamp(3, 22);          // 左边的灯拿掉了，不挡门口的机甲端端
    [-2, 2].forEach(function (bx) { var zb = streamZ(bx); var BX = bx < 0 ? -4 : 5; for (var Z2 = (zb - 1) * 2; Z2 <= (zb + 1) * 2 + 1; Z2++) { D.set(BX, 1, Z2, rail); if (Z2 % 3 === 0) D.set(BX, 0, Z2, post); } });
    var wingC = [one('#F2CF5B'), one('#F7F2E6'), one('#9CC7E8')], body = one('#3B3530');
    [[-14, 15], [13, 14], [-9, -15]].forEach(function (b, i) {
      var X = b[0] * 2, Z = b[1] * 2, Y = 4, ph = i * 2.1;
      D.set(X, Y, Z, body, 11, 0, ph); D.set(X - 1, Y, Z, wingC[i], 11, 0, ph + 100); D.set(X + 1, Y, Z, wingC[i], 11, 0, ph + 100);
    });
    return D;
  }

  /* ---------- 四分之一格：主堡顶唯一的旗（天圆地方 logo，0.25 单位） ---------- */
  var FLAG = { W: 36, H: 24, pole: 34 };
  function buildFlags(tops) {
    var F = new Model(), pole = pal(['#8C7A62', '#7F6E57']), red = pal(['#C65A3F', '#C15540']), line = one('#F7EDD8'), rim = one('#A9452F');
    var W = FLAG.W, H = FLAG.H, poleH = FLAG.pole;
    var X0 = 1, Z0 = 1, Y0 = tops.keep * 4;               // 旗杆立在主堡尖顶中心 (0.5, 0.5)
    F.box(X0, X0 + 1, Y0, Y0 + poleH, Z0, Z0 + 1, pole);
    F.box(X0 - 1, X0 + 2, Y0 + poleH + 1, Y0 + poleH + 2, Z0 - 1, Z0 + 2, P.gold);
    var g = logoGrid(W - 6, H - 6, 1.1), fy0 = Y0 + poleH - H + 1;
    for (var i = 0; i < W; i++) for (var j = 0; j < H; j++) {
      var mid = Math.abs(j - (H - 1) / 2);
      if (i >= W - 4 && mid < (i - (W - 5)) * 0.9) continue;
      var X = X0 + 2 + i, Y = fy0 + (H - 1 - j);
      var gi = i - 3, gj = j - 3, c = red;
      if (j === 0 || j === H - 1) c = rim;
      if (gi >= 0 && gj >= 0 && gi < W - 6 && gj < H - 6 && g[gj][gi]) c = line;
      var v = F.set(X, Y, Z0, c, 10); v[6] = (i + 1) / 4;
      var v2 = F.set(X, Y, Z0 + 1, c, 10); v2[6] = (i + 1) / 4;
    }
    FLAG.box = [0.25, (X0 + 2 + W) / 4, (fy0) / 4, (Y0 + poleH + 3) / 4, 0.25, 0.75];
    return F;
  }


  /* ---------- 网格生成：只出露在外面的面 + 顶点 AO ---------- */
  var DIRS = [
    { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, 0, 1], u: [-1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] }
  ];
  var AOF = [0.52, 0.68, 0.84, 1.0];
  function mesh(M, scale, ox, oy, oz, out, delayFn) {
    M.m.forEach(function (v) {
      var x = v[0], y = v[1], z = v[2], g = v[4], kind = v[5];
      var cx = ox + (x + 0.5) * scale, cy = oy + (y + 0.5) * scale, cz = oz + (z + 0.5) * scale;
      var delay = delayFn(v), seed = hash3(x, y + 3, z);
      for (var f = 0; f < 6; f++) {
        var D = DIRS[f], n = D.n, u = D.u, w = D.v;
        var nx = x + n[0], ny = y + n[1], nz = z + n[2];
        var nb = M.get(nx, ny, nz);
        if (nb && !(nb[5] === 1 && kind !== 1) && !(nb[4] !== g && (g === 1 || g === 2 || nb[4] === 1 || nb[4] === 2))) continue;
        var ao = [], corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (var c = 0; c < 4; c++) {
          var a = corners[c][0], b = corners[c][1];
          var s1 = M.has(nx + a * u[0], ny + a * u[1], nz + a * u[2]) ? 1 : 0;
          var s2 = M.has(nx + b * w[0], ny + b * w[1], nz + b * w[2]) ? 1 : 0;
          var cc = M.has(nx + a * u[0] + b * w[0], ny + a * u[1] + b * w[1], nz + a * u[2] + b * w[2]) ? 1 : 0;
          ao.push(kind === 2 ? 1 : AOF[(s1 && s2) ? 0 : 3 - (s1 + s2 + cc)]);
        }
        var order = (ao[0] + ao[2] > ao[1] + ao[3]) ? [0, 1, 2, 0, 2, 3] : [1, 2, 3, 1, 3, 0];
        for (var t = 0; t < 6; t++) {
          var ci = order[t], a2 = corners[ci][0], b2 = corners[ci][1];
          var h = 0.5 * scale;
          out.push(cx, cy, cz,
            (n[0] + a2 * u[0] + b2 * w[0]) * h, (n[1] + a2 * u[1] + b2 * w[1]) * h, (n[2] + a2 * u[2] + b2 * w[2]) * h,
            n[0], n[1], n[2], v[3][0], v[3][1], v[3][2], ao[ci], (a2 + 1) / 2, (b2 + 1) / 2,
            g, delay, seed, kind, v[6] || 0);
        }
      }
    });
  }
  var STRIDE = 20;

  /* ---------- 矩阵 ---------- */
  function persp(fy, asp, n, f) { var t = 1 / Math.tan(fy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; }
  function lookAt(e, c, up) {
    var zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
  }
  function mul(a, b) { var o = new Array(16); for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
  function xform(m, p) { var x = p[0], y = p[1], z = p[2]; return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]]; }

  /* ---------- 着色器 ---------- */
  var VS = [
    'precision mediump float;',
    'attribute vec3 aC,aO,aN,aCol;attribute float aAO;attribute vec2 aUV;attribute vec4 aM;attribute float aS;',
    'uniform mat4 uVP;uniform float uT,uDoor,uTime,uYaw;uniform float uG[11];',
    'varying vec3 vCol,vN,vW;varying float vAO,vSeed,vKind,vGlow;varying vec2 vUV;',
    'vec3 rotY(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);}',
    'void main(){',
    ' float g=aM.x;float k=clamp((uT-aM.y)/0.55,0.,1.);',
    ' float q=k-1.;float e=1.+2.2*q*q*q+1.2*q*q;',
    ' float s=min(1.,k*2.5);',
    ' vec3 off=aO*s;vec3 c=aC;vec3 n=aN;',
    ' if(g>11.5){float kk=g<12.5?0.34:(g<13.5?0.2:0.08);float ya=uYaw-kk*sin(uYaw);c=rotY(c,ya);off=rotY(off,ya);n=rotY(n,ya);}',
    ' if(g>0.5&&g<2.5){vec3 hg=g<1.5?vec3(-1.,0.,10.5):vec3(2.,0.,10.5);float a=(g<1.5?1.:-1.)*uDoor*1.55;',
    '   vec3 p=c+off-hg;p=rotY(p,a);c=p+hg;off=vec3(0.);n=rotY(n,a);}',
    ' if(g>9.5&&g<10.5){c.z+=sin(uTime*3.0-aS*1.1)*0.05*aS;}',
    ' if(g>10.5&&g<11.5){float ph=mod(aS,100.);c+=vec3(sin(uTime*.45+ph)*2.4,0.6+sin(uTime*1.7+ph*2.)*0.45,cos(uTime*.33+ph)*1.9);',
    '   if(aS>50.)c.y+=(abs(sin(uTime*15.+ph))-0.5)*0.35;}',
    ' vec3 p=c+off;p.y+=(1.-e)*8.;',
    ' gl_Position=uVP*vec4(p,1.);vW=p;',
    ' vCol=aCol;vN=n;vAO=aAO;vUV=aUV;vSeed=aM.z;vKind=aM.w;',
    ' float gl=0.;for(int i=0;i<11;i++){if(abs(float(i)-g)<0.5)gl=uG[i];}',
    ' if(g>0.5&&g<2.5)gl=uG[7]*0.6;',
    ' vGlow=gl;',
    '}'].join('\n');
  // 端端立绘：面向镜头的平面精灵（原设定图抠图，不改画），和城堡一起做深度测试
  var SVS = [
    'precision mediump float;',
    'attribute vec2 aQ;',
    'uniform mat4 uVP;uniform vec3 uPos,uR,uEye;uniform vec2 uSz;uniform vec4 uUV;uniform float uRoll,uFlip,uMode;',
    'varying vec2 vT,vQ;',
    'void main(){',
    ' vQ=aQ;vec3 p;',
    ' if(uMode>1.5){p=uPos+vec3(aQ.x*uSz.x,0.04,(aQ.y-0.5)*uSz.y);}',
    ' else{vec2 l=vec2(aQ.x*uSz.x,(aQ.y-0.5)*uSz.y);float c=cos(uRoll),s=sin(uRoll);l=vec2(l.x*c-l.y*s,l.x*s+l.y*c);l.y+=0.5*uSz.y;',
    '  p=uPos+uR*l.x+vec3(0.,l.y,0.);p+=normalize(uEye-uPos)*0.9;}',
    ' gl_Position=uVP*vec4(p,1.);',
    ' float u=uFlip>0.5?0.5-aQ.x:aQ.x+0.5;',
    ' vT=vec2(mix(uUV.x,uUV.z,u),mix(uUV.w,uUV.y,aQ.y));',
    '}'].join('\n');
  var SFS = [
    'precision mediump float;',
    'uniform sampler2D uTex;uniform float uMode,uAlpha,uShim,uTime,uBright;uniform vec3 uTint;',
    'varying vec2 vT,vQ;',
    'void main(){',
    ' if(uMode>1.5){vec2 d=vec2(vQ.x,vQ.y-0.5)*2.;float a=(1.-smoothstep(0.15,1.,dot(d,d)))*0.2*uAlpha;gl_FragColor=vec4(vec3(.22,.17,.12)*a,a);return;}',
    ' if(uMode>0.5){float a=texture2D(uTex,vT,2.5).a*uAlpha;if(a<0.01)discard;gl_FragColor=vec4(uTint*a,a);return;}',
    ' vec4 c=texture2D(uTex,vT);',
    ' if(c.a<0.02)discard;',
    ' if(uShim>0.){vec3 s=c.rgb/c.a;float b=smoothstep(0.08,0.3,s.b-max(s.r,s.g*0.92));',
    '  float w=0.5+0.5*sin(uTime*3.6-vT.y*70.+vT.x*30.);c.rgb+=vec3(.55,.85,1.)*b*(0.12+0.38*w*w)*uShim*c.a;}',
    ' c.rgb*=uBright;',
    ' gl_FragColor=c*uAlpha;',
    '}'].join('\n');
  var FS = [
    'precision mediump float;',
    'uniform vec3 uL;uniform float uTime;',
    'varying vec3 vCol,vN,vW;varying float vAO,vSeed,vKind,vGlow;varying vec2 vUV;',
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'void main(){',
    ' vec3 n=normalize(vN);',
    ' float dif=max(dot(n,uL),0.);',
    ' float sky=0.5+0.5*n.y;',
    ' float lit=0.50+0.42*dif+0.16*sky;',
    ' vec3 col=vCol;',
    ' float edge=min(min(vUV.x,1.-vUV.x),min(vUV.y,1.-vUV.y));',
    ' if(vKind<0.5){',
    '  float px=h(floor(vUV*4.)+vSeed*91.);',
    '  col*=0.95+0.09*px;',
    '  col*=mix(0.88,1.,smoothstep(0.,0.07,edge));',
    ' } else if(vKind<1.5){',
    '  vec3 warm=vec3(1.,.86,.55);',
    '  col=mix(col,vec3(.93,.97,.94),0.18*(1.-vUV.y));',
    '  col=mix(col,warm,0.28+0.72*vGlow);col=mix(col,vec3(1.,.95,.78),vGlow*0.35);',
    '  col*=mix(0.84,1.,smoothstep(0.,0.1,edge));',
    '  lit=mix(lit,1.12,0.35)+0.3*vGlow;',
    ' } else if(vKind<2.5){ lit=1.0+0.22*vGlow; col=mix(col,vec3(1.),0.06*vGlow); }',
    ' else {',
    '  float r=sin(uTime*1.6+vW.x*0.9+vW.z*0.5)*0.5+0.5;float r2=h(floor(vW.xz*2.)+floor(uTime*1.5));',
    '  col=mix(col,vec3(.94,.98,.97),step(0.93,r2)*0.6+r*0.06);lit=0.92+0.12*dif;',
    ' }',
    ' if(vKind<0.5&&vGlow>0.){col=mix(col,vec3(1.,.82,.45),vGlow*0.55);lit=mix(lit,1.2,vGlow*0.5);}',
    ' col*=lit*vAO;',
    ' col=pow(col,vec3(0.96));',
    ' float dd=length(vW.xz);float fd=smoothstep(40.,200.,dd);',
    ' col=mix(col,vec3(.74,.86,.62),fd*0.16);',
    ' float mist=(1.-smoothstep(-8.,6.,vW.y))*smoothstep(40.,90.,dd);',
    ' float band=exp(-pow((vW.y+1.)/8.,2.))*smoothstep(55.,110.,dd)*0.12;',
    ' col=mix(col,vec3(.90,.95,.86),clamp(mist*0.22+band,0.,0.28));',
    ' gl_FragColor=vec4(col,1.);',
    '}'].join('\n');

  /* ---------- 热区：四座角楼 + 主堡旗 + 正门（标签跟着建筑走，被主堡挡住就藏起来） ---------- */
  var SPOTS = [
    { id: 'eng', g: 3, t: TOWERS[0] }, { id: 'cn', g: 4, t: TOWERS[1] },
    { id: 'math', g: 5, t: TOWERS[2] }, { id: 'works', g: 6, t: TOWERS[3] }
  ];
  SPOTS.forEach(function (s) {
    if (s.t) { var x0 = s.t.x0, z0 = s.t.z0; s.box = [x0 - 0.6, x0 + 5.6, 0, TOWER_TOP, z0 - 0.6, z0 + 5.6]; s.a = [x0 + 2.5, TOWER_TOP - 0.4, z0 + 2.5];
      s.out = [x0 < 0 ? -1 : 1, z0 < 0 ? -1 : 1]; s.c = [x0 + 2.5, 9, z0 + 2.5]; }
  });
  var KEEP_BOX = [-3.6, 4.6, 0, 32, -3.6, 4.6];
  function segHitsBox(a, b, B) { // 线段 a→b 是否穿过盒子 B（略收一点，边缘不算挡住）
    var t0 = 0, t1 = 1;
    for (var i = 0; i < 3; i++) {
      var d = b[i] - a[i], lo = B[i * 2], hi = B[i * 2 + 1];
      if (Math.abs(d) < 1e-6) { if (a[i] < lo || a[i] > hi) return false; continue; }
      var u = (lo - a[i]) / d, v = (hi - a[i]) / d; if (u > v) { var tmp = u; u = v; v = tmp; }
      t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return false;
    }
    return true;
  }
  var LINES = {
    tap: ['Hi! 点角楼试试', 'Hello! 我是 Duang', 'Duang~!', '四座角楼，四个房间', "Let's go!", '盾牌防御！Shield up!'],
    hint: ['点这座试试！', 'Try this one!', '这里面有好玩的', 'Tap here!'],
    go: ['出发！', 'Go go go!', '我陪你去！']
  };

  var stage = document.getElementById('stage');
  var canvas = document.getElementById('castle');
  var bubble = document.getElementById('bubble');
  var heroHit = document.getElementById('duang-hit');
  var bgFar = stage.querySelector('.bg-far'), bgPeaks = stage.querySelector('.bg-peaks'), bgCloud = stage.querySelector('.bg-cloud');
  var spotEls = {};
  [].forEach.call(document.querySelectorAll('.spot'), function (el) { spotEls[el.dataset.id] = el; });
  if (STILL) document.documentElement.classList.add('still');
  if (REDUCED) document.documentElement.classList.add('calm');

  var gl = null;
  if (!Q.has('nogl')) {
    try { gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: STILL, powerPreference: 'low-power' }) || canvas.getContext('experimental-webgl'); } catch (e) { gl = null; }
  }
  var state = {
    yaw: -0.95, pitch: FB_PITCH, vyaw: 0, t0: performance.now(), lastUser: -1e9, lastAct: performance.now(),
    glow: new Float32Array(11), glowTarget: new Float32Array(11), door: 0, doorTarget: 0, built: false, focus: null
  };
  var fast = false;
  try { fast = sessionStorage.getItem('hd-built') === '1'; sessionStorage.setItem('hd-built', '1'); } catch (e) { }
  var INTRO = REDUCED ? 0 : (fast ? 1.3 : 3.0);
  var VEIL = Q.has('veil'), ARRIVED = Q.has('arrived');
  if (VEIL || ARRIVED) { INTRO = 0; state.yaw = FB_YAW; state.builtCam = true; state.built = true; }
  if (REDUCED || !gl) state.yaw = FB_YAW;

  function camera(w, h) {
    var asp = w / h, fov = 0.5, tf = Math.tan(fov / 2);
    var halfW = asp < 0.8 ? 16.5 : 25, halfH = asp < 0.8 ? 25.5 : 26;
    var dist = Math.max(halfW / (tf * asp), halfH / tf) + 12;
    var tgt = [0.5, asp < 0.8 ? 17.5 : 17, 2];
    var F = state.focus;
    if (F) { var fp = F.hero ? heroes[F.hero].pos : F.tgt; tgt = [fp[0], fp[1] + (F.dy || 0), fp[2]]; dist = F.dist; }
    var cp = Math.cos(state.pitch);
    var eye = [tgt[0] + dist * Math.sin(state.yaw) * cp, tgt[1] + dist * Math.sin(state.pitch), tgt[2] + dist * Math.cos(state.yaw) * cp];
    return { vp: mul(persp(fov, asp, 1.5, dist + 260), lookAt(eye, tgt, [0, 1, 0])), eye: eye };
  }
  function project(cam, p, w, h) {
    var c = xform(cam.vp, p);
    return [(c[0] / c[3] * 0.5 + 0.5) * w, (1 - (c[1] / c[3] * 0.5 + 0.5)) * h, c[3]];
  }
  function rectOf(cam, B, w, h) {
    var r = [1e9, 1e9, -1e9, -1e9, 0];
    for (var i = 0; i < 8; i++) {
      var p = project(cam, [B[i & 1], B[2 + ((i >> 1) & 1)], B[4 + ((i >> 2) & 1)]], w, h);
      r[0] = Math.min(r[0], p[0]); r[1] = Math.min(r[1], p[1]); r[2] = Math.max(r[2], p[0]); r[3] = Math.max(r[3], p[1]); r[4] += p[2] / 8;
    }
    return r;
  }
  function placeSpots(cam, w, h, ready) {
    var E = cam.eye, placed = [];
    var hd = [E[0] - 0.5, E[2] - 0.5], hl = Math.hypot(hd[0], hd[1]); hd = [hd[0] / hl, hd[1] / hl];
    SPOTS.forEach(function (s) {
      var vis = 1, B = s.box;
      if (s.flag) {
        var fb = FLAG.box; B = [fb[0] - 0.4, fb[1] + 0.2, fb[2] - 0.4, fb[3], fb[4] - 0.3, fb[5] + 0.3];
        s.a = [(fb[0] + fb[1]) / 2, fb[3], 0.5]; s.c = [(fb[0] + fb[1]) / 2, (fb[2] + fb[3]) / 2, 0.5];
      } else if (s.t) {
        var front = s.out[0] * hd[0] + s.out[1] * hd[1] > -0.2;
        B = [s.box[0], s.box[1], front ? 0 : 7, s.box[3], s.box[4], s.box[5]];
        var cx = s.t.x0 + (s.out[0] < 0 ? 0.2 : 4.8), cz = s.t.z0 + (s.out[1] < 0 ? 0.2 : 4.8);
        var pts = [s.a, [cx, 12, cz], [s.t.x0 + 2.5, 15, s.t.z0 + 2.5]];
        vis = pts.filter(function (p) { return !segHitsBox(E, p, KEEP_BOX); }).length >= 2 ? 1 : 0;
      } else if (s.door) {
        var dx = E[0] - s.a[0], dy = E[1] - s.a[1], dz = E[2] - s.a[2], l = Math.hypot(dx, dy, dz);
        vis = Math.max(0, Math.min(1, ((s.n[0] * dx + s.n[1] * dy + s.n[2] * dz) / l - 0.3) / 0.12));
      }
      if (!ready) vis = 0;
      var r = rectOf(cam, B, w, h);
      var minW = s.flag ? 64 : 48, minH = s.flag ? 64 : 48;
      if (r[2] - r[0] < minW) { var mx = (r[0] + r[2]) / 2; r[0] = mx - minW / 2; r[2] = mx + minW / 2; }
      if (r[3] - r[1] < minH) { var my = (r[1] + r[3]) / 2; r[1] = my - minH / 2; r[3] = my + minH / 2; }
      s.rect = r; s.vis = vis; s.sx = (r[0] + r[2]) / 2; s.sy = (r[1] + r[3]) / 2; s.depth = r[4];
      var el = spotEls[s.id]; if (!el) return;
      el.style.transform = 'translate3d(' + r[0].toFixed(1) + 'px,' + r[1].toFixed(1) + 'px,0)';
      var hit = el._hit || (el._hit = el.querySelector('.hit'));
      hit.style.width = (r[2] - r[0]).toFixed(0) + 'px'; hit.style.height = (r[3] - r[1]).toFixed(0) + 'px';
      var hidden = vis < 0.5;
      if (hidden !== el._hidden) { el._hidden = hidden; el.classList.toggle('off', hidden); el.tabIndex = hidden ? -1 : 0; el.setAttribute('aria-hidden', hidden ? 'true' : 'false'); }
    });
    SPOTS.slice().sort(function (a, b) { return b.depth - a.depth; }).forEach(function (s, i) { var el = spotEls[s.id]; if (el) el.style.zIndex = s.flag ? 40 : String(10 + i); });
    // 标签：默认挂在建筑头顶（正门挂在门下），按远近排，互相不压
    SPOTS.slice().sort(function (a, b) { return a.depth - b.depth; }).forEach(function (s) {
      var el = spotEls[s.id]; if (!el) return;
      var lab = el._lab || (el._lab = el.querySelector('.lab'));
      if (!el._lw || el._lwW !== w) { el._lw = lab.offsetWidth; el._lh = lab.offsetHeight; el._lwW = w; }
      var lw = el._lw, lh = el._lh, r = s.rect, ap = project(cam, s.a, w, h);
      var lx = ap[0] - lw / 2, ly;
      if (s.door) ly = r[3] + 8;
      else if (s.flag) { lx = r[0] - lw - 6; ly = (r[1] + r[3]) / 2 - lh / 2; if (lx < 6) { lx = r[2] + 6; } }
      else ly = ap[1] - lh - 8;
      lx = Math.max(6, Math.min(w - 6 - lw, lx)); ly = Math.max(6, Math.min(h - 6 - lh, ly));
      if (s.vis >= 0.5) {
        for (var k = 0; k < 4; k++) {
          var hitR = placed.filter(function (q) { return lx < q[2] + 4 && lx + lw > q[0] - 4 && ly < q[3] + 4 && ly + lh > q[1] - 4; })[0];
          if (!hitR) break;
          ly = s.door ? hitR[3] + 4 : hitR[1] - lh - 4;
          if (ly < 6) { ly = hitR[3] + 4; }
        }
        placed.push([lx, ly, lx + lw, ly + lh]);
      }
      s.lab = [lx, ly, lx + lw, ly + lh];
      var L = (lx - r[0]).toFixed(0), T = (ly - r[1]).toFixed(0);
      if (L !== el._L || T !== el._T) { el._L = L; el._T = T; lab.style.left = L + 'px'; lab.style.top = T + 'px'; }
      el.style.opacity = s.vis.toFixed(2);
    });
  }

  /* ---------- 降级：静态图 + 热区 ---------- */
  var heroes = {};
  if (!gl) {
    document.documentElement.classList.add('nogl');
    var fbImg = stage.querySelector('.fallback'); if (fbImg) fbImg.src = fbImg.getAttribute('data-src');
    buildFlags({ keep: KEEP_TOP });
    var resizeFb = function () { var r = stage.getBoundingClientRect(); placeSpots(camera(r.width, r.height), r.width, r.height, true); };
    addEventListener('resize', resizeFb); resizeFb(); if (fbImg) fbImg.addEventListener('load', resizeFb);
    bindSpots(function () { });
    return;
  }

  /* ---------- 场景网格 ---------- */
  var tops = {}, data = [], maxDelay = 0;
  var castle = buildCastle(tops), details = buildDetails(castle), flags = buildFlags(tops);
  function delayAt(wy, x, y, z) {
    var d = wy < -1 ? (wy + 9) * 0.03 + hash3(x, 1, z) * 0.1 : 0.2 + (wy + 1) * 0.04 + hash3(x, y, z + 9) * 0.3;
    maxDelay = Math.max(maxDelay, d); return d;
  }
  mesh(castle, 1, 0, 0, 0, data, function (v) { return delayAt(v[1], v[0], v[1], v[2]); });
  FAR_LAYERS.forEach(function (Lr, li) { var cs = Lr.cell; mesh(buildFarLayer(Lr, li), cs, 0, 0, 0, data, function (v) { return Math.max(0, delayAt(Math.max(-9, v[1] * cs * 0.3), v[0], v[1], v[2]) * 0.6); }); });
  mesh(details, 0.5, 0, 0, 0, data, function (v) { return delayAt(v[1] * 0.5 + 0.5, v[0], v[1], v[2]) + 0.15; });
  mesh(flags, 0.25, 0, 0, 0, data, function (v) { return delayAt(v[1] * 0.25 - 4, v[0], v[1], v[2]) + 0.35; });
  var arr = new Float32Array(data), totalVerts = arr.length / STRIDE;
  data = null;
  var heroDelay = maxDelay + 0.05, timeTotal = heroDelay + 0.8, speed = INTRO > 0 ? timeTotal / INTRO : 1;

  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function program(vs, fs) { var p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }
  var progC;
  try { progC = program(VS, FS); } catch (e) { console.error(e); location.replace(location.pathname + '?nogl=1'); return; }
  function attribs(prog, list, stride) { return list.map(function (a) { return [gl.getAttribLocation(prog, a[0]), a[1], a[2], stride]; }).filter(function (a) { return a[0] >= 0; }); }
  function uniforms(prog, names) { var U = {}; names.forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); }); return U; }
  var AC = attribs(progC, [['aC', 3, 0], ['aO', 3, 3], ['aN', 3, 6], ['aCol', 3, 9], ['aAO', 1, 12], ['aUV', 2, 13], ['aM', 4, 15], ['aS', 1, 19]], STRIDE);
  var UC = uniforms(progC, ['uVP', 'uT', 'uDoor', 'uTime', 'uG', 'uL', 'uYaw']);
  var enabled = [];
  function bindAttribs(list) {
    enabled.forEach(function (l) { gl.disableVertexAttribArray(l); }); enabled = [];
    list.forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, a[3] * 4, a[2] * 4); enabled.push(a[0]); });
  }
  function vbo(a) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW); return b; }
  var bufC = vbo(arr);

  /* ---------- 三个端端：原设定图立绘（一张 1024×256 图集） ---------- */
  var ATLAS = {
    exp_run: [0.001953125, 0.0703125, 0.14453125, 0.9921875, 0.6186], exp_wave: [0.150390625, 0.0703125, 0.2958984375, 0.9921875, 0.6314],
    mec_front: [0.3017578125, 0.0703125, 0.416015625, 0.9921875, 0.4958], mec_wave: [0.421875, 0.0703125, 0.5625, 0.9921875, 0.6102],
    combat: [0.568359375, 0.0078125, 0.771484375, 0.9921875, 0.8254]
  };
  var HEIGHT = { exp_run: 6.6, exp_wave: 6.8, mec_front: 7.0, mec_wave: 7.0, combat: 7.6 };
  var progS = program(SVS, SFS);
  var AS = attribs(progS, [['aQ', 2, 0]], 2);
  var US = uniforms(progS, ['uVP', 'uPos', 'uR', 'uEye', 'uSz', 'uUV', 'uRoll', 'uFlip', 'uMode', 'uTex', 'uAlpha', 'uShim', 'uTime', 'uBright', 'uTint']);
  var bufS = vbo(new Float32Array([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 0, 0.5, 1, -0.5, 1]));
  var tex = null;
  (function loadAtlas() {
    var img = new Image(), tried = false;
    img.onload = function () {
      tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      window.__spritesReady = img.currentSrc || img.src;
    };
    img.onerror = function () { if (!tried) { tried = true; img.src = 'assets/duang-sprites.png'; } };   // 不支持 WebP 的老浏览器用 PNG
    img.src = 'assets/duang-sprites.webp';
  })();
  function hero(key, pos) { return { key: key, pos: pos.slice(), drawPos: pos.slice(), flip: false, roll: 0, sx: 1, sy: 1, alpha: 1, shim: 0, halo: 0, bright: 1, shadow: 1 }; }
  heroes.mecha = hero('mec_front', [-4.5, 0, 13.4]);
  heroes.explorer = hero('exp_run', [0, 0, 15]);
  heroes.combat = hero('combat', [17, 22, 8]);
  heroes.combat.shadow = 0;
  var heroVerts = 3;

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); location.replace(location.pathname + '?nogl=1'); });
  window.__castleStats = { verts: totalVerts, sprites: heroVerts, voxels: castle.m.size + details.m.size + flags.m.size };

  /* ---------- 交互：拖动旋转 ---------- */
  var drag = null, mouse = null;
  function poke() { state.lastAct = performance.now(); }
  stage.addEventListener('pointerdown', function (e) {
    if (e.button && e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, pitch: state.pitch, moved: 0, t: performance.now(), lx: e.clientX, id: e.pointerId };
    state.vyaw = 0; state.lastUser = performance.now(); poke();
  });
  addEventListener('pointermove', function (e) {
    if (e.pointerType === 'mouse') { var r = stage.getBoundingClientRect(); mouse = [((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2]; if (Math.abs(mouse[0]) > 1.2 || Math.abs(mouse[1]) > 1.2) mouse = null; }
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    if (drag.moved > 6) stage.classList.add('dragging');
    var now = performance.now(), dt = Math.max(1, now - drag.t);
    state.vyaw = (e.clientX - drag.lx) * 0.0085 / dt * 16; drag.t = now; drag.lx = e.clientX;
    state.yaw = drag.yaw + dx * 0.0085;
    if (e.pointerType === 'mouse') state.pitch = Math.max(0.08, Math.min(0.62, drag.pitch + dy * 0.004));
    state.lastUser = now; poke();
  });
  function endDrag(e) { if (!drag || (e && e.pointerId !== drag.id)) return; stage._moved = drag.moved; drag = null; setTimeout(function () { stage.classList.remove('dragging'); }, 0); state.lastUser = performance.now(); }
  addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);
  stage.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { state.yaw -= 0.25; state.lastUser = performance.now(); poke(); }
    if (e.key === 'ArrowRight') { state.yaw += 0.25; state.lastUser = performance.now(); poke(); }
  });
  var turnBtn = document.getElementById('turn'), animYaw = null;
  if (turnBtn) turnBtn.addEventListener('click', function () {
    state.vyaw = 0; poke();
    var tgtYaw = Math.cos(state.yaw) < 0 ? Math.round((state.yaw - FB_YAW) / (2 * Math.PI)) * 2 * Math.PI + FB_YAW : state.yaw + Math.PI;
    animYaw = { from: state.yaw, to: tgtYaw, t: performance.now() }; state.lastUser = performance.now() + 2500;
  });

  /* ---------- 战斗端端：会飞、会回应 ---------- */
  var CB = { mode: 'patrol', ph: 0, spot: null, until: 0, flipT: -1e9, shieldT: -1e9, goT: -1e9, taps: 0, side: 0, sw: null, offY: 0 };
  var bubbleUntil = 0;
  function say(text, ms) {
    bubble.firstChild.textContent = text; bubble.classList.add('on'); bubbleUntil = performance.now() + (ms || 2400);
  }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function visit(s, ms, line) { CB.mode = 'visit'; CB.spot = s; CB.goT = performance.now(); CB.until = performance.now() + (ms || 4500); if (line) say(line, Math.min(ms || 2400, 2600)); }
  heroHit.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation(); if (stage._moved > 8) { stage._moved = 0; return; }
    var now = performance.now(); poke();
    CB.taps++;
    if (CB.taps % 2 === 1 && !REDUCED) CB.flipT = now; else CB.shieldT = now;
    say(CB.taps === 1 ? LINES.tap[0] : pick(LINES.tap));
    blip(6);
  });

  bindSpots(function (s) {
    state.glowTarget[s.g] = 1;
    if (s.flag) state.glowTarget[10] = 1;
    if (s.door) state.doorTarget = 1;
    visit(s, 3000, pick(LINES.go));
  });

  /* ---------- 冒险端端的小路：按弧长取点，速度均匀 ---------- */
  var PATH = (function () {
    var N = 480, pts = [], acc = [0];
    for (var i = 0; i <= N; i++) pts.push(ringPos(i / N * Math.PI * 2));
    for (i = 1; i <= N; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
    return { pts: pts, acc: acc, L: acc[N], N: N };
  })();
  function pathAt(u) {
    u = ((u % PATH.L) + PATH.L) % PATH.L;
    var lo = 0, hi = PATH.N;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (PATH.acc[m] <= u) lo = m; else hi = m; }
    var a = PATH.pts[lo], b = PATH.pts[hi], k = (u - PATH.acc[lo]) / Math.max(1e-6, PATH.acc[hi] - PATH.acc[lo]);
    return { p: [a[0] + (b[0] - a[0]) * k, 0, a[2] + (b[2] - a[2]) * k], yaw: Math.atan2(b[0] - a[0], b[2] - a[2]) };
  }

  /* ---------- 渲染循环 ---------- */
  var lastW = 0, lastH = 0, prev = performance.now();
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var EX = { u: PATH.L * 0.08, ph: 0, mode: 'run', runFor: 0, nextStop: 5.5, stopT: 0, yaw: 0 };
  function bell(k) { return k <= 0 || k >= 1 ? 0 : Math.sin(k * Math.PI); }

  function spriteQuad(H, cam, w, h) {   // 精灵四角投影到屏幕 → 可点区域 / 头顶位置
    var a = ATLAS[H.key], hh = HEIGHT[H.key] * H.sy, ww = hh * a[4] * H.sx / H.sy, p = H.drawPos;
    var R = [Math.cos(state.yaw), 0, -Math.sin(state.yaw)], r = [1e9, 1e9, -1e9, -1e9];
    [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]].forEach(function (q) {
      var s = project(cam, [p[0] + R[0] * q[0] * ww, p[1] + q[1] * hh, p[2] + R[2] * q[0] * ww], w, h);
      r[0] = Math.min(r[0], s[0]); r[1] = Math.min(r[1], s[1]); r[2] = Math.max(r[2], s[0]); r[3] = Math.max(r[3], s[1]);
    });
    return r;
  }
  function ease(k) { return k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
  function sstep(a, b, x) { var k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); }

  function updateHeroes(now, dt, t, cam, w, h) {
    var T = now / 1000, appear = Math.max(0, Math.min(1, (t - heroDelay) / 0.5));
    var pop = appear >= 1 ? 1 : Math.max(0.001, 1 + 2.4 * Math.pow(appear - 1, 3) + 1.4 * Math.pow(appear - 1, 2));
    var cyw = Math.cos(state.yaw), syw = Math.sin(state.yaw), RIGHT = [cyw, 0, -syw], FWD = [syw, 0, cyw];
    var mob = w / h < 0.8;

    // 机甲端端：守在正门左边，轻轻呼吸；隔一会儿换成挥手的那张，手跟着轻轻摆
    var M = heroes.mecha; M.key = 'mec_front'; M.roll = 0; M.sx = M.sy = pop; M.drawPos = M.pos.slice();
    if (!REDUCED) {
      var br = Math.sin(T * 2.1);
      M.sy *= 1 + 0.014 * br; M.sx *= 1 - 0.006 * br;
      var wv = ((T + 3) % 7.5) / 2.0;
      if (wv < 1) { M.key = 'mec_wave'; M.roll = Math.sin(wv * Math.PI * 4) * 0.045 * Math.min(1, bell(wv) * 2.5); }
    }

    // 冒险端端：绕城堡小路跑（按屏幕上的方向左右翻转），偶尔在前面停下挥手、跳一下
    var E = heroes.explorer; E.sx = E.sy = pop; E.roll = 0;
    if (REDUCED) {
      E.key = 'exp_wave'; E.flip = false; E.pos = [-11.5, 0, 14.6];
    } else {
      var here = pathAt(EX.u);
      if (EX.mode === 'run') {
        var sp = 3.6;
        EX.u += sp * dt; EX.ph += sp * dt * 2.3; EX.runFor += dt;
        here = pathAt(EX.u);
        var p0 = project(cam, here.p, w, h), p1 = project(cam, pathAt(EX.u + 0.8).p, w, h);
        if (Math.abs(p1[0] - p0[0]) > 0.4) E.flip = p1[0] < p0[0];
        E.key = 'exp_run';
        E.pos = here.p; E.pos[1] = Math.abs(Math.sin(EX.ph)) * 0.32;
        E.sy *= 1 - 0.035 * Math.abs(Math.cos(EX.ph)); E.roll = (E.flip ? 1 : -1) * (0.05 + Math.sin(EX.ph * 2) * 0.025);
        var fz = here.p[0] * FWD[0] + here.p[2] * FWD[2], fx = here.p[0] * RIGHT[0] + here.p[2] * RIGHT[2];
        if (EX.runFor > EX.nextStop && fz > 9 && Math.abs(fx) > 6) { EX.mode = 'stop'; EX.stopT = 0; }
      } else {
        EX.stopT += dt; var k = EX.stopT;
        E.pos = here.p.slice(); E.key = 'exp_wave'; E.flip = fx0(here.p) > 0;
        if (k > 1.5 && k < 2.1) { var j = (k - 1.5) / 0.6; E.pos[1] = bell(j) * 1.5; E.sy *= 1 + 0.05 * bell(j); }
        else if (k < 1.5) E.roll = Math.sin(k * 7) * 0.03;
        if (k > 2.5) { EX.mode = 'run'; EX.runFor = 0; EX.nextStop = 7 + Math.random() * 4; }
      }
    }
    function fx0(p) { return p[0] * RIGHT[0] + p[2] * RIGHT[2]; }
    E.drawPos = E.pos.slice();

    // 战斗端端：只在主堡旁边的天上飞（不从主堡、旗子前面经过）；旗子换边时从主堡后面绕过去（被主堡挡住）
    var B = heroes.combat; B.sx = B.sy = pop; B.roll = 0; B.halo = 0; B.bright = 1; B.shim = REDUCED ? 0.5 : 0.75 + 0.25 * Math.sin(T * 2.4);
    var kc = project(cam, [0.5, 24, 0.5], w, h), fc = project(cam, [(FLAG.box[0] + FLAG.box[1]) / 2, (FLAG.box[2] + FLAG.box[3]) / 2, 0.5], w, h);
    var want = fc[0] > kc[0] + 28 ? -1 : fc[0] < kc[0] - 28 ? 1 : (CB.side || -1);
    if (!CB.side) CB.side = want;
    if (Q.has('debug')) window.__dbgk = [Math.round(fc[0]), Math.round(kc[0]), want];
    if (want !== CB.side && !CB.sw) CB.sw = { from: CB.side, to: want, t: 0 };
    var X = mob ? 7.2 : 15.5, Y = mob ? 21.5 : 22, hi = (FLAG.box[3]) + 4.5;
    var lat, y = Y, back = 0;
    if (CB.sw) {
      CB.sw.t += dt / (REDUCED ? 0.01 : 2.6);
      var s = Math.min(1, CB.sw.t);
      lat = X * (CB.sw.from + (CB.sw.to - CB.sw.from) * sstep(0.3, 0.7, s));
      var bk = sstep(0, 0.3, s) * (1 - sstep(0.7, 1, s)); back = 15 * bk; y = Y - 10 * bk; void hi;
      if (s >= 1) { CB.side = CB.sw.to; CB.sw = null; }
    } else {
      CB.ph += dt;
      lat = CB.side * (X + Math.sin(CB.ph * 0.41) * (mob ? 0.8 : 2.2));
      y = Y + Math.sin(CB.ph * 0.57) * (mob ? 1.2 : 2);
      if (CB.mode === 'visit' || CB.mode === 'hint') {
        var sp2 = CB.spot, same = (sp2.sx - kc[0]) * CB.side > 0;
        if (same && !sp2.flag) { y = Math.max(TOWER_TOP + 2.5, y - 3); lat = CB.side * (X - 0.8); }   // 同一边：往那座楼低飞一点
        if (CB.mode === 'hint') state.glowTarget[sp2.g] = 0.25 + 0.25 * Math.sin(T * 6);
        if (now > CB.until) { if (CB.mode === 'hint') state.glowTarget[sp2.g] = 0; CB.mode = 'patrol'; poke(); }
      } else if (state.built && now - state.lastAct > 9000 && !REDUCED) {
        var cands = SPOTS.filter(function (s) { return s.vis > 0.9 && s.t; });
        if (cands.length) { CB.mode = 'hint'; CB.spot = pick(cands); CB.until = now + 5200; say(pick(LINES.hint), 3200); }
        poke();
      }
      if (mouse && !drag) { lat += mouse[0] * 1.2 * CB.side; y += mouse[1] * 1.2; }
    }
    if (REDUCED) { lat = CB.side * X; y = Y; }
    var depth = 3.5 - back;   // 平时稍微靠镜头一点；换边时退到主堡后面
    var target = [0.5 + RIGHT[0] * lat + FWD[0] * depth, y + CB.offY, 0.5 + RIGHT[2] * lat + FWD[2] * depth];
    if (appear < 1) target = [target[0] + RIGHT[0] * CB.side * (1 - appear) * 12, target[1] + (1 - appear) * 10, target[2] + RIGHT[2] * CB.side * (1 - appear) * 12];
    // 保底：投影到屏幕后，和主堡、旗子有重叠就往外 / 往下挪
    var fb = FLAG.box, FS_ = rectOf(cam, [fb[0] - 0.4, fb[1] + 0.2, fb[2] - 0.4, fb[3], fb[4] - 0.3, fb[5] + 0.3], w, h), KR = rectOf(cam, [KEEP_BOX[0] - 0.5, KEEP_BOX[1] + 0.5, 0, KEEP_TOP, KEEP_BOX[4] - 0.5, KEEP_BOX[5] + 0.5], w, h);
    var tmp = { key: 'combat', sx: 1, sy: 1, drawPos: target };
    for (var it = 0; it < 12 && !CB.sw; it++) {
      tmp.drawPos = target; var q = spriteQuad(tmp, cam, w, h), hit = false;
      [FS_, [KR[0] + 8, KR[1], KR[2] - 8, KR[3]]].forEach(function (R) { if (R && q[2] > R[0] - 12 && q[0] < R[2] + 12 && q[3] > R[1] - 12 && q[1] < R[3] + 12) hit = true; });
      if (!hit) break;
      target = [target[0] + RIGHT[0] * CB.side * 0.7, target[1] - 0.3, target[2] + RIGHT[2] * CB.side * 0.7];
    }
    if (!B.pos || REDUCED || appear <= 0) B.pos = target.slice();
    var follow = Math.min(1, dt * (CB.sw ? 3.2 : 1.8));
    var vx = (target[0] - B.pos[0]) * follow, vy = (target[1] - B.pos[1]) * follow, vz = (target[2] - B.pos[2]) * follow;
    B.pos = [B.pos[0] + vx, B.pos[1] + vy, B.pos[2] + vz];
    var vlat = (vx * RIGHT[0] + vz * RIGHT[2]) / Math.max(dt, 1e-3);
    B.flip = false;   // 不镜像：胸口和盾上的“天圆地方”标志要保持原样
    B.drawPos = [B.pos[0], B.pos[1] + (REDUCED ? 0 : Math.sin(T * 1.6) * 0.4), B.pos[2]];
    if (!REDUCED) B.roll = Math.sin(T * 1.1) * 0.035 - Math.max(-0.25, Math.min(0.25, vlat * 0.025));
    // 点一下：第一次原地转一圈（左右翻面），第二次举盾（蓝光）
    var fk = (now - CB.flipT) / 800;
    if (fk >= 0 && fk < 1) { var c2 = Math.cos(ease(fk) * Math.PI * 2); B.sx *= Math.max(0.04, Math.abs(c2)); if (c2 < 0) B.flip = !B.flip; B.drawPos[1] += bell(fk) * 1.2; }
    var sk = (now - CB.shieldT) / 1500;
    if (sk >= 0 && sk < 1) { var bb = Math.min(1, bell(sk) * 2.2); B.halo = bb; B.bright = 1 + 0.12 * bb; B.sx *= 1 + 0.05 * bb; B.sy *= 1 + 0.05 * bb; }
    var gk = (now - CB.goT) / 700;
    if (gk >= 0 && gk < 1) B.drawPos[1] += bell(gk) * 1.4;

    // 可点区域 = 精灵在屏幕上的框（最小 76×84）
    var hr = spriteQuad(B, cam, w, h);
    var ww = Math.max(76, hr[2] - hr[0]), hh = Math.max(84, hr[3] - hr[1]), bx = (hr[0] + hr[2]) / 2, by = (hr[1] + hr[3]) / 2;
    hr = [bx - ww / 2, by - hh / 2, bx + ww / 2, by + hh / 2];
    // 压到角楼标签：往上让一点，同时让标签优先可点
    var onLab = SPOTS.some(function (s) { var R = s.lab; return s.vis >= 0.5 && R && !s.flag && hr[0] < R[2] && hr[2] > R[0] && hr[1] < R[3] && hr[3] > R[1]; });
    CB.offY = Math.max(0, Math.min(5, CB.offY + (onLab && CB.mode === 'patrol' ? dt * 2 : -dt * 0.4)));
    if (onLab !== heroHit._low) { heroHit._low = onLab; heroHit.style.zIndex = onLab ? '5' : ''; }
    heroHit.style.width = ww.toFixed(0) + 'px'; heroHit.style.height = hh.toFixed(0) + 'px';
    heroHit.style.transform = 'translate3d(' + hr[0].toFixed(1) + 'px,' + hr[1].toFixed(1) + 'px,0)';
    heroHit.classList.toggle('on', appear >= 1 && !!tex && !CB.sw);
    var bw2 = (bubble.firstChild.offsetWidth || 120) / 2 + 8;
    var bX = Math.max(bw2, Math.min(w - bw2, bx)), bY = Math.max(58, hr[1] + 4);
    if (CB.sw) {   // 绕到主堡后面时，气泡先挂到要去的那一边，不压主堡和旗子
      var dp = project(cam, [0.5 + RIGHT[0] * CB.sw.to * X + FWD[0] * 3.5, Y + HEIGHT.combat, 0.5 + RIGHT[2] * CB.sw.to * X + FWD[2] * 3.5], w, h);
      bX = Math.max(bw2, Math.min(w - bw2, dp[0])); bY = Math.max(58, dp[1] + 4);
    }
    bubble.style.transform = 'translate3d(' + bX.toFixed(1) + 'px,' + bY.toFixed(1) + 'px,0)';
    if (bubble.classList.contains('on') && now > bubbleUntil) bubble.classList.remove('on');
    if (Q.has('debug')) window.__hq = { mecha: spriteQuad(M, cam, w, h), explorer: spriteQuad(E, cam, w, h), combat: spriteQuad(B, cam, w, h) };
  }

  function drawSprites(cam, vp, time) {
    if (!tex) return;
    gl.useProgram(progS);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufS); bindAttribs(AS);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(US.uTex, 0);
    gl.uniformMatrix4fv(US.uVP, false, vp); gl.uniform3fv(US.uEye, cam.eye); gl.uniform1f(US.uTime, time);
    gl.uniform3f(US.uR, Math.cos(state.yaw), 0, -Math.sin(state.yaw));
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    var list = [heroes.mecha, heroes.explorer, heroes.combat].map(function (H) {
      var p = H.drawPos, d = Math.hypot(cam.eye[0] - p[0], cam.eye[1] - p[1] - 2.5, cam.eye[2] - p[2]); return [d, H];
    }).sort(function (a, b) { return b[0] - a[0]; });
    function quad(H, mode, scale, alpha) {
      var a = ATLAS[H.key], hh = HEIGHT[H.key] * H.sy * scale, ww = HEIGHT[H.key] * a[4] * H.sx * scale, p = H.drawPos;
      gl.uniform1f(US.uMode, mode); gl.uniform1f(US.uAlpha, alpha);
      if (mode > 1.5) { gl.uniform3f(US.uPos, p[0], H.pos[1] > 3 ? 0 : 0, p[2]); gl.uniform2f(US.uSz, ww * 0.9, ww * 0.55); }
      else { gl.uniform3f(US.uPos, p[0], p[1] - (scale - 1) * hh * 0.5 / scale, p[2]); gl.uniform2f(US.uSz, ww, hh); }
      gl.uniform4f(US.uUV, a[0], a[1], a[2], a[3]); gl.uniform1f(US.uRoll, H.roll); gl.uniform1f(US.uFlip, H.flip ? 1 : 0);
      gl.uniform1f(US.uShim, H.shim); gl.uniform1f(US.uBright, H.bright);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    list.forEach(function (it) { var H = it[1]; if (H.shadow) quad(H, 2, 1, Math.max(0, 1 - H.pos[1] * 0.4) * Math.min(1, H.sx)); });
    list.forEach(function (it) {
      var H = it[1];
      if (H.halo > 0.01) { gl.uniform3f(US.uTint, 0.45, 0.8, 1.0); quad(H, 1, 1.1, 0.55 * H.halo); }
      quad(H, 0, 1, 1);
    });
    gl.depthMask(true); gl.disable(gl.BLEND);
  }

  function frame(now) {
    var dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    if (document.documentElement.classList.contains('paused-scene')) dt = 0;
    var r = stage.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height);
    if (w !== lastW || h !== lastH) { lastW = w; lastH = h; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); gl.viewport(0, 0, canvas.width, canvas.height); }
    var t = INTRO === 0 ? 99 : (now - state.t0) / 1000 * speed;
    var ready = t >= heroDelay + 0.5;
    if (ready && !state.built) { state.built = true; stage.classList.add('built'); poke(); }
    if (!REDUCED && !state.builtCam) {
      var k = Math.min(1, t / timeTotal), e = 1 - Math.pow(1 - k, 3);
      if (state.lastUser < 0) state.yaw = -0.95 + (FB_YAW - 0.05 + 0.95) * e;
      if (k >= 1) state.builtCam = true;
    }
    var idle = now - state.lastUser > 6000;
    if (animYaw) { var ak = Math.min(1, (now - animYaw.t) / 1400), ae = ak < .5 ? 4 * ak * ak * ak : 1 - Math.pow(-2 * ak + 2, 3) / 2; state.yaw = animYaw.from + (animYaw.to - animYaw.from) * ae; if (ak >= 1) animYaw = null; }
    else if (!drag && Math.abs(state.vyaw) > 0.0005) { state.yaw += state.vyaw; state.vyaw *= 0.93; }
    else if (!drag && idle && state.builtCam && !REDUCED && !state.focus) {
      state.swing = (state.swing || 0) + dt;
      var base = state.swingBase == null ? (state.swingBase = state.yaw) : state.swingBase;
      state.yaw += ((base + Math.sin(state.swing * 0.16) * 0.36) - state.yaw) * Math.min(1, dt * 0.8);
    }
    if (!idle) { state.swingBase = null; state.swing = 0; }
    for (var i = 0; i < 11; i++) state.glow[i] += (state.glowTarget[i] - state.glow[i]) * Math.min(1, dt * 12);
    state.door += (state.doorTarget - state.door) * Math.min(1, dt * 7);

    var cam = camera(w, h);
    if (!STILL) placeSpots(cam, w, h, ready);
    updateHeroes(now, dt, t, cam, w, h);

    var lx = -0.42, ly = 0.78, lz = 0.62, cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
    var L = [lx * cy + lz * sy, ly, -lx * sy + lz * cy], ll = Math.hypot(L[0], L[1], L[2]);
    var vp = new Float32Array(cam.vp), time = REDUCED ? 0 : now / 1000;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(progC);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufC); bindAttribs(AC);
    gl.uniformMatrix4fv(UC.uVP, false, vp);
    gl.uniform1f(UC.uT, t); gl.uniform1f(UC.uYaw, state.yaw); gl.uniform1f(UC.uDoor, state.door); gl.uniform1f(UC.uTime, time);
    gl.uniform1fv(UC.uG, state.glow); gl.uniform3f(UC.uL, L[0] / ll, L[1] / ll, L[2] / ll);
    gl.drawArrays(gl.TRIANGLES, 0, totalVerts);
    if (t >= heroDelay) drawSprites(cam, vp, time);
    // 远景视差
    if (bgFar) { var px = -(state.yaw * 70); bgFar.style.transform = 'translate3d(' + (((px % 600) + 600) % 600 - 600).toFixed(1) + 'px,0,0)'; }
    if (bgPeaks) { var pp = -(state.yaw * 40); bgPeaks.style.transform = 'translate3d(' + (((pp % 720) + 720) % 720 - 720).toFixed(1) + 'px,0,0)'; }
    if (bgCloud) bgCloud.style.transform = 'translate3d(' + (-(state.yaw * 30)).toFixed(1) + 'px,0,0)';
    if (turnBtn) { var back = Math.cos(state.yaw) < 0; if (back !== turnBtn._back) { turnBtn._back = back; turnBtn.textContent = back ? '转回正面' : '转到背面'; turnBtn.setAttribute('aria-label', back ? '把城堡转回正面' : '把城堡转到背面'); } }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__tick = function (n) {
    for (var i = 0; i < (n || 1); i++) frame(prev + 33.4);
  };
  window.__castle = state; window.__heroes = heroes; window.__CB = CB; window.__say = say; window.__spots = SPOTS;

  addEventListener('pageshow', function (e) { if (e.persisted) { state.glowTarget.fill(0); state.glow.fill(0); state.doorTarget = 0; state.door = 0; [].forEach.call(document.querySelectorAll('.spot.press'), function (el) { el.classList.remove('press'); }); } });

  /* ---------- 公用：点角楼 / 旗 / 门 ---------- */
  function bindSpots(onPress) {
    SPOTS.forEach(function (s) {
      var el = spotEls[s.id]; if (!el) return;
      el.addEventListener('click', function (e) {
        if (stage._moved > 8) { e.preventDefault(); stage._moved = 0; return; }
        e.preventDefault();
        if (el.classList.contains('press')) return;
        el.classList.add('press'); onPress(s); blip(s.g);
        var href = el.getAttribute('href');
        window.__lastNav = href;
        setTimeout(function () { if (!window.__noNav) location.href = href; }, REDUCED ? 120 : (s.door ? 800 : 650));
      });
    });
  }
  // 点击音效默认关闭；网址带 ?sound=1 才打开
  var SOUND = Q.has('sound'), actx = null;
  function blip(g) {
    if (!SOUND) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), v = actx.createGain(), t = actx.currentTime;
      var notes = [0, 0, 0, 523, 659, 587, 784, 698, 440];
      o.type = 'square'; o.frequency.setValueAtTime(notes[g] || 600, t); o.frequency.setValueAtTime((notes[g] || 600) * 1.5, t + 0.07);
      v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(0.05, t + 0.01); v.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(v); v.connect(actx.destination); o.start(t); o.stop(t + 0.24);
    } catch (e) { }
  }
})();
