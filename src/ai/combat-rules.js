/**
 * 三軍棋戰鬥規則知識（AI 版）
 * ------------------------------------------------------------------
 * 依 DESIGN.md §2.4 與 src/core/combat-table.json 建立「AI 自己能算」的
 * 戰鬥預測工具。AI 只在自己的模擬世界（belief 取樣）裡使用，不讀敵方真值。
 *
 * 主要概念：
 *   - 一般攻擊：直接查勝負表 matrix[守方][攻方]。
 *   - 特殊行動：先依 DESIGN 的映射換算「攻方代打者」，再查表。
 *   - 修正規則（覆寫勝負表）：工兵拆炮壘、炮艦砲擊炮壘、潛艇遇飛彈、
 *     軍旗被攻擊直接獲勝…等。
 *   - 回傳的不只是 A/D/B/N/R/FLAG 代碼，還有「實務上誰會消失、誰會佔位」，
 *     方便 AI 計算交換期望值。
 */
import {
  PIECES,
  PIECE_BY_KEY,
  LANDING_PROFILE,
  BOMBARD_PROFILE,
  AA_ATTACKER,
  FORT_PROFILE,
} from '../core/pieces.js';
import { COMBAT_MATRIX, COMBAT_NAMES } from './combat-data.js';

/* ------------------------------------------------------------------ */
/* 勝負結果代碼                                                        */
/* ------------------------------------------------------------------ */

/** 勝負表結果代碼（與 core/combat-table.json 一致） */
export const OUTCOME = {
  ATTACK_WIN: 'A', // 攻方勝：守方消滅，攻方存活並佔位
  DEFEND_WIN: 'D', // 守方勝：攻方消滅
  BOTH: 'B', // 同歸於盡
  DRAW: 'N', // 不分勝負：雙方存活，攻方留在原處
  RECON: 'R', // 偵察：目標曝光，不發生戰鬥
  NO_EFFECT: 'X', // 無法作用（合法行動不應生成）
  FLAG: 'FLAG', // 軍旗被攻擊：攻擊方直接獲勝
};

/** 結果的白話說明 */
export const OUTCOME_TEXT = {
  A: '攻方勝',
  D: '守方勝',
  B: '同歸於盡',
  N: '不分勝負',
  R: '偵察曝光',
  X: '無法作用',
  FLAG: '奪旗勝利',
};

/* ------------------------------------------------------------------ */
/* 棋子基本資料查詢（用 core/pieces.js 的權威定義）                    */
/* ------------------------------------------------------------------ */

const PIECE_LIST = PIECES.map((p) => ({
  key: p.key,
  name: p.name,
  branch: p.branch,
  category: p.category,
  rank: p.rank,
  move: p.move,
  tags: p.tags || [],
}));
export const AI_PIECES = PIECE_LIST;
export const PIECE_KEYS = PIECE_LIST.map((p) => p.key);
export const PIECE_COUNT = PIECE_KEYS.length; // 30

export function pieceMeta(key) {
  return PIECE_BY_KEY[key] || null;
}
export function nameOf(key) {
  return PIECE_BY_KEY[key]?.name || null;
}
const NAME_TO_KEY = Object.fromEntries(PIECES.map((p) => [p.name, p.key]));
export function keyOfName(name) {
  return NAME_TO_KEY[name] || null;
}
export function branchOf(key) {
  return PIECE_BY_KEY[key]?.branch || null;
}
export function categoryOf(key) {
  return PIECE_BY_KEY[key]?.category || null;
}
export function isOfficerKey(key) {
  return PIECE_BY_KEY[key]?.category === 'officer';
}
export function isWeaponKey(key) {
  return PIECE_BY_KEY[key]?.category === 'weapon';
}
export function rankOf(key) {
  return PIECE_BY_KEY[key]?.rank || 0;
}
export function isStaticKey(key) {
  return PIECE_BY_KEY[key]?.move === 'static';
}
export function isMovableKey(key) {
  const p = PIECE_BY_KEY[key];
  return !!p && p.move !== 'static';
}
export function hasTag(key, tag) {
  return !!(PIECE_BY_KEY[key]?.tags || []).includes(tag);
}
/** 該棋種是否會飛（空軍） */
export function isAirKey(key) {
  return PIECE_BY_KEY[key]?.branch === 'air';
}
/** 該棋種是否為海軍 */
export function isNavyKey(key) {
  return PIECE_BY_KEY[key]?.branch === 'navy';
}
/** 該棋種是否為陸軍（含軍旗） */
export function isArmyKey(key) {
  return PIECE_BY_KEY[key]?.branch === 'army';
}

