/**
 * 三軍棋 3D — 共用工具層
 * ------------------------------------------------------------------
 * 幾何/材質快取、程序化 CanvasTexture、幾何合併、緩動函式、徽記建模。
 * 全部資源皆為程序生成，不依賴任何外部檔案。
 */
import * as THREE from 'three';

/* ================================================================== */
/* 基本工具                                                            */
/* ================================================================== */

export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** 可重現的亂數（mulberry32） */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => (--t) * t * t + 1,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

/* ================================================================== */
/* 幾何快取                                                            */
/* ================================================================== */
const geoCache = new Map();
function cached(key, factory) {
  let g = geoCache.get(key);
  if (!g) {
    g = factory();
    geoCache.set(key, g);
  }
  return g;
}

export const G = {
  box: (w, h, d) => cached(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rt, rb, h, seg = 16) =>
    cached(`cyl:${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)),
  sphere: (r, ws = 16, hs = 12) =>
    cached(`sph:${r}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, ws, hs)),
  cone: (r, h, seg = 16) => cached(`cone:${r}:${h}:${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  torus: (r, tube, rs = 8, ts = 24, arc = TAU) =>
    cached(`tor:${r}:${tube}:${rs}:${ts}:${arc}`, () => new THREE.TorusGeometry(r, tube, rs, ts, arc)),
  ring: (ri, ro, seg = 32) =>
    cached(`ring:${ri}:${ro}:${seg}`, () => new THREE.RingGeometry(ri, ro, seg)),
  circle: (r, seg = 32) => cached(`circle:${r}:${seg}`, () => new THREE.CircleGeometry(r, seg)),
  plane: (w, h, ws = 1, hs = 1) =>
    cached(`plane:${w}:${h}:${ws}:${hs}`, () => new THREE.PlaneGeometry(w, h, ws, hs)),
  capsule: (r, len, cap = 6, rad = 12) =>
    cached(`cap:${r}:${len}:${cap}:${rad}`, () => new THREE.CapsuleGeometry(r, len, cap, rad)),
  ico: (r, detail = 0) => cached(`ico:${r}:${detail}`, () => new THREE.IcosahedronGeometry(r, detail)),
  dodeca: (r) => cached(`dode:${r}`, () => new THREE.DodecahedronGeometry(r)),
  /**
   * 以 Shape 拉伸出的板狀幾何（沿 +z 拉伸，置中於 z 軸）
   * 用於星形、機翼、船體等特殊輪廓。
   */
  extrude(shape, depth = 0.02, bevel = 0.006) {
    const key = `ext:${shape.uuid}:${depth}:${bevel}`;
    return cached(key, () => {
      const g = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: bevel > 0,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 2,
        curveSegments: 12,
      });
      g.translate(0, 0, -depth / 2);
      return g;
    });
  },
};

/** 由座標點建立平滑的封閉 Shape */
export function shapeFromPoints(points) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  return s;
}

/** 五角星 Shape */
export function starShape(outer = 0.16, inner = 0.065, points = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

/* ================================================================== */
/* 材質快取                                                            */
/* ================================================================== */
const matCache = new Map();

/** 標準 PBR 材質（快取） */
export function M(color, opts = {}) {
  const key = `M:${color}:${JSON.stringify(opts)}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      metalness: opts.metalness ?? 0.2,
      roughness: opts.roughness ?? 0.6,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      flatShading: opts.flatShading ?? false,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      envMapIntensity: opts.envMapIntensity ?? 1,
      depthWrite: opts.depthWrite ?? true,
    });
    m.name = key;
    matCache.set(key, m);
  }
  return m;
}

/** 自發光材質（會吃到 Bloom） */
export function E(color, intensity = 1.6, opts = {}) {
  return M(0x000000, {
    emissive: color,
    emissiveIntensity: intensity,
    metalness: 0,
    roughness: 1,
    ...opts,
  });
}

