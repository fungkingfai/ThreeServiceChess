/**
 * 三軍棋 3D — 棋子層
 * ------------------------------------------------------------------
 * 30 種棋子全部以程序化幾何生成（無外部模型檔）：
 *   官兵：軍官小雕像（軍帽、肩章星、披風、佩劍、望遠鏡、地圖…）
 *         騎兵（馬＋騎手）、步兵（步槍兵）、工兵（黃盔＋鐵鏟）
 *   武器：地雷、陷阱、炮壘、毒氣、飛彈、炸彈、原子炮、
 *         坦克車、大炮、高射炮、機關鎗
 *   海軍：主力艦、巡洋艦、炮艦、驅逐艦、潛水艇
 *   空軍：戰鬥機（後掠翼噴射機）、偵察機（雙翼機）
 *   軍旗：旗座＋飄動陣營旗
 * 隱藏棋（key=null）顯示「棋背」：陣營色圓徽＋軍種徽記（陸/海/空）。
 */
import * as THREE from 'three';
import { PIECE_BY_KEY, BRANCH } from '../core/pieces.js';
import * as U from './utils.js';

const PI = Math.PI;

/** 預設陣營配色（可被 setSideColors 覆寫） */
export const DEFAULT_SIDE_COLORS = {
  south: { main: '#a82834', dark: '#5b141f', light: '#e8604c', accent: '#f0c060', name: '南軍' },
  north: { main: '#2b5c9e', dark: '#17324e', light: '#6fa8e0', accent: '#d9e6f2', name: '北軍' },
};

export function normalizeSideColors(input) {
  const out = {};
  for (const side of ['south', 'north']) {
    const base = { ...DEFAULT_SIDE_COLORS[side] };
    const given = input && input[side] ? input[side] : {};
    out[side] = {
      ...base,
      ...given,
      main: given.main || given.primary || given.color || base.main,
      dark: given.dark || given.secondary || base.dark,
      light: given.light || base.light,
      accent: given.accent || base.accent,
    };
  }
  return out;
}

/* 共用材質（不隨陣營改變） */
const SKIN = U.MAT.skin();
const SKIN_DARK = U.MAT.skinShadow();
const GOLD = U.MAT.gold();
const BRASS = U.MAT.brass();
const SILVER = U.MAT.silver();
const STEEL = U.MAT.steel();
const DARKSTEEL = U.MAT.darkSteel();
const GUNMETAL = U.MAT.gunmetal();
const BLACK = U.MAT.black();
const RUBBER = U.MAT.rubber();
const WOOD = U.MAT.wood();
const WOOD_DARK = U.MAT.woodDark();
const SANDBAG = U.MAT.sandbag();
const CONCRETE = U.MAT.concrete();
const STONE = U.MAT.stone();
const GLASS = U.MAT.glass();
const GREEN = U.MAT.gasGreen();

/** 共用小幾何 */
const STAR_SMALL = U.G.extrude(U.starShape(0.017, 0.0072), 0.006, 0.001);
const STAR_TINY = U.G.extrude(U.starShape(0.012, 0.005), 0.005, 0.001);
const HORSE_BROWN = U.M(0x5c3b23, { metalness: 0.05, roughness: 0.85 });
const HORSE_DARK = U.M(0x33210f, { metalness: 0.05, roughness: 0.9 });
const CLOTH_WHITE = U.M(0xddd6c4, { roughness: 0.85, metalness: 0.02 });

/* ================================================================== */
/* 陣營材質組                                                          */
/* ================================================================== */