/** 我方（AI）手上的完整 30 棋種清單（每個棋種各一枚） */
export const FULL_ROSTER = PIECE_LIST.map((p) => p.key);

/** 挑出某軍種的棋種 */
export function keysOfBranch(branch) {
  return PIECE_LIST.filter((p) => p.branch === branch).map((p) => p.key);
}
export const ARMY_KEYS = keysOfBranch('army');
export const NAVY_KEYS = keysOfBranch('navy');
export const AIR_KEYS = keysOfBranch('air');

/* ------------------------------------------------------------------ */
/* 特殊行動的「攻方代打者」換算                                        */
/* ------------------------------------------------------------------ */

/**
 * 取得特殊行動實際拿去查表的攻擊方棋名。
 * @param {string} attackerKey 真正的攻方棋種 key
 * @param {string|null} defenderKey 守方棋種 key（未知時可傳 null，僅少數映射需要）
 * @param {string} special normal|landing|bombard|fire|antiair|missile
 * @returns {string|null} 棋名
 */
export function attackerProfileName(attackerKey, defenderKey, special = 'normal') {
  switch (special) {
    case 'landing': {
      const profile = LANDING_PROFILE[attackerKey];
      if (!profile) return null;
      // 登陸戰力依守方類別：官兵→官階、武器（含地雷陷阱炮壘）→武器
      const cat = defenderKey ? categoryOf(defenderKey) : 'officer';
      return cat === 'officer' ? profile.officer : profile.weapon;
    }
    case 'bombard': {
      const profile = BOMBARD_PROFILE[attackerKey];
      if (!profile) return null;
      const cat = defenderKey ? categoryOf(defenderKey) : 'officer';
      return cat === 'officer' ? profile.officer : profile.weapon;
    }
    case 'fire':
      return FORT_PROFILE;
    case 'antiair':
      return AA_ATTACKER;
    case 'missile':
      return '飛彈';
    default:
      return nameOf(attackerKey);
  }
}

/* ------------------------------------------------------------------ */
/* 核心：戰鬥預測                                                      */
/* ------------------------------------------------------------------ */

const DEFENDER_NAMES = new Set(Object.keys(COMBAT_MATRIX));

/**
 * 戰鬥預測（含 DESIGN §2.4 的修正規則）。
 *
 * @param {object} params
 * @param {string} params.attackerKey 攻方棋種 key
 * @param {string} params.defenderKey 守方棋種 key（'flag' 表軍旗）
 * @param {string} [params.special='normal'] normal|landing|bombard|fire|antiair|missile
 * @returns {null|{outcome:string, attackerDies:boolean, defenderDies:boolean,
 *   occupied:boolean, flagCapture:boolean, reveal:boolean, attackerProfile:?string,
 *   rawOutcome:string}} 若 X（不合法）則回傳 null
 */