/** 加亮透明材質（光暈、光環、粒子） */
export function Glow(color, opacity = 0.55, blending = THREE.AdditiveBlending, opts = {}) {
  const key = `G:${color}:${opacity}:${blending}:${JSON.stringify(opts)}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending,
      depthWrite: false,
      side: opts.side ?? THREE.DoubleSide,
      toneMapped: opts.toneMapped ?? false,
      fog: false,
    });
    matCache.set(key, m);
  }
  return m;
}

/** 常用材質表（全域共用，省記憶體） */
export const MAT = {
  gold: () => M(0xd9a93f, { metalness: 0.95, roughness: 0.24, envMapIntensity: 1.35 }),
  goldDark: () => M(0x8c6420, { metalness: 0.9, roughness: 0.38 }),
  brass: () => M(0xb08a4a, { metalness: 0.9, roughness: 0.32 }),
  silver: () => M(0xc8d2da, { metalness: 0.92, roughness: 0.22 }),
  steel: () => M(0x8e99a4, { metalness: 0.88, roughness: 0.32 }),
  darkSteel: () => M(0x3a4048, { metalness: 0.8, roughness: 0.42 }),
  gunmetal: () => M(0x24282e, { metalness: 0.85, roughness: 0.3 }),
  black: () => M(0x14161a, { metalness: 0.3, roughness: 0.7 }),
  rubber: () => M(0x1c1d1f, { metalness: 0.05, roughness: 0.95 }),
  skin: () => M(0xd9a173, { metalness: 0.05, roughness: 0.72 }),
  skinShadow: () => M(0xb27c50, { metalness: 0.05, roughness: 0.75 }),
  wood: () => M(0x6b4626, { metalness: 0.05, roughness: 0.8 }),
  woodDark: () => M(0x3c2716, { metalness: 0.05, roughness: 0.85 }),
  sandbag: () => M(0xbfa06a, { metalness: 0.02, roughness: 0.96 }),
  concrete: () => M(0x8c8c88, { metalness: 0.05, roughness: 0.9 }),
  stone: () => M(0x8a8378, { metalness: 0.04, roughness: 0.92 }),
  soil: () => M(0x6e5433, { metalness: 0.02, roughness: 1 }),
  glass: () => M(0x9fd8ff, {
    metalness: 0.35, roughness: 0.08, transparent: true, opacity: 0.42,
    envMapIntensity: 1.8, depthWrite: false, side: THREE.DoubleSide,
  }),
  gasGreen: () => M(0x74d64a, {
    metalness: 0.1, roughness: 0.35, transparent: true, opacity: 0.5,
    emissive: 0x2f8f22, emissiveIntensity: 0.9,
  }),
};

/* ================================================================== */
/* 程序化紋理                                                          */
/* ================================================================== */
let MAX_ANISO = 4;
export function setMaxAnisotropy(v) {
  MAX_ANISO = v;
}

const FONT_STACK =
  '"Noto Sans TC","Noto Sans CJK TC","Noto Serif CJK TC","Noto Serif TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function canvasTex(canvas, { srgb = true, wrap = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = MAX_ANISO;
  t.needsUpdate = true;
  if (wrap) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  } else {
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
  }
  return t;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 金色漸層文字 */
function goldText(ctx, text, x, y, size, { stroke = true, letter = 2, color = null } = {}) {
  ctx.save();
  ctx.font = `800 ${size}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${letter}px`;
  if (stroke) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(6,8,12,0.92)';
    ctx.lineWidth = size * 0.16;
    ctx.strokeText(text, x, y);
  }
  if (color) {
    ctx.fillStyle = color;
  } else {
    const g = ctx.createLinearGradient(0, y - size * 0.55, 0, y + size * 0.55);
    g.addColorStop(0, '#fffbe6');
    g.addColorStop(0.42, '#f6dc92');
    g.addColorStop(0.55, '#e0b25a');
    g.addColorStop(1, '#a97a2a');
    ctx.fillStyle = g;
  }
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** 棋子名牌：512 x 128，透明底 */
export function makeLabelTexture(text, { accent = '#e8c060', sideColor = '#c22b3a', branch = false } = {}) {
  const w = 512, h = 128;
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  // 底板
  roundRect(ctx, 10, 20, 492, 88, 20);
  ctx.fillStyle = 'rgba(9,13,19,0.82)';
  ctx.fill();
  // 外框（金）
  roundRect(ctx, 10, 20, 492, 88, 20);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  // 內框（陣營色）
  roundRect(ctx, 19, 29, 474, 70, 14);
  ctx.strokeStyle = sideColor;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.9;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 左右菱形裝飾
  for (const x of [38, 474]) {
    ctx.save();
    ctx.translate(x, 64);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
  }

  const size = branch ? 68 : text.length >= 3 ? 58 : 64;
  goldText(ctx, text, 256, 66, size, { letter: branch ? 8 : 4 });
  return canvasTex(cv);
}

/** 棋盤壓克力名牌 */
export function makePlaqueTexture() {
  const w = 1024, h = 320;
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d');
  // 底色：深藍黑玻璃
  const g0 = ctx.createLinearGradient(0, 0, 0, h);
  g0.addColorStop(0, 'rgba(16,22,32,0.96)');
  g0.addColorStop(0.5, 'rgba(10,14,21,0.98)');
  g0.addColorStop(1, 'rgba(22,16,12,0.96)');
  roundRect(ctx, 8, 8, w - 16, h - 16, 28);
  ctx.fillStyle = g0;
  ctx.fill();
  // 金框
  roundRect(ctx, 8, 8, w - 16, h - 16, 28);
  ctx.strokeStyle = '#d9b05a';
  ctx.lineWidth = 5;
  ctx.stroke();
  roundRect(ctx, 26, 26, w - 52, h - 52, 18);
  ctx.strokeStyle = 'rgba(217,176,90,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 標題
  goldText(ctx, '三 軍 棋', w / 2, 132, 128, { letter: 6 });
  // 副標
  ctx.save();
  ctx.font = `600 44px ${FONT_STACK}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '10px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c9b489';
  ctx.fillText('陸・海・空 三軍立體戰場', w / 2, 226);
  ctx.restore();
  // 三顆軍種小徽（右到左：陸 海 空）
  const labels = [
    ['陸', '#c8874a'],
    ['海', '#4f9fd8'],
    ['空', '#8fd6e8'],
  ];
  labels.forEach(([t, c], i) => {
    const x = w / 2 + (i - 1) * 88;
    ctx.beginPath();
    ctx.arc(x, 272, 24, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,10,14,0.9)';
    ctx.fill();
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.font = `700 30px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c;
    ctx.fillText(t, x, 274);
  });
  return canvasTex(cv);
}

/** 沙土地形貼圖（程序化） */
export function makeSandTexture({ seed = 7, base = '#c8a76a', edge = '#8d6d3f', green = false } = {}) {
  const size = 512;
  const cv = makeCanvas(size, size);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const rand = rng(seed);
  // 大面積色斑
  for (let i = 0; i < 260; i++) {
    const x = rand() * size, y = rand() * size;
    const r = 8 + rand() * 46;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rand() > 0.5;
    g.addColorStop(0, dark ? 'rgba(110,84,48,0.16)' : 'rgba(238,214,164,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 等高線（地圖感）
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 16; i++) {
    ctx.strokeStyle = `rgba(${green ? '92,104,60' : '120,92,52'},${0.12 + rand() * 0.12})`;
    ctx.beginPath();
    let x = rand() * size, y = rand() * size;
    ctx.moveTo(x, y);
    for (let k = 0; k < 14; k++) {
      x += (rand() - 0.5) * 58;
      y += (rand() - 0.5) * 58;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // 細砂粒
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 26;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n, 0, 255);
  }
  ctx.putImageData(img, 0, 0);

  // 乾草/灌木點
  for (let i = 0; i < (green ? 520 : 260); i++) {
    const x = rand() * size, y = rand() * size;
    ctx.fillStyle = green
      ? `rgba(${70 + rand() * 40},${86 + rand() * 44},${44 + rand() * 24},${0.16 + rand() * 0.3})`
      : `rgba(${96 + rand() * 40},${82 + rand() * 30},${44 + rand() * 22},${0.1 + rand() * 0.24})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 1 + rand() * 2.6, 0.8 + rand() * 1.6, rand() * 3.14, 0, Math.PI * 2);
    ctx.fill();
  }
  // 邊緣暗角（近海岸潮濕）
  const eg = ctx.createLinearGradient(0, 0, size, size);
  eg.addColorStop(0, 'rgba(60,44,26,0.10)');
  eg.addColorStop(0.5, 'rgba(0,0,0,0)');
  eg.addColorStop(1, 'rgba(60,44,26,0.12)');
  ctx.fillStyle = eg;
  ctx.fillRect(0, 0, size, size);
  void edge;
  return canvasTex(cv);
}

