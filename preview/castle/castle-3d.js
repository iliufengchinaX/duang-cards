/* Hello Duang · Unified 3D Floating Castle + Island WebGL2/WebGL1 GLB PBR Renderer
 * Zero external CDN dependencies (100% local & LAN reliable).
 * Loads assets/models/castle-island.glb and renders it composited over the static empty-plate
 * time-of-day background with:
 *   - Real 3D rotation of castle + floating island together (drag yaw, subtle pitch, inertia, idle sway, turn-to-back button)
 *   - Time-of-day matched PBR lighting (Day sunlight / Sunset golden horizon / Night moonlight + glowing windows & lanterns)
 *   - Tangent-space normal mapping (via screen-space derivatives), hemisphere sky/ground bounce, ACES filmic tone mapping
 *   - Live animated waterfall UV cascade, gentle splash shimmer, breeze-waving flags, and subtle floating bob
 */
(function () {
  'use strict';

  var MODEL_URL = 'assets/models/castle-island.glb';
  var HERO_YAW = -0.26;    // Slight 3/4 hero angle matching front render (shows double door + crown banner + waterfall)
  var HERO_PITCH = 0.23;   // Slightly elevated view showing island meadow & waterfall cleanly
  var MIN_PITCH = 0.06;
  var MAX_PITCH = 0.56;
  var MIN_ZOOM = 0.84;
  var MAX_ZOOM = 1.28;

  /* ---------- Time-of-day lighting presets composited into empty plates & official 效果图 ---------- */
  var LIGHTS = {
    day: {
      sunDir: [0.70, 0.62, 0.34],
      sunCol: [1.00, 0.93, 0.82],
      sunInt: 0.94,
      skyCol: [0.46, 0.69, 0.93],
      gndCol: [0.36, 0.42, 0.34],
      ambInt: 0.33,
      shdCol: [0.38, 0.50, 0.67],
      rimDir: [-0.58, 0.48, -0.66],
      rimCol: [0.68, 0.83, 0.97],
      rimInt: 0.13,
      emScale: 1.02,
      lanternInt: 0.34,
      lanternCol: [1.00, 0.76, 0.36],
      fogCol: [0.66, 0.78, 0.90],
      fogAmt: 0.34,
      hazeAmt: 0.11,
      underAmt: 0.94,
      liftCol: [0.15, 0.24, 0.37],
      liftAlpha: 0.53,
      exp: 0.73,
      wrap: 0.06,
      aoStr: 0.86,
      normBoost: 1.36,
      albedoCont: 1.20,
      warmth: [1.01, 0.98, 0.94],
      sat: 0.94,
      cont: 0.10,
      spriteTint: [0.97, 0.97, 0.96]
    },
    sunset: {
      sunDir: [0.84, 0.28, 0.34],
      sunCol: [1.00, 0.54, 0.26],
      sunInt: 1.04,
      skyCol: [0.48, 0.36, 0.54],
      gndCol: [0.34, 0.24, 0.27],
      ambInt: 0.33,
      shdCol: [0.44, 0.31, 0.48],
      rimDir: [-0.64, 0.36, -0.66],
      rimCol: [0.95, 0.62, 0.46],
      rimInt: 0.18,
      emScale: 1.75,
      lanternInt: 0.84,
      lanternCol: [1.00, 0.64, 0.24],
      fogCol: [0.68, 0.49, 0.50],
      fogAmt: 0.40,
      hazeAmt: 0.15,
      underAmt: 0.97,
      liftCol: [0.18, 0.14, 0.22],
      liftAlpha: 0.59,
      exp: 0.70,
      wrap: 0.05,
      aoStr: 0.90,
      normBoost: 1.42,
      albedoCont: 1.22,
      warmth: [1.04, 0.90, 0.84],
      sat: 0.97,
      cont: 0.11,
      spriteTint: [0.98, 0.85, 0.78]
    },
    night: {
      sunDir: [0.58, 0.72, 0.38],
      sunCol: [0.42, 0.65, 1.00],
      sunInt: 0.36,
      skyCol: [0.11, 0.22, 0.42],
      gndCol: [0.06, 0.12, 0.22],
      ambInt: 0.24,
      shdCol: [0.10, 0.20, 0.38],
      rimDir: [-0.52, 0.56, -0.64],
      rimCol: [0.42, 0.64, 0.94],
      rimInt: 0.18,
      emScale: 2.50,
      lanternInt: 1.28,
      lanternCol: [1.00, 0.66, 0.22],
      fogCol: [0.18, 0.30, 0.47],
      fogAmt: 0.44,
      hazeAmt: 0.16,
      underAmt: 0.99,
      liftCol: [0.03, 0.07, 0.16],
      liftAlpha: 0.65,
      exp: 0.62,
      wrap: 0.08,
      aoStr: 0.82,
      normBoost: 1.28,
      albedoCont: 1.16,
      warmth: [0.72, 0.86, 1.12],
      sat: 0.92,
      cont: 0.09,
      spriteTint: [0.72, 0.81, 0.95]
    }
  };

  /* ---------- Minimal 4x4 Matrix & Quaternion Math ---------- */
  function mat4Identity() {
    var m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  }

  function mat4Mul(out, a, b) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (var i = 0; i < 4; i++) {
      var b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      out[i * 4]     = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
      out[i * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
      out[i * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
      out[i * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
    }
    return out;
  }

  function mat4FromTRS(t, q, s) {
    var x = q[0], y = q[1], z = q[2], w = q[3];
    var x2 = x + x, y2 = y + y, z2 = z + z;
    var xx = x * x2, xy = x * y2, xz = x * z2;
    var yy = y * y2, yz = y * z2, zz = z * z2;
    var wx = w * x2, wy = w * y2, wz = w * z2;
    var sx = s[0], sy = s[1], sz = s[2];
    var m = new Float32Array(16);
    m[0] = (1 - (yy + zz)) * sx;
    m[1] = (xy + wz) * sx;
    m[2] = (xz - wy) * sx;
    m[3] = 0;
    m[4] = (xy - wz) * sy;
    m[5] = (1 - (xx + zz)) * sy;
    m[6] = (yz + wx) * sy;
    m[7] = 0;
    m[8] = (xz + wy) * sz;
    m[9] = (yz - wx) * sz;
    m[10] = (1 - (xx + yy)) * sz;
    m[11] = 0;
    m[12] = t[0];
    m[13] = t[1];
    m[14] = t[2];
    m[15] = 1;
    return m;
  }

  function mat4Perspective(fovRad, aspect, near, far) {
    var f = 1.0 / Math.tan(fovRad * 0.5);
    var nf = 1.0 / (near - far);
    var m = new Float32Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) * nf;
    m[11] = -1;
    m[14] = 2 * far * near * nf;
    return m;
  }

  function mat4LookAt(eye, target, up) {
    var zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    var zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    var xx = up[1] * zz - up[2] * zy;
    var xy = up[2] * zx - up[0] * zz;
    var xz = up[0] * zy - up[1] * zx;
    var xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy;
    var yy = zz * xx - zx * xz;
    var yz = zx * xy - zy * xx;
    var m = new Float32Array(16);
    m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
    m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
    m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
    m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    m[15] = 1;
    return m;
  }

  function mat4RotateYTranslate(yaw, ty) {
    var c = Math.cos(yaw), s = Math.sin(yaw);
    var m = mat4Identity();
    m[0] = c; m[2] = -s;
    m[8] = s; m[10] = c;
    m[13] = ty;
    return m;
  }

  function mat4FlightBasis(pos, vel, bankRad) {
    // Build orthonormal glTF Y-up flight matrix (local -Z = forward, +Y = up, +X = right)
    var fl = Math.hypot(vel[0], vel[1], vel[2]) || 1;
    var fx = vel[0] / fl, fy = vel[1] / fl, fz = vel[2] / fl;
    // right0 = norm(cross(fwd, [0, 1, 0])) = norm([-fz, 0, fx])
    var r0x = -fz, r0y = 0, r0z = fx;
    var rl = Math.hypot(r0x, r0z);
    if (rl < 1e-5) { r0x = 1; r0z = 0; rl = 1; }
    r0x /= rl; r0z /= rl;
    // up0 = cross(right0, fwd)
    var u0x = r0y * fz - r0z * fy;
    var u0y = r0z * fx - r0x * fz;
    var u0z = r0x * fy - r0y * fx;
    // Apply aerodynamic bank around forward axis (+bank tilts right wing up -> left/CCW turn)
    var cb = Math.cos(bankRad), sb = Math.sin(bankRad);
    var rx = r0x * cb + u0x * sb, ry = r0y * cb + u0y * sb, rz = r0z * cb + u0z * sb;
    var ux = u0x * cb - r0x * sb, uy = u0y * cb - r0y * sb, uz = u0z * cb - r0z * sb;
    var m = new Float32Array(16);
    m[0] = rx;   m[1] = ry;   m[2] = rz;   m[3] = 0;
    m[4] = ux;   m[5] = uy;   m[6] = uz;   m[7] = 0;
    m[8] = -fx;  m[9] = -fy;  m[10] = -fz; m[11] = 0;
    m[12] = pos[0]; m[13] = pos[1]; m[14] = pos[2]; m[15] = 1;
    return m;
  }

  function mat4TranslateRotateZ(tx, ty, tz, rz) {
    var c = Math.cos(rz), s = Math.sin(rz);
    var m = mat4Identity();
    m[0] = c;  m[1] = s;
    m[4] = -s; m[5] = c;
    m[12] = tx; m[13] = ty; m[14] = tz;
    return m;
  }

  /* ---------- Sky Creature Trajectories (matched to build_castle_island.py, converted to glTF Y-up) ---------- */
  var BIRD_SPECS = [
    { dth: 0.00, dr:  0.00, dz:  0.05, ph: 0.00 },
    { dth: 0.13, dr: -0.38, dz:  0.22, ph: 1.15 },
    { dth: 0.16, dr:  0.22, dz: -0.14, ph: 2.30 },
    { dth: 0.27, dr: -0.52, dz:  0.34, ph: 3.45 },
    { dth: 0.31, dr:  0.15, dz:  0.12, ph: 4.60 },
    { dth: 0.43, dr: -0.25, dz: -0.06, ph: 5.75 },
    { dth: 0.48, dr:  0.08, dz:  0.28, ph: 0.65 }
  ];

  function evalPteroPosGltf(tSec) {
    var TAU = Math.PI * 2;
    var period = 9.5;
    var theta = (205.0 * Math.PI / 180.0) + TAU * (tSec / period);
    var rMod = 1.0 + 0.045 * Math.sin(2.0 * theta);
    var bx = 4.65 * rMod * Math.cos(theta);
    var by = 4.25 * rMod * Math.sin(theta);
    var bz = 5.05 + 0.36 * Math.sin(theta + 0.50) + 0.10 * Math.sin(2.0 * theta) - 0.06 * Math.sin(TAU * tSec);
    return [bx, bz, -by];
  }

  function evalPteroFlap(tSec) {
    var ph = Math.PI * 2 * tSec;
    return 0.08 + 0.44 * Math.sin(ph) - 0.10 * Math.sin(2.0 * ph);
  }

  function evalBirdPosGltf(idx, tSec) {
    var TAU = Math.PI * 2;
    var period = 9.5;
    var sp = BIRD_SPECS[idx % BIRD_SPECS.length];
    var theta = (18.0 * Math.PI / 180.0) + sp.dth - TAU * (tSec / period);
    var wob = 0.14 * Math.sin(TAU * (tSec / period) * 2.0 + sp.ph);
    var rx = 5.20 + sp.dr + wob;
    var ry = 4.90 + sp.dr + wob * 0.85;
    var bx = rx * Math.cos(theta);
    var by = ry * Math.sin(theta);
    var bz = 6.60 + sp.dz + 0.32 * Math.cos(theta - 0.60) + 0.08 * Math.sin(TAU * (tSec / period) * 2.0 + sp.ph * 1.3);
    return [bx, bz, -by];
  }

  function evalBirdFlap(idx, tSec) {
    var sp = BIRD_SPECS[idx % BIRD_SPECS.length];
    return 0.06 + 0.62 * Math.sin(Math.PI * 2 * tSec * 3.0 + sp.ph);
  }

  /* ---------- Official Duang Character Sprite Atlas & Combat Flight Path ---------- */
  // Left-to-right frames in assets/duang-sprites.webp (1024x256): [u0, v0, u1, v1, aspectWoverH]
  var DUANG_ATLAS = {
    exp_run:   [0.001953125,  0.0703125, 0.14453125,   0.9921875, 0.6186],
    exp_wave:  [0.150390625,  0.0703125, 0.2958984375, 0.9921875, 0.6314],
    mec_front: [0.3017578125, 0.0703125, 0.416015625,  0.9921875, 0.4958],
    mec_wave:  [0.421875,     0.0703125, 0.5625,       0.9921875, 0.6102],
    combat:    [0.568359375,  0.0078125, 0.771484375,  0.9921875, 0.8254]
  };
  // World-space character heights in meters (matches island/keep scale; keeps sprites readable at 1080p)
  var DUANG_HEIGHT = {
    exp_run:   1.20,
    exp_wave:  1.22,
    mec_front: 1.24,
    mec_wave:  1.24,
    combat:    1.42
  };
  var COMBAT_PERIOD = 9.5; // 9.5s side-to-side loop behind the keep (matches 2 seamless cycles in 19s review video)

  function evalCombatPosGltf(tSec) {
    // Sweeps between right (+3.30, 3.05, +0.53) and left (-3.30, 3.05, +0.53) via rear waypoint (0.0, 2.65, -2.95)
    // behind the keep so the keep occludes him mid-crossing; stays clear of doors, flags, towers & pterosaur band.
    var w = Math.PI * 2 * (tSec / COMBAT_PERIOD);
    var c = Math.cos(w);
    var s2 = Math.sin(w) * Math.sin(w);
    var theta = Math.PI * 0.5 - (Math.PI * 0.5 + 0.18) * c;
    var bx = 3.35 * Math.cos(theta);
    var by = 2.95 * Math.sin(theta);
    var bz = 3.05 - 0.40 * s2 + 0.12 * Math.sin(2.0 * w + 0.6);
    // glTF (x, y, z) = Blender (x, z_up, -y)
    return [bx, bz, -by];
  }

  function norm3(v) {
    var l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  function lerp(a, b, k) { return a + (b - a) * k; }
  function lerp3(a, b, k) { return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function easeInOutCubic(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function bellCurve(k) { return (k <= 0 || k >= 1) ? 0 : Math.sin(k * Math.PI); }

  function transformPointMat4(m, p) {
    var x = p[0], y = p[1], z = p[2];
    return [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14]
    ];
  }

  function cloneLight(L) {
    return {
      sunDir: L.sunDir.slice(), sunCol: L.sunCol.slice(), sunInt: L.sunInt,
      skyCol: L.skyCol.slice(), gndCol: L.gndCol.slice(), ambInt: L.ambInt,
      shdCol: L.shdCol.slice(),
      rimDir: L.rimDir.slice(), rimCol: L.rimCol.slice(), rimInt: L.rimInt,
      emScale: L.emScale, lanternInt: L.lanternInt, lanternCol: L.lanternCol.slice(),
      fogCol: L.fogCol.slice(), fogAmt: L.fogAmt,
      hazeAmt: L.hazeAmt, underAmt: L.underAmt,
      liftCol: L.liftCol.slice(), liftAlpha: L.liftAlpha,
      exp: L.exp,
      wrap: L.wrap, aoStr: L.aoStr, normBoost: L.normBoost, albedoCont: L.albedoCont,
      warmth: L.warmth.slice(), sat: L.sat, cont: L.cont,
      spriteTint: L.spriteTint.slice()
    };
  }

  /* ---------- GLSL PBR Shaders (WebGL2 & WebGL1 compatible) ---------- */
  function buildShaders(isWebGL2) {
    var vsHeader = isWebGL2
      ? '#version 300 es\n#define ATTR in\n#define VARY out\n'
      : 'precision highp float;\n#define ATTR attribute\n#define VARY varying\n';

    var fsHeader = isWebGL2
      ? '#version 300 es\nprecision highp float;\nprecision highp int;\n#define VARY in\n#define TEX2D texture\nout vec4 fragOut;\n#define OUTCOLOR fragOut\n'
      : '#extension GL_OES_standard_derivatives : enable\nprecision highp float;\nprecision highp int;\n#define VARY varying\n#define TEX2D texture2D\n#define OUTCOLOR gl_FragColor\n';

    var vs = vsHeader + [
      'precision highp float;',
      'precision highp int;',
      'ATTR vec3 aPos;',
      'ATTR vec3 aNorm;',
      'ATTR vec2 aUV;',
      'uniform mat4 uModel;',
      'uniform mat4 uVP;',
      'uniform float uTime;',
      'uniform int uFxMode;', // 0=normal, 1=waterfall, 2=splash, 3=flag
      'uniform vec2 uSplashCenter;',
      'VARY vec3 vWorldPos;',
      'VARY vec3 vWorldNorm;',
      'VARY vec2 vUV;',
      'VARY vec3 vLocalPos;',
      'void main() {',
      '  vec3 p = aPos;',
      '  vec3 n = aNorm;',
      '  if (uFxMode == 3) {',
      '    // Gentle breeze ripple along flag length (UV.x = 0 at pole -> 1 at tip)',
      '    float w = clamp(aUV.x, 0.0, 1.0);',
      '    float wave = sin(uTime * 3.4 - w * 5.2 + p.y * 1.3) * 0.065 * w * w;',
      '    p.z += wave;',
      '    p.y += cos(uTime * 2.6 - w * 4.0) * 0.018 * w;',
      '  } else if (uFxMode == 2) {',
      '    // Gentle radial breathing around dynamic splash center',
      '    float pulse = 1.0 + sin(uTime * 3.0) * 0.035;',
      '    vec2 d = p.xz - uSplashCenter;',
      '    p.xz = uSplashCenter + d * pulse;',
      '  }',
      '  vec4 wp = uModel * vec4(p, 1.0);',
      '  vWorldPos = wp.xyz;',
      '  vWorldNorm = normalize(mat3(uModel) * n);',
      '  vUV = aUV;',
      '  vLocalPos = p;',
      '  gl_Position = uVP * wp;',
      '}'
    ].join('\n');

    var fs = fsHeader + [
      'VARY vec3 vWorldPos;',
      'VARY vec3 vWorldNorm;',
      'VARY vec2 vUV;',
      'VARY vec3 vLocalPos;',
      '',
      'uniform vec3 uEye;',
      'uniform float uTime;',
      'uniform int uFxMode;',
      'uniform int uMatKind;', // 0=other, 1=stone/stair, 2=roof, 3=grass/tuft, 4=leaf/vine, 5=rock, 6=window/lantern
      'uniform int uIsCreature;',
      '',
      '// Material',
      'uniform vec4 uBaseColor;',
      'uniform float uMetallic;',
      'uniform float uRoughness;',
      'uniform vec3 uEmissive;',
      'uniform float uEmissiveStr;',
      'uniform float uNormalScale;',
      'uniform float uAlphaCutoff;',
      'uniform int uHasBaseTex;',
      'uniform int uHasNormTex;',
      'uniform int uHasEmTex;',
      'uniform sampler2D uBaseTex;',
      'uniform sampler2D uNormTex;',
      'uniform sampler2D uEmTex;',
      '',
      '// Lighting & material response (interpolated per time-of-day)',
      'uniform vec3 uSunDir;',
      'uniform vec3 uSunCol;',
      'uniform float uSunInt;',
      'uniform vec3 uSkyCol;',
      'uniform vec3 uGndCol;',
      'uniform float uAmbInt;',
      'uniform vec3 uShdCol;',
      'uniform vec3 uRimDir;',
      'uniform vec3 uRimCol;',
      'uniform float uRimInt;',
      'uniform float uEmScale;',
      'uniform float uLanternInt;',
      'uniform vec3 uLanternCol;',
      'uniform vec3 uFogCol;',
      'uniform float uFogAmt;',
      'uniform float uHazeAmt;',
      'uniform float uUnderAmt;',
      'uniform vec3 uLiftCol;',
      'uniform float uExp;',
      'uniform float uWrap;',
      'uniform float uAoStr;',
      'uniform float uNormBoost;',
      'uniform float uAlbedoCont;',
      'uniform vec3 uWarmth;',
      'uniform float uSat;',
      'uniform float uCont;',
      'uniform mat4 uModel;',
      '',
      'vec3 srgbToLinear(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }',
      'vec3 linearToSrgb(vec3 c) { return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); }',
      'vec3 acesFilm(vec3 x) {',
      '  float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;',
      '  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);',
      '}',
      'vec3 lumContrast(vec3 c, float p, float pivot) {',
      '  float L = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.004);',
      '  float tL = pivot * pow(L / pivot, p);',
      '  return clamp(c * (tL / L), 0.0, 1.0);',
      '}',
      'vec2 evalTreeShadow(vec2 p, vec2 c, float r, vec2 shOff) {',
      '  float dc = length(p - c) / r;',
      '  float ds = length(p - (c + shOff * 0.55)) / (r * 1.12);',
      '  float ao = 1.0 - (1.0 - smoothstep(0.32, 1.15, dc)) * 0.34;',
      '  float sh = 1.0 - (1.0 - smoothstep(0.28, 1.18, ds)) * 0.52;',
      '  return vec2(ao, sh);',
      '}',
      'float evalWarmLight(vec3 pLight, vec3 wp, vec3 N, float falloff) {',
      '  vec3 d = pLight - wp;',
      '  float att = 1.0 / (1.0 + dot(d, d) * falloff);',
      '  float facing = max(dot(N, normalize(d)) * 0.62 + 0.38, 0.0);',
      '  return facing * att;',
      '}',
      '',
      'vec3 perturbNormal(vec3 N, vec3 pos, vec2 uv, vec3 mapN) {',
      '  vec3 dp1 = dFdx(pos);',
      '  vec3 dp2 = dFdy(pos);',
      '  vec2 duv1 = dFdx(uv);',
      '  vec2 duv2 = dFdy(uv);',
      '  vec3 dp2perp = cross(dp2, N);',
      '  vec3 dp1perp = cross(N, dp1);',
      '  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;',
      '  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;',
      '  float invmax = inversesqrt(max(dot(T, T), dot(B, B)) + 1e-6);',
      '  mat3 TBN = mat3(T * invmax, B * invmax, N);',
      '  return normalize(TBN * mapN);',
      '}',
      '',
      'void main() {',
      '  vec2 uv = vUV;',
      '  if (uFxMode == 1) {',
      '    uv.y = fract(uv.y - uTime * 1.15);',
      '    uv.x += sin(vLocalPos.y * 5.0 - uTime * 4.0) * 0.012;',
      '  }',
      '',
      '  vec4 baseSample = (uHasBaseTex == 1) ? TEX2D(uBaseTex, uv) : vec4(1.0);',
      '  vec3 albedo = srgbToLinear(baseSample.rgb) * uBaseColor.rgb;',
      '  float alpha = baseSample.a * uBaseColor.a;',
      '  if (uAlphaCutoff > 0.0 && alpha < uAlphaCutoff) discard;',
      '',
      '  if (uFxMode == 2) {',
      '    float shim = 0.88 + 0.16 * sin(uTime * 4.5 + length(uv - 0.5) * 24.0);',
      '    albedo *= shim;',
      '  }',
      '',
      '  vec3 Ngeom = normalize(vWorldNorm);',
      '  if (!gl_FrontFacing) Ngeom = -Ngeom;',
      '  vec3 N = Ngeom;',
      '  float cavity = 1.0;',
      '  if (uHasNormTex == 1) {',
      '    vec3 rawN = TEX2D(uNormTex, uv).xyz * 2.0 - 1.0;',
      '    float slope = length(rawN.xy);',
      '    cavity = 1.0 - clamp(slope * 0.62, 0.0, 0.38) * uAoStr;',
      '    vec3 mapN = vec3(rawN.xy * uNormalScale * uNormBoost, rawN.z);',
      '    N = perturbNormal(Ngeom, vWorldPos, uv, mapN);',
      '  }',
      '',
      '  // Material-specific albedo micro-contrast & tonal harmony matched to 效果图',
      '  float aL = max(dot(albedo, vec3(0.2126, 0.7152, 0.0722)), 0.004);',
      '  if (uMatKind == 1) {',
      '    // Stone & stairs: crisp mortar contrast, clean sandstone balance & subtle block weathering',
      '    float isStone = 1.0 - smoothstep(0.02, 0.12, albedo.g - albedo.r);',
      '    albedo = lumContrast(albedo, uAlbedoCont, 0.45);',
      '    albedo *= mix(vec3(1.0), vec3(1.00, 0.96, 0.90), isStone);',
      '    float sVar = sin(vLocalPos.x * 3.1 + vLocalPos.y * 2.4) * cos(vLocalPos.z * 2.9 - vLocalPos.y * 1.7);',
      '    albedo *= mix(vec3(0.95, 0.95, 0.97), vec3(1.05, 1.02, 0.96), sVar * 0.5 + 0.5);',
      '  } else if (uMatKind == 2) {',
      '    // Terracotta roofs: warm burnt-clay richness & deeper stepped shingle relief',
      '    albedo = mix(albedo, vec3(aL * 1.20, aL * 0.90, aL * 0.66), 0.18);',
      '    albedo = lumContrast(albedo, uAlbedoCont * 1.05, 0.22) * vec3(1.04, 1.01, 0.90);',
      '    float tierGrad = 0.93 + 0.12 * fract(vLocalPos.y * 4.0);',
      '    albedo *= tierGrad;',
      '  } else if (uMatKind == 3) {',
      '    // Meadow grass: warmer sunlit olive-green with organic multi-scale tonal patches',
      '    float isGreen = smoothstep(0.01, 0.12, albedo.g - albedo.r * 0.78);',
      '    vec3 meadow = mix(albedo, vec3(aL * 1.12, aL * 0.98, aL * 0.66), 0.28);',
      '    meadow = lumContrast(meadow, 1.0 + (uAlbedoCont - 1.0) * 0.55, 0.36) * vec3(1.08, 0.82, 0.92);',
      '    float gPatch = 0.5 + 0.5 * (0.58 * sin(vLocalPos.x * 1.15 + vLocalPos.z * 0.85) * cos(vLocalPos.x * 0.72 - vLocalPos.z * 1.32) + 0.42 * sin(vLocalPos.x * 2.55 - vLocalPos.z * 2.10 + 1.4));',
      '    vec3 patchCol = mix(vec3(0.82, 0.89, 0.84), vec3(1.14, 1.08, 0.92), gPatch);',
      '    albedo = mix(albedo * vec3(0.92, 0.88, 0.84), meadow * patchCol, isGreen);',
      '  } else if (uMatKind == 4) {',
      '    // Tree leaves & vines: lush layered foliage with sunlit crowns & deeper olive undersides',
      '    float isLeaf = smoothstep(0.02, 0.12, albedo.g - albedo.b * 0.95);',
      '    vec3 foliage = mix(albedo, vec3(aL * 1.04, aL * 1.00, aL * 0.68), 0.22);',
      '    foliage = lumContrast(foliage, uAlbedoCont * 0.92, 0.30) * vec3(1.04, 0.80, 0.92);',
      '    float crown = smoothstep(-0.35, 0.65, Ngeom.y) * 0.55 + 0.45 * smoothstep(0.45, 2.25, vLocalPos.y);',
      '    foliage *= mix(vec3(0.76, 0.84, 0.82), vec3(1.12, 1.08, 0.88), crown);',
      '    albedo = mix(albedo, foliage, isLeaf);',
      '  } else if (uMatKind == 5) {',
      '    // Cliff rock underside: cooler weathered stone, sharper terrace stratification & crack contrast',
      '    albedo = lumContrast(albedo, uAlbedoCont * 1.22, 0.34) * vec3(0.71, 0.70, 0.70);',
      '    float strata = 0.88 + 0.20 * fract(vLocalPos.y * 1.85);',
      '    albedo *= strata;',
      '  } else if (uMatKind == 0 && uFxMode == 0) {',
      '    albedo = lumContrast(albedo, mix(1.0, uAlbedoCont, 0.32), 0.42);',
      '  }',
      '',
      '  vec3 V = normalize(uEye - vWorldPos);',
      '  vec3 L = normalize(uSunDir);',
      '  vec3 H = normalize(L + V);',
      '',
      '  float NdotLraw = dot(N, L);',
      '  float NdotL = max(NdotLraw, 0.0);',
      '  float NdotV = max(dot(N, V), 0.001);',
      '  float NdotH = max(dot(N, H), 0.0);',
      '',
      '  // GGX-inspired specular + preset-tuned wrap diffuse for crisp voxel modeling',
      '  float rough = clamp(uRoughness, 0.08, 1.0);',
      '  float a2 = rough * rough * rough * rough;',
      '  float denom = (NdotH * NdotH * (a2 - 1.0) + 1.0);',
      '  float D = a2 / (3.14159 * denom * denom + 1e-5);',
      '  vec3 F0 = mix(vec3(0.04), albedo, uMetallic);',
      '  vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);',
      '  vec3 spec = (D * F) * 0.25 / (NdotL + NdotV + 0.25);',
      '  vec3 kD = (1.0 - F) * (1.0 - uMetallic);',
      '',
      '  // Analytical contact AO, directional cast shadows & sculptural island underside 实',
      '  float contactAO = 1.0;',
      '  float castShd = 1.0;',
      '  float underAO = 1.0;',
      '  float underDirect = 1.0;',
      '  float belowRim = 0.0;',
      '  if (uIsCreature == 0) {',
      '    // Model-space sun vector so cast shadows track sun direction as island yaws',
      '    vec3 Lloc = normalize(vec3(dot(uModel[0].xyz, L), dot(uModel[1].xyz, L), dot(uModel[2].xyz, L)));',
      '    vec2 shOff = -Lloc.xz / max(Lloc.y, 0.38);',
      '    float shLen = length(shOff);',
      '    if (shLen > 1.35) shOff *= (1.35 / shLen);',
      '',
      '    // Meadow & stairs ground contact shadows',
      '    float onGround = (1.0 - smoothstep(0.04, 0.28, abs(vLocalPos.y))) * smoothstep(0.20, 0.65, Ngeom.y);',
      '    if (onGround > 0.01) {',
      '      float cAO = 1.0;',
      '      float cSh = 1.0;',
      '      // Castle footprint contact AO + cast shadow on lawn',
      '      vec2 cp = abs(vLocalPos.xz) - vec2(1.92);',
      '      float dCastle = max(cp.x, cp.y);',
      '      if (dCastle > -0.15) {',
      '        cAO *= 1.0 - (1.0 - smoothstep(0.0, 0.78, max(dCastle, 0.0))) * 0.28;',
      '        vec2 sp = abs(vLocalPos.xz - shOff * 0.92) - vec2(1.98);',
      '        float dSh = max(sp.x, sp.y);',
      '        cSh *= 1.0 - (1.0 - smoothstep(-0.15, 0.68, dSh)) * 0.50;',
      '      }',
      '      // 5 voxel tree canopy contact & cast shadows (matching widened build_castle_island.py coords)',
      '      vec2 ts1 = evalTreeShadow(vLocalPos.xz, vec2(-4.75,  0.50), 0.96, shOff);',
      '      vec2 ts2 = evalTreeShadow(vLocalPos.xz, vec2( 4.75,  0.50), 0.96, shOff);',
      '      vec2 ts3 = evalTreeShadow(vLocalPos.xz, vec2( 3.75,  3.50), 0.72, shOff);',
      '      vec2 ts4 = evalTreeShadow(vLocalPos.xz, vec2(-3.75, -3.50), 0.92, shOff);',
      '      vec2 ts5 = evalTreeShadow(vLocalPos.xz, vec2( 3.75, -3.50), 0.92, shOff);',
      '      cAO *= ts1.x * ts2.x * ts3.x * ts4.x * ts5.x;',
      '      cSh *= ts1.y * ts2.y * ts3.y * ts4.y * ts5.y;',
      '      contactAO *= mix(1.0, cAO, onGround * uAoStr);',
      '      castShd *= mix(1.0, cSh, onGround * uAoStr);',
      '    }',
      '',
      '    // Architectural wall-base grounding & under-cornice eave occlusion',
      '    if (vLocalPos.y >= 0.0) {',
      '      float baseBand = 1.0 - smoothstep(0.0, 0.52, vLocalPos.y);',
      '      float keepCornice = smoothstep(3.52, 3.96, vLocalPos.y) * (1.0 - smoothstep(3.98, 4.10, vLocalPos.y)) * (1.0 - smoothstep(0.88, 1.18, max(abs(vLocalPos.x), abs(vLocalPos.z))));',
      '      float towerCornice = smoothstep(1.75, 2.08, vLocalPos.y) * (1.0 - smoothstep(2.12, 2.25, vLocalPos.y));',
      '      float archAO = (1.0 - baseBand * 0.14) * (1.0 - keepCornice * 0.24) * (1.0 - towerCornice * 0.12);',
      '      contactAO *= mix(1.0, archAO, uAoStr);',
      '    }',
      '',
      '    // Sculptural island underside rock 实: overhang self-shadow, dark downward faces & recessed crevices',
      '    belowRim = smoothstep(0.05, -0.45, vLocalPos.y);',
      '    float depthNorm = clamp((-vLocalPos.y - 0.25) / 4.45, 0.0, 1.0);',
      '    float rLocal = length(vLocalPos.xz);',
      '    float rNorm = clamp(rLocal / 6.45, 0.0, 1.0);',
      '    float expectedR = mix(6.35, 1.95, depthNorm);',
      '    float recessAO = mix(0.48, 1.0, smoothstep(-1.55, 0.25, rLocal - expectedR));',
      '    float depthAO = mix(1.0, 0.23 + 0.77 * smoothstep(-4.65, -0.10, vLocalPos.y), uUnderAmt);',
      '    float downAO = mix(1.0, mix(0.26, 1.0, smoothstep(-0.82, 0.28, Ngeom.y)), belowRim * uUnderAmt);',
      '    float rawUnderAO = depthAO * downAO * mix(1.0, recessAO, belowRim * uUnderAmt);',
      '    underAO = max(mix(1.0, rawUnderAO, uAoStr), 0.16);',
      '    float overhangShd = mix(1.0, smoothstep(0.20, 0.94, rNorm) * (1.0 - 0.76 * depthNorm), belowRim);',
      '    float downSunCut = mix(1.0, smoothstep(-0.48, 0.22, Ngeom.y), belowRim);',
      '    underDirect = mix(1.0, overhangShd * downSunCut, uUnderAmt);',
      '  }',
      '',
      '  float wrapL = max((NdotLraw + uWrap) / (1.0 + uWrap), 0.0);',
      '  float dirCavity = mix(1.0, cavity, 0.55);',
      '  vec3 direct = (kD * albedo * wrapL / 3.14159 + spec * NdotL) * uSunCol * uSunInt * 2.4 * dirCavity * castShd * underDirect;',
      '',
      '  // Hemisphere sky/ground ambient + directional shadow-side & underside plate-matched sky fill',
      '  float hemi = N.y * 0.5 + 0.5;',
      '  vec3 hemiCol = mix(uGndCol, uSkyCol, hemi);',
      '  float shdWeight = clamp(-NdotLraw * 0.5 + 0.5, 0.0, 1.0) * 0.36;',
      '  vec3 ambCol = mix(hemiCol, uShdCol, shdWeight);',
      '  ambCol = mix(ambCol, uShdCol * 0.76, belowRim * 0.48);',
      '  vec3 amb = ambCol * albedo * uAmbInt * underAO * contactAO * cavity;',
      '',
      '  // Soft atmospheric horizon light-wrap (modest rim so silhouette integrates into plate air)',
      '  float fres = pow(1.0 - NdotV, 3.0);',
      '  float rimN = max(dot(N, normalize(uRimDir)) * 0.5 + 0.5, 0.0);',
      '  vec3 rim = uRimCol * fres * rimN * uRimInt * (0.35 + 0.65 * albedo) * (1.0 - belowRim * 0.68);',
      '',
      '  // Warm point-light bounce from front archway, garden lantern, curtain wall windows & keep (masked above island underside)',
      '  vec3 pDoor   = (uModel * vec4( 0.00, 0.55,  2.15, 1.0)).xyz;',
      '  vec3 pGarden = (uModel * vec4(-1.40, 1.08,  3.25, 1.0)).xyz;',
      '  vec3 pRightW = (uModel * vec4( 2.18, 0.68,  0.05, 1.0)).xyz;',
      '  vec3 pLeftW  = (uModel * vec4(-2.18, 0.68,  0.05, 1.0)).xyz;',
      '  vec3 pBackW  = (uModel * vec4( 0.00, 0.68, -2.18, 1.0)).xyz;',
      '  vec3 pKeepF  = (uModel * vec4( 0.00, 3.12,  1.18, 1.0)).xyz;',
      '  float wSum = evalWarmLight(pDoor,   vWorldPos, N, 0.78)',
      '             + evalWarmLight(pGarden, vWorldPos, N, 0.86) * 1.10',
      '             + evalWarmLight(pRightW, vWorldPos, N, 0.82) * 0.95',
      '             + evalWarmLight(pLeftW,  vWorldPos, N, 0.82) * 0.72',
      '             + evalWarmLight(pBackW,  vWorldPos, N, 0.82) * 0.85',
      '             + evalWarmLight(pKeepF,  vWorldPos, N, 0.68) * 0.65;',
      '  float aboveIsland = (uIsCreature == 0) ? smoothstep(-0.35, 0.15, vLocalPos.y) : 0.25;',
      '  vec3 warmBounce = albedo * uLanternCol * wSum * uLanternInt * 0.78 * aboveIsland;',
      '',
      '  // Emissive (windows & lanterns stay incandescent warm independent of moonlit cooling)',
      '  vec3 emCol = uEmissive;',
      '  if (uHasEmTex == 1) emCol *= srgbToLinear(TEX2D(uEmTex, uv).rgb);',
      '  float emMult = (uFxMode == 1 || uFxMode == 2) ? (0.7 + 0.3 * uEmScale) : uEmScale;',
      '  vec3 emissive = emCol * uEmissiveStr * emMult;',
      '',
      '  vec3 litCol = (direct + amb + rim) * uWarmth + warmBounce;',
      '',
      '  // Plate atmospheric integration: gentle aerial perspective, soft edge air-blend & lowest-tip mist 虚',
      '  float camDist = length(uEye - vWorldPos);',
      '  float depthF = clamp((camDist - 21.0) / 18.0, 0.0, 1.0);',
      '  float heightF = 1.0 - smoothstep(-1.5, 6.2, vLocalPos.y) * 0.45;',
      '  float edgeWrap = pow(1.0 - NdotV, 3.2) * 0.28;',
      '  float airHaze = uHazeAmt * ((0.52 + 0.48 * depthF) * heightF + edgeWrap);',
      '  if (uFxMode == 3 || uIsCreature == 1) airHaze *= 0.52;',
      '  if (uFxMode == 2) airHaze *= 0.35;',
      '  float tipMask = (uIsCreature == 0) ? pow(1.0 - smoothstep(-4.75, -2.45, vLocalPos.y), 1.35) : 0.0;',
      '  float tipMist = tipMask * uFogAmt;',
      '  if (uFxMode == 1) tipMist *= 0.35;',
      '  if (uFxMode == 2) tipMist = 0.0;',
      '  vec3 fogLin = srgbToLinear(mix(uFogCol, uLiftCol * 1.05, tipMask * 0.56));',
      '  float totalHaze = clamp(airHaze + tipMist * (1.0 - airHaze), 0.0, 0.62);',
      '  vec3 col = mix(litCol, fogLin, totalHaze) + emissive * (1.0 - totalHaze * 0.30);',
      '',
      '  // ACES Filmic Tone Mapping + sRGB + gentle saturation & smoothstep contrast',
      '  col = linearToSrgb(acesFilm(col * uExp));',
      '  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));',
      '  col = clamp(mix(vec3(luma), col, uSat), 0.0, 1.0);',
      '  vec3 sc = col * col * (3.0 - 2.0 * col);',
      '  col = clamp(mix(col, sc, uCont), 0.0, 1.0);',
      '  OUTCOLOR = vec4(col * alpha, alpha);',
      '}'
    ].join('\n');

    return { vs: vs, fs: fs };
  }

  /* ---------- GLSL Billboard Sprite Shaders (WebGL2 & WebGL1 compatible) ---------- */
  function buildSpriteShaders(isWebGL2) {
    var vsHeader = isWebGL2
      ? '#version 300 es\n#define ATTR in\n#define VARY out\n'
      : 'precision highp float;\n#define ATTR attribute\n#define VARY varying\n';

    var fsHeader = isWebGL2
      ? '#version 300 es\nprecision highp float;\nprecision highp int;\n#define VARY in\n#define TEX2D texture\nout vec4 fragOut;\n#define OUTCOLOR fragOut\n'
      : 'precision highp float;\nprecision highp int;\n#define VARY varying\n#define TEX2D texture2D\n#define OUTCOLOR gl_FragColor\n';

    var vs = vsHeader + [
      'precision highp float;',
      'precision highp int;',
      'ATTR vec2 aQ;',
      'uniform mat4 uVP;',
      'uniform vec3 uPos;',
      'uniform vec3 uRight;',
      'uniform vec3 uFwd;',
      'uniform vec3 uEye;',
      'uniform vec2 uSz;',
      'uniform vec4 uUV;',
      'uniform float uRoll;',
      'uniform float uFlip;',
      'uniform float uMode;', // 0 = sprite billboard, 2 = ground contact shadow, 3 = under-island mist lift-shadow
      'VARY vec2 vUV;',
      'VARY vec2 vQ;',
      'void main() {',
      '  vQ = aQ;',
      '  vec3 p;',
      '  if (uMode > 2.5) {',
      '    p = uPos + uRight * (aQ.x * uSz.x) + uFwd * ((aQ.y - 0.5) * uSz.y);',
      '  } else if (uMode > 1.5) {',
      '    p = uPos + uRight * (aQ.x * uSz.x) + vec3(0.0, 0.018, 0.0) + uFwd * ((aQ.y - 0.5) * uSz.y);',
      '  } else {',
      '    vec2 l = vec2(aQ.x * uSz.x, (aQ.y - 0.5) * uSz.y);',
      '    float cs = cos(uRoll), sn = sin(uRoll);',
      '    l = vec2(l.x * cs - l.y * sn, l.x * sn + l.y * cs);',
      '    l.y += 0.5 * uSz.y;',
      '    vec3 toEye = normalize(uEye - uPos);',
      '    p = uPos + uRight * l.x + vec3(0.0, l.y, 0.0) + toEye * 0.04;',
      '  }',
      '  gl_Position = uVP * vec4(p, 1.0);',
      '  float u = uFlip > 0.5 ? (0.5 - aQ.x) : (aQ.x + 0.5);',
      '  vUV = vec2(mix(uUV.x, uUV.z, u), mix(uUV.w, uUV.y, aQ.y));',
      '}'
    ].join('\n');

    var fs = fsHeader + [
      'uniform sampler2D uTex;',
      'uniform float uMode;',
      'uniform float uAlpha;',
      'uniform float uShim;',
      'uniform float uTime;',
      'uniform vec3 uTint;',
      'VARY vec2 vUV;',
      'VARY vec2 vQ;',
      'void main() {',
      '  if (uMode > 2.5) {',
      '    // Soft premultiplied-alpha mist lift-shadow under the floating island (yaws with island)',
      '    vec2 d = vec2(vQ.x, vQ.y - 0.5) * 2.0;',
      '    float r2 = dot(d, d);',
      '    if (r2 >= 1.0) discard;',
      '    float ang = (r2 > 1e-6) ? atan(d.y, d.x) : 0.0;',
      '    float lobe = 1.0 + 0.06 * cos(ang * 4.0 + 0.4) + 0.04 * sin(ang * 3.0 - 0.8);',
      '    float r = sqrt(r2) / lobe;',
      '    float core = exp(-r * r * 3.4);',
      '    float halo = exp(-r * r * 1.38) * 0.50;',
      '    float edgeFade = 1.0 - smoothstep(0.68, 1.0, r);',
      '    float a = clamp((core * 0.78 + halo) * edgeFade, 0.0, 1.0) * uAlpha;',
      '    if (a < 0.003) discard;',
      '    vec3 col = mix(uTint * 1.12, uTint * 0.76, core);',
      '    OUTCOLOR = vec4(col * a, a);',
      '    return;',
      '  }',
      '  if (uMode > 1.5) {',
      '    vec2 d = vec2(vQ.x, vQ.y - 0.5) * 2.0;',
      '    float a = (1.0 - smoothstep(0.15, 1.0, dot(d, d))) * 0.24 * uAlpha;',
      '    if (a < 0.004) discard;',
      '    OUTCOLOR = vec4(vec3(0.10, 0.14, 0.08) * a, a);',
      '    return;',
      '  }',
      '  vec4 c = TEX2D(uTex, vUV);',
      '  if (c.a < 0.03) discard;',
      '  if (uShim > 0.0) {',
      '    vec3 s = c.rgb / max(c.a, 0.001);',
      '    float b = smoothstep(0.08, 0.30, s.b - max(s.r, s.g * 0.92));',
      '    float w = 0.5 + 0.5 * sin(uTime * 3.6 - vUV.y * 70.0 + vUV.x * 30.0);',
      '    c.rgb += vec3(0.55, 0.85, 1.0) * b * (0.10 + 0.32 * w * w) * uShim * c.a;',
      '  }',
      '  c.rgb *= uTint;',
      '  OUTCOLOR = c * uAlpha;',
      '}'
    ].join('\n');

    return { vs: vs, fs: fs };
  }

  /* ---------- Minimal Spec-Compliant GLB (glTF 2.0 Binary) Loader ---------- */
  function parseGLB(arrayBuffer) {
    var dv = new DataView(arrayBuffer);
    if (dv.getUint32(0, true) !== 0x46546C67) {
      throw new Error('Not a valid GLB file');
    }
    var version = dv.getUint32(4, true);
    if (version !== 2) throw new Error('Unsupported glTF version: ' + version);

    var json = null, bin = null;
    var offset = 12;
    while (offset < dv.byteLength) {
      var chunkLen = dv.getUint32(offset, true);
      var chunkType = dv.getUint32(offset + 4, true);
      offset += 8;
      if (chunkType === 0x4E4F534A) { // JSON
        var text = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer, offset, chunkLen));
        json = JSON.parse(text);
      } else if (chunkType === 0x004E4942) { // BIN
        bin = arrayBuffer.slice(offset, offset + chunkLen);
      }
      offset += chunkLen;
    }
    if (!json || !bin) throw new Error('GLB missing JSON or BIN chunk');
    return { json: json, bin: bin };
  }

  function componentBytes(ct) {
    if (ct === 5120 || ct === 5121) return 1;
    if (ct === 5122 || ct === 5123) return 2;
    return 4;
  }

  function typeCount(t) {
    if (t === 'SCALAR') return 1;
    if (t === 'VEC2') return 2;
    if (t === 'VEC3') return 3;
    if (t === 'VEC4') return 4;
    if (t === 'MAT4') return 16;
    return 1;
  }

  function readAccessorFloat(gltf, bin, accIdx) {
    var acc = gltf.accessors[accIdx];
    var bv = gltf.bufferViews[acc.bufferView];
    var nComp = typeCount(acc.type);
    var cBytes = componentBytes(acc.componentType);
    var stride = bv.byteStride || (nComp * cBytes);
    var start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    var dv = new DataView(bin);
    var out = new Float32Array(acc.count * nComp);
    for (var i = 0; i < acc.count; i++) {
      var base = start + i * stride;
      for (var c = 0; c < nComp; c++) {
        var o = base + c * cBytes;
        var val = 0;
        if (acc.componentType === 5126) val = dv.getFloat32(o, true);
        else if (acc.componentType === 5123) val = acc.normalized ? dv.getUint16(o, true) / 65535 : dv.getUint16(o, true);
        else if (acc.componentType === 5122) val = acc.normalized ? Math.max(-1, dv.getInt16(o, true) / 32767) : dv.getInt16(o, true);
        else if (acc.componentType === 5121) val = acc.normalized ? dv.getUint8(o) / 255 : dv.getUint8(o);
        else if (acc.componentType === 5120) val = acc.normalized ? Math.max(-1, dv.getInt8(o) / 127) : dv.getInt8(o);
        out[i * nComp + c] = val;
      }
    }
    return { data: out, count: acc.count, min: acc.min, max: acc.max };
  }

  function readAccessorIndices(gltf, bin, accIdx) {
    var acc = gltf.accessors[accIdx];
    var bv = gltf.bufferViews[acc.bufferView];
    var cBytes = componentBytes(acc.componentType);
    var stride = bv.byteStride || cBytes;
    var start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    var dv = new DataView(bin);
    var use32 = acc.componentType === 5125;
    var out = use32 ? new Uint32Array(acc.count) : new Uint16Array(acc.count);
    for (var i = 0; i < acc.count; i++) {
      var o = start + i * stride;
      if (acc.componentType === 5125) out[i] = dv.getUint32(o, true);
      else if (acc.componentType === 5123) out[i] = dv.getUint16(o, true);
      else out[i] = dv.getUint8(o);
    }
    return { data: out, count: acc.count, glType: use32 ? 5125 : 5123 };
  }

  function decodeImageFromBufferView(gltf, bin, imgIdx) {
    var imgDef = gltf.images[imgIdx];
    var bv = gltf.bufferViews[imgDef.bufferView];
    var bytes = new Uint8Array(bin, bv.byteOffset || 0, bv.byteLength);
    var blob = new Blob([bytes], { type: imgDef.mimeType || 'image/png' });
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var im = new Image();
      im.onload = function () { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = function (err) { URL.revokeObjectURL(url); reject(err); };
      im.src = url;
    });
  }

  function isPow2(v) { return (v & (v - 1)) === 0; }

  /* ---------- Controller & Renderer Bootstrap ---------- */
  function initCastle3D(opts) {
    var stage = document.getElementById('stage');
    var canvas = document.getElementById('castle-3d');
    if (!stage || !canvas) return null;

    var reduceMq = matchMedia('(prefers-reduced-motion: reduce)');
    var stillMode = false;
    try { stillMode = new URLSearchParams(location.search).has('still'); } catch (err) {}
    var gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    var isGL2 = !!gl;
    if (!gl) {
      gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
      if (gl) {
        gl.getExtension('OES_standard_derivatives');
        gl.getExtension('OES_element_index_uint');
      }
    }
    if (!gl) {
      return {
        status: 'no-webgl',
        setTime: function () {},
        setVariant: function () {},
        resetView: function () {},
        turnBack: function () {},
        getCanvas: function () { return null; }
      };
    }

    var anisoExt = gl.getExtension('EXT_texture_filter_anisotropic') ||
      gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') ||
      gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
    var maxAniso = anisoExt ? Math.min(8, gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 4) : 1;

    // Compile shader program
    var src = buildShaders(isGL2);
    function compile(type, code) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, code);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('[castle-3d] Shader compile error:', gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    }
    var vs = compile(gl.VERTEX_SHADER, src.vs);
    var fs = compile(gl.FRAGMENT_SHADER, src.fs);
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[castle-3d] Program link error:', gl.getProgramInfoLog(prog));
      return null;
    }

    var att = {
      pos: gl.getAttribLocation(prog, 'aPos'),
      norm: gl.getAttribLocation(prog, 'aNorm'),
      uv: gl.getAttribLocation(prog, 'aUV')
    };
    var uni = {};
    [
      'uModel', 'uVP', 'uTime', 'uFxMode', 'uMatKind', 'uIsCreature', 'uSplashCenter', 'uEye',
      'uBaseColor', 'uMetallic', 'uRoughness', 'uEmissive', 'uEmissiveStr',
      'uNormalScale', 'uAlphaCutoff', 'uHasBaseTex', 'uHasNormTex', 'uHasEmTex',
      'uBaseTex', 'uNormTex', 'uEmTex',
      'uSunDir', 'uSunCol', 'uSunInt', 'uSkyCol', 'uGndCol', 'uAmbInt', 'uShdCol',
      'uRimDir', 'uRimCol', 'uRimInt', 'uEmScale', 'uLanternInt', 'uLanternCol',
      'uFogCol', 'uFogAmt', 'uHazeAmt', 'uUnderAmt', 'uLiftCol', 'uExp', 'uWrap', 'uAoStr', 'uNormBoost', 'uAlbedoCont',
      'uWarmth', 'uSat', 'uCont'
    ].forEach(function (k) { uni[k] = gl.getUniformLocation(prog, k); });

    // 1x1 white fallback texture
    var whiteTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, whiteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

    // Sprite billboard program & quad VBO for the three official Duang characters
    var spriteSrc = buildSpriteShaders(isGL2);
    var spriteProg = null;
    var sAtt = { q: -1 };
    var sUni = {};
    var spriteBuf = null;
    var spriteTex = null;
    (function initSpritePipeline() {
      var svs = compile(gl.VERTEX_SHADER, spriteSrc.vs);
      var sfs = compile(gl.FRAGMENT_SHADER, spriteSrc.fs);
      if (!svs || !sfs) return;
      var sp = gl.createProgram();
      gl.attachShader(sp, svs);
      gl.attachShader(sp, sfs);
      gl.linkProgram(sp);
      if (!gl.getProgramParameter(sp, gl.LINK_STATUS)) {
        console.error('[castle-3d] Sprite program link error:', gl.getProgramInfoLog(sp));
        return;
      }
      spriteProg = sp;
      sAtt.q = gl.getAttribLocation(sp, 'aQ');
      ['uVP', 'uPos', 'uRight', 'uFwd', 'uEye', 'uSz', 'uUV', 'uRoll', 'uFlip', 'uMode', 'uTex', 'uAlpha', 'uShim', 'uTime', 'uTint']
        .forEach(function (k) { sUni[k] = gl.getUniformLocation(sp, k); });

      spriteBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 0, 0.5, 1, -0.5, 1]), gl.STATIC_DRAW);

      // Load official 1024x256 sprite atlas (WebP primary, PNG fallback, premultiplied alpha)
      var img = new Image();
      var triedPng = false;
      function fallbackPng() {
        if (triedPng) return;
        triedPng = true;
        img.src = 'assets/duang-sprites.png';
      }
      img.onload = function () {
        var t = gl.createTexture();
        try {
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          var canMip = isGL2 || (isPow2(img.width) && isPow2(img.height));
          if (canMip) {
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          } else {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          }
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          if (anisoExt && maxAniso > 1) {
            gl.texParameterf(gl.TEXTURE_2D, anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, maxAniso);
          }
          spriteTex = t;
          window.__spritesReady = img.currentSrc || img.src;
          if (opts && opts.onReady) opts.onReady(modelBounds);
        } catch (err) {
          console.warn('[castle-3d] Sprite atlas upload failed:', err);
          gl.deleteTexture(t);
          spriteTex = null;
          fallbackPng();
        } finally {
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        }
      };
      img.onerror = fallbackPng;
      img.src = 'assets/duang-sprites.webp';
    })();

    // Three official Duang characters in island/model glTF Y-up space (x, y_up, z = -y_blender)
    var heroes = {
      mecha: {
        name: 'mecha',
        key: 'mec_front',
        basePos: [-2.12, 0.0, 2.55], // Grass left of front gate & garden lantern, off stair slab
        pos: [-2.12, 0.0, 2.55],
        sx: 1, sy: 1, roll: 0, flip: false, shim: 0, shadow: 1
      },
      explorer: {
        name: 'explorer',
        key: 'exp_wave',
        basePos: [-3.08, 0.0, 2.32], // Left-front lawn waving, inside wooden fence & clear of trees
        pos: [-3.08, 0.0, 2.32],
        sx: 1, sy: 1, roll: 0, flip: false, shim: 0, shadow: 1
      },
      combat: {
        name: 'combat',
        key: 'combat',
        basePos: evalCombatPosGltf(0),
        pos: evalCombatPosGltf(0),
        sx: 1, sy: 1, roll: 0, flip: false, shim: 0.45, shadow: 0
      }
    };

    var drawablesOpaque = [];
    var drawablesBlend = [];
    var creatureDrawables = [];
    var modelBounds = { minY: -3.5, maxY: 7.5, radius: 5.0, centerY: 2.0 };
    var splashCenter = [1.95, 4.35];
    var modelLoaded = false;
    var modelStatus = 'loading';

    function classifyFx(name) {
      var nm = (name || '').toLowerCase();
      if (nm.indexOf('waterfall') >= 0 || nm.indexOf('water') >= 0) return 1;
      if (nm.indexOf('splash') >= 0) return 2;
      if (nm.indexOf('flag') >= 0) return 3;
      return 0;
    }

    function classifyMatKind(name) {
      var nm = (name || '').toLowerCase();
      if (nm.indexOf('stone') >= 0 || nm.indexOf('stair') >= 0) return 1;
      if (nm.indexOf('roof') >= 0) return 2;
      if (nm.indexOf('grass') >= 0) return 3;
      if (nm.indexOf('leaf') >= 0 || nm.indexOf('vine') >= 0) return 4;
      if (nm.indexOf('rock') >= 0) return 5;
      if (nm.indexOf('window') >= 0 || nm.indexOf('lantern') >= 0) return 6;
      return 0;
    }

    function createTexture(img, wrapRepeat) {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      var canMip = isGL2 || (isPow2(img.width) && isPow2(img.height));
      if (canMip) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      var wrap = (wrapRepeat && canMip) ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      if (anisoExt && maxAniso > 1) {
        gl.texParameterf(gl.TEXTURE_2D, anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, maxAniso);
      }
      return tex;
    }

    function loadModel(url) {
      return fetch(url).then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.arrayBuffer();
      }).then(function (buf) {
        var parsed = parseGLB(buf);
        var gltf = parsed.json;
        var bin = parsed.bin;

        // Decode all embedded images
        var imgPromises = (gltf.images || []).map(function (_, idx) {
          return decodeImageFromBufferView(gltf, bin, idx);
        });
        return Promise.all(imgPromises).then(function (imgs) {
          var glTexs = (gltf.textures || []).map(function (tDef) {
            var im = imgs[tDef.source];
            var imgName = ((gltf.images[tDef.source] && gltf.images[tDef.source].name) || '').toLowerCase();
            var wantRepeat = imgName.indexOf('water') >= 0;
            return createTexture(im, wantRepeat);
          });

          var mats = (gltf.materials || []).map(function (mDef) {
            var pbr = mDef.pbrMetallicRoughness || {};
            var bc = pbr.baseColorFactor || [1, 1, 1, 1];
            var em = mDef.emissiveFactor || [0, 0, 0];
            var emStr = 1.0;
            if (mDef.extensions && mDef.extensions.KHR_materials_emissive_strength) {
              emStr = mDef.extensions.KHR_materials_emissive_strength.emissiveStrength;
            }
            if (em[0] === 0 && em[1] === 0 && em[2] === 0 && !mDef.emissiveTexture) {
              emStr = 0.0;
            }
            return {
              name: mDef.name || '',
              kind: classifyMatKind(mDef.name),
              baseColor: bc,
              metallic: pbr.metallicFactor != null ? pbr.metallicFactor : 0.0,
              roughness: pbr.roughnessFactor != null ? pbr.roughnessFactor : 0.8,
              baseTex: pbr.baseColorTexture ? glTexs[pbr.baseColorTexture.index] : null,
              normTex: mDef.normalTexture ? glTexs[mDef.normalTexture.index] : null,
              normScale: (mDef.normalTexture && mDef.normalTexture.scale != null) ? mDef.normalTexture.scale : 1.0,
              emTex: mDef.emissiveTexture ? glTexs[mDef.emissiveTexture.index] : null,
              emissive: em,
              emissiveStr: emStr,
              alphaMode: mDef.alphaMode || 'OPAQUE',
              alphaCutoff: mDef.alphaMode === 'MASK' ? (mDef.alphaCutoff != null ? mDef.alphaCutoff : 0.5) : 0.0,
              doubleSided: !!mDef.doubleSided
            };
          });

          var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
          var spMinX = 1e9, spMaxX = -1e9, spMinZ = 1e9, spMaxZ = -1e9;

          function nodeLocalMatrix(nd) {
            if (nd.matrix) return new Float32Array(nd.matrix);
            var t = nd.translation || [0, 0, 0];
            var r = nd.rotation || [0, 0, 0, 1];
            var s = nd.scale || [1, 1, 1];
            return mat4FromTRS(t, r, s);
          }

          function parseCreatureInfo(nodeName, parentInfo) {
            var nm = (nodeName || '').toLowerCase();
            if (nm === 'fx_pterosaur') {
              return { kind: 'ptero', idx: 0, part: 'body' };
            }
            if (nm === 'fx_pterosaur_wingl') {
              return { kind: 'ptero', idx: 0, part: 'wingL' };
            }
            if (nm === 'fx_pterosaur_wingr') {
              return { kind: 'ptero', idx: 0, part: 'wingR' };
            }
            if (nm.indexOf('fx_pterosaur') === 0) {
              var pPart = nm.indexOf('wingl') >= 0 ? 'wingL' : (nm.indexOf('wingr') >= 0 ? 'wingR' : 'body');
              return { kind: 'ptero', idx: 0, part: pPart };
            }
            var bm = nm.match(/^fx_bird(?:_(\d+))?(?:_(wing[lr]))?$/);
            if (bm) {
              var bIdx = bm[1] ? Math.max(0, parseInt(bm[1], 10) - 1) : 0;
              var bPart = bm[2] === 'wingl' ? 'wingL' : (bm[2] === 'wingr' ? 'wingR' : 'body');
              return { kind: 'bird', idx: bIdx, part: bPart };
            }
            if (nm === 'fx_birds') {
              return { kind: 'flock', idx: 0, part: 'root' };
            }
            if (parentInfo && parentInfo.kind !== 'flock') {
              return { kind: parentInfo.kind, idx: parentInfo.idx, part: parentInfo.part };
            }
            return null;
          }

          function visitNode(nodeIdx, parentMat, parentCreature) {
            var nd = gltf.nodes[nodeIdx];
            var local = nodeLocalMatrix(nd);
            var world = mat4Mul(new Float32Array(16), parentMat, local);
            var cInfo = parseCreatureInfo(nd.name, parentCreature);
            var isSkyCreature = !!cInfo;

            if (nd.mesh != null) {
              var mesh = gltf.meshes[nd.mesh];
              var fxMode = classifyFx(nd.name || mesh.name);
              var cInfoFinal = cInfo || parseCreatureInfo(mesh.name, parentCreature);
              isSkyCreature = !!cInfoFinal;
              mesh.primitives.forEach(function (prim) {
                var posA = readAccessorFloat(gltf, bin, prim.attributes.POSITION);
                var normA = prim.attributes.NORMAL != null
                  ? readAccessorFloat(gltf, bin, prim.attributes.NORMAL)
                  : { data: new Float32Array(posA.count * 3) };
                var uvA = prim.attributes.TEXCOORD_0 != null
                  ? readAccessorFloat(gltf, bin, prim.attributes.TEXCOORD_0)
                  : { data: new Float32Array(posA.count * 2) };

                // Track castle+island bounding box (exclude flying sky creatures so camera framing never shifts)
                if (!isSkyCreature) {
                  for (var i = 0; i < posA.count; i++) {
                    var px = posA.data[i * 3], py = posA.data[i * 3 + 1], pz = posA.data[i * 3 + 2];
                    if (fxMode === 2) {
                      if (px < spMinX) spMinX = px; if (px > spMaxX) spMaxX = px;
                      if (pz < spMinZ) spMinZ = pz; if (pz > spMaxZ) spMaxZ = pz;
                    }
                    var wx = world[0] * px + world[4] * py + world[8] * pz + world[12];
                    var wy = world[1] * px + world[5] * py + world[9] * pz + world[13];
                    var wz = world[2] * px + world[6] * py + world[10] * pz + world[14];
                    if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
                    if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
                    if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
                  }
                }

                var posBuf = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
                gl.bufferData(gl.ARRAY_BUFFER, posA.data, gl.STATIC_DRAW);

                var normBuf = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
                gl.bufferData(gl.ARRAY_BUFFER, normA.data, gl.STATIC_DRAW);

                var uvBuf = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
                gl.bufferData(gl.ARRAY_BUFFER, uvA.data, gl.STATIC_DRAW);

                var idxBuf = null, idxCount = posA.count, idxType = 0;
                if (prim.indices != null) {
                  var ind = readAccessorIndices(gltf, bin, prim.indices);
                  idxBuf = gl.createBuffer();
                  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
                  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ind.data, gl.STATIC_DRAW);
                  idxCount = ind.count;
                  idxType = ind.glType;
                }

                var mat = prim.material != null ? mats[prim.material] : {
                  baseColor: [0.8, 0.8, 0.8, 1], metallic: 0, roughness: 0.8,
                  baseTex: null, normTex: null, normScale: 1, emTex: null,
                  emissive: [0, 0, 0], emissiveStr: 0, alphaMode: 'OPAQUE', alphaCutoff: 0, doubleSided: false
                };
                var creatureMeta = null;
                if (cInfoFinal) {
                  creatureMeta = {
                    kind: cInfoFinal.kind,
                    idx: cInfoFinal.idx,
                    part: cInfoFinal.part,
                    hinge: nd.translation ? nd.translation.slice() : [0, 0, 0],
                    baseWorld: world
                  };
                }
                var item = {
                  name: nd.name || mesh.name || '',
                  world: world,
                  posBuf: posBuf,
                  normBuf: normBuf,
                  uvBuf: uvBuf,
                  idxBuf: idxBuf,
                  idxCount: idxCount,
                  idxType: idxType,
                  mat: mat,
                  fxMode: fxMode || classifyFx(mat.name),
                  creature: creatureMeta
                };
                if (creatureMeta) creatureDrawables.push(item);
                if (mat.alphaMode === 'BLEND') drawablesBlend.push(item);
                else drawablesOpaque.push(item);
              });
            }
            if (nd.children) {
              nd.children.forEach(function (ci) { visitNode(ci, world, cInfo); });
            }
          }

          var scIdx = gltf.scene != null ? gltf.scene : 0;
          var rootNodes = (gltf.scenes && gltf.scenes[scIdx] && gltf.scenes[scIdx].nodes) || [];
          var ident = mat4Identity();
          rootNodes.forEach(function (ni) { visitNode(ni, ident, null); });

          if (spMaxX > spMinX && spMaxZ > spMinZ) {
            splashCenter = [(spMinX + spMaxX) * 0.5, (spMinZ + spMaxZ) * 0.5];
          }
          if (maxY > minY) {
            var spanX = maxX - minX, spanY = maxY - minY, spanZ = maxZ - minZ;
            modelBounds = {
              minY: minY,
              maxY: maxY,
              centerY: (minY + maxY) * 0.5,
              spanY: spanY,
              radius: Math.max(spanX, spanZ) * 0.5
            };
          }

          modelLoaded = true;
          modelStatus = 'ready';
          stage.classList.add('has-3d');
          stage.classList.remove('missing-3d');
          if (opts && opts.onReady) opts.onReady(modelBounds);
        });
      }).catch(function (err) {
        modelStatus = 'missing-glb';
        stage.classList.add('missing-3d');
        console.warn('[castle-3d] Could not load ' + url + ' yet:', err && err.message ? err.message : err);
        if (opts && opts.onMissing) opts.onMissing(err);
      });
    }

    /* ---------- 3D Interaction State (aligned with castle.js feel) ---------- */
    var state = {
      yaw: HERO_YAW,
      pitch: HERO_PITCH,
      vyaw: 0,
      zoom: 1.0,
      tZoom: 1.0,
      lastUser: -1e9,
      swing: 0,
      swingBase: null,
      variant: 'desktop'
    };

    var curLight = cloneLight(LIGHTS.day);
    var lightTween = null;
    var animYaw = null;
    var pointers = new Map();
    var drag = null;
    var pinchDist = 0;

    function isUI(target) {
      return !!(target && target.closest && target.closest('a, button, .top, .icp, #menu, .bar'));
    }

    function pairDist() {
      var it = pointers.values();
      var p1 = it.next().value, p2 = it.next().value;
      return Math.hypot(p2.x - p1.x, p2.y - p1.y);
    }

    stage.addEventListener('pointerdown', function (e) {
      if (e.button && e.button !== 0) return;
      if (isUI(e.target)) return;
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      state.vyaw = 0;
      animYaw = null;
      state.lastUser = performance.now();
      if (pointers.size === 1) {
        drag = {
          id: e.pointerId,
          x: e.clientX, y: e.clientY,
          lx: e.clientX, t: performance.now(),
          yaw: state.yaw, pitch: state.pitch,
          moved: 0
        };
      } else if (pointers.size === 2) {
        drag = null;
        pinchDist = Math.max(12, pairDist());
      }
    });

    stage.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      var now = performance.now();
      if (pointers.size === 1 && drag && e.pointerId === drag.id) {
        var dx = e.clientX - drag.x;
        var dy = e.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
        if (drag.moved > 5) stage.classList.add('dragging');
        var dt = Math.max(4, now - drag.t);
        state.vyaw = ((e.clientX - drag.lx) * 0.0085) / dt * 16;
        drag.lx = e.clientX;
        drag.t = now;
        state.yaw = drag.yaw + dx * 0.0085;
        state.pitch = clamp(drag.pitch + dy * 0.0038, MIN_PITCH, MAX_PITCH);
        state.lastUser = now;
      } else if (pointers.size >= 2) {
        var d = pairDist();
        if (pinchDist > 0) {
          state.tZoom = clamp(state.tZoom * (d / pinchDist), MIN_ZOOM, MAX_ZOOM);
        }
        pinchDist = Math.max(12, d);
        state.lastUser = now;
      }
    });

    function endPointer(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (drag && e.pointerId === drag.id) {
        stage._moved = drag.moved;
        drag = null;
        stage.classList.remove('dragging');
        state.lastUser = performance.now();
      }
      if (pointers.size < 2) pinchDist = 0;
    }
    stage.addEventListener('pointerup', endPointer);
    stage.addEventListener('pointercancel', endPointer);
    stage.addEventListener('lostpointercapture', endPointer);

    // Subtle zoom via mouse wheel / trackpad pinch on the 3D castle camera (background stays fixed)
    stage.addEventListener('wheel', function (e) {
      if (isUI(e.target)) return;
      e.preventDefault();
      var dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 24;
      else if (e.deltaMode === 2) dy *= 240;
      var sens = e.ctrlKey ? 0.0042 : 0.0010;
      state.tZoom = clamp(state.tZoom * Math.exp(-dy * sens), MIN_ZOOM, MAX_ZOOM);
      state.lastUser = performance.now();
    }, { passive: false });

    function resetView() {
      state.vyaw = 0;
      state.tZoom = 1.0;
      state.pitch = HERO_PITCH;
      var turns = Math.round((state.yaw - HERO_YAW) / (Math.PI * 2));
      animYaw = { from: state.yaw, to: turns * Math.PI * 2 + HERO_YAW, t: performance.now(), dur: 900 };
      state.lastUser = performance.now() + 1800;
    }

    function turnBack() {
      state.vyaw = 0;
      var showingBack = Math.cos(state.yaw) < 0;
      var tgt;
      if (showingBack) {
        tgt = Math.round((state.yaw - HERO_YAW) / (Math.PI * 2)) * Math.PI * 2 + HERO_YAW;
      } else {
        tgt = state.yaw + Math.PI;
      }
      animYaw = { from: state.yaw, to: tgt, t: performance.now(), dur: 1350 };
      state.lastUser = performance.now() + 2600;
    }

    stage.addEventListener('dblclick', function (e) {
      if (isUI(e.target)) return;
      resetView();
    });

    stage.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { state.yaw -= 0.28; state.vyaw = 0; animYaw = null; state.lastUser = performance.now(); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { state.yaw += 0.28; state.vyaw = 0; animYaw = null; state.lastUser = performance.now(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { state.pitch = clamp(state.pitch + 0.06, MIN_PITCH, MAX_PITCH); state.lastUser = performance.now(); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { state.pitch = clamp(state.pitch - 0.06, MIN_PITCH, MAX_PITCH); state.lastUser = performance.now(); e.preventDefault(); }
      else if (e.key === '+' || e.key === '=') { state.tZoom = clamp(state.tZoom + 0.08, MIN_ZOOM, MAX_ZOOM); e.preventDefault(); }
      else if (e.key === '-') { state.tZoom = clamp(state.tZoom - 0.08, MIN_ZOOM, MAX_ZOOM); e.preventDefault(); }
      else if (e.key === '0') { resetView(); e.preventDefault(); }
    });

    var turnBtn = document.getElementById('turn');
    if (turnBtn) {
      turnBtn.addEventListener('click', turnBack);
    }

    function setTime(t, immediate, durMs) {
      var target = LIGHTS[t] || LIGHTS.day;
      if (immediate) {
        curLight = cloneLight(target);
        lightTween = null;
      } else {
        lightTween = { from: cloneLight(curLight), to: target, t0: performance.now(), dur: durMs || 1200 };
      }
    }

    function setVariant(vKey) {
      state.variant = vKey || 'desktop';
    }

    /* ---------- Camera Framing (matches castle silhouette in desktop / iPad / phone empty plates) ---------- */
    var lastW = 0, lastH = 0;
    function resizeCanvas() {
      var w = stage.clientWidth || innerWidth;
      var h = stage.clientHeight || innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var pw = Math.max(1, Math.round(w * dpr));
      var ph = Math.max(1, Math.round(h * dpr));
      if (pw !== lastW || ph !== lastH) {
        lastW = pw; lastH = ph;
        canvas.width = pw; canvas.height = ph;
        gl.viewport(0, 0, pw, ph);
      }
      return { w: w, h: h, aspect: w / Math.max(1, h) };
    }

    function computeCamera(aspect) {
      var fov = 34 * Math.PI / 180;
      var spanY = modelBounds.spanY || 10.5;
      var radius = modelBounds.radius || 4.0;
      var halfFov = fov * 0.5;

      // Target screen coverage matching reference renders (pulled back gently for the wider floating island):
      // Higher cy moves model DOWN on screen; lower cy moves model UP on screen.
      // Desktop: full castle + wider island + waterfall & splash framed cleanly below top nav bar
      // iPad: wide side margins so rotated island never clips, floating above foreground hill
      // Phone: generous side padding so full island width stays inside portrait viewport
      var distByH, distByW, targetYOffset;
      if (aspect >= 1.15) {
        distByH = (spanY * 0.5) / (Math.tan(halfFov) * 0.59);
        distByW = (radius * 1.16) / (Math.tan(halfFov) * aspect * 0.47);
        targetYOffset = 0.42;
      } else if (aspect >= 0.66) {
        distByH = (spanY * 0.5) / (Math.tan(halfFov) * 0.54);
        distByW = (radius * 1.14) / (Math.tan(halfFov) * aspect * 0.71);
        targetYOffset = -0.55;
      } else {
        distByH = (spanY * 0.5) / (Math.tan(halfFov) * 0.50);
        distByW = (radius * 1.14) / (Math.tan(halfFov) * aspect * 0.77);
        targetYOffset = -1.00;
      }

      var dist = Math.max(distByH, distByW) / state.zoom;
      var cy = modelBounds.centerY + targetYOffset;
      var eye = [
        0,
        cy + Math.sin(state.pitch) * dist,
        Math.cos(state.pitch) * dist
      ];
      var target = [0, cy, 0];
      var proj = mat4Perspective(fov, aspect, 0.25, 220.0);
      var view = mat4LookAt(eye, target, [0, 1, 0]);
      var vp = mat4Mul(new Float32Array(16), proj, view);
      return { eye: eye, vp: vp };
    }

    function drawList(list, rootMat, vp, eye, timeSec, L) {
      var sunDir = norm3(L.sunDir);
      var rimDir = norm3(L.rimDir);
      gl.uniformMatrix4fv(uni.uVP, false, vp);
      gl.uniform3fv(uni.uEye, eye);
      gl.uniform1f(uni.uTime, timeSec);
      gl.uniform2fv(uni.uSplashCenter, splashCenter);
      gl.uniform3fv(uni.uSunDir, sunDir);
      gl.uniform3fv(uni.uSunCol, L.sunCol);
      gl.uniform1f(uni.uSunInt, L.sunInt);
      gl.uniform3fv(uni.uSkyCol, L.skyCol);
      gl.uniform3fv(uni.uGndCol, L.gndCol);
      gl.uniform1f(uni.uAmbInt, L.ambInt);
      gl.uniform3fv(uni.uShdCol, L.shdCol);
      gl.uniform3fv(uni.uRimDir, rimDir);
      gl.uniform3fv(uni.uRimCol, L.rimCol);
      gl.uniform1f(uni.uRimInt, L.rimInt);
      gl.uniform1f(uni.uEmScale, L.emScale);
      gl.uniform1f(uni.uLanternInt, L.lanternInt);
      gl.uniform3fv(uni.uLanternCol, L.lanternCol);
      gl.uniform3fv(uni.uFogCol, L.fogCol);
      gl.uniform1f(uni.uFogAmt, L.fogAmt);
      gl.uniform1f(uni.uHazeAmt, L.hazeAmt);
      gl.uniform1f(uni.uUnderAmt, L.underAmt);
      gl.uniform3fv(uni.uLiftCol, L.liftCol);
      gl.uniform1f(uni.uExp, L.exp);
      gl.uniform1f(uni.uWrap, L.wrap);
      gl.uniform1f(uni.uAoStr, L.aoStr);
      gl.uniform1f(uni.uNormBoost, L.normBoost);
      gl.uniform1f(uni.uAlbedoCont, L.albedoCont);
      gl.uniform3fv(uni.uWarmth, L.warmth);
      gl.uniform1f(uni.uSat, L.sat);
      gl.uniform1f(uni.uCont, L.cont);

      var mTmp = new Float32Array(16);
      for (var i = 0; i < list.length; i++) {
        var d = list[i], m = d.mat;
        mat4Mul(mTmp, rootMat, d.world);
        gl.uniformMatrix4fv(uni.uModel, false, mTmp);
        gl.uniform1i(uni.uFxMode, d.fxMode);
        gl.uniform1i(uni.uMatKind, m.kind || 0);
        gl.uniform1i(uni.uIsCreature, d.creature ? 1 : 0);
        gl.uniform4fv(uni.uBaseColor, m.baseColor);
        gl.uniform1f(uni.uMetallic, m.metallic);
        gl.uniform1f(uni.uRoughness, m.roughness);
        gl.uniform3fv(uni.uEmissive, m.emissive);
        gl.uniform1f(uni.uEmissiveStr, m.emissiveStr);
        gl.uniform1f(uni.uNormalScale, m.normScale);
        gl.uniform1f(uni.uAlphaCutoff, m.alphaCutoff);

        if (m.doubleSided) gl.disable(gl.CULL_FACE);
        else { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, m.baseTex || whiteTex);
        gl.uniform1i(uni.uBaseTex, 0);
        gl.uniform1i(uni.uHasBaseTex, m.baseTex ? 1 : 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, m.normTex || whiteTex);
        gl.uniform1i(uni.uNormTex, 1);
        gl.uniform1i(uni.uHasNormTex, m.normTex ? 1 : 0);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, m.emTex || whiteTex);
        gl.uniform1i(uni.uEmTex, 2);
        gl.uniform1i(uni.uHasEmTex, m.emTex ? 1 : 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, d.posBuf);
        gl.enableVertexAttribArray(att.pos);
        gl.vertexAttribPointer(att.pos, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, d.normBuf);
        gl.enableVertexAttribArray(att.norm);
        gl.vertexAttribPointer(att.norm, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, d.uvBuf);
        gl.enableVertexAttribArray(att.uv);
        gl.vertexAttribPointer(att.uv, 2, gl.FLOAT, false, 0, 0);

        if (d.idxBuf) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, d.idxBuf);
          gl.drawElements(gl.TRIANGLES, d.idxCount, d.idxType, 0);
        } else {
          gl.drawArrays(gl.TRIANGLES, 0, d.idxCount);
        }
      }
    }

    function updateCreatures(tSec) {
      if (!creatureDrawables.length) return;
      var dtE = 0.02;
      var pteroBodyMat = null;
      var pteroFlap = 0;
      var birdBodyMats = {};
      var birdFlaps = {};

      for (var i = 0; i < creatureDrawables.length; i++) {
        var d = creatureDrawables[i];
        var c = d.creature;
        if (c.kind === 'ptero') {
          if (!pteroBodyMat) {
            var p0 = evalPteroPosGltf(tSec);
            var p1 = evalPteroPosGltf(tSec + dtE);
            var vel = [(p1[0] - p0[0]) / dtE, (p1[1] - p0[1]) / dtE, (p1[2] - p0[2]) / dtE];
            // Positive bank lifts right wing up (banking into CCW left turn)
            var bank = 0.22 + 0.06 * Math.sin(Math.PI * 2 * (tSec / 9.5));
            pteroBodyMat = mat4FlightBasis(p0, vel, bank);
            pteroFlap = evalPteroFlap(tSec);
          }
          if (c.part === 'wingL' || c.part === 'wingR') {
            var angP = (c.part === 'wingR') ? pteroFlap : -pteroFlap;
            var wMatP = mat4TranslateRotateZ(c.hinge[0], c.hinge[1], c.hinge[2], angP);
            d.world = mat4Mul(new Float32Array(16), pteroBodyMat, wMatP);
          } else {
            d.world = pteroBodyMat;
          }
        } else if (c.kind === 'bird') {
          var bi = c.idx;
          if (!birdBodyMats[bi]) {
            var b0 = evalBirdPosGltf(bi, tSec);
            var b1 = evalBirdPosGltf(bi, tSec + dtE);
            var bVel = [(b1[0] - b0[0]) / dtE, (b1[1] - b0[1]) / dtE, (b1[2] - b0[2]) / dtE];
            var sp = BIRD_SPECS[bi % BIRD_SPECS.length];
            // Negative bank dips right wing down (banking into CW right turn)
            var bBank = -(0.18 + 0.05 * Math.cos(Math.PI * 2 * (tSec / 9.5) + sp.ph));
            birdBodyMats[bi] = mat4FlightBasis(b0, bVel, bBank);
            birdFlaps[bi] = evalBirdFlap(bi, tSec);
          }
          if (c.part === 'wingL' || c.part === 'wingR') {
            var angB = (c.part === 'wingR') ? birdFlaps[bi] : -birdFlaps[bi];
            var wMatB = mat4TranslateRotateZ(c.hinge[0], c.hinge[1], c.hinge[2], angB);
            d.world = mat4Mul(new Float32Array(16), birdBodyMats[bi], wMatB);
          } else {
            d.world = birdBodyMats[bi];
          }
        } else if (c.kind === 'flock') {
          // Fallback orbit if a combined FX_Birds mesh is ever loaded
          var flockYaw = -Math.PI * 2 * (tSec / 9.5);
          var flockBob = Math.sin(Math.PI * 2 * (tSec / 4.75)) * 0.28;
          d.world = mat4Mul(new Float32Array(16), mat4RotateYTranslate(flockYaw, flockBob), c.baseWorld);
        }
      }
    }

    function updateHeroes(tSec, reduced) {
      // 1. Mecha: gentle breathing + waves every 7.5s for 2.0s (frozen on mec_front when reduced/still)
      var M = heroes.mecha;
      M.key = 'mec_front';
      M.pos[0] = M.basePos[0];
      M.pos[1] = M.basePos[1];
      M.pos[2] = M.basePos[2];
      M.sx = 1;
      M.sy = 1;
      M.roll = 0;
      M.flip = false;
      M.shim = 0;
      if (!reduced) {
        var br = Math.sin(tSec * 2.1);
        M.sy = 1 + 0.014 * br;
        M.sx = 1 - 0.006 * br;
        var wv = ((tSec + 3.0) % 7.5) / 2.0;
        if (wv < 1.0) {
          M.key = 'mec_wave';
          M.roll = Math.sin(wv * Math.PI * 4.0) * 0.045 * Math.min(1.0, bellCurve(wv) * 2.5);
        }
      }

      // 2. Explorer: stays on the left-front lawn waving (no running ring path in this pass)
      var E = heroes.explorer;
      E.key = 'exp_wave';
      E.pos[0] = E.basePos[0];
      E.pos[1] = E.basePos[1];
      E.pos[2] = E.basePos[2];
      E.sx = 1;
      E.sy = 1;
      E.roll = 0;
      E.flip = false;
      E.shim = 0;
      if (!reduced) {
        E.roll = Math.sin(tSec * 2.6) * 0.028;
        E.sy = 1 + 0.012 * Math.sin(tSec * 2.4 + 0.8);
        E.sx = 1 - 0.005 * Math.sin(tSec * 2.4 + 0.8);
        E.pos[1] = Math.max(0.0, Math.sin(tSec * 1.3)) * 0.018;
      }

      // 3. Combat: continuous side-to-side patrol behind the keep (parked cleanly on right side when reduced/still)
      var B = heroes.combat;
      B.key = 'combat';
      B.sx = 1;
      B.sy = 1;
      B.flip = false; // Never mirror so the 天圆地方 logo on chest & shield stays right-way-round
      if (reduced) {
        var restP = evalCombatPosGltf(0);
        B.pos[0] = restP[0];
        B.pos[1] = restP[1];
        B.pos[2] = restP[2];
        B.roll = 0;
        B.shim = 0.45;
      } else {
        var curP = evalCombatPosGltf(tSec);
        var nxtP = evalCombatPosGltf(tSec + 0.05);
        var vx = (nxtP[0] - curP[0]) / 0.05;
        B.pos[0] = curP[0];
        B.pos[1] = curP[1];
        B.pos[2] = curP[2];
        B.roll = Math.sin(tSec * 1.4) * 0.035 - clamp(vx * 0.028, -0.14, 0.14);
        B.shim = 0.70 + 0.30 * Math.sin(tSec * 2.4);
      }
    }

    function drawUnderShadow(rootMat, vp, eye, timeSec, L) {
      if (!spriteProg || !spriteBuf || sAtt.q < 0 || !L.liftAlpha || L.liftAlpha <= 0.001) return;

      gl.useProgram(spriteProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
      gl.enableVertexAttribArray(sAtt.q);
      gl.vertexAttribPointer(sAtt.q, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, spriteTex || whiteTex);
      gl.uniform1i(sUni.uTex, 0);
      gl.uniformMatrix4fv(sUni.uVP, false, vp);
      gl.uniform3fv(sUni.uEye, eye);
      gl.uniform1f(sUni.uTime, timeSec);
      gl.uniform3fv(sUni.uTint, L.liftCol || [0.20, 0.30, 0.43]);
      gl.uniform1f(sUni.uMode, 3.0);
      gl.uniform4f(sUni.uUV, 0.0, 0.0, 1.0, 1.0);
      gl.uniform1f(sUni.uRoll, 0.0);
      gl.uniform1f(sUni.uFlip, 0.0);
      gl.uniform1f(sUni.uShim, 0.0);

      gl.disable(gl.CULL_FACE);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      // Island-local horizontal basis transformed by rootMat so the mist lift-shadow yaws & bobs with the island
      var islandRight = [rootMat[0], rootMat[1], rootMat[2]];
      var islandFwd = [rootMat[8], rootMat[9], rootMat[10]];
      var sunDir = norm3(L.sunDir);
      gl.uniform3fv(sUni.uRight, islandRight);
      gl.uniform3fv(sUni.uFwd, islandFwd);

      // Layer A: Broad soft mist shadow bed directly below the chunkier island mass
      var pBed = transformPointMat4(rootMat, [0.12, -4.58, -0.12]);
      pBed[0] -= sunDir[0] * 0.42;
      pBed[2] -= sunDir[2] * 0.28;
      gl.uniform3fv(sUni.uPos, pBed);
      gl.uniform2f(sUni.uSz, 17.2, 14.5);
      gl.uniform1f(sUni.uAlpha, L.liftAlpha * 0.84);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Layer B: Tighter upper-mist shadow echo cupping the stepped lower rock silhouette
      var pEcho = transformPointMat4(rootMat, [0.12, -3.35, -0.12]);
      pEcho[0] -= sunDir[0] * 0.24;
      pEcho[2] -= sunDir[2] * 0.16;
      gl.uniform3fv(sUni.uPos, pEcho);
      gl.uniform2f(sUni.uSz, 14.6, 12.9);
      gl.uniform1f(sUni.uAlpha, L.liftAlpha * 0.54);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.disableVertexAttribArray(sAtt.q);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    function drawSprites(rootMat, vp, eye, timeSec, L) {
      if (!spriteProg || !spriteTex || !spriteBuf || sAtt.q < 0) return;

      // Disable unused attributes from the PBR program before switching to sprite program
      if (att.pos >= 0 && att.pos !== sAtt.q) gl.disableVertexAttribArray(att.pos);
      if (att.norm >= 0 && att.norm !== sAtt.q) gl.disableVertexAttribArray(att.norm);
      if (att.uv >= 0 && att.uv !== sAtt.q) gl.disableVertexAttribArray(att.uv);

      gl.useProgram(spriteProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
      gl.enableVertexAttribArray(sAtt.q);
      gl.vertexAttribPointer(sAtt.q, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, spriteTex);
      gl.uniform1i(sUni.uTex, 0);
      gl.uniformMatrix4fv(sUni.uVP, false, vp);
      gl.uniform3fv(sUni.uEye, eye);
      gl.uniform1f(sUni.uTime, timeSec);
      gl.uniform3fv(sUni.uTint, L.spriteTint || [1, 1, 1]);

      gl.disable(gl.CULL_FACE);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);

      // Transform model-space character anchors by rootMat (inherits island yaw + floating bob)
      var items = [heroes.mecha, heroes.explorer, heroes.combat].map(function (H) {
        var wp = transformPointMat4(rootMat, H.pos);
        var gp = transformPointMat4(rootMat, [H.pos[0], 0.0, H.pos[2]]);
        var dx = eye[0] - wp[0], dy = eye[1] - (wp[1] + 0.65), dz = eye[2] - wp[2];
        var dist = Math.hypot(dx, dy, dz);
        // Upright camera-facing horizontal basis: right = norm(cross(up, toEye)) = norm([dz, 0, -dx])
        var rl = Math.hypot(dz, dx) || 1;
        var rx = dz / rl, rz = -dx / rl;
        var fx = dx / rl, fz = dz / rl;
        return { H: H, wp: wp, gp: gp, dist: dist, right: [rx, 0, rz], fwd: [fx, 0, fz] };
      });
      // Sort back-to-front for clean alpha compositing
      items.sort(function (a, b) { return b.dist - a.dist; });

      // Sub-pass A: Soft ground contact shadows under grounded Duang characters
      for (var i = 0; i < items.length; i++) {
        var itS = items[i], HS = itS.H;
        if (!HS.shadow) continue;
        var aS = DUANG_ATLAS[HS.key];
        var wS = DUANG_HEIGHT[HS.key] * aS[4] * HS.sx;
        gl.uniform1f(sUni.uMode, 2.0);
        gl.uniform1f(sUni.uAlpha, Math.max(0.0, 1.0 - HS.pos[1] * 2.5));
        gl.uniform3fv(sUni.uPos, itS.gp);
        gl.uniform3fv(sUni.uRight, itS.right);
        gl.uniform3fv(sUni.uFwd, itS.fwd);
        gl.uniform2f(sUni.uSz, wS * 0.92, wS * 0.56);
        gl.uniform4f(sUni.uUV, aS[0], aS[1], aS[2], aS[3]);
        gl.uniform1f(sUni.uRoll, 0.0);
        gl.uniform1f(sUni.uFlip, 0.0);
        gl.uniform1f(sUni.uShim, 0.0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      // Sub-pass B: Character billboard sprites (depth-tested against castle & keep)
      for (var j = 0; j < items.length; j++) {
        var it = items[j], H = it.H;
        var a = DUANG_ATLAS[H.key];
        var hh = DUANG_HEIGHT[H.key] * H.sy;
        var ww = DUANG_HEIGHT[H.key] * a[4] * H.sx;
        gl.uniform1f(sUni.uMode, 0.0);
        gl.uniform1f(sUni.uAlpha, 1.0);
        gl.uniform3fv(sUni.uPos, it.wp);
        gl.uniform3fv(sUni.uRight, it.right);
        gl.uniform3fv(sUni.uFwd, it.fwd);
        gl.uniform2f(sUni.uSz, ww, hh);
        gl.uniform4f(sUni.uUV, a[0], a[1], a[2], a[3]);
        gl.uniform1f(sUni.uRoll, H.roll);
        gl.uniform1f(sUni.uFlip, H.flip ? 1.0 : 0.0);
        gl.uniform1f(sUni.uShim, H.shim);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      gl.disableVertexAttribArray(sAtt.q);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    /* ---------- Frame Update & Render ---------- */
    var simTime = 0;
    function render(now, dt, paused) {
      var sz = resizeCanvas();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!modelLoaded) return;

      var reduced = stillMode || reduceMq.matches || paused;
      if (!reduced) simTime += dt;
      updateCreatures(simTime);
      updateHeroes(simTime, reduced);

      // Interpolate lighting on time-of-day transitions
      if (lightTween) {
        var k = Math.min(1, (now - lightTween.t0) / lightTween.dur);
        var e = easeInOutCubic(k);
        var F = lightTween.from, T = lightTween.to;
        curLight = {
          sunDir: lerp3(F.sunDir, T.sunDir, e),
          sunCol: lerp3(F.sunCol, T.sunCol, e),
          sunInt: lerp(F.sunInt, T.sunInt, e),
          skyCol: lerp3(F.skyCol, T.skyCol, e),
          gndCol: lerp3(F.gndCol, T.gndCol, e),
          ambInt: lerp(F.ambInt, T.ambInt, e),
          shdCol: lerp3(F.shdCol, T.shdCol, e),
          rimDir: lerp3(F.rimDir, T.rimDir, e),
          rimCol: lerp3(F.rimCol, T.rimCol, e),
          rimInt: lerp(F.rimInt, T.rimInt, e),
          emScale: lerp(F.emScale, T.emScale, e),
          lanternInt: lerp(F.lanternInt, T.lanternInt, e),
          lanternCol: lerp3(F.lanternCol, T.lanternCol, e),
          fogCol: lerp3(F.fogCol, T.fogCol, e),
          fogAmt: lerp(F.fogAmt, T.fogAmt, e),
          hazeAmt: lerp(F.hazeAmt, T.hazeAmt, e),
          underAmt: lerp(F.underAmt, T.underAmt, e),
          liftCol: lerp3(F.liftCol, T.liftCol, e),
          liftAlpha: lerp(F.liftAlpha, T.liftAlpha, e),
          exp: lerp(F.exp, T.exp, e),
          wrap: lerp(F.wrap, T.wrap, e),
          aoStr: lerp(F.aoStr, T.aoStr, e),
          normBoost: lerp(F.normBoost, T.normBoost, e),
          albedoCont: lerp(F.albedoCont, T.albedoCont, e),
          warmth: lerp3(F.warmth, T.warmth, e),
          sat: lerp(F.sat, T.sat, e),
          cont: lerp(F.cont, T.cont, e),
          spriteTint: lerp3(F.spriteTint, T.spriteTint, e)
        };
        if (k >= 1) { curLight = cloneLight(T); lightTween = null; }
      }

      // Smooth zoom interpolation
      state.zoom += (state.tZoom - state.zoom) * Math.min(1, dt * 10);

      // Yaw update: turn animation -> release inertia -> gentle idle sway
      var idle = (now - state.lastUser) > 5200;
      if (animYaw) {
        var ak = Math.min(1, (now - animYaw.t) / animYaw.dur);
        state.yaw = animYaw.from + (animYaw.to - animYaw.from) * easeInOutCubic(ak);
        if (ak >= 1) animYaw = null;
      } else if (!drag && Math.abs(state.vyaw) > 0.0004) {
        state.yaw += state.vyaw * (dt * 60);
        state.vyaw *= Math.pow(0.93, dt * 60);
      } else if (!drag && idle && !reduced) {
        state.swing += dt;
        if (state.swingBase == null) state.swingBase = state.yaw;
        var tgtYaw = state.swingBase + Math.sin(state.swing * 0.24) * 0.30;
        state.yaw += (tgtYaw - state.yaw) * Math.min(1, dt * 1.1);
      }
      if (!idle || drag || animYaw) {
        state.swingBase = null;
        state.swing = 0;
      }

      // Sync "转到背面 / 转回正面" button label
      if (turnBtn) {
        var isBack = Math.cos(state.yaw) < 0;
        if (isBack !== turnBtn._back) {
          turnBtn._back = isBack;
          turnBtn.textContent = isBack ? '转回正面' : '转到背面';
          turnBtn.setAttribute('aria-label', isBack ? '把城堡和浮空岛转回正面' : '把城堡和浮空岛转到背面');
        }
      }

      // Gentle vertical levitation bob of the floating island
      var bobY = reduced ? 0 : Math.sin(simTime * 0.85) * 0.085;
      var rootMat = mat4RotateYTranslate(state.yaw, bobY);
      var cam = computeCamera(sz.aspect);

      // Pass 0: Soft premultiplied-alpha under-island lift-shadow in the valley mist (parented to rootMat, behind opaque island)
      drawUnderShadow(rootMat, cam.vp, cam.eye, simTime, curLight);

      gl.useProgram(prog);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);

      // Pass 1: Opaque geometry (overwrites Pass 0 wherever castle/island/creatures sit)
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      drawList(drawablesOpaque, rootMat, cam.vp, cam.eye, simTime, curLight);

      // Pass 2: Translucent water & splash (premultiplied alpha blend over canvas)
      if (drawablesBlend.length) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        drawList(drawablesBlend, rootMat, cam.vp, cam.eye, simTime, curLight);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }

      // Pass 3: Official Duang character billboard sprites (depth-tested against castle & keep)
      drawSprites(rootMat, cam.vp, cam.eye, simTime, curLight);
    }

    // Start loading GLB immediately
    loadModel(MODEL_URL);

    var api = {
      render: render,
      setTime: setTime,
      setVariant: setVariant,
      resetView: resetView,
      turnBack: turnBack,
      getCanvas: function () { return canvas; },
      status: function () { return modelStatus; },
      isLoaded: function () { return modelLoaded; },
      angles: function () { return { yaw: state.yaw, pitch: state.pitch, zoom: state.zoom }; },
      heroes: heroes
    };
    window.__castle3d = api;
    return api;
  }

  window.initCastle3D = initCastle3D;
})();