function createSideMats(cfg) {
  return {
    cfg,
    main: new THREE.MeshStandardMaterial({ color: cfg.main, metalness: 0.32, roughness: 0.46, envMapIntensity: 0.95 }),
    dark: new THREE.MeshStandardMaterial({ color: cfg.dark, metalness: 0.36, roughness: 0.5, envMapIntensity: 0.9 }),
    light: new THREE.MeshStandardMaterial({ color: cfg.light, metalness: 0.28, roughness: 0.42 }),
    accent: new THREE.MeshStandardMaterial({ color: cfg.accent, metalness: 0.9, roughness: 0.26, envMapIntensity: 1.3 }),
    cloth: new THREE.MeshStandardMaterial({ color: cfg.main, roughness: 0.86, metalness: 0.02, side: THREE.DoubleSide }),
    enamel: new THREE.MeshStandardMaterial({ color: cfg.main, metalness: 0.45, roughness: 0.3, envMapIntensity: 1.1 }),
    decal: new THREE.MeshBasicMaterial({ color: cfg.light, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({
      color: cfg.light, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }),
    ringGlow: new THREE.MeshBasicMaterial({
      color: cfg.light, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      side: THREE.DoubleSide,
    }),
  };
}

function applySideMats(set, cfg) {
  set.main.color.set(cfg.main);
  set.dark.color.set(cfg.dark);
  set.light.color.set(cfg.light);
  set.accent.color.set(cfg.accent);
  set.cloth.color.set(cfg.main);
  set.enamel.color.set(cfg.main);
  set.decal.color.set(cfg.light);
  set.glow.color.set(cfg.light);
  set.ringGlow.color.set(cfg.light);
}

/* ================================================================== */
/* 官兵小雕像                                                          */
/* ================================================================== */

function addFoot(b, mats, sx) {
  b.add(U.G.box(0.082, 0.048, 0.13), BLACK, [sx * 0.055, 0.024, 0.014]);
  b.add(U.G.cyl(0.036, 0.042, 0.18, 9), mats.dark, [sx * 0.055, 0.13, 0]);
}

function addArmBeams(b, from, to, mats) {
  const mid = new THREE.Vector3((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
  U.addBeam(b, new THREE.Vector3(...from), mid, 0.055, 0.055, mats.main);
  U.addBeam(b, mid, new THREE.Vector3(...to), 0.05, 0.05, mats.main);
}

function addSword(b, mats, hand, dir, len = 0.27) {
  const d = new THREE.Vector3(...dir).normalize();
  const h = new THREE.Vector3(...hand);
  const tip = h.clone().addScaledVector(d, len);
  b.add(U.G.box(0.016, 0.016, 0.21), GOLD, [h.x, h.y + 0.01, h.z + 0.02], [0, 0, 0]);
  U.addBeam(b, h.clone().addScaledVector(d, 0.02), tip, 0.026, 0.012, SILVER);
  b.add(U.G.box(0.06, 0.014, 0.03), GOLD, [h.x, h.y, h.z]);
  b.add(U.G.cyl(0.011, 0.011, 0.07, 6), WOOD_DARK, [
    h.x - d.x * 0.05, h.y - d.y * 0.05, h.z - d.z * 0.05,
  ]);
}

/**
 * 軍官雕像（面向 +z）
 * opts: { scale, stars, pose, cape, plume, cap, backFlag, scarf }
 */
function buildOfficer(b, mats, opts = {}) {
  const s = opts.scale ?? 1;
  const stars = opts.stars ?? 0;
  const pose = opts.pose ?? 'stand';
  const cap = opts.cap ?? 'peak';
  const S = (v) => v * s;

  // 腿與靴
  addFoot(b, mats, -1);
  addFoot(b, mats, 1);

  // 軀幹
  b.add(U.G.cyl(S(0.078), S(0.062), S(0.25), 14), mats.main, [0, S(0.345), 0]);
  // 腰帶
  b.add(U.G.cyl(S(0.079), S(0.079), S(0.032), 14), mats.dark, [0, S(0.235), 0]);
  b.add(U.G.box(S(0.052), S(0.03), S(0.02)), GOLD, [0, S(0.235), S(0.072)]);
  // 胸前斜帶
  b.add(U.G.box(S(0.11), S(0.026), S(0.014)), GOLD, [0, S(0.36), S(0.07)], [0, 0, 0.55]);
  // 排扣
  for (let i = 0; i < 3; i++) b.add(U.G.sphere(S(0.0075), 6, 5), GOLD, [0, S(0.31 + i * 0.045), S(0.077)]);

  // 肩與肩章
  for (const sx of [-1, 1]) {
    b.add(U.G.sphere(S(0.045), 9, 7), mats.main, [sx * S(0.088), S(0.44), 0]);
    b.add(U.G.box(S(0.1), S(0.018), S(0.075)), GOLD, [sx * S(0.088), S(0.466), 0]);
    for (let i = 0; i < stars; i++) {
      b.add(STAR_SMALL, GOLD,
        [sx * S(0.088) + (i - (stars - 1) / 2) * S(0.021), S(0.478), 0],
        [-PI / 2, 0, 0], S(0.75));
    }
  }

  // 手／手臂（依姿勢）
  const handL = [-S(0.115), S(0.235), S(0.01)];
  const handR = [S(0.115), S(0.235), S(0.01)];
  const shoulderL = [-S(0.09), S(0.43), 0];
  const shoulderR = [S(0.09), S(0.43), 0];

  if (pose === 'stand') {
    addArmBeams(b, shoulderL, handL, mats);
    addArmBeams(b, shoulderR, handR, mats);
  } else if (pose === 'sword_up') {
    const elbowR = [S(0.17), S(0.41), S(0.03)];
    const hR = [S(0.2), S(0.52), S(0.08)];
    addArmBeams(b, shoulderR, elbowR, mats);
    addArmBeams(b, elbowR, hR, mats);
    addArmBeams(b, shoulderL, [-S(0.12), S(0.3), S(0.05)], mats);
    handR[0] = hR[0]; handR[1] = hR[1]; handR[2] = hR[2];
    b.add(U.G.sphere(S(0.028), 8, 6), SKIN, hR);
    addSword(b, mats, hR, [0.24, 1, 0.06], S(0.3));
    // 左手
    b.add(U.G.sphere(S(0.028), 8, 6), SKIN, [-S(0.12), S(0.3), S(0.05)]);
  } else if (pose === 'sword_down') {
    const hR = [S(0.15), S(0.28), S(0.06)];
    addArmBeams(b, shoulderR, hR, mats);
    addArmBeams(b, shoulderL, [-S(0.115), S(0.26), S(0.02)], mats);
    b.add(U.G.sphere(S(0.028), 8, 6), SKIN, hR);
    b.add(U.G.sphere(S(0.028), 8, 6), SKIN, [-S(0.115), S(0.26), S(0.02)]);
    addSword(b, mats, hR, [0.12, -0.35, 0.9], S(0.28));
  } else if (pose === 'binoculars') {
    const hL = [-S(0.045), S(0.545), S(0.075)];
    const hR = [S(0.045), S(0.545), S(0.075)];
    addArmBeams(b, shoulderL, [-S(0.12), S(0.47), S(0.05)], mats);
    addArmBeams(b, [-S(0.12), S(0.47), S(0.05)], hL, mats);
    addArmBeams(b, shoulderR, [S(0.12), S(0.47), S(0.05)], mats);
    addArmBeams(b, [S(0.12), S(0.47), S(0.05)], hR, mats);
    b.add(U.G.sphere(S(0.027), 8, 6), SKIN, hL);
    b.add(U.G.sphere(S(0.027), 8, 6), SKIN, hR);
    b.add(U.G.box(S(0.075), S(0.045), S(0.06)), DARKSTEEL, [0, S(0.552), S(0.1)]);
    for (const sx of [-1, 1]) {
      b.add(U.G.cyl(S(0.022), S(0.026), S(0.05), 10), BLACK, [sx * S(0.035), S(0.552), S(0.14)], [PI / 2, 0, 0]);
      b.add(U.G.cyl(S(0.017), S(0.017), S(0.01), 10), GOLD, [sx * S(0.035), S(0.552), S(0.168)], [PI / 2, 0, 0]);
    }
  } else if (pose === 'map') {
    const hL = [-S(0.06), S(0.37), S(0.13)];
    addArmBeams(b, shoulderL, hL, mats);
    addArmBeams(b, shoulderR, [S(0.11), S(0.27), S(0.02)], mats);
    b.add(U.G.sphere(S(0.028), 8, 6), SKIN, hL);
    b.add(U.G.sphere(S(0.028), 8, 6), SKIN, [S(0.11), S(0.27), S(0.02)]);
    // 捲起的地圖
    b.add(U.G.cyl(S(0.024), S(0.024), S(0.16), 10), CLOTH_WHITE, [S(-0.02), S(0.375), S(0.145)], [0, 0, PI / 2]);
    b.add(U.G.cyl(S(0.026), S(0.026), S(0.02), 10), mats.accent, [S(-0.095), S(0.375), S(0.145)], [0, 0, PI / 2]);
  } else if (pose === 'point') {
    const hR = [S(0.15), S(0.45), S(0.16)];
    addArmBeams(b, shoulderR, [S(0.13), S(0.44), S(0.07)], mats);
    addArmBeams(b, [S(0.13), S(0.44), S(0.07)], hR, mats);
    addArmBeams(b, shoulderL, [-S(0.13), S(0.3), S(0.03)], mats);
    b.add(U.G.sphere(S(0.028), 8, 6), SKIN, hR);
    b.add(U.G.box(S(0.022), S(0.022), S(0.05)), SKIN_DARK, [hR[0], hR[1], hR[2] + S(0.045)]);
    b.add(U.G.sphere(S(0.028), 8, 6), SKIN, [-S(0.13), S(0.3), S(0.03)]);
  } else if (pose === 'pistol') {
    const hR = [S(0.14), S(0.34), S(0.09)];
    addArmBeams(b, shoulderR, hR, mats);
    addArmBeams(b, shoulderL, [-S(0.115), S(0.27), S(0.02)], mats);
    b.add(U.G.sphere(S(0.028), 8, 6), SKIN, hR);
    b.add(U.G.sphere(S(0.028), 8, 6), SKIN, [-S(0.115), S(0.27), S(0.02)]);
    b.add(U.G.box(S(0.02), S(0.05), S(0.08)), DARKSTEEL, [hR[0], hR[1], hR[2] + S(0.035)]);
    b.add(U.G.cyl(S(0.012), S(0.012), S(0.05), 8), GUNMETAL, [hR[0], hR[1] + S(0.01), hR[2] + S(0.09)], [PI / 2, 0, 0]);
  }

  // 頭與臉
  b.add(U.G.cyl(S(0.03), S(0.035), S(0.05), 8), SKIN_DARK, [0, S(0.49), 0]);
  b.add(U.G.sphere(S(0.058), 16, 12), SKIN, [0, S(0.56), 0]);
  for (const sx of [-1, 1]) {
    b.add(U.G.sphere(S(0.009), 6, 5), BLACK, [sx * S(0.021), S(0.565), S(0.051)]);
  }
  b.add(U.G.box(S(0.075), S(0.02), S(0.05)), SKIN_DARK, [0, S(0.4), S(0.02)]); // 下巴陰影/領口

  // 帽子
  if (cap === 'helmet') {
    b.add(U.G.sphere(S(0.072), 14, 10), U.M(0x55603a, { metalness: 0.3, roughness: 0.5 }), [0, S(0.6), 0], [0, 0, 0], [1, 0.72, 1]);
    b.add(U.G.torus(S(0.07), S(0.012), 6, 18, PI * 1.1), U.M(0x3c4527, { metalness: 0.3, roughness: 0.5 }), [0, S(0.6), 0], [PI / 2, 0, PI * 0.95]);
  } else if (cap === 'side') {
    b.add(U.G.box(S(0.115), S(0.04), S(0.105)), mats.dark, [0, S(0.615), 0], [0.06, 0, 0]);
    b.add(U.G.box(S(0.09), S(0.02), S(0.03)), mats.accent, [0, S(0.62), S(0.055)]);
  } else {
    b.add(U.G.cyl(S(0.06), S(0.066), S(0.052), 14), mats.dark, [0, S(0.618), 0]);
    b.add(U.G.cyl(S(0.069), S(0.069), S(0.012), 14), mats.dark, [0, S(0.646), 0]);
    b.add(U.G.box(S(0.085), S(0.012), S(0.045)), BLACK, [0, S(0.602), S(0.056)], [0.22, 0, 0]);
    b.add(U.G.sphere(S(0.013), 8, 6), GOLD, [0, S(0.625), S(0.062)]);
  }
  if (opts.plume) {
    b.add(U.G.cyl(S(0.012), S(0.02), S(0.12), 6), GOLD, [0, S(0.71), S(0.01)]);
    b.add(U.G.cone(S(0.045), S(0.12), 10), mats.light, [0, S(0.79), S(0.01)]);
    b.add(U.G.cyl(S(0.008), S(0.04), S(0.08), 6), mats.accent, [0, S(0.72), -S(0.05)], [0.25, 0, 0]);
  }

  // 披風
  if (opts.cape) {
    const capeGeo = new THREE.CylinderGeometry(S(0.07), S(0.23), S(0.44), 16, 1, true, PI * 0.72, PI * 0.56);
    b.add(capeGeo, mats.cloth, [0, S(0.28), 0], [0, PI, 0]);
    // 披風下緣金邊
    b.add(U.G.torus(S(0.225), S(0.014), 6, 20, PI * 0.56), GOLD, [0, S(0.065), 0], [PI / 2, 0, PI * 0.22]);
  }

  // 背後小軍旗（團長／兵團司令）
  if (opts.backFlag) {
    const pole = [S(0.02), S(0.4), -S(0.12)];
    b.add(U.G.cyl(S(0.009), S(0.009), S(0.55), 6), BRASS, pole, [0.1, 0, -0.18]);
    b.add(U.G.plane(S(0.19), S(0.13)), mats.decal, [S(0.11), S(0.6), -S(0.19)], [0, -0.35, 0]);
  }
  // 金色飾繩
  if (opts.scarf) {
    b.add(U.G.torus(S(0.085), S(0.012), 6, 16, PI * 0.9), GOLD, [0, S(0.44), 0], [PI / 2, 0, 0]);
  }
  return b;
}

/* ---------------- 騎兵 ---------------- */

function buildCavalry(b, mats) {
  // 馬身
  b.add(U.G.capsule(0.072, 0.24, 5, 10), HORSE_BROWN, [0, 0.34, -0.01], [PI / 2, 0, 0]);
  b.add(U.G.sphere(0.085, 12, 9), HORSE_BROWN, [0, 0.35, 0.19], [0, 0, 0], [1, 0.95, 0.9]);
  b.add(U.G.sphere(0.078, 12, 9), HORSE_BROWN, [0, 0.35, -0.19]);
  // 腿
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.add(U.G.cyl(0.017, 0.02, 0.26, 7), HORSE_BROWN, [sx * 0.05, 0.16, sz * 0.14 - 0.01]);
      b.add(U.G.cyl(0.024, 0.024, 0.03, 7), HORSE_DARK, [sx * 0.05, 0.025, sz * 0.14 - 0.01]);
    }
  }
  // 頸與頭
  const neckFrom = new THREE.Vector3(0, 0.4, 0.18);
  const neckTo = new THREE.Vector3(0, 0.55, 0.3);
  U.addBeam(b, neckFrom, neckTo, 0.11, 0.12, HORSE_BROWN, 0.0);
  b.add(U.G.box(0.07, 0.075, 0.16), HORSE_BROWN, [0, 0.58, 0.37], [0.5, 0, 0]);
  b.add(U.G.box(0.045, 0.04, 0.05), HORSE_DARK, [0, 0.53, 0.45], [0.5, 0, 0]);
  for (const sx of [-1, 1]) b.add(U.G.cone(0.012, 0.04, 5), HORSE_BROWN, [sx * 0.025, 0.64, 0.33], [0.2, 0, 0]);
  // 鬃毛與尾
  b.add(U.G.box(0.02, 0.06, 0.24), HORSE_DARK, [0, 0.58, 0.28], [0.5, 0, 0]);
  b.add(U.G.cone(0.03, 0.26, 6), HORSE_DARK, [0, 0.33, -0.32], [-0.9, 0, 0]);
  // 馬鞍與鞍布
  b.add(U.G.box(0.14, 0.022, 0.2), mats.dark, [0, 0.425, -0.01]);
  b.add(U.G.box(0.11, 0.04, 0.16), mats.main, [0, 0.445, -0.01]);
  b.add(U.G.box(0.1, 0.03, 0.04), GOLD, [0, 0.44, 0.075]);
  // 韁繩
  b.add(U.G.torus(0.055, 0.006, 5, 12, PI), GOLD, [0, 0.56, 0.4], [PI / 2, 0, 0]);

  // 騎手（縮小軍官，坐姿）
  const r = 0.62;
  const S = (v) => v * r;
  b.add(U.G.cyl(S(0.075), S(0.06), S(0.22), 12), mats.main, [0, 0.56, -0.02]);
  b.add(U.G.cyl(S(0.077), S(0.077), S(0.03), 12), mats.dark, [0, 0.47, -0.02]);
  b.add(U.G.box(S(0.05), S(0.03), S(0.02)), GOLD, [0, 0.47, 0.03]);
  for (const sx of [-1, 1]) {
    b.add(U.G.sphere(S(0.042), 8, 7), mats.main, [sx * S(0.085), 0.645, -0.01]);
    b.add(U.G.box(S(0.095), S(0.016), S(0.07)), GOLD, [sx * S(0.085), 0.668, -0.01]);
    for (let i = 0; i < 2; i++) b.add(STAR_TINY, GOLD, [sx * S(0.085) + (i - 0.5) * S(0.024), 0.678, -0.01], [-PI / 2, 0, 0], 0.9);
  }
  // 腿（跨坐）
  for (const sx of [-1, 1]) {
    b.add(U.G.cyl(S(0.03), S(0.034), S(0.15), 7), mats.dark, [sx * 0.085, 0.48, 0.06], [0.9, 0, sx * 0.35]);
  }
  // 手臂：右手舉刀
  U.addBeam(b, [0.06, 0.64, 0], [0.16, 0.7, 0.06], 0.045, 0.045, mats.main);
  U.addBeam(b, [0.16, 0.7, 0.06], [0.2, 0.8, 0.1], 0.04, 0.04, mats.main);
  b.add(U.G.sphere(S(0.027), 8, 6), SKIN, [0.2, 0.8, 0.1]);
  addSword(b, mats, [0.2, 0.8, 0.1], [0.25, 1, 0.1], 0.24);
  U.addBeam(b, [-0.06, 0.64, 0], [-0.11, 0.53, 0.08], 0.045, 0.045, mats.main);
  b.add(U.G.sphere(S(0.027), 8, 6), SKIN, [-0.11, 0.53, 0.08]);
  // 頭
  b.add(U.G.sphere(S(0.058), 14, 10), SKIN, [0, 0.78, -0.01]);
  for (const sx of [-1, 1]) b.add(U.G.sphere(S(0.008), 6, 5), BLACK, [sx * S(0.02), 0.785, S(0.05) - 0.01]);
  b.add(U.G.cyl(S(0.058), S(0.062), S(0.045), 12), mats.dark, [0, 0.835, -0.01]);
  b.add(U.G.box(S(0.08), S(0.012), S(0.04)), BLACK, [0, 0.822, 0.04], [0.2, 0, 0]);
  b.add(U.G.sphere(S(0.012), 8, 6), GOLD, [0, 0.832, 0.045]);
}

/* ---------------- 步兵 ---------------- */

function buildInfantry(b, mats) {
  // 腿
  for (const sx of [-1, 1]) {
    b.add(U.G.box(0.085, 0.05, 0.13), U.M(0x3a3a32, { roughness: 0.9 }), [sx * 0.055, 0.025, 0.01]);
    b.add(U.G.cyl(0.038, 0.044, 0.19, 9), U.M(0x4b5540, { roughness: 0.85 }), [sx * 0.055, 0.14, 0]);
  }
  // 軍服
  b.add(U.G.cyl(0.08, 0.066, 0.25, 14), mats.main, [0, 0.35, 0]);
  b.add(U.G.cyl(0.082, 0.082, 0.035, 14), mats.dark, [0, 0.235, 0]);
  b.add(U.G.box(0.05, 0.03, 0.02), GOLD, [0, 0.235, 0.074]);
  // 背包
  b.add(U.G.box(0.13, 0.16, 0.07), U.M(0x6a5c3c, { roughness: 0.9 }), [0, 0.36, -0.1]);
  b.add(U.G.cyl(0.02, 0.02, 0.14, 8), WOOD, [0.085, 0.44, -0.08], [0, 0, 0.4]);
  // 肩
  for (const sx of [-1, 1]) b.add(U.G.sphere(0.044, 9, 7), mats.main, [sx * 0.088, 0.445, 0]);
  // 手臂：持步槍斜跨胸前
  const hL = [0.02, 0.3, 0.12];
  const hR = [-0.1, 0.42, 0.05];
  U.addBeam(b, [-0.09, 0.43, 0], [-0.12, 0.33, 0.04], 0.052, 0.052, mats.main);
  U.addBeam(b, [-0.12, 0.33, 0.04], hL, 0.047, 0.047, mats.main);
  U.addBeam(b, [0.09, 0.43, 0], [0.12, 0.4, 0.06], 0.052, 0.052, mats.main);
  U.addBeam(b, [0.12, 0.4, 0.06], hR, 0.047, 0.047, mats.main);
  b.add(U.G.sphere(0.027, 8, 6), SKIN, hL);
  b.add(U.G.sphere(0.027, 8, 6), SKIN, hR);
  // 步槍（斜背）
  const rifleFrom = new THREE.Vector3(-0.2, 0.2, 0.16);
  const rifleTo = new THREE.Vector3(0.16, 0.72, 0.1);
  U.addBeam(b, rifleFrom, rifleTo, 0.022, 0.022, WOOD_DARK);
  U.addBeam(b, rifleTo, new THREE.Vector3(0.19, 0.82, 0.09), 0.013, 0.013, GUNMETAL);
  b.add(U.G.box(0.03, 0.06, 0.02), GUNMETAL, [0.13, 0.66, 0.11]);
  // 頭盔
  b.add(U.G.sphere(0.06, 16, 12), SKIN, [0, 0.56, 0]);
  for (const sx of [-1, 1]) b.add(U.G.sphere(0.009, 6, 5), BLACK, [sx * 0.021, 0.565, 0.052]);
  b.add(U.G.sphere(0.073, 14, 10), U.M(0x50603c, { metalness: 0.35, roughness: 0.45 }), [0, 0.6, 0], [0, 0, 0], [1, 0.75, 1.05]);
  b.add(U.G.torus(0.072, 0.013, 6, 18, PI * 1.2), U.M(0x3c4a2c, { metalness: 0.3, roughness: 0.5 }), [0, 0.596, 0], [PI / 2, 0, PI * 0.9]);
  // 下頷帶
  b.add(U.G.torus(0.058, 0.006, 5, 14, PI * 0.9), U.M(0x3a3a2c, { roughness: 0.9 }), [0, 0.55, 0], [0, 0, PI * 0.05]);
}

/* ---------------- 工兵 ---------------- */

function buildEngineer(b, mats) {
  // 腿
  for (const sx of [-1, 1]) {
    b.add(U.G.box(0.085, 0.05, 0.13), U.M(0x4a4030, { roughness: 0.9 }), [sx * 0.055, 0.025, 0.01]);
    b.add(U.G.cyl(0.038, 0.044, 0.19, 9), U.M(0x6b6248, { roughness: 0.85 }), [sx * 0.055, 0.14, 0]);
  }
  // 工作服
  b.add(U.G.cyl(0.082, 0.068, 0.25, 14), mats.main, [0, 0.35, 0]);
  b.add(U.G.cyl(0.084, 0.084, 0.035, 14), U.M(0x4a4030, { roughness: 0.9 }), [0, 0.235, 0]);
  b.add(U.G.box(0.05, 0.032, 0.02), GOLD, [0, 0.235, 0.075]);
  // 工具腰帶
  for (let i = 0; i < 3; i++) {
    b.add(U.G.box(0.045, 0.07, 0.03), U.M(0x5a4a2e, { roughness: 0.9 }), [(-1 + i) * 0.06, 0.2, 0.07]);
  }
  // 肩上鐵鏟
  const shovelFrom = new THREE.Vector3(-0.18, 0.42, -0.02);
  const shovelTo = new THREE.Vector3(0.14, 0.66, 0.06);
  U.addBeam(b, shovelFrom, shovelTo, 0.02, 0.02, WOOD);
  b.add(U.G.box(0.1, 0.13, 0.02), STEEL, [0.18, 0.72, 0.08], [0, 0, -0.5]);
  // 肩
  for (const sx of [-1, 1]) b.add(U.G.sphere(0.044, 9, 7), mats.main, [sx * 0.088, 0.445, 0]);
  // 手臂
  U.addBeam(b, [0.09, 0.43, 0], [0.13, 0.5, 0.06], 0.052, 0.052, mats.main);
  b.add(U.G.sphere(0.027, 8, 6), SKIN, [0.13, 0.5, 0.06]);
  U.addBeam(b, [-0.09, 0.43, 0], [-0.12, 0.3, 0.05], 0.052, 0.052, mats.main);
  b.add(U.G.sphere(0.027, 8, 6), SKIN, [-0.12, 0.3, 0.05]);
  // 頭
  b.add(U.G.sphere(0.06, 16, 12), SKIN, [0, 0.56, 0]);
  for (const sx of [-1, 1]) b.add(U.G.sphere(0.009, 6, 5), BLACK, [sx * 0.021, 0.565, 0.052]);
  // 黃色安全帽
  b.add(U.G.sphere(0.078, 16, 10), U.M(0xe0b23a, { metalness: 0.2, roughness: 0.4 }), [0, 0.61, 0], [0, 0, 0], [1, 0.72, 1.02]);
  b.add(U.G.cyl(0.088, 0.09, 0.014, 16), U.M(0xc49726, { metalness: 0.2, roughness: 0.4 }), [0, 0.585, 0.01]);
  b.add(U.G.box(0.02, 0.05, 0.03), U.M(0xe0b23a, { metalness: 0.2, roughness: 0.4 }), [0, 0.64, 0.075]);
}

/* ================================================================== */
/* 武器                                                                */
/* ================================================================== */

function buildMine(b, mats) {
  const sand = U.G.torus(0.27, 0.055, 6, 26);
  b.add(sand, SANDBAG, [0, 0.03, 0], [PI / 2, 0, 0], [1, 0.7, 1]);
  b.add(U.G.cyl(0.25, 0.27, 0.07, 28), DARKSTEEL, [0, 0.03, 0]);
  b.add(U.G.cyl(0.26, 0.26, 0.012, 28), U.M(0x6b5b3a, { metalness: 0.4, roughness: 0.7 }), [0, 0.065, 0]);
  b.add(U.G.torus(0.255, 0.016, 6, 30), GOLD, [0, 0.07, 0], [PI / 2, 0, 0]);
  // 放射刻痕
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2;
    b.add(U.G.box(0.13, 0.014, 0.022), BLACK, [Math.sin(a) * 0.14, 0.075, Math.cos(a) * 0.14], [0, a, 0]);
  }
  // 引信
  b.add(U.G.cyl(0.045, 0.05, 0.05, 12), GUNMETAL, [0, 0.1, 0]);
  b.add(U.G.cyl(0.012, 0.012, 0.07, 8), BRASS, [0, 0.15, 0]);
  // 四根角刺
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    const from = new THREE.Vector3(Math.sin(a) * 0.06, 0.1, Math.cos(a) * 0.06);
    const to = new THREE.Vector3(Math.sin(a) * 0.19, 0.22, Math.cos(a) * 0.19);
    U.addBeam(b, from, to, 0.012, 0.012, STEEL);
    b.add(U.G.sphere(0.017, 6, 5), GUNMETAL, [to.x, to.y, to.z]);
  }
  // 紅色警示燈（獨立網格，會閃爍）
  const led = new THREE.Mesh(U.G.sphere(0.028, 10, 8), U.E(0xff3b22, 2.6));
  led.position.set(0, 0.04, 0.27);
  led.castShadow = false;
  b.add(U.G.cyl(0.032, 0.038, 0.03, 10), DARKSTEEL, [0, 0.025, 0.27]);
  return { extras: [led] };
}