export function battleForecast(attackerKey, defenderKey, special = 'normal') {
  if (!attackerKey || !defenderKey) return null;

  // 軍旗：任何攻擊都直接奪旗獲勝（不論攻守強弱、是否同歸於盡）
  if (defenderKey === 'flag') {
    return {
      outcome: OUTCOME.FLAG,
      rawOutcome: OUTCOME.FLAG,
      attackerDies: false,
      defenderDies: true,
      occupied: true,
      flagCapture: true,
      reveal: true,
      attackerProfile: nameOf(attackerKey),
    };
  }

  const defenderName = nameOf(defenderKey);
  if (!defenderName || !DEFENDER_NAMES.has(defenderName)) return null;

  const profileName = attackerProfileName(attackerKey, defenderKey, special);
  if (!profileName) return null;

  let raw = COMBAT_MATRIX[defenderName]?.[profileName] ?? OUTCOME.NO_EFFECT;

  // ---------- DESIGN §2.4 修正規則（覆寫勝負表） ----------
  if (special === 'normal') {
    // 工兵主動攻擊炮壘／炸彈 ⇒ 工兵（攻方）勝；勝負表對炮壘原為 D
    if (attackerKey === 'engineer' && defenderKey === 'fort') raw = OUTCOME.ATTACK_WIN;
  }
  // 炮艦砲擊炮壘 ⇒ 炮艦勝（代打者「炮壘」查表原為同歸於盡）
  if (special === 'bombard' && defenderKey === 'fort') raw = OUTCOME.ATTACK_WIN;
  // 炮壘砲擊炮艦 ⇒ 炮壘勝（勝負表已是 A，這裡明確寫出以免未來改表）
  if (special === 'fire' && defenderKey === 'gunboat') raw = OUTCOME.ATTACK_WIN;
  // 潛水艇被飛彈攻擊 ⇒ N（勝負表為 X，以 N 處理；實務上飛彈會落空消滅）
  if (special === 'missile' && defenderKey === 'submarine') raw = OUTCOME.DRAW;

  const outcome = raw;
  if (outcome === OUTCOME.NO_EFFECT) return null;

  // 轉換成「雙方死活／佔位」語意
  let attackerDies = false;
  let defenderDies = false;
  let occupied = false;
  switch (outcome) {
    case OUTCOME.ATTACK_WIN:
      defenderDies = true;
      occupied = true;
      break;
    case OUTCOME.DEFEND_WIN:
      attackerDies = true;
      break;
    case OUTCOME.BOTH:
      attackerDies = true;
      defenderDies = true;
      break;
    case OUTCOME.DRAW:
    case OUTCOME.RECON:
      break;
    default:
      return null;
  }

  // 飛彈發射後必定消失（即使結果是 N/R；對陷阱時飛彈亡、陷阱存）
  if (special === 'missile') {
    attackerDies = true;
    occupied = false;
  }

  // 戰鬥參與者（或偵察目標）一律曝光；R 也算曝光
  const reveal = true;

  return {
    outcome,
    rawOutcome: raw,
    attackerDies,
    defenderDies,
    occupied,
    flagCapture: false,
    reveal,
    // R（偵察）不會傷害對方
    attackerProfile: profileName,
  };
}

/* ------------------------------------------------------------------ */
/* 棋種價值（AI 評估用；單位為「分」）                                 */
/* ------------------------------------------------------------------ */

/**
 * 棋子相對價值。概念：
 *   - 軍旗＝無限大（奪旗直接獲勝，見 FLAG_VALUE）
 *   - 官兵依階級遞增；總司令額外加分（陣亡會曝光軍旗）
 *   - 特殊武器依戰術用途給分
 */
export const PIECE_VALUES = {
  flag: 9999,
  commander: 120,
  army_group: 100,
  corps: 86,
  division: 74,
  brigade: 64,
  battalion: 54,
  company: 45,
  platoon: 38,
  cavalry: 32,
  infantry: 27,
  engineer: 30,
  mine: 22,
  trap: 30,
  fort: 40,
  gas: 36,
  missile: 42,
  bomb: 34,
  atomic: 72,
  tank: 60,
  cannon: 48,
  aa: 42,
  mg: 36,
  battleship: 66,
  cruiser: 54,
  gunboat: 50,
  destroyer: 40,
  submarine: 46,
  fighter: 72,
  scout: 26,
};

/** 軍旗的價值（EV 中的奪旗/失旗勝負權重） */
export const FLAG_VALUE = 50000;

export function valueOf(key) {
  return PIECE_VALUES[key] ?? 10;
}

