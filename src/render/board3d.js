/**
 * 三軍棋 3D — 棋盤層
 * ------------------------------------------------------------------
 * 黃土陸地（南北）／動態海洋（自訂 Shader）／海岸柔邊泡沫／
 * 13×13 兵站圓環／環形鐵路（含跨海鐵橋）／正交空中航線／
 * 城牆與三座城門／行營帳篷／錨點碼頭／機場停機坪／
 * 棋盤外框、桌面、壓克力名牌、羅盤等裝飾。
 *
 * 座標：world x = col - 6, z = row - 6；北 = -z。
 */
import * as THREE from 'three';
import {
  NODES, NODE, COLS, ROWS, RAIL_EDGES, RAIL_BRIDGE_COLS,
  GATE_CR, CAMP_CR, AIRPORT_CR, ANCHOR_CR,
  nodeAt, nodeId,
} from '../core/board.js';
import * as U from './utils.js';

/** 各類節點的「站立高度」 */
export const HEIGHTS = {
  land: 0.02,
  sea: -0.14,
  bridge: 0.46,
  airport: 0.035,
  gate: 0.15,
};

const WAV = { amp: 0.1, amp2: 0.045 };

function northCoastY(x) {
  return 1.5 + Math.sin(x * 1.35 + 0.6) * WAV.amp + Math.sin(x * 3.1 + 2.2) * WAV.amp2;
}
function southCoastY(x) {
  return -1.5 - (Math.sin(x * 1.15 + 1.2) * WAV.amp + Math.sin(x * 2.7 + 0.4) * WAV.amp2);
}

/* ================================================================== */
/* 紋理                                                                */
/* ================================================================== */