function buildTrap(b, mats) {
  // 沙袋圍圈
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2;
    b.add(U.G.capsule(0.055, 0.13, 4, 8), SANDBAG,
      [Math.sin(a) * 0.3, 0.055, Math.cos(a) * 0.3], [PI / 2, 0, -a], [1, 1, 0.85]);
  }
  // 坑洞
  b.add(U.G.cyl(0.24, 0.22, 0.07, 24), U.M(0x0a0806, { roughness: 1 }), [0, 0.02, 0]);
  b.add(U.G.ring(0.22, 0.28, 24), U.M(0x2a2018, { roughness: 1 }), [0, 0.055, 0], [-PI / 2, 0, 0]);
  // 尖刺
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    const r = i % 2 ? 0.11 : 0.17;
    b.add(U.G.cone(0.028, 0.17, 6), STEEL,
      [Math.sin(a) * r, 0.1, Math.cos(a) * r], [0.22 * Math.sin(a), 0, -0.22 * Math.cos(a)]);
  }
  b.add(U.G.cone(0.03, 0.15, 6), SILVER, [0, 0.1, 0]);
  // 警示牌
  b.add(U.G.cyl(0.012, 0.012, 0.3, 6), WOOD_DARK, [0.22, 0.16, 0.18]);
  b.add(U.G.box(0.16, 0.11, 0.015), U.M(0xd8b23c, { roughness: 0.7 }), [0.22, 0.34, 0.18], [0, 0.3, 0]);
  b.add(U.G.box(0.1, 0.03, 0.017), BLACK, [0.22, 0.34, 0.19], [0, 0.3, 0]);
}

function buildFort(b, mats) {
  // 混凝土基座
  b.add(U.G.cyl(0.3, 0.32, 0.09, 20), CONCRETE, [0, 0.045, 0]);
  // 沙包牆（前弧）
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 7; i++) {
      const a = -PI * 0.55 + (i / 6) * PI * 1.1;
      const r = 0.29 - row * 0.015;
      b.add(U.G.capsule(0.05, 0.1, 4, 8), SANDBAG,
        [Math.sin(a) * r, 0.1 + row * 0.07, Math.cos(a) * r],
        [0, a, 0], [1, 1, 0.9]);
    }
  }
  // 碉堡主體
  b.add(U.G.cyl(0.22, 0.25, 0.2, 8), CONCRETE, [0, 0.19, 0]);
  b.add(U.G.cyl(0.24, 0.24, 0.02, 8), U.M(0x6f6b60, { roughness: 0.9 }), [0, 0.3, 0]);
  // 炮塔
  b.add(U.G.cyl(0.13, 0.15, 0.1, 16), DARKSTEEL, [0, 0.35, 0]);
  b.add(U.G.sphere(0.12, 14, 8), DARKSTEEL, [0, 0.4, 0], [0, 0, 0], [1, 0.55, 1]);
  // 炮管（朝 +z，微微抬高）
  const gunFrom = new THREE.Vector3(0, 0.38, 0.06);
  const gunTo = new THREE.Vector3(0, 0.46, 0.44);
  U.addBeam(b, gunFrom, gunTo, 0.065, 0.065, GUNMETAL);
  b.add(U.G.cyl(0.045, 0.05, 0.07, 12), DARKSTEEL, [0, 0.465, 0.46], [PI / 2 - 0.2, 0, 0]);
  // 沙包上的陣營識別布
  b.add(U.G.box(0.1, 0.015, 0.03), mats.main, [0, 0.27, 0.27], [0.2, 0, 0]);
  b.add(U.G.box(0.05, 0.06, 0.012), mats.accent, [0, 0.2, 0.315]);
  // 彈藥箱
  b.add(U.G.box(0.1, 0.07, 0.06), U.M(0x4c5236, { roughness: 0.85 }), [0.25, 0.08, -0.05], [0, 0.5, 0]);
}