/** 胡桃木桌面貼圖 */
export function makeWoodTexture({ seed = 3, base = '#33200f', light = '#57371b' } = {}) {
  const size = 1024;
  const cv = makeCanvas(size, size);
  const ctx = cv.getContext('2d');
  const rand = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 340; i++) {
    const y0 = rand() * size;
    const amp = 8 + rand() * 26;
    const freq = 0.004 + rand() * 0.012;
    const phase = rand() * TAU;
    const alpha = 0.05 + rand() * 0.16;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.3 + phase * 2) * amp * 0.25;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rand() > 0.5 ? `rgba(20,10,4,${alpha})` : `rgba(120,74,32,${alpha * 0.8})`;
    ctx.lineWidth = 0.6 + rand() * 2.6;
    ctx.stroke();
  }
  // 木節
  for (let i = 0; i < 7; i++) {
    const x = 120 + rand() * 780, y = 120 + rand() * 780;
    for (let k = 6; k > 0; k--) {
      ctx.beginPath();
      ctx.ellipse(x, y, k * 9, k * 4.2, rand() * 0.6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(18,9,4,${0.05 + 0.05 * k})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }
  // 中心柔光
  const g = ctx.createRadialGradient(size * 0.5, size * 0.42, 60, size * 0.5, size * 0.5, size * 0.72);
  g.addColorStop(0, light);
  g.addColorStop(0.5, 'rgba(87,55,27,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  return canvasTex(cv, { wrap: true });
}

/** 機場停機坪貼圖 */
export function makeTarmacTexture() {
  const size = 512;
  const cv = makeCanvas(size, size);
  const ctx = cv.getContext('2d');
  const rand = rng(23);
  ctx.fillStyle = '#4b4e52';
  ctx.fillRect(0, 0, size, size);
  // 柏油噪點
  for (let i = 0; i < 4200; i++) {
    ctx.fillStyle = `rgba(${20 + rand() * 90},${22 + rand() * 90},${24 + rand() * 92},${rand() * 0.28})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 3, 1 + rand() * 3);
  }
  // 跑道線
  ctx.strokeStyle = 'rgba(226,226,214,0.75)';
  ctx.lineWidth = 7;
  ctx.setLineDash([46, 34]);
  ctx.beginPath();
  ctx.moveTo(60, 256);
  ctx.lineTo(452, 256);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(232,196,96,0.8)';
  ctx.strokeRect(40, 40, 432, 432);
  // T 字停機位
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(220,220,210,0.55)';
  ctx.lineWidth = 5;
  ctx.arc(256, 158, 58, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(256, 216);
  ctx.lineTo(256, 300);
  ctx.stroke();
  // 風化污漬
  for (let i = 0; i < 24; i++) {
    ctx.beginPath();
    ctx.fillStyle = `rgba(10,10,10,${0.05 + rand() * 0.1})`;
    ctx.ellipse(rand() * size, rand() * size, 12 + rand() * 50, 6 + rand() * 26, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvasTex(cv);
}

/** 軍旗布面貼圖 */
export function makeFlagTexture(sideColor, sideName = '南軍', emblem = 'army') {
  const w = 512, h = 320;
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d');
  // 底色
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, sideColor);
  g.addColorStop(1, '#1a1016');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 斜紋
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 26;
  for (let i = -h; i < w + h; i += 96) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h, h);
    ctx.stroke();
  }
  ctx.restore();
  // 金邊
  ctx.strokeStyle = '#e6c46a';
  ctx.lineWidth = 12;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  // 中央徽記（三軍合一：星 + 錨 + 翼）
  ctx.save();
  ctx.translate(w / 2, h / 2 - 6);
  ctx.strokeStyle = '#f4d98a';
  ctx.fillStyle = '#f4d98a';
  ctx.lineWidth = 6;
  // 星
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 18 : 46;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r, y = Math.sin(a) * r - 8;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  // 翼
  ctx.beginPath();
  ctx.moveTo(-52, 46);
  ctx.quadraticCurveTo(-150, 22, -196, 58);
  ctx.quadraticCurveTo(-142, 60, -52, 78);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(52, 46);
  ctx.quadraticCurveTo(150, 22, 196, 58);
  ctx.quadraticCurveTo(142, 60, 52, 78);
  ctx.closePath();
  ctx.fill();
  // 錨（下方小）
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 92, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 101);
  ctx.lineTo(0, 138);
  ctx.moveTo(-15, 112);
  ctx.lineTo(15, 112);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 130, 22, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
  void emblem;
  // 下方陣營名
  ctx.save();
  ctx.font = `800 54px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '10px';
  ctx.strokeStyle = 'rgba(10,6,4,0.85)';
  ctx.lineWidth = 9;
  ctx.strokeText(sideName, w / 2, h - 52);
  ctx.fillStyle = '#f8e6b0';
  ctx.fillText(sideName, w / 2, h - 52);
  ctx.restore();
  return canvasTex(cv);
}

/** 毒氣骷髏牌 */
export function makeSkullTexture() {
  const s = 256;
  const cv = makeCanvas(s, s);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  // 黃底警示牌
  roundRect(ctx, 8, 8, s - 16, s - 16, 26);
  ctx.fillStyle = '#e8c33c';
  ctx.fill();
  ctx.strokeStyle = '#231a06';
  ctx.lineWidth = 8;
  roundRect(ctx, 8, 8, s - 16, s - 16, 26);
  ctx.stroke();
  // 骷髏
  ctx.fillStyle = '#1c1508';
  ctx.beginPath();
  ctx.arc(128, 112, 52, Math.PI, 0);
  ctx.lineTo(176, 156);
  ctx.quadraticCurveTo(176, 176, 152, 176);
  ctx.lineTo(104, 176);
  ctx.quadraticCurveTo(80, 176, 80, 156);
  ctx.closePath();
  ctx.fill();
  // 眼窩
  ctx.fillStyle = '#e8c33c';
  ctx.beginPath();
  ctx.ellipse(105, 112, 15, 18, 0.15, 0, Math.PI * 2);
  ctx.ellipse(151, 112, 15, 18, -0.15, 0, Math.PI * 2);
  ctx.fill();
  // 鼻
  ctx.beginPath();
  ctx.moveTo(128, 128);
  ctx.lineTo(138, 148);
  ctx.lineTo(118, 148);
  ctx.closePath();
  ctx.fill();
  // 牙
  ctx.fillStyle = '#1c1508';
  for (let i = 0; i < 4; i++) ctx.fillRect(108 + i * 12, 158, 7, 18);
  return canvasTex(cv);
}

/** 輻射警示貼圖 */
export function makeRadiationTexture() {
  const s = 256;
  const cv = makeCanvas(s, s);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  ctx.beginPath();
  ctx.arc(128, 128, 104, 0, Math.PI * 2);
  ctx.fillStyle = '#f2c93c';
  ctx.fill();
  ctx.strokeStyle = '#1a1404';
  ctx.lineWidth = 8;
  ctx.stroke();
  // 三葉
  ctx.fillStyle = '#1a1404';
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(128, 128);
    ctx.rotate((i * Math.PI * 2) / 3 - Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 82, -Math.PI / 6, Math.PI / 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(128, 128, 26, 0, Math.PI * 2);
  ctx.fillStyle = '#f2c93c';
  ctx.fill();
  return canvasTex(cv);
}

/** 柔和徑向光暈（粒子、接觸陰影共用） */
export function makeRadialTexture({ inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)' } = {}) {
  const s = 128;
  const cv = makeCanvas(s, s);
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return canvasTex(cv);
}

/** 3D 浮動橫幅（純文字，透明背景） */
export function makeBannerTexture(text, { sub = '', color = '#ffe9b0', size = 150 } = {}) {
  const w = 1024, h = 300;
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  // 中央柔光
  const g = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,210,120,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  goldText(ctx, text, w / 2, h / 2 - (sub ? 24 : 0), size, { letter: 10, color });
  if (sub) {
    ctx.save();
    ctx.font = `600 40px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '8px';
    ctx.strokeStyle = 'rgba(8,10,14,0.9)';
    ctx.lineWidth = 8;
    ctx.strokeText(sub, w / 2, h / 2 + 100);
    ctx.fillStyle = '#e7d6ae';
    ctx.fillText(sub, w / 2, h / 2 + 100);
    ctx.restore();
  }
  return canvasTex(cv);
}

/* ================================================================== */
/* 幾何合併（大幅降低 draw call）                                      */
/* ================================================================== */

function mergeEntries(entries) {
  let total = 0;
  const prepared = [];
  for (const e of entries) {
    const g = e.geometry.index ? e.geometry.toNonIndexed() : e.geometry.clone();
    g.applyMatrix4(e.matrix);
    total += g.attributes.position.count;
    prepared.push(g);
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of prepared) {
    const p = g.attributes.position.array;
    pos.set(p, o * 3);
    const n = g.attributes.normal ? g.attributes.normal.array : null;
    if (n) nor.set(n, o * 3);
    const u = g.attributes.uv ? g.attributes.uv.array : null;
    if (u) uv.set(u, o * 2);
    o += g.attributes.position.count;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return geo;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * 部件收集器：把大量小零件依材質合併成少量 Mesh。
 * pos / rot / scale 皆為世界（相對於 parent）座標。
 */
export class PartBuilder {
  constructor() {
    this.entries = [];
    this.matrices = [];
  }
  /** 加入零件。rot 為 Euler 弧度 [x,y,z]，scale 可為數字或 [x,y,z] */
  add(geometry, material, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
    _v.set(pos[0], pos[1], pos[2]);
    _e.set(rot[0], rot[1], rot[2]);
    _q.setFromEuler(_e);
    if (typeof scale === 'number') _s.set(scale, scale, scale);
    else _s.set(scale[0], scale[1], scale[2]);
    const m = new THREE.Matrix4();
    m.compose(_v, _q, _s);
    this.entries.push({ geometry, material, matrix: m });
    return this;
  }
  /** 直接以矩陣加入 */
  addM(geometry, material, matrix) {
    this.entries.push({ geometry, material, matrix });
    return this;
  }
  /** 建立合併後的 Group（每個材質一個 Mesh） */
  build({ castShadow = true, receiveShadow = false } = {}) {
    const group = new THREE.Group();
    const byMat = new Map();
    for (const e of this.entries) {
      let list = byMat.get(e.material);
      if (!list) byMat.set(e.material, (list = []));
      list.push(e);
    }
    for (const [material, list] of byMat) {
      const geo = mergeEntries(list);
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = castShadow && !material.transparent;
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    return group;
  }
}

/** 將一組 {geo, mat, matrix} 合併為單一 Mesh（供效果/裝飾使用） */
export function mergeMeshList(entries, material, opts = {}) {
  const geo = mergeEntries(entries);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = opts.castShadow ?? false;
  mesh.receiveShadow = opts.receiveShadow ?? false;
  return mesh;
}

/** 遞迴釋放資源 */
export function disposeObject(obj) {
  if (!obj) return;
  obj.traverse?.((o) => {
    if (o.geometry) o.geometry.dispose?.();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const k of Object.keys(m)) {
          const v = m[k];
          if (v && v.isTexture) v.dispose?.();
        }
        m.dispose?.();
      }
    }
    if (o.isSprite && o.material?.map) o.material.map.dispose?.();
  });
}

/* ================================================================== */
/* 三軍徽記（幾何版）                                                  */
/* ================================================================== */

const emblemCache = new Map();

/**
 * 建立軍種徽記（面向 +z，尺寸約 0.44 見方）。
 * branch: 'army' | 'navy' | 'air'
 * 回傳 Group（已合併），可安全 clone（共享幾何與材質）。
 */
export function makeBranchEmblem(branch, goldMat = MAT.gold(), darkMat = MAT.darkSteel()) {
  const key = `${branch}:${goldMat.uuid}:${darkMat.uuid}`;
  let base = emblemCache.get(key);
  if (base) return base.clone();

  const b = new PartBuilder();
  if (branch === 'army') {
    // 交叉步槍 ×2
    for (const sign of [-1, 1]) {
      const rot = [0, 0, sign * 0.62];
      b.add(G.box(0.028, 0.30, 0.024), darkMat, [0, 0.01, 0.01], rot);
      b.add(G.box(0.05, 0.10, 0.03), darkMat, [sign * 0.083, -0.114, 0.01], rot);
      b.add(G.cyl(0.011, 0.011, 0.16, 8), goldMat, [sign * -0.06, 0.115, 0.045], rot);
    }
    // 中央五角星
    const star = G.extrude(starShape(0.185, 0.075), 0.05, 0.01);
    b.add(star, goldMat, [0, 0.02, 0.03]);
    // 底部緞帶
    b.add(G.box(0.34, 0.045, 0.035), goldMat, [0, -0.20, 0.02], [0, 0, 0.02]);
    b.add(G.box(0.26, 0.032, 0.03), darkMat, [0, -0.24, 0.02], [0, 0, -0.02]);
  } else if (branch === 'navy') {
    // 錨
    b.add(G.torus(0.045, 0.014, 8, 16), goldMat, [0, 0.175, 0.02]);
    b.add(G.cyl(0.018, 0.018, 0.30, 10), goldMat, [0, 0.015, 0.02]);
    b.add(G.box(0.22, 0.03, 0.03), goldMat, [0, 0.12, 0.02]);
    // 底部弧
    b.add(G.torus(0.145, 0.02, 8, 24, Math.PI), goldMat, [0, -0.10, 0.02], [0, 0, Math.PI]);
    // 錨爪
    for (const s of [-1, 1]) {
      const shape = shapeFromPoints([
        [0, 0],
        [0.075, 0.056],
        [0.028, 0.014],
        [0.075, -0.02],
      ]);
      b.add(G.extrude(shape, 0.026, 0.004), goldMat, [s * 0.115, -0.085, 0.02], [0, 0, s * -0.5], [s, 1, 1]);
    }
    // 繩索
    b.add(G.torus(0.16, 0.012, 6, 20, Math.PI * 1.1), darkMat, [0, -0.06, -0.01], [0, 0, 2.4]);
  } else {
    // 機翼 + 中央星
    const wing = shapeFromPoints([
      [0, 0.05],
      [-0.34, 0.16],
      [-0.40, 0.10],
      [-0.14, -0.05],
      [-0.03, -0.04],
    ]);
    const right = wing.clone();
    right.autoClose = true;
    b.add(G.extrude(wing, 0.03, 0.006), goldMat, [0, 0, 0.02]);
    b.add(G.extrude(wing, 0.03, 0.006), goldMat, [0, 0, 0.02], [0, 0, 0], [-1, 1, 1]);
    // 機身
    b.add(G.cyl(0.02, 0.045, 0.26, 10), goldMat, [0, -0.015, 0.02], [0, 0, -Math.PI / 2]);
    b.add(G.cone(0.045, 0.09, 10), goldMat, [0.16, -0.015, 0.02], [0, 0, -Math.PI / 2]);
    // 尾翼
    b.add(G.box(0.09, 0.10, 0.028), goldMat, [-0.16, 0.02, 0.02], [0, 0, 0.25]);
    // 中央星
    b.add(G.extrude(starShape(0.075, 0.032), 0.035, 0.006), darkMat, [0, 0.0, 0.05]);
  }
  base = b.build({ castShadow: false });
  emblemCache.set(key, base);
  return base.clone();
}

/** 建立一個貼圖平面（透明材質），置中於原點、面向 +z */
export function makeDecalPlane(texture, w, h, opts = {}) {
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: opts.side ?? THREE.FrontSide,
    toneMapped: opts.toneMapped ?? true,
    opacity: opts.opacity ?? 1,
    blending: opts.blending ?? THREE.NormalBlending,
    fog: opts.fog ?? true,
  });
  const mesh = new THREE.Mesh(G.plane(w, h), mat);
  mesh.castShadow = false;
  return mesh;
}

/** 文字牌（Sprite） */
export function makeTextSprite(texture, w = 4, h = 1.2, opts = {}) {
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity: opts.opacity ?? 1,
    blending: opts.blending ?? THREE.NormalBlending,
    toneMapped: opts.toneMapped ?? true,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(w, h, 1);
  return sp;
}

/** 船艦/飛機的接觸陰影（貼地柔邊圓） */
export function makeContactShadow(size = 1.2, opacity = 0.5) {
  const tex = getShadowTex();
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    opacity,
    color: 0x05070a,
    toneMapped: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(G.plane(size, size), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  return mesh;
}

let _shadowTex = null;
function getShadowTex() {
  if (!_shadowTex) {
    _shadowTex = makeRadialTexture({ inner: 'rgba(255,255,255,0.95)', outer: 'rgba(255,255,255,0)' });
  }
  return _shadowTex;
}

/** 把物件轉為不投影（常用於細小裝飾） */
export function noShadow(obj) {
  obj.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  return obj;
}