function makeCliffTexture() {
  const w = 256, h = 512;
  const cv = U.makeCanvas(w, h);
  const ctx = cv.getContext('2d');
  const rand = U.rng(11);
  ctx.fillStyle = '#4c3a24';
  ctx.fillRect(0, 0, w, h);
  // 土層橫紋
  for (let i = 0; i < 90; i++) {
    const y = rand() * h;
    ctx.fillStyle = rand() > 0.5
      ? `rgba(${40 + rand() * 60},${30 + rand() * 45},${16 + rand() * 24},0.35)`
      : `rgba(${120 + rand() * 50},${92 + rand() * 40},${54 + rand() * 30},0.22)`;
    ctx.fillRect(0, y, w, 1 + rand() * 8);
  }
  // 碎石
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = `rgba(${80 + rand() * 90},${70 + rand() * 70},${45 + rand() * 40},${0.15 + rand() * 0.3})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 3);
  }
  const tex = U.canvasTex(cv, { wrap: true });
  tex.repeat.set(0.35, 0.09);
  return tex;
}

function makeCompassTexture() {
  const s = 512;
  const cv = U.makeCanvas(s, s);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  const c = s / 2;
  // 銅盤
  let g = ctx.createRadialGradient(c, c, 20, c, c, c - 10);
  g.addColorStop(0, '#d9b467');
  g.addColorStop(0.55, '#a8813c');
  g.addColorStop(1, '#5c3f19');
  ctx.beginPath();
  ctx.arc(c, c, c - 14, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#2a1c08';
  ctx.lineWidth = 10;
  ctx.stroke();
  // 刻度
  ctx.save();
  ctx.translate(c, c);
  for (let i = 0; i < 72; i++) {
    const a = (i * Math.PI * 2) / 72;
    const r0 = i % 9 === 0 ? c - 62 : c - 44;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * (c - 26), Math.sin(a) * (c - 26));
    ctx.strokeStyle = i % 9 === 0 ? '#1c1206' : 'rgba(30,20,8,0.6)';
    ctx.lineWidth = i % 9 === 0 ? 5 : 2.5;
    ctx.stroke();
  }
  // 八芒星
  for (let k = 0; k < 2; k++) {
    const R = k === 0 ? c - 88 : c - 150;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 ? R * 0.34 : R;
      const a = -Math.PI / 2 + (i * Math.PI) / 8 + (k * Math.PI) / 8;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = k === 0 ? 'rgba(58,38,12,0.92)' : 'rgba(240,214,150,0.85)';
    ctx.fill();
  }
  // 東南西北
  ctx.font = '700 74px "Noto Sans TC","Noto Serif CJK TC",serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1a1104';
  ctx.fillText('北', c, 68);
  ctx.fillText('南', c, s - 66);
  ctx.fillText('東', s - 66, c + 4);
  ctx.fillText('西', 66, c + 4);
  // 中心
  ctx.beginPath();
  ctx.arc(c, c, 20, 0, Math.PI * 2);
  ctx.fillStyle = '#f2d795';
  ctx.fill();
  ctx.strokeStyle = '#1a1104';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();
  return U.canvasTex(cv);
}

function makeGatePlaqueTexture() {
  const w = 256, h = 128;
  const cv = U.makeCanvas(w, h);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  U.roundRect(ctx, 6, 10, w - 12, h - 20, 12);
  ctx.fillStyle = '#191008';
  ctx.fill();
  ctx.strokeStyle = '#e2be72';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.font = '800 74px "Noto Sans TC","Noto Serif CJK TC",serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f0d391';
  ctx.fillText('城 門', w / 2, h / 2 + 4);
  return U.canvasTex(cv);
}

function makeSideBannerTexture(sideColor, label) {
  const w = 128, h = 192;
  const cv = U.makeCanvas(w, h);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, sideColor);
  g.addColorStop(1, '#1a1016');
  ctx.fillStyle = g;
  ctx.fillRect(4, 4, w - 8, h - 8);
  ctx.strokeStyle = '#e6c46a';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  ctx.font = '800 62px "Noto Sans TC","Noto Serif CJK TC",serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f7e3ae';
  ctx.fillText(label, w / 2, h / 2 - 6);
  // 下緣流蘇
  ctx.fillStyle = '#e6c46a';
  for (let i = 0; i < 5; i++) ctx.fillRect(12 + i * 22, h - 14, 10, 10);
  return U.canvasTex(cv);
}

/* ================================================================== */
/* 海洋 Shader                                                         */
/* ================================================================== */

const SEA_VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;

float waveH(vec2 p, float t) {
  return sin(p.x * 2.1 + t * 1.05) * 0.020
       + sin(p.y * 2.9 - t * 1.35) * 0.014
       + sin((p.x * 1.35 + p.y * 2.15) + t * 1.85) * 0.010
       + sin((p.x * 4.1 - p.y * 1.65) - t * 2.35) * 0.006;
}

void main() {
  vec3 pos = position;
  vec2 p = vec2(pos.x, pos.y);
  float h = waveH(p, uTime);
  pos.z += h;
  float eps = 0.09;
  float hx = waveH(p + vec2(eps, 0.0), uTime);
  float hy = waveH(p + vec2(0.0, eps), uTime);
  vec3 n = normalize(vec3(-(hx - h) / eps, -(hy - h) / eps, 1.0));
  vNormalW = normalize(normalMatrix * n);
  vUv = uv;
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SEA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uQuality;
uniform vec3 uSun;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uFoam;
uniform vec3 uFogColor;
uniform float uFogDensity;

varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorld);

  float shore = smoothstep(0.4, 1.5, abs(vWorld.z));

  // 基礎水色（深藍，近岸略亮）
  vec3 base = mix(uDeep, uShallow, shore * 0.8);
  base = mix(base, base * 1.12, smoothstep(0.0, 0.6, N.y));

  // 細波紋（低畫質時簡化）
  if (uQuality > 0.5) {
    float r1 = fbm(vWorld.xz * 3.2 + vec2(uTime * 0.12, -uTime * 0.09));
    float r2 = fbm(vWorld.xz * 8.0 - vec2(uTime * 0.18, uTime * 0.11));
    base += vec3(0.012, 0.026, 0.032) * (r1 * 0.7 + r2 * 0.3);
  }

  // 菲涅爾（收斂、偏暗）
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  vec3 col = mix(base, uSky, clamp(fres * 0.32, 0.0, 0.30));

  // 太陽高光（窄而剋制，避免大面積死白）
  vec3 R = reflect(-uSun, N);
  float spec = pow(max(dot(R, V), 0.0), 180.0);
  col += vec3(1.0, 0.82, 0.56) * spec * 0.55;

  if (uQuality > 0.5) {
    float sheen = pow(max(dot(R, V), 0.0), 11.0);
    col += vec3(1.0, 0.72, 0.42) * sheen * 0.02;
    vec2 sp = vWorld.xz * 26.0 + vec2(uTime * 0.5, uTime * 0.3);
    float sparkle = pow(noise(sp), 16.0) * pow(noise(sp * 1.7 + 3.0), 10.0);
    col += vec3(0.75, 0.88, 1.0) * sparkle * 0.55;
  }

  // 拍岸白沫（只在近岸細帶）
  float foamA = noise(vec2(vWorld.x * 3.2 + uTime * 0.35, vWorld.z * 2.0 - uTime * 0.5));
  float foamB = noise(vec2(vWorld.x * 7.0 - uTime * 0.6, vWorld.z * 4.5 + uTime * 0.3));
  float foamBand = smoothstep(1.33, 1.56, abs(vWorld.z) + foamA * 0.08);
  float foam = smoothstep(0.62, 0.9, foamA * 0.62 + foamB * 0.38) * foamBand;
  float edgeLine = smoothstep(1.46, 1.56, abs(vWorld.z)) * (0.2 + 0.35 * foamB);
  col = mix(col, uFoam, clamp(foam * 0.30 + edgeLine * 0.16, 0.0, 0.36));

  // 兵站圓環（低調的航圖感）
  vec2 cell = floor(vWorld.xz + 0.5);
  float d = length(vWorld.xz - cell);
  float ring = 1.0 - smoothstep(0.0, 0.03, abs(d - 0.365));
  float dotc = 1.0 - smoothstep(0.02, 0.08, d);
  float inBoard = step(abs(vWorld.x), 6.45) * step(abs(vWorld.z), 1.42);
  col += vec3(0.18, 0.36, 0.45) * (ring * 0.045 + dotc * 0.014) * inBoard;

  // 霧
  float dist = length(cameraPosition - vWorld);
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));

  // 避免任何像素過曝成全白
  col = min(col, vec3(0.85));
  gl_FragColor = vec4(col, 1.0);
}
`;

const FOAM_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const FOAM_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFlip;
uniform vec3 uColor;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float t = mix(vUv.y, 1.0 - vUv.y, uFlip);
  float n = noise(vec2(vUv.x * 22.0 + uTime * 0.45, t * 4.0 - uTime * 0.65));
  float n2 = noise(vec2(vUv.x * 48.0 - uTime * 0.55, t * 7.0 + uTime * 0.4));
  float band = smoothstep(0.0, 0.85, t);
  float foam = smoothstep(0.45, 0.78, n * 0.65 + n2 * 0.5) * band;
  float edge = smoothstep(0.86, 0.99, t) * (0.4 + 0.5 * n2);
  float a = clamp(foam * 0.26 + edge * 0.42, 0.0, 0.5) * smoothstep(0.0, 0.25, t);
  gl_FragColor = vec4(uColor, a);
}
`;

/* ================================================================== */
/* 主建構                                                              */
/* ================================================================== */

export function createBoard3D(options = {}) {
  const group = new THREE.Group();
  group.name = 'board3d';

  const updaters = [];
  const rand = U.rng(20251106);

  /** 陣營色（由 View 傳入，供城門旗、營旗動態換色） */
  function pickColor(colors, side) {
    const c = (colors && colors[side]) || {};
    return c.main || c.primary || c.color || (side === 'south' ? '#a82834' : '#2b5c9e');
  }
  let sideColorMap = {
    south: pickColor(options.sideColors, 'south'),
    north: pickColor(options.sideColors, 'north'),
  };
  const bannerMeshes = [];
  const campFlags = [];

  /* ---------------- 材質 ---------------- */
  const cliffTex = makeCliffTexture();
  const northSand = U.makeSandTexture({ seed: 17, base: '#c5a86e', green: true });
  const southSand = U.makeSandTexture({ seed: 41, base: '#cbab6d', green: false });
  for (const t of [northSand, southSand]) {
    t.repeat.set(1 / 13, 1 / 13);
    t.offset.set(0.5, 0.5);
  }

  const landTopN = new THREE.MeshStandardMaterial({
    map: northSand, roughness: 0.93, metalness: 0.03, envMapIntensity: 0.35,
  });
  const landTopS = new THREE.MeshStandardMaterial({
    map: southSand, roughness: 0.93, metalness: 0.03, envMapIntensity: 0.35,
  });
  const cliffMat = new THREE.MeshStandardMaterial({
    map: cliffTex, color: 0xb59a72, roughness: 0.95, metalness: 0.02,
  });

  const frameWoodTex = U.makeWoodTexture({ seed: 9, base: '#2a1a0d', light: '#5c3b1e' });
  frameWoodTex.repeat.set(2.5, 2.5);
  const frameMat = new THREE.MeshStandardMaterial({
    map: frameWoodTex, color: 0xb08a68, roughness: 0.42, metalness: 0.22, envMapIntensity: 0.9,
  });
  const frameInnerMat = new THREE.MeshStandardMaterial({
    color: 0x231408, roughness: 0.55, metalness: 0.25,
  });
  const goldMat = U.MAT.gold();
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc29a52, metalness: 0.92, roughness: 0.3, envMapIntensity: 1.2,
  });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8d8577, roughness: 0.9, metalness: 0.05 });
  const stoneDark = new THREE.MeshStandardMaterial({ color: 0x6b655a, roughness: 0.92, metalness: 0.05 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2c303c, roughness: 0.55, metalness: 0.35 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0x8f2f26, roughness: 0.5, metalness: 0.1 });
  const creamMat = new THREE.MeshStandardMaterial({ color: 0xd8cbb0, roughness: 0.7, metalness: 0.05 });
  const canvasMat = new THREE.MeshStandardMaterial({ color: 0xc3ad83, roughness: 0.92, metalness: 0.02 });
  const railMetal = new THREE.MeshStandardMaterial({
    color: 0xb9c2cc, metalness: 0.95, roughness: 0.22, envMapIntensity: 1.5,
  });
  const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.9, metalness: 0.05 });
  const ballastMat = new THREE.MeshStandardMaterial({ color: 0x5c5850, roughness: 0.98, metalness: 0.03 });
  const deckWood = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.8, metalness: 0.05 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6d6255, roughness: 0.95, metalness: 0.04 });
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x5d6b3a, roughness: 0.9, metalness: 0.02 });

  /* ================================================================ */
  /* 1. 陸地                                                            */
  /* ================================================================ */
  function makeLand(side) {
    const isNorth = side === 'north';
    const shape = new THREE.Shape();
    const xs = [];
    for (let i = 0; i <= 96; i++) xs.push(-6.5 + (13 * i) / 96);
    if (isNorth) {
      shape.moveTo(xs[0], northCoastY(xs[0]));
      for (let i = 1; i < xs.length; i++) shape.lineTo(xs[i], northCoastY(xs[i]));
      shape.lineTo(6.5, 6.5);
      shape.lineTo(-6.5, 6.5);
    } else {
      shape.moveTo(xs[0], southCoastY(xs[0]));
      for (let i = 1; i < xs.length; i++) shape.lineTo(xs[i], southCoastY(xs[i]));
      shape.lineTo(6.5, -6.5);
      shape.lineTo(-6.5, -6.5);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.55,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.05,
      bevelSegments: 2,
      curveSegments: 6,
    });
    const mesh = new THREE.Mesh(geo, [isNorth ? landTopN : landTopS, cliffMat]);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = HEIGHTS.land - (0.55 + 0.07);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    group.add(mesh);
    return mesh;
  }
  makeLand('north');
  makeLand('south');

  /* ================================================================ */
  /* 2. 海洋 + 海岸泡沫                                                 */
  /* ================================================================ */
  const seaUniforms = {
    uTime: { value: 0 },
    uQuality: { value: 1 },
    uSun: { value: new THREE.Vector3(7.5, 16, 9.5).normalize() },
    uDeep: { value: new THREE.Color(0x04161f) },
    uShallow: { value: new THREE.Color(0x0a3a4a) },
    uSky: { value: new THREE.Color(0x2f4b63) },
    uFoam: { value: new THREE.Color(0xcfe6f0) },
    uFogColor: { value: new THREE.Color(0x0b0e16) },
    uFogDensity: { value: 0.0125 },
  };
  const seaGeo = new THREE.PlaneGeometry(14.2, 3.9, 200, 44);
  const seaMat = new THREE.ShaderMaterial({
    uniforms: seaUniforms,
    vertexShader: SEA_VERT,
    fragmentShader: SEA_FRAG,
    side: THREE.FrontSide,
  });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = HEIGHTS.sea - 0.01;
  sea.receiveShadow = false;
  group.add(sea);

  // 海岸泡沫帶
  const foamMatN = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFlip: { value: 0 },
      uColor: { value: new THREE.Color(0xa8cddc) },
    },
    vertexShader: FOAM_VERT,
    fragmentShader: FOAM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const foamMatS = foamMatN.clone();
  foamMatS.uniforms = THREE.UniformsUtils.clone(foamMatN.uniforms);
  foamMatS.uniforms.uFlip.value = 1;
  foamMatS.uniforms.uColor.value = new THREE.Color(0xd6f2ff);

  const foamGeo = new THREE.PlaneGeometry(13.2, 0.95, 1, 1);
  const foamN = new THREE.Mesh(foamGeo, foamMatN);
  foamN.rotation.x = -Math.PI / 2;
  foamN.position.set(0, -0.075, -1.28);
  group.add(foamN);
  const foamS = new THREE.Mesh(foamGeo, foamMatS);
  foamS.rotation.x = -Math.PI / 2;
  foamS.position.set(0, -0.075, 1.28);
  group.add(foamS);

  updaters.push((t) => {
    seaUniforms.uTime.value = t;
    foamMatN.uniforms.uTime.value = t;
    foamMatS.uniforms.uTime.value = t;
  });

  /* ================================================================ */
  /* 3. 兵站圓環（節點刻痕）                                             */
  /* ================================================================ */
  // 節點刻痕刻意低對比，讓棋子成為視覺主角
  const markMat = new THREE.MeshStandardMaterial({
    color: 0x7d6636, metalness: 0.15, roughness: 0.95, envMapIntensity: 0.25,
  });
  const markRailMat = new THREE.MeshStandardMaterial({
    color: 0x94763e, metalness: 0.5, roughness: 0.62,
  });
  const markBridgeMat = new THREE.MeshStandardMaterial({
    color: 0x6f6142, metalness: 0.55, roughness: 0.6,
  });
  const ringNormal = new U.PartBuilder();
  const ringRail = new U.PartBuilder();
  const ringBridge = new U.PartBuilder();
  for (const n of NODES) {
    if (n.zone === 'sea') continue;
    const y = n.bridge ? HEIGHTS.bridge + 0.004 : HEIGHTS.land + 0.006;
    const target = n.rail ? ringRail : ringNormal;
    const mat = n.rail ? markRailMat : markMat;
    // 單圈細刻痕（外）：低調、不搶戲
    target.add(U.G.ring(0.398, 0.44, 36), mat, [n.x, y, n.z], [-Math.PI / 2, 0, 0]);
    // 中心小點
    target.add(U.G.circle(0.03, 12), mat, [n.x, y, n.z], [-Math.PI / 2, 0, 0]);
  }
  // 跨海鐵橋節點（海面 bridge 節點）
  for (const n of NODES) {
    if (!n.bridge) continue;
    ringBridge.add(U.G.ring(0.33, 0.38, 28), markBridgeMat, [n.x, HEIGHTS.bridge + 0.005, n.z], [-Math.PI / 2, 0, 0]);
  }
  const ringN = ringNormal.build({ castShadow: false });
  const ringR = ringRail.build({ castShadow: false });
  const ringB = ringBridge.build({ castShadow: false });
  group.add(ringN, ringR, ringB);

  /* ================================================================ */
  /* 4. 空中航線（正交虛線）                                             */
  /* ================================================================ */
  {
    const dashMat = new THREE.MeshBasicMaterial({
      color: 0x74dcff,
      transparent: true,
      opacity: 0.30,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const dashes = new U.PartBuilder();
    const dashLen = 0.19;
    const step = 0.36;
    for (let r = 0; r < ROWS; r++) {
      const z = r - 6;
      for (let x = -6.4; x <= 6.4; x += step) {
        dashes.add(U.G.plane(dashLen, 0.016), dashMat, [x, 0.048, z], [-Math.PI / 2, 0, 0]);
      }
    }
    for (let c = 0; c < COLS; c++) {
      const x = c - 6;
      for (let z = -6.4; z <= 6.4; z += step) {
        dashes.add(U.G.plane(0.016, dashLen), dashMat, [x, 0.048, z], [-Math.PI / 2, 0, 0]);
      }
    }
    const mesh = dashes.build({ castShadow: false });
    mesh.traverse((o) => { if (o.isMesh) o.renderOrder = 2; });
    group.add(mesh);
  }

  /* ================================================================ */
  /* 5. 環形鐵路（含跨海鐵橋）                                           */
  /* ================================================================ */
  const railMetalB = new U.PartBuilder();
  const sleeperB = new U.PartBuilder();
  const ballastB = new U.PartBuilder();
  const bridgeDeckB = new U.PartBuilder();
  const bridgeTrussB = new U.PartBuilder();
  const pierB = new U.PartBuilder();

  const railNodeHeight = (n) => (n.bridge ? HEIGHTS.bridge : HEIGHTS.land);

  function addRailEdge(a, b) {
    const na = NODE[a], nb = NODE[b];
    const ya = railNodeHeight(na) + 0.075;
    const yb = railNodeHeight(nb) + 0.075;
    const from = new THREE.Vector3(na.x, ya, na.z);
    const to = new THREE.Vector3(nb.x, yb, nb.z);
    const dir = to.clone().sub(from);
    const len = dir.length();
    const horizontal = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
    const horizLen = horizontal.length() || 1;
    const perp = new THREE.Vector3(-horizontal.z / horizLen, 0, horizontal.x / horizLen);
    const isBridgeEdge = na.bridge || nb.bridge;
    const onBridge = na.bridge && nb.bridge;

    // 碎石道床
    if (!isBridgeEdge || onBridge) {
      const mid = from.clone().add(to).multiplyScalar(0.5);
      U.addBeam(ballastB, mid.clone().setY(mid.y - 0.045), to.clone().setY(to.y - 0.045), 0.34, 0.045, ballastMat);
    }
    // 枕木
    const steps = Math.max(3, Math.round(len / 0.155));
    for (let i = 1; i < steps; i++) {
      const k = i / steps;
      const p = from.clone().lerp(to, k);
      const yaw = Math.atan2(dir.x, dir.z);
      sleeperB.add(U.G.box(0.30, 0.035, 0.075), sleeperMat, [p.x, p.y - 0.03, p.z], [0, yaw, 0]);
    }
    // 兩條鋼軌
    for (const s of [-1, 1]) {
      const off = perp.clone().multiplyScalar(0.058 * s);
      const f2 = from.clone().add(off);
      const t2 = to.clone().add(off);
      U.addBeam(railMetalB, f2.clone().setY(f2.y), t2.clone().setY(t2.y), 0.03, 0.035, railMetal);
      // 軌道底部陰影細條
      U.addBeam(sleeperB, f2.clone().setY(f2.y - 0.035), t2.clone().setY(t2.y - 0.035), 0.016, 0.012, sleeperMat);
    }

    // 跨海鐵橋：橋面、桁架、橋墩
    if (isBridgeEdge) {
      if (onBridge) {
        // 橋面
        const mid = from.clone().add(to).multiplyScalar(0.5);
        U.addBeam(bridgeDeckB, mid.clone().setY(mid.y - 0.075), to.clone().setY(to.y - 0.075), 0.66, 0.07, deckWood);
        // 兩側鋼桁架
        for (const s of [-1, 1]) {
          const off = perp.clone().multiplyScalar(0.35 * s);
          const f2 = from.clone().add(off);
          const t2 = to.clone().add(off);
          U.addBeam(bridgeTrussB, f2.clone().setY(HEIGHTS.bridge + 0.05), t2.clone().setY(HEIGHTS.bridge + 0.05), 0.05, 0.09, railMetal);
          U.addBeam(bridgeTrussB, f2.clone().setY(HEIGHTS.bridge + 0.34), t2.clone().setY(HEIGHTS.bridge + 0.34), 0.06, 0.07, railMetal);
          // 斜撐
          const nSeg = 4;
          for (let i = 0; i < nSeg; i++) {
            const k0 = i / nSeg, k1 = (i + 1) / nSeg;
            const p0 = from.clone().lerp(to, k0).add(off);
            const p1 = from.clone().lerp(to, k1).add(off);
            const up = i % 2 === 0;
            const aPt = up ? p0.clone().setY(HEIGHTS.bridge + 0.33) : p0.clone().setY(HEIGHTS.bridge + 0.09);
            const bPt = up ? p1.clone().setY(HEIGHTS.bridge + 0.09) : p1.clone().setY(HEIGHTS.bridge + 0.33);
            U.addBeam(bridgeTrussB, aPt, bPt, 0.035, 0.035, railMetal);
            // 立柱
            const pv = up ? p0.clone().setY(HEIGHTS.bridge + 0.09) : p1.clone().setY(HEIGHTS.bridge + 0.09);
            const pt = pv.clone().setY(HEIGHTS.bridge + 0.33);
            U.addBeam(bridgeTrussB, pv, pt, 0.035, 0.035, railMetal);
          }
        }
        // 橋墩
        const midP = from.clone().add(to).multiplyScalar(0.5);
        pierB.add(U.G.cyl(0.085, 0.115, HEIGHTS.bridge + 0.2, 10), stoneDark,
          [midP.x, (HEIGHTS.bridge - 0.2) / 2 - 0.14, midP.z]);
        pierB.add(U.G.box(0.24, 0.07, 0.24), stoneMat, [midP.x, HEIGHTS.bridge - 0.09, midP.z]);
      }
    }
  }

  for (const [a, b] of RAIL_EDGES) addRailEdge(a, b);

  {
    const railGroup = new THREE.Group();
    const r1 = railMetalB.build({ castShadow: true });
    const r2 = sleeperB.build({ castShadow: true });
    const r3 = ballastB.build({ castShadow: false, receiveShadow: true });
    const r4 = bridgeDeckB.build({ castShadow: true });
    const r5 = bridgeTrussB.build({ castShadow: true });
    const r6 = pierB.build({ castShadow: false });
    railGroup.add(r1, r2, r3, r4, r5, r6);
    group.add(railGroup);
  }

  /* ================================================================ */
  /* 6. 城牆與城門                                                       */
  /* ================================================================ */
  const wallStone = new U.PartBuilder();
  const wallRed = new U.PartBuilder();
  const wallRoof = new U.PartBuilder();
  const wallGold = new U.PartBuilder();
  const wallCream = new U.PartBuilder();
  const gatePlinthB = new U.PartBuilder();
  const gatePlaqueTex = makeGatePlaqueTexture();
  const bannerTex = {
    south: makeSideBannerTexture(sideColorMap.south, '南'),
    north: makeSideBannerTexture(sideColorMap.north, '北'),
  };
  const gatePlaques = [];

  function addGateTower(side, col) {
    const isNorth = side === 'north';
    const zWall = isNorth ? -6.86 : 6.86;
    const x = col - 6;
    const inward = isNorth ? 1 : -1; // 面向棋盤內側

    // 基座
    wallStone.add(U.G.box(1.35, 0.3, 0.85), stoneMat, [x, 0.22 + 0.15, zWall]);
    wallStone.add(U.G.box(1.18, 0.07, 0.72), stoneDark, [x, 0.59, zWall]);
    // 城門洞（深色凹面）
    wallStone.add(U.G.box(0.52, 0.42, 0.07), U.M(0x120c07, { roughness: 0.95 }), [x, 0.44, zWall + inward * 0.44]);
    // 拱門金釘
    wallGold.add(U.G.box(0.6, 0.035, 0.05), goldMat, [x, 0.67, zWall + inward * 0.45]);

    // 一樓城身
    wallStone.add(U.G.box(1.0, 0.52, 0.62), stoneMat, [x, 0.6 + 0.26, zWall]);
    // 朱紅立柱
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        wallRed.add(U.G.cyl(0.045, 0.05, 0.55, 10), redMat, [x + sx * 0.4, 1.12 + 0.1, zWall + sz * 0.24]);
      }
    }
    // 二樓閣身
    wallCream.add(U.G.box(0.82, 0.3, 0.5), creamMat, [x, 1.32, zWall]);
    // 欄杆
    for (const sx of [-1, 1]) {
      wallGold.add(U.G.box(0.02, 0.1, 0.46), goldMat, [x + sx * 0.44, 1.23, zWall]);
    }
    // 屋頂下層
    wallRoof.add(U.G.box(1.3, 0.055, 0.92), roofMat, [x, 1.5, zWall]);
    // 屋頂斜面（兩坡）
    for (const s of [-1, 1]) {
      wallRoof.add(U.G.box(1.34, 0.06, 0.56), roofMat, [x, 1.63, zWall + s * 0.25], [s * 0.55, 0, 0]);
      // 簷角上翹
      for (const sx of [-1, 1]) {
        wallGold.add(U.G.box(0.1, 0.05, 0.34), goldMat, [x + sx * 0.63, 1.6, zWall + s * 0.36], [s * 0.7, 0, sx * 0.25]);
      }
    }
    // 上層屋頂
    wallRoof.add(U.G.box(0.94, 0.05, 0.7), roofMat, [x, 1.78, zWall]);
    for (const s of [-1, 1]) {
      wallRoof.add(U.G.box(0.98, 0.05, 0.4), roofMat, [x, 1.88, zWall + s * 0.19], [s * 0.6, 0, 0]);
    }
    // 正脊與寶頂
    wallGold.add(U.G.box(1.0, 0.045, 0.08), goldMat, [x, 1.93, zWall]);
    wallGold.add(U.G.sphere(0.055, 12, 8), goldMat, [x, 1.99, zWall]);
    wallGold.add(U.G.cone(0.03, 0.12, 8), goldMat, [x, 2.07, zWall]);
    // 匾額
    const plaque = U.makeDecalPlane(gatePlaqueTex, 0.5, 0.25);
    plaque.position.set(x, 1.32, zWall + inward * 0.255);
    if (!isNorth) plaque.rotation.y = Math.PI;
    gatePlaques.push(plaque);
    group.add(plaque);
    // 城牆上的陣營旗
    const banner = U.makeDecalPlane(bannerTex[side], 0.34, 0.5);
    banner.position.set(x + 0.62, 1.28, zWall + inward * 0.2);
    if (!isNorth) banner.rotation.y = Math.PI;
    group.add(banner);
    bannerMeshes.push({ mesh: banner, side });

    // 旗座（棋盤內、城門節點上）
    const nodeX = x;
    const nodeZ = (isNorth ? 0 : 12) - 6;
    gatePlinthB.add(U.G.box(0.78, 0.06, 0.78), stoneDark, [nodeX, HEIGHTS.land + 0.03, nodeZ]);
    gatePlinthB.add(U.G.box(0.64, 0.06, 0.64), stoneMat, [nodeX, HEIGHTS.land + 0.095, nodeZ]);
    gatePlinthB.add(U.G.box(0.5, 0.03, 0.5), brassMat, [nodeX, HEIGHTS.gate - 0.01, nodeZ]);
    // 四角小柱
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        gatePlinthB.add(U.G.cyl(0.022, 0.026, 0.09, 8), brassMat,
          [nodeX + sx * 0.3, HEIGHTS.land + 0.07, nodeZ + sz * 0.3]);
      }
    }
  }

  for (const side of ['north', 'south']) {
    const isNorth = side === 'north';
    const zWall = isNorth ? -6.86 : 6.86;
    // 城牆段（城門塔之間）
    const gateX = GATE_CR[side].map(([c]) => c - 6);
    const edges = [-6.9, ...gateX.flatMap((x) => [x - 0.72, x + 0.72]), 6.9];
    for (let i = 0; i < edges.length - 1; i += 1) {
      const a = edges[i], b = edges[i + 1];
      if (i % 2 === 0) {
        const len = b - a;
        if (len <= 0.05) continue;
        const cx = (a + b) / 2;
        wallStone.add(U.G.box(len, 0.62, 0.4), stoneMat, [cx, 0.22 + 0.31, zWall]);
        wallStone.add(U.G.box(len, 0.1, 0.5), stoneDark, [cx, 0.22 + 0.05, zWall]);
        wallGold.add(U.G.box(len, 0.025, 0.44), goldMat, [cx, 0.22 + 0.63, zWall]);
        // 垛口
        const nM = Math.max(2, Math.floor(len / 0.3));
        for (let m = 0; m < nM; m++) {
          const mx = a + (len * (m + 0.5)) / nM;
          wallStone.add(U.G.box(0.16, 0.18, 0.2), stoneMat, [mx, 0.22 + 0.73, zWall]);
        }
      }
    }
    for (const [c] of GATE_CR[side]) addGateTower(side, c);
  }

  {
    const wallGroup = new THREE.Group();
    wallGroup.add(wallStone.build({ castShadow: true, receiveShadow: true }));
    wallGroup.add(wallRed.build({ castShadow: true }));
    wallGroup.add(wallRoof.build({ castShadow: true }));
    wallGroup.add(wallGold.build({ castShadow: false }));
    wallGroup.add(wallCream.build({ castShadow: true }));
    wallGroup.add(gatePlinthB.build({ castShadow: false, receiveShadow: true }));
    group.add(wallGroup);
  }

  /* ================================================================ */
  /* 7. 行營（帳篷）                                                     */
  /* ================================================================ */
  {
    const tentCanvas = new U.PartBuilder();
    const tentGold = new U.PartBuilder();
    const tentDark = new U.PartBuilder();
    for (const side of ['north', 'south']) {
      for (const [c, r] of CAMP_CR[side]) {
        const x = c - 6;
        const z = r - 6;
        const outward = side === 'north' ? -1 : 1;
        const tz = z + outward * 0.34;
        // 帳篷底布
        tentDark.add(U.G.cyl(0.31, 0.33, 0.02, 24), U.M(0x3b2c1c, { roughness: 1 }), [x, 0.035, tz]);
        // 帳篷本體（四角錐）
        tentCanvas.add(U.G.cone(0.33, 0.34, 4), canvasMat, [x, 0.2, tz], [0, Math.PI / 4, 0]);
        // 帳篷飾邊
        tentGold.add(U.G.box(0.44, 0.02, 0.44), goldMat, [x, 0.055, tz], [0, Math.PI / 4, 0]);
        // 入口（深色三角）
        const door = new THREE.Mesh(
          new THREE.ConeGeometry(0.11, 0.24, 4),
          U.M(0x241a10, { roughness: 1 })
        );
        door.position.set(x, 0.12, tz + outward * 0.2);
        door.rotation.y = Math.PI / 4;
        door.scale.z = 0.35;
        group.add(door);
        // 頂旗
        tentGold.add(U.G.cyl(0.012, 0.012, 0.24, 6), brassMat, [x, 0.48, tz]);
        const fm = new THREE.Mesh(
          U.G.plane(0.16, 0.1),
          new THREE.MeshBasicMaterial({ color: sideColorMap[side], side: THREE.DoubleSide })
        );
        fm.position.set(x + 0.09, 0.55, tz);
        group.add(fm);
        campFlags.push({ mesh: fm, side });
        // 營火（發光餘燼）
        const ember = new THREE.Mesh(
          U.G.ico(0.055, 0),
          U.E(0xff7430, 2.4)
        );
        ember.position.set(x + 0.3, 0.06, tz + outward * 0.02);
        group.add(ember);
        const emberRing = new THREE.Mesh(U.G.ring(0.07, 0.1, 12), U.Glow(0xff8a3a, 0.5));
        emberRing.rotation.x = -Math.PI / 2;
        emberRing.position.set(x + 0.3, 0.045, tz + outward * 0.02);
        group.add(emberRing);
        updaters.push((t) => {
          const f = 0.7 + 0.3 * Math.sin(t * 7.3 + x * 3) * Math.sin(t * 3.1 + z);
          ember.material.emissiveIntensity = 1.6 + f * 1.4;
          ember.scale.setScalar(0.9 + f * 0.15);
        });
      }
    }
    group.add(tentCanvas.build({ castShadow: true }));
    group.add(tentGold.build({ castShadow: false }));
    group.add(tentDark.build({ castShadow: false, receiveShadow: true }));
  }

  /* ================================================================ */
  /* 8. 錨點碼頭                                                         */
  /* ================================================================ */
  {
    const dockWood = new U.PartBuilder();
    const dockMetal = new U.PartBuilder();
    const seen = new Set();
    for (const side of ['north', 'south']) {
      for (const [c, r] of ANCHOR_CR[side]) {
        const key = `${side}:${c}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const isNorth = side === 'north';
        const coastZ = isNorth ? -1.5 : 1.5;
        const towardSea = isNorth ? 1 : -1;
        // 碼頭位置：錨點旁 0.5 格
        let x = c - 6 + 0.5;
        if (c - 6 + 0.5 > 6.25) x = c - 6 - 0.5;
        const z0 = coastZ - towardSea * 0.25;
        const z1 = coastZ + towardSea * 0.55;
        const mx = (z0 + z1) / 2;
        // 橋板
        const planks = 5;
        for (let i = 0; i < planks; i++) {
          const pz = z0 + ((z1 - z0) * (i + 0.5)) / planks;
          dockWood.add(U.G.box(0.24, 0.045, 0.14), deckWood, [x, -0.02, pz]);
        }
        // 兩側樁
        for (const sz of [z0 + 0.1, z1 - 0.1]) {
          for (const sx of [-1, 1]) {
            dockWood.add(U.G.cyl(0.026, 0.032, 0.5, 8), U.MAT.woodDark(),
              [x + sx * 0.14, -0.18, sz]);
          }
        }
        // 繫船柱
        dockMetal.add(U.G.cyl(0.028, 0.035, 0.1, 10), brassMat, [x, 0.03, z1 - towardSea * 0.06]);
        // 浮標
        const buoyX = x + 0.32;
        const buoyZ = z0 + (z1 - z0) * 0.7;
        const buoy = new THREE.Group();
        const b1 = new THREE.Mesh(U.G.sphere(0.075, 12, 8), U.M(0xb52a34, { metalness: 0.2, roughness: 0.4 }));
        const b2 = new THREE.Mesh(U.G.cyl(0.045, 0.075, 0.12, 10), U.M(0xe8e2d0, { metalness: 0.1, roughness: 0.6 }));
        b2.position.y = -0.07;
        const b3 = new THREE.Mesh(U.G.cyl(0.008, 0.008, 0.16, 6), brassMat);
        b3.position.y = 0.1;
        buoy.add(b1, b2, b3);
        buoy.position.set(buoyX, -0.1, buoyZ);
        group.add(buoy);
        updaters.push((t) => {
          buoy.position.y = -0.1 + Math.sin(t * 1.6 + buoyX * 2.3) * 0.018;
          buoy.rotation.z = Math.sin(t * 1.2 + buoyZ) * 0.14;
        });
      }
    }
    group.add(dockWood.build({ castShadow: true }));
    group.add(dockMetal.build({ castShadow: false }));
  }

  /* ================================================================ */
  /* 9. 機場停機坪                                                       */
  /* ================================================================ */
  {
    const tarmacTex = U.makeTarmacTexture();
    const tarmacMat = new THREE.MeshStandardMaterial({
      map: tarmacTex, roughness: 0.82, metalness: 0.12, envMapIntensity: 0.45,
    });
    const padGeo = new THREE.PlaneGeometry(1.16, 1.16);
    const borderMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.9 });
    const props = new U.PartBuilder();
    const windsocks = [];
    for (const side of ['north', 'south']) {
      for (const [c, r] of AIRPORT_CR[side]) {
        const x = c - 6;
        const z = r - 6;
        // 停機坪（往棋盤內側偏移避免超出陸地）
        const ox = c === 0 ? 0.09 : -0.09;
        const oz = r === 0 ? 0.09 : -0.09;
        const pad = new THREE.Mesh(padGeo, tarmacMat);
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(x + ox, HEIGHTS.airport, z + oz);
        pad.receiveShadow = true;
        group.add(pad);
        // 邊框
        const frame = new THREE.Mesh(U.G.box(1.2, 0.03, 1.2), borderMat);
        frame.position.set(x + ox, HEIGHTS.airport - 0.02, z + oz);
        group.add(frame);
        // 風向袋（位於內側角落）
        const wx = x + ox - Math.sign(x + ox || 1) * 0.42;
        const wz = z + oz - Math.sign(z + oz || 1) * 0.42;
        props.add(U.G.cyl(0.012, 0.016, 0.42, 8), brassMat, [wx, 0.24, wz]);
        props.add(U.G.sphere(0.02, 8, 6), brassMat, [wx, 0.46, wz]);
        // 小型油桶
        for (let i = 0; i < 2; i++) {
          props.add(U.G.cyl(0.055, 0.055, 0.12, 10), U.M(0x3f5a3a, { metalness: 0.5, roughness: 0.45 }),
            [x + ox + (i - 0.5) * 0.14, 0.09, z + oz + 0.45]);
          props.add(U.G.torus(0.055, 0.007, 4, 12), brassMat,
            [x + ox + (i - 0.5) * 0.14, 0.09, z + oz + 0.45], [Math.PI / 2, 0, 0]);
        }
        // 風向袋本體（布套錐）
        const sockGroup = new THREE.Group();
        const sockColor = side === 'north' ? 0x2b5c9e : 0xa82834;
        for (let i = 0; i < 3; i++) {
          const r0 = 0.05 - i * 0.012;
          const seg = new THREE.Mesh(
            U.G.cyl(r0, r0 - 0.008, 0.055, 10),
            new THREE.MeshStandardMaterial({
              color: i % 2 === 0 ? sockColor : 0xe8e2d0,
              roughness: 0.85, metalness: 0.02,
            })
          );
          seg.rotation.z = Math.PI / 2;
          seg.position.x = 0.05 + i * 0.05;
          sockGroup.add(seg);
        }
        sockGroup.position.set(wx, 0.42, wz);
        group.add(sockGroup);
        windsocks.push(sockGroup);
        updaters.push((t) => {
          sockGroup.rotation.y = 0.5 + Math.sin(t * 0.9 + x) * 0.35;
          sockGroup.rotation.z = Math.sin(t * 1.7 + z) * 0.12;
        });
      }
    }
    group.add(props.build({ castShadow: true }));
  }

  /* ================================================================ */
  /* 10. 海岸岩石與植被（裝飾）                                          */
  /* ================================================================ */
  {
    const rocks = new U.PartBuilder();
    const greens = new U.PartBuilder();
    // 海岸線碎石
    for (const side of ['north', 'south']) {
      const isNorth = side === 'north';
      for (let x = -6.2; x <= 6.2; x += 0.21) {
        if (rand() > 0.5) continue;
        const coast = isNorth ? northCoastY(x) : southCoastY(x);
        const z = -coast + (isNorth ? -0.12 : 0.12);
        const s = 0.04 + rand() * 0.07;
        rocks.add(U.G.ico(s, 0), rockMat,
          [x + (rand() - 0.5) * 0.1, HEIGHTS.land + s * 0.35, z],
          [rand() * 3, rand() * 3, rand() * 3], [1, 0.7 + rand() * 0.5, 1]);
      }
    }
    // 內陸灌木與小樹（放在格子之間，避免擋住棋子）
    for (let r = 0; r < ROWS; r++) {
      if (r >= 5 && r <= 7) continue;
      for (let c = 0; c < COLS; c++) {
        if (rand() > 0.18) continue;
        const x = c - 6 + 0.5;
        const z = r - 6 + 0.5;
        if (Math.abs(x) > 6.2 || Math.abs(z) > 6.2) continue;
        if (rand() > 0.4) {
          // 灌木
          const s = 0.05 + rand() * 0.05;
          greens.add(U.G.ico(s, 0), greenMat,
            [x + (rand() - 0.5) * 0.2, HEIGHTS.land + s * 0.8, z + (rand() - 0.5) * 0.2]);
        } else {
          // 小樹
          const h = 0.12 + rand() * 0.1;
          greens.add(U.G.cyl(0.012, 0.018, h, 6), U.MAT.woodDark(), [x, HEIGHTS.land + h / 2, z]);
          greens.add(U.G.cone(0.07 + rand() * 0.03, 0.14 + rand() * 0.08, 7), greenMat,
            [x, HEIGHTS.land + h + 0.06, z], [0, rand() * 3, 0]);
        }
      }
    }
    group.add(rocks.build({ castShadow: false }));
    group.add(greens.build({ castShadow: true }));
  }

  /* ================================================================ */
  /* 11. 外框 / 桌面裝飾 / 名牌 / 羅盤                                  */
  /* ================================================================ */
  {
    const frameB = new U.PartBuilder();
    const frameDarkB = new U.PartBuilder();
    const frameGoldB = new U.PartBuilder();
    // 內壁
    const wallH = 0.76;
    const wallY = 0.22 - wallH / 2;
    for (const s of [-1, 1]) {
      frameDarkB.add(U.G.box(0.16, wallH, 13.9), frameInnerMat, [s * 6.55, wallY, 0]);
      frameDarkB.add(U.G.box(13.9, wallH, 0.16), frameInnerMat, [0, wallY, s * 6.55]);
    }
    // 框面（四邊）
    for (const s of [-1, 1]) {
      frameB.add(U.G.box(15.0, 0.24, 0.82), frameMat, [0, 0.12, s * 6.9]);
      frameB.add(U.G.box(0.82, 0.24, 15.0), frameMat, [s * 6.9, 0.12, 0]);
    }
    // 內側倒角
    for (const s of [-1, 1]) {
      frameB.add(U.G.box(14.1, 0.06, 0.1), frameMat, [0, 0.21, s * 6.53]);
      frameB.add(U.G.box(0.1, 0.06, 14.1), frameMat, [s * 6.53, 0.21, 0]);
    }
    // 黃銅鑲邊
    for (const s of [-1, 1]) {
      frameGoldB.add(U.G.box(14.35, 0.02, 0.045), goldMat, [0, 0.245, s * 6.62]);
      frameGoldB.add(U.G.box(14.35, 0.02, 0.045), goldMat, [0, 0.245, s * 7.18]);
      frameGoldB.add(U.G.box(0.045, 0.02, 14.35), goldMat, [s * 6.62, 0.245, 0]);
      frameGoldB.add(U.G.box(0.045, 0.02, 14.35), goldMat, [s * 7.18, 0.245, 0]);
    }
    // 外框桌腳裝飾（四角銅片 + 鉚釘）
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        frameGoldB.add(U.G.box(0.5, 0.03, 0.5), brassMat, [sx * 6.92, 0.245, sz * 6.92]);
        for (let i = 0; i < 4; i++) {
          frameGoldB.add(U.G.sphere(0.022, 8, 6), goldMat,
            [sx * 6.92 + (i % 2 ? 0.17 : -0.17), 0.265, sz * 6.92 + (i < 2 ? 0.17 : -0.17)]);
        }
      }
    }
    group.add(frameB.build({ castShadow: true, receiveShadow: true }));
    group.add(frameDarkB.build({ castShadow: true, receiveShadow: true }));
    group.add(frameGoldB.build({ castShadow: false }));

    // 壓克力名牌（放在南側框上，面向玩家）
    const plaqueTex = U.makePlaqueTexture();
    const plaqueW = 2.5, plaqueH = 0.78;
    const plaquePanel = new THREE.Mesh(
      new THREE.BoxGeometry(plaqueW, plaqueH, 0.055),
      new THREE.MeshStandardMaterial({ color: 0x101720, roughness: 0.35, metalness: 0.35 })
    );
    const plaqueFace = U.makeDecalPlane(plaqueTex, plaqueW - 0.04, plaqueH - 0.04);
    plaqueFace.position.z = 0.032;
    const plaqueGroup = new THREE.Group();
    plaqueGroup.add(plaquePanel, plaqueFace);
    plaqueGroup.position.set(0, 0.66, 7.02);
    plaqueGroup.rotation.x = -0.32;
    // 底座
    const plaqueFoot = new THREE.Mesh(U.G.box(0.9, 0.07, 0.36), brassMat);
    plaqueFoot.position.set(0, 0.275, 7.06);
    group.add(plaqueGroup, plaqueFoot);

    // 羅盤（南東角）
    const compassTex = makeCompassTexture();
    const compass = new THREE.Mesh(
      U.G.circle(0.3, 48),
      new THREE.MeshStandardMaterial({
        map: compassTex, transparent: true, roughness: 0.32, metalness: 0.55,
        envMapIntensity: 1.2, depthWrite: false,
      })
    );
    compass.rotation.x = -Math.PI / 2;
    compass.rotation.z = 0;
    compass.position.set(6.9, 0.252, 6.9);
    compass.renderOrder = 1;
    group.add(compass);
    // 南西角銅星
    const star = new THREE.Mesh(
      U.G.extrude(U.starShape(0.19, 0.08), 0.02, 0.004),
      brassMat
    );
    star.rotation.x = -Math.PI / 2;
    star.position.set(-6.9, 0.25, 6.9);
    group.add(star);
  }

  /* ================================================================ */
  /* API                                                                */
  /* ================================================================ */
  const _pos = new THREE.Vector3();

  function nodeWorld(id, target = new THREE.Vector3()) {
    const n = NODE[id];
    if (!n) return target.set(0, 0, 0);
    return target.set(n.x, groundY(id), n.z);
  }

  function groundY(id) {
    const n = NODE[id];
    if (!n) return HEIGHTS.land;
    if (n.bridge) return HEIGHTS.bridge;
    if (n.zone === 'sea') return HEIGHTS.sea;
    if (n.kind === 'airport') return HEIGHTS.airport;
    if (n.kind === 'gate') return HEIGHTS.gate;
    return HEIGHTS.land;
  }

  /** 射線 → 節點 id（棋盤內），失敗回傳 null */
  const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.02);
  const _hit = new THREE.Vector3();
  function pickNode(raycaster) {
    if (!raycaster.ray.intersectPlane(_plane, _hit)) return null;
    if (Math.abs(_hit.x) > 6.55 || Math.abs(_hit.z) > 6.55) return null;
    const col = Math.round(_hit.x + 6);
    const row = Math.round(_hit.z + 6);
    if (col < 0 || col > 12 || row < 0 || row > 12) return null;
    return nodeId(col, row);
  }

  function update(t) {
    for (const fn of updaters) fn(t);
  }

  function dispose() {
    U.disposeObject(group);
  }

  /** 動態換陣營色（城門旗、營旗） */
  function setSideColors(colors) {
    for (const side of ['north', 'south']) {
      sideColorMap[side] = pickColor(colors, side);
    }
    for (const b of bannerMeshes) {
      const old = b.mesh.material.map;
      b.mesh.material.map = makeSideBannerTexture(sideColorMap[b.side], b.side === 'south' ? '南' : '北');
      b.mesh.material.needsUpdate = true;
      old?.dispose?.();
    }
    for (const f of campFlags) {
      f.mesh.material.color.set(sideColorMap[f.side]);
    }
  }

  /** 畫質切換：0 = 低（簡化海面波紋） */
  function setQuality(q) {
    seaUniforms.uQuality.value = q >= 1 ? 1 : 0;
  }

  return { group, nodeWorld, groundY, pickNode, update, dispose, setSideColors, setQuality, HEIGHTS };
}

export default createBoard3D;