function buildGas(b, mats) {
  // 鋼瓶底座
  for (const sx of [-1, 1]) {
    b.add(U.G.cyl(0.055, 0.055, 0.22, 12), U.M(0x4d6b3a, { metalness: 0.6, roughness: 0.4 }), [sx * 0.1, 0.13, 0]);
    b.add(U.G.cyl(0.06, 0.06, 0.02, 12), GOLD, [sx * 0.1, 0.25, 0]);
    b.add(U.G.sphere(0.035, 10, 8), BRASS, [sx * 0.1, 0.28, 0]);
  }
  b.add(U.G.box(0.3, 0.05, 0.18), DARKSTEEL, [0, 0.03, 0]);
  // 毒霧球（半透明綠）
  const cloud = new THREE.Group();
  const blobs = [
    [0, 0.4, 0, 0.13], [-0.12, 0.34, 0.06, 0.09], [0.12, 0.36, -0.03, 0.1],
    [0.03, 0.5, 0.05, 0.08], [-0.05, 0.3, -0.08, 0.07],
  ];
  for (const [x, y, z, r] of blobs) {
    const m = new THREE.Mesh(U.G.sphere(r, 12, 10), GREEN);
    m.position.set(x, y, z);
    m.castShadow = false;
    cloud.add(m);
  }
  // 毒氣標誌
  b.add(U.G.cyl(0.01, 0.01, 0.38, 6), WOOD_DARK, [0.24, 0.19, 0.1]);
  const skullTex = U.makeSkullTexture();
  const sign = U.makeDecalPlane(skullTex, 0.17, 0.17);
  sign.position.set(0.24, 0.4, 0.13);
  sign.rotation.y = 0.3;
  b.addM(U.G.box(0.18, 0.18, 0.012), U.M(0x2a2a20, { roughness: 0.9 }), U.mat4([0.24, 0.4, 0.11], [0, 0.3, 0]));
  return { extras: [cloud, sign], cloud };
}

function buildMissile(b, mats) {
  // 三腳架
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    U.addBeam(b, new THREE.Vector3(0, 0.16, 0), new THREE.Vector3(Math.sin(a) * 0.26, 0.02, Math.cos(a) * 0.26), 0.035, 0.035, DARKSTEEL);
    b.add(U.G.box(0.09, 0.02, 0.09), GUNMETAL, [Math.sin(a) * 0.26, 0.012, Math.cos(a) * 0.26], [0, a, 0]);
  }
  b.add(U.G.cyl(0.08, 0.1, 0.06, 12), DARKSTEEL, [0, 0.18, 0]);
  // 發射臂（仰角 52°）
  const tilt = -0.92;
  b.add(U.G.box(0.11, 0.05, 0.56), GUNMETAL, [0, 0.34, 0.02], [tilt, 0, 0]);
  b.add(U.G.box(0.13, 0.03, 0.1), DARKSTEEL, [0, 0.55, -0.16], [tilt, 0, 0]);
  // 火箭本體（沿發射臂方向，仰角上揚）
  const rocket = new THREE.Group();
  const body = new THREE.Mesh(U.G.cyl(0.048, 0.048, 0.34, 14), U.M(0xd8d2c2, { metalness: 0.4, roughness: 0.35 }));
  const nose = new THREE.Mesh(U.G.cone(0.048, 0.13, 14), U.M(0xb32632, { metalness: 0.4, roughness: 0.35 }));
  nose.position.y = 0.235;
  const band = new THREE.Mesh(U.G.cyl(0.05, 0.05, 0.03, 14), mats.accent);
  band.position.y = -0.1;
  rocket.add(body, nose, band);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2;
    const fin = new THREE.Mesh(U.G.box(0.012, 0.1, 0.09), mats.main);
    fin.position.set(Math.sin(a) * 0.05, -0.16, Math.cos(a) * 0.05);
    fin.rotation.y = -a;
    rocket.add(fin);
  }
  const missileGroup = new THREE.Group();
  missileGroup.add(rocket);
  missileGroup.position.set(0, 0.3, 0.12);
  missileGroup.rotation.x = 0.92;
  // 發射臂支撐
  b.add(U.G.cyl(0.03, 0.035, 0.2, 8), DARKSTEEL, [0, 0.25, 0.16], [tilt, 0, 0]);
  // 控制箱與警示燈
  b.add(U.G.box(0.13, 0.09, 0.08), U.M(0x4a5233, { roughness: 0.7 }), [0.16, 0.08, 0.08], [0, 0.35, 0]);
  b.add(U.G.box(0.02, 0.02, 0.02), U.E(0xffc23a, 2.2), [0.16, 0.14, 0.08]);
  return { extras: [missileGroup], missileGroup };
}

function buildBomb(b, mats) {
  // 炸彈支架
  b.add(U.G.box(0.18, 0.04, 0.18), DARKSTEEL, [0, 0.03, 0]);
  for (const sx of [-1, 1]) b.add(U.G.box(0.03, 0.07, 0.13), GUNMETAL, [sx * 0.1, 0.075, 0], [0, 0, sx * 0.3]);
  // 彈體
  b.add(U.G.sphere(0.15, 20, 16), U.M(0x1b1d20, { metalness: 0.55, roughness: 0.38 }), [0, 0.22, 0]);
  b.add(U.G.cyl(0.12, 0.15, 0.1, 16), U.M(0x14161a, { metalness: 0.6, roughness: 0.4 }), [0, 0.36, 0]);
  // 紅色警示環
  b.add(U.G.torus(0.15, 0.012, 6, 24), U.M(0xc42b2b, { roughness: 0.55 }), [0, 0.22, 0], [PI / 2, 0, 0]);
  // 尾翼
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2;
    b.add(U.G.box(0.02, 0.13, 0.09), GUNMETAL, [Math.sin(a) * 0.1, 0.42, Math.cos(a) * 0.1], [0.4, -a, 0]);
  }
  // 引信
  b.add(U.G.torus(0.1, 0.012, 6, 16, PI), BRASS, [0.0, 0.47, 0], [0, 0, 0.4]);
  // 警示貼紙
  b.add(U.G.box(0.09, 0.05, 0.01), U.M(0xd9b23a, { roughness: 0.7 }), [0.11, 0.24, 0.1], [0, -0.6, 0.2]);
  // 火花
  const spark = new THREE.Mesh(U.G.sphere(0.026, 8, 6), U.E(0xffb347, 3.2));
  spark.position.set(0.17, 0.44, 0);
  return { extras: [spark], spark };
}

function buildAtomic(b, mats) {
  // 履帶底盤
  for (const sx of [-1, 1]) {
    b.add(U.G.box(0.14, 0.12, 0.5), RUBBER, [sx * 0.21, 0.07, -0.02]);
    for (let i = 0; i < 4; i++) {
      b.add(U.G.cyl(0.055, 0.055, 0.15, 10), DARKSTEEL, [sx * 0.21, 0.055, -0.2 + i * 0.13], [0, 0, PI / 2]);
    }
    for (let i = 0; i < 6; i++) {
      b.add(U.G.box(0.17, 0.018, 0.03), GUNMETAL, [sx * 0.21, 0.135, -0.24 + i * 0.09]);
    }
  }
  b.add(U.G.box(0.32, 0.06, 0.52), DARKSTEEL, [0, 0.13, -0.02]);
  // 厚重防護罩
  b.add(U.G.box(0.38, 0.24, 0.4), U.M(0x555a3c, { metalness: 0.5, roughness: 0.5 }), [0, 0.27, -0.06]);
  b.add(U.G.box(0.3, 0.02, 0.3), U.M(0x6a7048, { metalness: 0.4, roughness: 0.6 }), [0, 0.39, -0.06]);
  // 黃黑警示條
  for (let i = 0; i < 4; i++) {
    b.add(U.G.box(0.06, 0.18, 0.012), U.M(i % 2 ? 0x1c1c18 : 0xd8b53a, { roughness: 0.6 }),
      [-0.14 + i * 0.095, 0.27, 0.145], [0, 0, 0.35]);
  }
  // 超粗炮管（朝 +z）
  const barrelFrom = new THREE.Vector3(0, 0.32, 0.05);
  const barrelTo = new THREE.Vector3(0, 0.44, 0.62);
  U.addBeam(b, barrelFrom, barrelTo, 0.15, 0.15, GUNMETAL);
  b.add(U.G.cyl(0.1, 0.115, 0.09, 14), DARKSTEEL, [0, 0.445, 0.63], [PI / 2 - 0.2, 0, 0]);
  b.add(U.G.cyl(0.06, 0.06, 0.03, 12), BLACK, [0, 0.452, 0.68], [PI / 2 - 0.2, 0, 0]);
  // 炮口制退器
  for (const sx of [-1, 1]) b.add(U.G.box(0.03, 0.09, 0.09), GUNMETAL, [sx * 0.07, 0.44, 0.64]);
  // 散熱管
  b.add(U.G.cyl(0.02, 0.02, 0.26, 8), BRASS, [0.18, 0.24, -0.1], [0.3, 0, 0.2]);
  b.add(U.G.cyl(0.02, 0.02, 0.26, 8), BRASS, [-0.18, 0.24, -0.1], [0.3, 0, -0.2]);
  // 輻射標誌（貼在正面）
  const radTex = U.makeRadiationTexture();
  const decal = U.makeDecalPlane(radTex, 0.2, 0.2);
  decal.position.set(0, 0.27, 0.15);
  return { extras: [decal] };
}

function buildTank(b, mats) {
  // 履帶
  for (const sx of [-1, 1]) {
    b.add(U.G.box(0.12, 0.16, 0.62), RUBBER, [sx * 0.21, 0.085, 0]);
    for (let i = 0; i < 6; i++) {
      b.add(U.G.cyl(0.055, 0.055, 0.13, 12), DARKSTEEL, [sx * 0.21, 0.075, -0.24 + i * 0.096], [0, 0, PI / 2]);
    }
    for (let i = 0; i < 8; i++) {
      b.add(U.G.box(0.15, 0.02, 0.035), GUNMETAL, [sx * 0.21, 0.165, -0.27 + i * 0.077]);
    }
  }
  // 車體
  b.add(U.G.box(0.4, 0.15, 0.56), mats.main, [0, 0.17, 0]);
  b.add(U.G.box(0.4, 0.04, 0.14), mats.dark, [0, 0.25, 0.22], [0.35, 0, 0]);
  b.add(U.G.box(0.42, 0.035, 0.1), GUNMETAL, [0, 0.26, -0.14]);
  // 側面識別條
  for (const sx of [-1, 1]) b.add(U.G.box(0.005, 0.04, 0.3), mats.light, [sx * 0.201, 0.2, -0.06]);
  // 炮塔
  b.add(U.G.cyl(0.135, 0.155, 0.1, 16), mats.main, [0, 0.3, -0.02]);
  b.add(U.G.sphere(0.13, 16, 8), mats.main, [0, 0.35, -0.02], [0, 0, 0], [1, 0.5, 1]);
  // 炮管
  const gunFrom = new THREE.Vector3(0, 0.325, 0.1);
  const gunTo = new THREE.Vector3(0, 0.335, 0.6);
  U.addBeam(b, gunFrom, gunTo, 0.05, 0.05, DARKSTEEL);
  b.add(U.G.cyl(0.032, 0.032, 0.09, 12), GUNMETAL, [0, 0.335, 0.62], [PI / 2, 0, 0]);
  // 車長塔與機槍
  b.add(U.G.cyl(0.05, 0.055, 0.06, 12), DARKSTEEL, [0.03, 0.39, -0.08]);
  b.add(U.G.box(0.02, 0.06, 0.1), GUNMETAL, [0.03, 0.42, -0.03]);
  b.add(U.G.cyl(0.012, 0.012, 0.1, 8), GUNMETAL, [0.03, 0.45, 0.0], [PI / 2, 0, 0]);
  // 天線
  b.add(U.G.cyl(0.006, 0.006, 0.28, 5), BLACK, [-0.1, 0.42, -0.16], [0, 0, 0.12]);
  // 備用油桶
  b.add(U.G.cyl(0.05, 0.05, 0.14, 10), U.M(0x4a5233, { roughness: 0.7 }), [0.16, 0.29, -0.2], [PI / 2, 0, 0]);
}