/**
 * 依「候選棋種分布」計算期望價值。
 * @param {Map<string,number>|Object} dist key→機率
 */
export function expectedValue(dist) {
  let v = 0;
  if (dist instanceof Map) {
    for (const [k, p] of dist) v += (PIECE_VALUES[k] ?? 10) * p;
  } else if (dist) {
    for (const k of Object.keys(dist)) v += (PIECE_VALUES[k] ?? 10) * (dist[k] || 0);
  }
  return v;
}

/* ------------------------------------------------------------------ */
/* 對抗分布                                                            */
/* ------------------------------------------------------------------ */

/**
 * 以「攻擊方已知、守方為候選分布」計算戰鬥期望。
 *
 * 回傳：
 *   pWin / pLose / pBoth / pDraw / pFlag —— 各結果機率（pFlag=奪旗）
 *   attackerDiesProb / defenderDiesProb —— 雙方陣亡機率
 *   exchange —— 交換期望值（以棋種價值計，正值＝攻方賺）
 *   對 X 候選視為「不可能」（因為引擎已把該行動列為合法，真守方必不為 X），
 *   會重新正規化。
 *
 * @param {string} attackerKey
 * @param {Map<string,number>} defenderDist 守方候選分布（key→機率）
 * @param {string} special
 * @param {(key:string)=>number} [valueFn]
 */
export function expectedBattle(attackerKey, defenderDist, special = 'normal', valueFn = valueOf) {
  const res = {
    total: 0,
    pWin: 0,
    pLose: 0,
    pBoth: 0,
    pDraw: 0,
    pRecon: 0,
    pFlag: 0,
    attackerDiesProb: 0,
    defenderDiesProb: 0,
    exchange: 0,
    known: false,
    sampleKey: null,
  };
  if (!defenderDist || defenderDist.size === 0) return res;
  let total = 0;
  const valid = [];
  for (const [defKey, p] of defenderDist) {
    if (!(p > 0)) continue;
    const fc = battleForecast(attackerKey, defKey, special);
    if (!fc) continue; // X：此候選與「行動合法」矛盾
    total += p;
    valid.push([defKey, p, fc]);
  }
  if (!valid.length) return res;

  const av = valueFn(attackerKey);
  for (const [defKey, p, fc] of valid) {
    const q = p / total;
    res.total += q;
    if (fc.outcome === OUTCOME.FLAG) res.pFlag += q;
    else if (fc.outcome === OUTCOME.ATTACK_WIN) res.pWin += q;
    else if (fc.outcome === OUTCOME.DEFEND_WIN) res.pLose += q;
    else if (fc.outcome === OUTCOME.BOTH) res.pBoth += q;
    else if (fc.outcome === OUTCOME.RECON) res.pRecon += q;
    else res.pDraw += q;

    if (fc.attackerDies) res.attackerDiesProb += q;
    if (fc.defenderDies) res.defenderDiesProb += q;

    const dv = valueFn(defKey);
    let ex = 0;
    if (fc.flagCapture) ex = FLAG_VALUE + dv;
    else {
      if (fc.defenderDies) ex += dv;
      if (fc.attackerDies) ex -= av;
    }
    res.exchange += q * ex;
  }
  res.known = defenderDist.size === 1;
  res.sampleKey = res.known ? defenderDist.keys().next().value : null;
  return res;
}

/** 檢查某特殊攻擊對某守方棋種是否可能（非 X） */
export function canBattle(attackerKey, defenderKey, special = 'normal') {
  return !!battleForecast(attackerKey, defenderKey, special);
}

/** 取得勝負表的原始代碼（不做特殊映射，僅供除錯/測試） */
export function rawOutcome(defenderKey, attackerKey) {
  const dName = nameOf(defenderKey);
  const aName = nameOf(attackerKey);
  if (!dName || !aName) return null;
  return COMBAT_MATRIX[dName]?.[aName] ?? null;
}

/** 給測試/除錯：勝負表是否與 core/combat-table.json 一致（由 tests 檢查） */
export { COMBAT_MATRIX, COMBAT_NAMES };