function buildCannon(b, mats) {
  // 車架
  b.add(U.G.box(0.2, 0.08, 0.36), WOOD_DARK, [0, 0.16, 0.02]);
  // 大輪（兩側）
  for (const sx of [-1, 1]) {
    b.add(U.G.torus(0.15, 0.028, 6, 20), WOOD, [sx * 0.19, 0.16, 0.08], [0, PI / 2, 0]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      b.add(U.G.cyl(0.012, 0.012, 0.28, 5), WOOD, [sx * 0.19, 0.16 + Math.sin(a) * 0.07, 0.08 + Math.cos(a) * 0.07], [0, PI / 2, a]);
    }
    b.add(U.G.cyl(0.035, 0.035, 0.055, 10), BRASS, [sx * 0.19, 0.16, 0.08], [0, 0, PI / 2]);
  }
  // 炮尾支架
  b.add(U.G.box(0.16, 0.13, 0.12), DARKSTEEL, [0, 0.24, -0.04]);
  // 長炮管（朝 +z 微仰）
  const from = new THREE.Vector3(0, 0.26, 0.02);
  const to = new THREE.Vector3(0, 0.35, 0.6);
  U.addBeam(b, from, to, 0.09, 0.09, GUNMETAL);
  b.add(U.G.cyl(0.05, 0.055, 0.1, 14), DARKSTEEL, [0, 0.355, 0.62], [PI / 2 - 0.17, 0, 0]);
  b.add(U.G.torus(0.052, 0.012, 5, 14), BRASS, [0, 0.35, 0.57], [PI / 2 - 0.17, 0, 0]);
  // 炮盾
  b.add(U.G.box(0.34, 0.24, 0.03), mats.main, [0, 0.26, 0.1], [0.1, 0, 0]);
  b.add(U.G.box(0.28, 0.16, 0.02), mats.dark, [0, 0.26, 0.117], [0.1, 0, 0]);
  b.add(U.G.sphere(0.02, 8, 6), GOLD, [0, 0.2, 0.12]);
  // 駐鋤（後拖架）
  for (const sx of [-1, 1]) {
    U.addBeam(b, new THREE.Vector3(sx * 0.08, 0.16, -0.12), new THREE.Vector3(sx * 0.14, 0.0, -0.46), 0.05, 0.05, WOOD);
    b.add(U.G.box(0.09, 0.02, 0.12), GUNMETAL, [sx * 0.14, 0.01, -0.45]);
  }
  // 炮彈
  b.add(U.G.sphere(0.035, 8, 6), GUNMETAL, [0.15, 0.04, -0.16]);
  b.add(U.G.sphere(0.035, 8, 6), GUNMETAL, [0.2, 0.04, -0.1]);
}

function buildAA(b, mats) {
  // 十字炮架
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    U.addBeam(b, new THREE.Vector3(0, 0.07, 0), new THREE.Vector3(Math.sin(a) * 0.32, 0.03, Math.cos(a) * 0.32), 0.05, 0.05, DARKSTEEL);
    b.add(U.G.cyl(0.05, 0.06, 0.05, 8), GUNMETAL, [Math.sin(a) * 0.32, 0.025, Math.cos(a) * 0.32]);
  }
  b.add(U.G.cyl(0.2, 0.23, 0.07, 16), DARKSTEEL, [0, 0.11, 0]);
  // 旋轉炮座
  b.add(U.G.cyl(0.13, 0.15, 0.1, 16), mats.main, [0, 0.19, 0]);
  b.add(U.G.cyl(0.02, 0.02, 0.1, 10), BRASS, [0, 0.28, -0.05]);
  // 雙聯裝高射炮管（仰角 55°）
  for (const sx of [-1, 1]) {
    const from = new THREE.Vector3(sx * 0.045, 0.24, 0.02);
    const to = new THREE.Vector3(sx * 0.045, 0.52, 0.42);
    U.addBeam(b, from, to, 0.032, 0.032, GUNMETAL);
    b.add(U.G.cyl(0.024, 0.03, 0.07, 10), DARKSTEEL, [sx * 0.045, 0.56, 0.47], [-0.75, 0, 0]);
  }
  // 炮座護板
  b.add(U.G.box(0.3, 0.16, 0.03), mats.dark, [0, 0.22, 0.14], [-0.25, 0, 0]);
  // 彈藥箱
  b.add(U.G.box(0.12, 0.08, 0.07), U.M(0x4c5236, { roughness: 0.8 }), [-0.24, 0.09, -0.06], [0, 0.4, 0]);
  // 觀測鏡
  b.add(U.G.cyl(0.018, 0.022, 0.13, 8), DARKSTEEL, [0.13, 0.28, 0.05], [0.4, 0, -0.5]);
  b.add(U.G.cyl(0.024, 0.024, 0.015, 8), U.E(0x7fe3ff, 0.8), [0.13, 0.28, 0.05], [0.4, 0, -0.5]);
}

function buildMG(b, mats) {
  // 沙袋掩體（前弧）
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 5; i++) {
      const a = -PI * 0.5 + (i / 4) * PI * 0.95;
      const r = 0.3 - row * 0.02;
      b.add(U.G.capsule(0.045, 0.085, 4, 8), SANDBAG,
        [Math.sin(a) * r, 0.075 + row * 0.075, Math.cos(a) * r], [0, a, 0], [1, 1, 0.9]);
    }
  }
  // 三腳架
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    U.addBeam(b, new THREE.Vector3(0, 0.26, 0), new THREE.Vector3(Math.sin(a) * 0.24, 0.02, Math.cos(a) * 0.24), 0.03, 0.03, DARKSTEEL);
  }
  b.add(U.G.cyl(0.05, 0.06, 0.04, 10), DARKSTEEL, [0, 0.27, 0]);
  // 機槍本體
  b.add(U.G.box(0.09, 0.08, 0.26), GUNMETAL, [0, 0.32, 0.02]);
  b.add(U.G.cyl(0.026, 0.026, 0.34, 10), DARKSTEEL, [0, 0.335, 0.26], [PI / 2, 0, 0]);
  // 散熱罩環
  for (let i = 0; i < 4; i++) b.add(U.G.torus(0.032, 0.007, 5, 12), GUNMETAL, [0, 0.335, 0.14 + i * 0.065], [PI / 2, 0, 0]);
  // 槍托
  b.add(U.G.box(0.07, 0.09, 0.1), WOOD_DARK, [0, 0.31, -0.16]);
  // 彈藥箱與彈鏈
  b.add(U.G.box(0.11, 0.09, 0.1), U.M(0x4c5236, { roughness: 0.8 }), [0.17, 0.05, -0.06], [0, 0.25, 0]);
  for (let i = 0; i < 5; i++) b.add(U.G.cyl(0.012, 0.012, 0.04, 6), GOLD, [0.17 - i * 0.02, 0.11 + i * 0.012, -0.02 + i * 0.012], [0, 0.3, PI / 2]);
  // 副手頭盔（半埋）
  b.add(U.G.sphere(0.055, 12, 8), U.M(0x50603c, { metalness: 0.35, roughness: 0.5 }), [-0.22, 0.14, 0.14], [0, 0, 0], [1, 0.7, 1]);
}

/* ================================================================== */
/* 海軍                                                                */
/* ================================================================== */

function makeHullGeo(len, beam, height, bow = 0.55, stern = 0.78) {
  const s = new THREE.Shape();
  const L = len / 2, B = beam / 2;
  s.moveTo(L, 0);
  s.quadraticCurveTo(L * bow, B, 0, B);
  s.lineTo(-L * stern, B * 0.9);
  s.quadraticCurveTo(-L, B * 0.5, -L, 0);
  s.quadraticCurveTo(-L, -B * 0.5, -L * stern, -B * 0.9);
  s.lineTo(0, -B);
  s.quadraticCurveTo(L * bow, -B, L, 0);
  return new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false, curveSegments: 8 });
}

function buildShip(b, mats, kind) {
  const spec = {
    battleship: { len: 0.88, beam: 0.3, hull: 0.13, turrets: [[-0.22, 3, 1.25], [0.12, 3, 1.25], [0.3, 2, 1.0]], bridge: 0.16, funnels: [-0.02], mast: true },
    cruiser: { len: 0.76, beam: 0.26, hull: 0.12, turrets: [[-0.16, 2, 1.1], [0.26, 2, 1.0]], bridge: 0.2, funnels: [0.02], mast: true },
    gunboat: { len: 0.58, beam: 0.22, hull: 0.11, turrets: [[0.16, 1, 1.0]], bridge: 0.12, funnels: [-0.02], mast: false },
    destroyer: { len: 0.78, beam: 0.22, hull: 0.11, turrets: [[0.28, 1, 0.95], [-0.28, 1, 0.95]], bridge: 0.14, funnels: [0.05, -0.12], mast: true },
    submarine: { len: 0.62, beam: 0.2, hull: 0.1, turrets: [], bridge: 0.0, funnels: [], mast: false },
  }[kind];
  const { len, beam } = spec;

  // 船體（含下層紅漆）
  const lower = makeHullGeo(len * 0.97, beam * 0.95, 0.08);
  b.addM(lower, U.M(0x5c1a1a, { metalness: 0.3, roughness: 0.55 }),
    U.mat4([0, -0.06, 0], [-PI / 2, 0, 0]));
  const hull = makeHullGeo(len, beam, spec.hull);
  b.addM(hull, U.M(0x7b8188, { metalness: 0.55, roughness: 0.42, envMapIntensity: 1.1 }),
    U.mat4([0, -0.015, 0], [-PI / 2, 0, 0]));
  // 陣營塗裝帶
  const stripe = makeHullGeo(len * 0.995, beam * 0.99, 0.026);
  b.addM(stripe, mats.main, U.mat4([0, 0.012, 0], [-PI / 2, 0, 0]));
  // 甲板
  const deckShape = makeHullGeo(len * 0.94, beam * 0.9, 0.012);
  b.addM(deckShape, WOOD, U.mat4([0, 0.115, 0], [-PI / 2, 0, 0]));
  const deckBorder = makeHullGeo(len * 0.98, beam * 0.96, 0.01);
  b.addM(deckBorder, GOLD, U.mat4([0, 0.105, 0], [-PI / 2, 0, 0]));

  // 舷窗
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = -len * 0.3 + (i / 4) * len * 0.55;
      b.add(U.G.sphere(0.011, 6, 5), GOLD, [x, 0.045, sz * (beam * 0.48)]);
    }
  }
  // 欄杆
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const x = -len * 0.34 + (i / 5) * len * 0.64;
      b.add(U.G.cyl(0.004, 0.004, 0.04, 4), GUNMETAL, [x, 0.14, sz * beam * 0.42]);
    }
    b.add(U.G.box(len * 0.68, 0.005, 0.005), GUNMETAL, [0, 0.162, sz * beam * 0.42]);
  }

  if (kind === 'submarine') {
    // 潛艇：圓筒船身
    b.addM(U.G.cyl(0.085, 0.085, len * 0.82, 16), U.M(0x3c4248, { metalness: 0.6, roughness: 0.38 }),
      U.mat4([0, 0.055, 0], [0, 0, PI / 2]));
    b.add(U.G.sphere(0.085, 14, 10), U.M(0x3c4248, { metalness: 0.6, roughness: 0.38 }), [len * 0.41, 0.055, 0], [0, 0, 0], [1.25, 1, 1]);
    b.add(U.G.cone(0.085, 0.12, 12), U.M(0x3c4248, { metalness: 0.6, roughness: 0.38 }), [-len * 0.46, 0.055, 0], [0, 0, PI / 2]);
    // 帆罩
    b.add(U.G.box(0.11, 0.11, 0.1), U.M(0x2f343a, { metalness: 0.6, roughness: 0.4 }), [0, 0.16, 0]);
    b.add(U.G.cyl(0.012, 0.012, 0.16, 6), GUNMETAL, [0.02, 0.26, 0.03]);
    b.add(U.G.cyl(0.008, 0.008, 0.2, 6), GUNMETAL, [-0.01, 0.28, -0.02]);
    b.add(U.G.box(0.02, 0.02, 0.06), GUNMETAL, [-0.01, 0.37, -0.02]);
    // 水平舵與尾鰭
    for (const sz of [-1, 1]) {
      b.add(U.G.box(0.12, 0.014, 0.08), U.M(0x2f343a, { metalness: 0.6, roughness: 0.4 }), [-len * 0.38, 0.055, sz * 0.1]);
      b.add(U.G.box(0.05, 0.12, 0.014), U.M(0x2f343a, { metalness: 0.6, roughness: 0.4 }), [-len * 0.44, 0.09, 0]);
    }
    // 陣營識別
    b.add(U.G.box(0.05, 0.03, 0.005), mats.main, [0, 0.1, 0.101]);
    return;
  }

  // 上層結構
  const bw = Math.max(0.18, beam * 0.8);
  b.add(U.G.box(bw, 0.11, len * 0.22), U.M(0x8f959c, { metalness: 0.5, roughness: 0.45 }), [spec.bridge * 0.2, 0.19, spec.bridge]);
  b.add(U.G.box(bw * 0.8, 0.09, len * 0.14), mats.main, [spec.bridge * 0.2, 0.29, spec.bridge + 0.01]);
  b.add(U.G.box(bw * 0.55, 0.06, len * 0.08), U.M(0x9aa0a7, { metalness: 0.5, roughness: 0.4 }), [spec.bridge * 0.2, 0.36, spec.bridge]);
  b.add(U.G.box(bw * 0.5, 0.018, len * 0.06), BRASS, [spec.bridge * 0.2, 0.395, spec.bridge]);
  // 艦橋窗
  for (let i = 0; i < 3; i++) b.add(U.G.box(0.035, 0.015, 0.005), U.E(0x8fd8ff, 0.5), [-0.05 + i * 0.05, 0.315, spec.bridge + len * 0.075]);

  // 煙囪
  for (const fx of spec.funnels) {
    b.add(U.G.cyl(0.045, 0.055, 0.18, 12), U.M(0x7a1f22, { metalness: 0.4, roughness: 0.5 }), [fx, 0.3, -0.02], [0, 0, 0.08]);
    b.add(U.G.cyl(0.047, 0.047, 0.02, 12), mats.dark, [fx, 0.39, -0.02]);
    b.add(U.G.cyl(0.045, 0.045, 0.006, 12), BLACK, [fx, 0.4, -0.02]);
  }
  // 桅杆與雷達
  if (spec.mast) {
    b.add(U.G.cyl(0.008, 0.011, 0.32, 6), GUNMETAL, [spec.bridge * 0.2, 0.5, spec.bridge - 0.05]);
    b.add(U.G.box(0.14, 0.008, 0.02), GUNMETAL, [spec.bridge * 0.2, 0.52, spec.bridge - 0.05]);
    b.add(U.G.box(0.09, 0.02, 0.05), DARKSTEEL, [spec.bridge * 0.2, 0.6, spec.bridge - 0.05]);
    // 雷達碟
    b.add(U.G.cyl(0.05, 0.055, 0.012, 12), U.M(0x9aa0a7, { metalness: 0.6, roughness: 0.4 }), [spec.bridge * 0.2, 0.66, spec.bridge - 0.05], [0.9, 0, 0]);
    // 陣營旗
    b.add(U.G.plane(0.12, 0.08), mats.decal, [-0.1, 0.5, spec.bridge - 0.03], [0, -0.3, 0]);
  }
  // 主炮塔
  for (const [tx, count, scl] of spec.turrets) {
    b.add(U.G.cyl(0.07 * scl, 0.082 * scl, 0.055 * scl, 14), U.M(0x8f959c, { metalness: 0.5, roughness: 0.42 }), [tx, 0.165, 0.02 * (tx > 0 ? 1 : -1)]);
    for (let k = 0; k < count; k++) {
      const off = (k - (count - 1) / 2) * 0.026 * scl;
      U.addBeam(b,
        new THREE.Vector3(tx + off, 0.185, 0.05),
        new THREE.Vector3(tx + off, 0.2, 0.05 + 0.17 * scl),
        0.016 * scl, 0.016 * scl, GUNMETAL);
    }
  }
  // 副炮／防空炮
  if (kind !== 'destroyer') {
    for (const sx of [-1, 1]) {
      b.add(U.G.cyl(0.03, 0.035, 0.03, 8), DARKSTEEL, [sx * 0.11, 0.16, 0.06]);
      b.add(U.G.cyl(0.008, 0.008, 0.12, 5), GUNMETAL, [sx * 0.11, 0.22, 0.09], [-0.7, 0, 0]);
    }
  }
  if (kind === 'destroyer') {
    // 魚雷發射管（斜置）
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        b.add(U.G.cyl(0.016, 0.016, 0.17, 8), GUNMETAL, [sx * 0.06 + (i - 1) * 0.022, 0.19, -0.04], [PI / 2 + 0.35, 0, 0]);
      }
      b.add(U.G.box(0.07, 0.02, 0.05), DARKSTEEL, [sx * 0.06, 0.16, -0.12]);
    }
    // 深水炸彈架
    for (let i = 0; i < 3; i++) {
      b.add(U.G.cyl(0.025, 0.025, 0.025, 10), U.M(0x3d4a3a, { roughness: 0.7 }), [-0.26 + i * 0.05, 0.17, -len * 0.3]);
    }
  }
  if (kind === 'battleship') {
    // 艦首錨
    b.add(U.G.torus(0.03, 0.008, 5, 12), BRASS, [len * 0.4, 0.07, 0.09], [0, 0, 0.3]);
    b.add(U.G.box(0.02, 0.06, 0.02), BRASS, [len * 0.4, 0.04, 0.09]);
  }
  if (kind === 'gunboat') {
    // 火箭發射架
    for (let i = 0; i < 3; i++) {
      b.add(U.G.cyl(0.018, 0.018, 0.11, 8), U.M(0x4a5233, { roughness: 0.6 }), [-0.12 + i * 0.035, 0.2, -0.12], [0.8, 0, 0]);
    }
    b.add(U.G.box(0.14, 0.03, 0.06), DARKSTEEL, [-0.09, 0.18, -0.14]);
  }
}

/* ================================================================== */
/* 空軍                                                                */
/* ================================================================== */

const PROPELLER_MAT = U.M(0x2a2c30, { metalness: 0.7, roughness: 0.4 });

function buildFighter(b, mats) {
  // 機身
  b.add(U.G.cyl(0.055, 0.045, 0.4, 14), U.M(0x9aa3ac, { metalness: 0.75, roughness: 0.3, envMapIntensity: 1.2 }), [0, 0.06, 0], [PI / 2, 0, 0]);
  b.add(U.G.cone(0.055, 0.16, 14), U.M(0x8f979f, { metalness: 0.7, roughness: 0.32 }), [0, 0.06, 0.27], [PI / 2, 0, 0]);
  b.add(U.G.cyl(0.045, 0.03, 0.14, 14), U.M(0x6f767d, { metalness: 0.7, roughness: 0.35 }), [0, 0.06, -0.24], [PI / 2, 0, 0]);
  // 陣營色帶
  b.add(U.G.cyl(0.057, 0.057, 0.06, 14), mats.main, [0, 0.06, 0.12], [PI / 2, 0, 0]);
  // 後掠翼
  for (const sx of [-1, 1]) {
    const shape = U.shapeFromPoints([
      [0, 0.06], [0.3 * sx, -0.06], [0.3 * sx, -0.11], [0.02 * sx, 0.0],
    ]);
    b.add(U.G.extrude(shape, 0.018, 0.004), mats.main, [0, 0.045, 0.02], [PI / 2, 0, 0]);
    // 翼端導彈
    b.add(U.G.cyl(0.012, 0.012, 0.11, 8), U.M(0xc9c9c2, { metalness: 0.5, roughness: 0.4 }), [sx * 0.3, 0.03, -0.06], [PI / 2, 0, 0]);
    b.add(U.G.cone(0.012, 0.03, 8), U.M(0xb32632, { metalness: 0.4, roughness: 0.4 }), [sx * 0.3, 0.03, 0.01], [PI / 2, 0, 0]);
    // 翼根
    b.add(U.G.box(0.1, 0.03, 0.14), U.M(0x8f979f, { metalness: 0.7, roughness: 0.35 }), [sx * 0.07, 0.055, 0.0]);
  }
  // 尾翼
  b.add(U.G.box(0.26, 0.014, 0.09), mats.main, [0, 0.075, -0.25], [0, 0, 0]);
  for (const sx of [-1, 1]) {
    b.add(U.G.box(0.014, 0.11, 0.1), mats.main, [sx * 0.1, 0.12, -0.26], [0.2, 0, sx * 0.18]);
  }
  // 座艙罩
  b.add(U.G.sphere(0.05, 14, 10), GLASS, [0, 0.12, 0.08], [0, 0, 0], [1, 0.7, 1.9]);
  b.add(U.G.torus(0.048, 0.006, 5, 16, PI), GOLD, [0, 0.125, 0.08], [PI / 2, 0, 0], [1, 0.7, 1.9]);
  b.add(U.G.sphere(0.016, 8, 6), SKIN, [0, 0.13, 0.09]);
  // 進氣口
  for (const sx of [-1, 1]) b.add(U.G.box(0.055, 0.05, 0.11), U.M(0x5e666d, { metalness: 0.6, roughness: 0.4 }), [sx * 0.065, 0.06, 0.02]);
  // 引擎噴口（發光）
  b.add(U.G.cyl(0.035, 0.045, 0.06, 12), DARKSTEEL, [0, 0.06, -0.32], [PI / 2, 0, 0]);
  b.add(U.G.circle(0.03, 12), U.E(0xff7a2e, 2.4), [0, 0.06, -0.345], [PI / 2, 0, 0]);
  // 起落架（收起狀態：小門）
  b.add(U.G.box(0.02, 0.1, 0.03), mats.dark, [0, 0.02, 0.05]);
  return { extras: [] };
}

function buildScout(b, mats) {
  // 機身
  b.add(U.G.cyl(0.05, 0.042, 0.36, 12), U.M(0xa8a07a, { metalness: 0.35, roughness: 0.55 }), [0, 0.08, 0], [PI / 2, 0, 0]);
  b.add(U.G.box(0.1, 0.08, 0.12), U.M(0xb0a67e, { metalness: 0.3, roughness: 0.6 }), [0, 0.1, -0.22]);
  // 發動機整流罩
  b.add(U.G.cyl(0.062, 0.07, 0.09, 14), U.M(0x8a8266, { metalness: 0.55, roughness: 0.45 }), [0, 0.08, 0.19], [PI / 2, 0, 0]);
  b.add(U.G.torus(0.064, 0.01, 5, 16), mats.accent, [0, 0.08, 0.235], [PI / 2, 0, 0]);
  // 螺旋槳（會旋轉）
  const prop = new THREE.Group();
  const spinner = new THREE.Mesh(U.G.cone(0.03, 0.07, 10), GOLD);
  spinner.rotation.x = PI / 2;
  spinner.position.z = 0.04;
  prop.add(spinner);
  for (const a of [0, PI / 2]) {
    const blade = new THREE.Mesh(U.G.box(0.022, 0.26, 0.012), PROPELLER_MAT);
    blade.rotation.z = a;
    blade.position.z = 0.02;
    prop.add(blade);
  }
  prop.position.set(0, 0.08, 0.28);
  // 雙翼
  b.add(U.G.box(0.56, 0.016, 0.15), mats.main, [0, 0.16, 0.06]);
  b.add(U.G.box(0.52, 0.016, 0.14), mats.main, [0, 0.0, 0.07]);
  b.add(U.G.box(0.57, 0.006, 0.03), mats.accent, [0, 0.17, 0.1]);
  b.add(U.G.box(0.53, 0.006, 0.03), mats.accent, [0, 0.01, 0.1]);
  // 支柱
  for (const sx of [-1, 1]) {
    for (const sz of [-0.02, 0.09]) {
      b.add(U.G.cyl(0.006, 0.006, 0.16, 5), GUNMETAL, [sx * 0.18, 0.08, sz]);
    }
    b.add(U.G.cyl(0.005, 0.005, 0.5, 5), GUNMETAL, [0, 0.08, 0.06], [0, 0, PI / 2]);
  }
  // 尾翼
  b.add(U.G.box(0.22, 0.012, 0.08), mats.main, [0, 0.1, -0.28]);
  b.add(U.G.box(0.012, 0.12, 0.1), mats.main, [0, 0.16, -0.3]);
  b.add(U.G.box(0.24, 0.006, 0.02), mats.accent, [0, 0.107, -0.28]);
  // 攝影機
  b.add(U.G.cyl(0.035, 0.035, 0.06, 10), DARKSTEEL, [0, -0.02, 0.06], [PI / 2, 0, 0]);
  b.add(U.G.cyl(0.026, 0.026, 0.02, 10), U.E(0x8fd8ff, 0.7), [0, -0.02, 0.095], [PI / 2, 0, 0]);
  // 起落架
  for (const sx of [-1, 1]) {
    b.add(U.G.cyl(0.008, 0.008, 0.1, 5), GUNMETAL, [sx * 0.12, -0.03, 0.08], [0.2, 0, sx * 0.3]);
    b.add(U.G.torus(0.032, 0.012, 5, 12), RUBBER, [sx * 0.15, -0.075, 0.09], [0, PI / 2, 0]);
  }
  // 座艙
  b.add(U.G.sphere(0.048, 14, 10), GLASS, [0, 0.12, 0.02], [0, 0, 0], [1, 0.75, 1.7]);
  b.add(U.G.sphere(0.014, 8, 6), SKIN, [0, 0.12, 0.03]);
  // 風向標（機尾小旗）
  b.add(U.G.plane(0.1, 0.06), mats.decal, [0.07, 0.2, -0.32], [0, -0.3, 0]);
  return { extras: [prop], propeller: prop };
}

/* ================================================================== */
/* 軍旗                                                                */
/* ================================================================== */

function buildFlag(b, mats, side, flagTexture) {
  // 石階旗座
  b.add(U.G.cyl(0.34, 0.36, 0.05, 20), STONE, [0, 0.025, 0]);
  b.add(U.G.cyl(0.3, 0.32, 0.05, 20), U.M(0x9a9285, { roughness: 0.9 }), [0, 0.075, 0]);
  b.add(U.G.cyl(0.24, 0.26, 0.05, 20), U.M(0xa8a093, { roughness: 0.9 }), [0, 0.125, 0]);
  b.add(U.G.torus(0.3, 0.014, 5, 28), GOLD, [0, 0.1, 0], [PI / 2, 0, 0]);
  b.add(U.G.torus(0.24, 0.012, 5, 24), GOLD, [0, 0.15, 0], [PI / 2, 0, 0]);
  // 台座浮雕
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2;
    b.add(U.G.box(0.1, 0.03, 0.012), mats.accent, [Math.sin(a) * 0.28, 0.075, Math.cos(a) * 0.28], [0, a, 0]);
  }
  // 旗桿
  b.add(U.G.cyl(0.018, 0.024, 0.85, 10), GOLD, [0, 0.56, 0]);
  b.add(U.G.sphere(0.04, 12, 10), GOLD, [0, 0.99, 0]);
  b.add(U.G.cone(0.022, 0.1, 8), GOLD, [0, 1.05, 0]);
  b.add(U.G.torus(0.032, 0.012, 5, 14), mats.accent, [0, 0.94, 0], [PI / 2, 0, 0]);
  // 旗布（獨立網格，另行飄動）
  const flagGeo = new THREE.PlaneGeometry(0.4, 0.25, 18, 8);
  flagGeo.translate(0.2, 0, 0);
  const flagMat = new THREE.MeshStandardMaterial({
    map: flagTexture,
    side: THREE.DoubleSide,
    roughness: 0.78,
    metalness: 0.05,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: flagTexture,
    emissiveIntensity: 0.16,
  });
  const cloth = new THREE.Mesh(flagGeo, flagMat);
  cloth.position.set(0.02, 0.88, 0);
  cloth.rotation.y = -0.45;
  cloth.castShadow = true;
  const basePos = flagGeo.attributes.position.array.slice();
  const anim = (t) => {
    const pos = flagGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = basePos[i * 3];
      const y = basePos[i * 3 + 1];
      const k = x / 0.4;
      pos.setZ(i, Math.sin(x * 16 - t * 6 + y * 4) * 0.035 * k + Math.sin(t * 2.2 + y * 6) * 0.008);
      pos.setY(i, y + Math.sin(x * 10 + t * 4) * 0.006 * k);
    }
    pos.needsUpdate = true;
    flagGeo.computeVertexNormals();
  };
  void side;
  return { extras: [cloth], flagAnim: anim };
}

/* ================================================================== */
/* 底座 / 棋背                                                         */
/* ================================================================== */

const BASE_TOP = 0.12;
const PLATE_SIZE = [0.68, 0.17];

function buildLandBase(b, mats) {
  b.add(U.G.cyl(0.4, 0.415, 0.05, 28), DARKSTEEL, [0, 0.025, 0]);
  b.add(U.G.cyl(0.36, 0.375, 0.045, 28), mats.enamel, [0, 0.073, 0]);
  b.add(U.G.cyl(0.33, 0.335, 0.016, 28), U.M(0x22262c, { metalness: 0.7, roughness: 0.4 }), [0, 0.104, 0]);
  b.add(U.G.torus(0.4, 0.012, 6, 34), GOLD, [0, 0.052, 0], [PI / 2, 0, 0]);
  b.add(U.G.torus(0.362, 0.008, 5, 30), GOLD, [0, 0.096, 0], [PI / 2, 0, 0]);
  // 底座側面小徽
  b.add(U.G.cyl(0.035, 0.035, 0.01, 12), mats.accent, [0, 0.099, 0.3], [PI / 2, 0, 0]);
  // 地面刻線（低調，不發亮）
  b.add(U.G.ring(0.44, 0.47, 36), mats.ringGlow, [0, 0.004, 0], [-PI / 2, 0, 0]);
}

function buildNavalBase(b, mats) {
  // 尾流圓環（浮於水面）
  b.add(U.G.ring(0.34, 0.42, 36), mats.ringGlow, [0, 0.015, 0], [-PI / 2, 0, 0]);
  b.add(U.G.ring(0.5, 0.53, 36), mats.ringGlow, [0, 0.012, 0], [-PI / 2, 0, 0]);
  b.add(U.G.cyl(0.42, 0.44, 0.02, 30), U.M(0x18242c, { metalness: 0.5, roughness: 0.5 }), [0, -0.005, 0]);
  b.add(U.G.torus(0.42, 0.008, 4, 32), GOLD, [0, 0.008, 0], [PI / 2, 0, 0]);
}

function buildAirBase(b, mats) {
  // 停機坪光環
  b.add(U.G.ring(0.44, 0.5, 36), mats.ringGlow, [0, 0.012, 0], [-PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    b.add(U.G.box(0.11, 0.004, 0.03), mats.ringGlow, [Math.sin(a) * 0.47, 0.013, Math.cos(a) * 0.47], [0, -a, 0]);
  }
  b.add(U.G.ring(0.3, 0.32, 30), mats.ringGlow, [0, 0.012, 0], [-PI / 2, 0, 0]);
}

/** 棋背軍種徽記貼圖（Canvas：陣營色底 + 金色軍種徽記 + 軍種字） */
const BACK_TEX_CACHE = new Map();
function makeBackTexture(branch, config) {
  const key = `${branch}:${config.main}:${config.light}:${config.accent}`;
  let tex = BACK_TEX_CACHE.get(key);
  if (tex) return tex;
  const size = 256;
  const cv = U.makeCanvas(size, size);
  const ctx = cv.getContext('2d');
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  // 陣營色底
  const g = ctx.createRadialGradient(c, c - 18, 10, c, c, c);
  g.addColorStop(0, config.light || config.main);
  g.addColorStop(0.55, config.main);
  g.addColorStop(1, config.dark || '#1a1016');
  ctx.beginPath();
  ctx.arc(c, c, c - 8, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  // 金環
  ctx.lineWidth = 10;
  ctx.strokeStyle = config.accent || '#f0c060';
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(20,12,6,0.75)';
  ctx.beginPath();
  ctx.arc(c, c, c - 22, 0, Math.PI * 2);
  ctx.stroke();
  // 深色徽記底盤
  ctx.beginPath();
  ctx.arc(c, c, c - 30, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(12,10,8,0.88)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = config.accent || '#f0c060';
  ctx.stroke();
  // 軍種徽記（金色）
  ctx.save();
  ctx.translate(c, c - 6);
  ctx.strokeStyle = '#f3d789';
  ctx.fillStyle = '#f3d789';
  ctx.lineWidth = 7;
  if (branch === 'navy') {
    // 錨
    ctx.beginPath(); ctx.arc(0, -46, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -35); ctx.lineTo(0, 34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-22, -16); ctx.lineTo(22, -16); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 24, 34, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-38, 30); ctx.lineTo(-48, 44); ctx.lineTo(-30, 40); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(38, 30); ctx.lineTo(48, 44); ctx.lineTo(30, 40); ctx.closePath(); ctx.fill();
  } else if (branch === 'air') {
    // 機翼 + 星
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.quadraticCurveTo(-56, -30, -88, -2);
    ctx.quadraticCurveTo(-46, -2, -10, 20);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.quadraticCurveTo(56, -30, 88, -2);
    ctx.quadraticCurveTo(46, -2, 10, 20);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 6, 10, 34, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 12 : 27;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = Math.cos(a) * r, y = Math.sin(a) * r - 42;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
  } else {
    // 星 + 交叉步槍
    for (const sign of [-1, 1]) {
      ctx.save(); ctx.rotate(sign * 0.62);
      ctx.fillRect(-5, -52, 10, 96);
      ctx.fillRect(-14, 30, 28, 12);
      ctx.restore();
    }
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 14 : 33;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = Math.cos(a) * r, y = Math.sin(a) * r - 10;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // 軍種字
  ctx.font = '700 34px "Noto Sans TC","Noto Serif CJK TC",serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(10,7,4,0.9)';
  ctx.lineWidth = 7;
  const label = branch === 'navy' ? '海' : branch === 'air' ? '空' : '陸';
  ctx.strokeText(label, c, size - 34);
  ctx.fillStyle = '#f8e6b0';
  ctx.fillText(label, c, size - 34);
  tex = U.canvasTex(cv);
  BACK_TEX_CACHE.set(key, tex);
  return tex;
}

function buildBackToken(branch, mats) {
  const g = new THREE.Group();
  const b = new U.PartBuilder();
  b.add(U.G.cyl(0.345, 0.36, 0.11, 32), mats.enamel, [0, 0.055, 0]);
  b.add(U.G.torus(0.345, 0.022, 6, 36), GOLD, [0, 0.105, 0], [PI / 2, 0, 0]);
  b.add(U.G.cyl(0.3, 0.31, 0.012, 32), mats.dark, [0, 0.113, 0]);
  b.add(U.G.torus(0.29, 0.008, 5, 32), BRASS, [0, 0.119, 0], [PI / 2, 0, 0]);
  // 邊緣鉚釘
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2;
    b.add(U.G.sphere(0.014, 6, 5), GOLD, [Math.sin(a) * 0.322, 0.108, Math.cos(a) * 0.322]);
  }
  const built = b.build({ castShadow: false });
  g.add(built);
  // 軍種徽記（Canvas 貼圖，遠看也清楚；不顯示棋種）
  const cfg = mats.cfg || { main: '#a82834', dark: '#5b141f', light: '#e8604c', accent: '#f0c060' };
  const decal = U.makeDecalPlane(makeBackTexture(branch, cfg), 0.62, 0.62);
  decal.rotation.x = -PI / 2;
  decal.position.y = 0.121;
  g.add(decal);
  return g;
}

/* ================================================================== */
/* 工廠                                                                */
/* ================================================================== */

export function createPieceFactory(options = {}) {
  let sideColors = normalizeSideColors(options.sideColors);
  const mats = {
    south: createSideMats(sideColors.south),
    north: createSideMats(sideColors.north),
  };
  const labelCache = new Map();
  const hiddenLabelCache = new Map();
  const flagTexCache = new Map();

  function getLabelTexture(def, side) {
    const key = `${side}:${def.key}`;
    let tex = labelCache.get(key);
    if (!tex) {
      const cfg = sideColors[side];
      tex = U.makeLabelTexture(def.short || def.name, {
        accent: '#f0cf7a',
        sideColor: cfg.main,
      });
      labelCache.set(key, tex);
    }
    return tex;
  }

  function getHiddenLabelTexture(branch, side) {
    const key = `${side}:${branch}`;
    let tex = hiddenLabelCache.get(key);
    if (!tex) {
      const cfg = sideColors[side];
      const text = branch === BRANCH.NAVY ? '海軍' : branch === BRANCH.AIR ? '空軍' : '陸軍';
      tex = U.makeLabelTexture(text, { accent: '#f0cf7a', sideColor: cfg.main, branch: true });
      hiddenLabelCache.set(key, tex);
    }
    return tex;
  }

  function getFlagTexture(side) {
    let tex = flagTexCache.get(side);
    if (!tex) {
      const cfg = sideColors[side];
      tex = U.makeFlagTexture(cfg.main, cfg.name, 'army');
      flagTexCache.set(side, tex);
    }
    return tex;
  }

  const PLATE_GEO = new THREE.PlaneGeometry(PLATE_SIZE[0], PLATE_SIZE[1]);
  const PLATE_HOLDER_Y = 0.31;
  const PLATE_Z = 0.4;

  function createPlate(side) {
    const mat = new THREE.MeshStandardMaterial({
      map: null,
      transparent: true,
      roughness: 0.55,
      metalness: 0.12,
      depthWrite: false,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: null,
      emissiveIntensity: 0.22,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(PLATE_GEO, mat);
    const holder = new THREE.Group();
    holder.add(mesh);
    holder.position.set(0, PLATE_HOLDER_Y, PLATE_Z);
    mesh.position.z = 0;
    return { holder, mesh, mat };
  }

  /**
   * 建立一枚棋子視覺物件
   * @param {object} state { uid, side, key|null, branch }
   */
  function createPiece(state) {
    const side = state.side;
    const S = mats[side];
    const group = new THREE.Group();
    group.name = `piece-${state.uid}`;
    const branch = state.branch || 'army';
    const def = state.key ? PIECE_BY_KEY[state.key] : null;

    // ---- 底座 ----
    const baseB = new U.PartBuilder();
    if (branch === BRANCH.NAVY) buildNavalBase(baseB, S);
    else if (branch === BRANCH.AIR) buildAirBase(baseB, S);
    else buildLandBase(baseB, S);
    const baseGroup = baseB.build({ castShadow: false, receiveShadow: false });
    group.add(baseGroup);

    // ---- 正面模型 ----
    const frontHolder = new THREE.Group();
    const frontB = new U.PartBuilder();
    let extras = [];
    let anims = [];
    let yaw = 0;
    let basePlateY = PLATE_HOLDER_Y;

    if (def) {
      const key = def.key;
      switch (key) {
        case 'commander': {
          buildOfficer(frontB, S, { scale: 1.12, stars: 4, pose: 'sword_up', cape: true, plume: true, scarf: true });
          break;
        }
        case 'army_group':
          buildOfficer(frontB, S, { scale: 1.06, stars: 3, pose: 'sword_down', cape: true, scarf: true });
          break;
        case 'corps':
          buildOfficer(frontB, S, { scale: 1.02, stars: 2, pose: 'binoculars' });
          break;
        case 'division':
          buildOfficer(frontB, S, { scale: 0.98, stars: 1, pose: 'map' });
          break;
        case 'brigade':
          buildOfficer(frontB, S, { scale: 0.95, stars: 0, pose: 'sword_down', backFlag: true });
          break;
        case 'battalion':
          buildOfficer(frontB, S, { scale: 0.92, stars: 0, pose: 'point' });
          break;
        case 'company':
          buildOfficer(frontB, S, { scale: 0.89, stars: 0, pose: 'pistol' });
          break;
        case 'platoon':
          buildOfficer(frontB, S, { scale: 0.86, stars: 0, pose: 'stand', cap: 'side' });
          break;
        case 'cavalry':
          buildCavalry(frontB, S);
          basePlateY = 0.3;
          break;
        case 'infantry':
          buildInfantry(frontB, S);
          break;
        case 'engineer':
          buildEngineer(frontB, S);
          break;
        case 'mine': {
          const r = buildMine(frontB, S);
          extras = r.extras || [];
          anims.push((t) => {
            const led = extras[0];
            if (led) led.material.emissiveIntensity = 0.4 + (Math.sin(t * 4.2) > 0.6 ? 3.2 : 0.4);
          });
          break;
        }
        case 'trap':
          buildTrap(frontB, S);
          break;
        case 'fort':
          buildFort(frontB, S);
          break;
        case 'gas': {
          const r = buildGas(frontB, S);
          extras = r.extras || [];
          const cloud = r.cloud;
          anims.push((t) => {
            if (!cloud) return;
            cloud.position.y = Math.sin(t * 1.3) * 0.03;
            cloud.rotation.y = t * 0.25;
            cloud.children.forEach((c, i) => {
              c.scale.setScalar(1 + Math.sin(t * 1.7 + i * 2) * 0.14);
            });
          });
          break;
        }
        case 'missile': {
          const r = buildMissile(frontB, S);
          extras = r.extras || [];
          break;
        }
        case 'bomb': {
          const r = buildBomb(frontB, S);
          extras = r.extras || [];
          anims.push((t) => {
            const sp = r.spark;
            if (sp) {
              sp.material.emissiveIntensity = 1.6 + Math.abs(Math.sin(t * 9.1)) * 3.2;
              sp.position.x = 0.17 + Math.sin(t * 5.3) * 0.008;
            }
          });
          break;
        }
        case 'atomic': {
          const r = buildAtomic(frontB, S);
          extras = r.extras || [];
          break;
        }
        case 'tank':
          buildTank(frontB, S);
          break;
        case 'cannon':
          buildCannon(frontB, S);
          break;
        case 'aa':
          buildAA(frontB, S);
          break;
        case 'mg':
          buildMG(frontB, S);
          break;
        case 'battleship':
        case 'cruiser':
        case 'gunboat':
        case 'destroyer':
        case 'submarine': {
          buildShip(frontB, S, key);
          yaw = side === 'south' ? 0.14 : PI - 0.14;
          anims.push((t) => {
            const ph = (Number(state.uid) || 0) % 7;
            frontHolder.position.y = Math.sin(t * 1.15 + ph) * 0.013;
            frontHolder.rotation.z = Math.sin(t * 0.9 + ph * 0.7) * 0.035;
            frontHolder.rotation.x = Math.sin(t * 1.4 + ph * 1.3) * 0.022;
          });
          basePlateY = 0.28;
          break;
        }
        case 'fighter': {
          buildFighter(frontB, S);
          yaw = 1.32;
          basePlateY = 0.44;
          break;
        }
        case 'scout': {
          const r = buildScout(frontB, S);
          extras = r.extras || [];
          const prop = r.propeller;
          anims.push((t, dt) => {
            if (prop) prop.rotation.z += dt * 26;
          });
          yaw = 1.22;
          basePlateY = 0.44;
          break;
        }
        case 'flag': {
          const r = buildFlag(frontB, S, side, getFlagTexture(side));
          extras = r.extras || [];
          if (r.flagAnim) anims.push(r.flagAnim);
          basePlateY = 0.62;
          break;
        }
        default:
          buildOfficer(frontB, S);
      }
    }

    const baseLift = branch === BRANCH.ARMY ? BASE_TOP : 0;
    const frontGroup = frontB.build({ castShadow: true, receiveShadow: false });
    // 注意：three 的 Object3D.add() 在無參數時會印出錯誤，故需先判斷
    const extraList = extras.filter(Boolean);
    if (extraList.length) frontGroup.add(...extraList);
    frontHolder.add(frontGroup);
    frontHolder.position.y = baseLift;
    frontHolder.rotation.y = yaw;
    group.add(frontHolder);

    // ---- 棋背（隱藏時顯示軍種徽記）----
    const backHolder = new THREE.Group();
    const backToken = buildBackToken(branch, S);
    backHolder.add(backToken);
    backHolder.position.y = branch === BRANCH.NAVY ? 0.01 : branch === BRANCH.ARMY ? BASE_TOP : 0.24;
    backHolder.visible = false;
    group.add(backHolder);

    // ---- 名牌 ----
    const plate = createPlate(side);
    plate.holder.position.y = basePlateY;
    group.add(plate.holder);
    const nameTex = def ? getLabelTexture(def, side) : null;
    const hiddenTex = getHiddenLabelTexture(branch, side);

    const piece = {
      uid: state.uid,
      side,
      branch,
      def,
      key: state.key,
      group,
      frontHolder,
      backHolder,
      baseGroup,
      plate: plate.holder,
      plateMesh: plate.mesh,
      plateMat: plate.mat,
      nameTex,
      hiddenTex,
      hidden: !def,
      yaw,
      basePlateY,
      anims,
      altitude: 0,
      targetAltitude: 0,
      cameraFacing: true,
      /** 隱藏／公開切換 */
      setHidden(hidden) {
        piece.hidden = hidden;
        frontHolder.visible = !hidden;
        backHolder.visible = hidden;
        piece.plateMat.map = hidden ? hiddenTex : nameTex;
        piece.plateMat.emissiveMap = hidden ? hiddenTex : nameTex;
        piece.plateMat.needsUpdate = true;
      },
      /** 每幀更新（動畫、面向鏡頭的名牌） */
      update(t, dt, camera) {
        for (const fn of anims) fn(t, dt);
        if (camera) {
          const p = group.position;
          piece.plate.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
        }
        // 名牌高度：飛機／船艦與地面棋一致，維持可讀
        piece.plate.position.y = basePlateY;
      },
      /** 設定飛行高度（僅空軍用） */
      setAltitude(y) {
        piece.altitude = y;
        frontHolder.position.y = y;
      },
    };
    piece.setHidden(!def);
    return piece;
  }

  function setSideColors(colors) {
    const next = normalizeSideColors(colors);
    for (const side of ['south', 'north']) {
      applySideMats(mats[side], next[side]);
      mats[side].cfg = { ...next[side] };
    }
    sideColors = next;
    // 陣營色已變更，重繪所有標籤與旗布
    for (const [key, tex] of labelCache) {
      tex.dispose();
      labelCache.delete(key);
    }
    for (const [key, tex] of hiddenLabelCache) {
      tex.dispose();
      hiddenLabelCache.delete(key);
    }
    for (const [key, tex] of flagTexCache) {
      tex.dispose();
      flagTexCache.delete(key);
    }
  }

  function dispose() {
    for (const tex of labelCache.values()) tex.dispose();
    for (const tex of hiddenLabelCache.values()) tex.dispose();
    for (const tex of flagTexCache.values()) tex.dispose();
    labelCache.clear();
    hiddenLabelCache.clear();
    flagTexCache.clear();
  }

  return { createPiece, setSideColors, dispose, materials: mats, BASE_TOP };
}

export default createPieceFactory;
