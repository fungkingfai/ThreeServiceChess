/**
 * 三軍棋戰鬥判定（combat）
 * ------------------------------------------------------------------
 * 職責：把「攻擊方 + 防守方 + 行動類型」轉成勝負表的一格，並套用
 * DESIGN.md §2.4 的所有特殊映射與覆寫規則。本模組為純函式、無狀態，
 * 不依賴 DOM / three.js，可同時被瀏覽器與 Node 測試 import。
 *
 * 勝負表方向：combat-table.json 的 `matrix[防守方名稱][攻擊方名稱]`
 *   A = 攻擊方勝（守方消滅）
 *   D = 防守方勝（攻方消滅）
 *   B = 同歸於盡
 *   N = 不分勝負（雙方存活，攻擊方退回／原地）
 *   R = 偵察（目標曝光，不戰鬥）
 *   X = 無法作用（不相容的交互；合法行動產生時必須排除）
 *
 * 特殊映射（DESIGN §2.4.2）：
 *   兩棲登陸  landing  → 攻擊方代入 LANDING_PROFILE[攻方key]（依守方官兵/武器選）
 *   炮艦砲擊  bombard  → 攻擊方代入 BOMBARD_PROFILE.gunboat
 *   炮壘砲擊  fort     → 攻擊方代入「炮壘」
 *   防空攻擊  antiair  → 攻擊方代入「高射炮」（高射炮與炮艦共用）
 *   飛彈轟擊  missile  → 攻擊方代入「飛彈」
 *
 * 覆寫規則（DESIGN §2.4.3，優先於勝負表）：
 *   1. 軍旗被任何敵棋攻擊 → FLAG（直接勝利；勝負表沒有軍旗列）。
 *   2. 工兵攻擊炮壘 / 炸彈 → 工兵勝（A）。
 *   3. 炮艦攻擊炮壘、炮壘攻擊炮艦 → 攻擊方勝（A，先攻勝）。
 *   4. 潛水艇被飛彈、炮壘、戰鬥機攻擊 → N（雙方無損；飛彈仍會落空消滅，
 *      由 engine 依「飛彈發射後必定消滅」處理）。若表為 X 亦以 N 處理。
 *   5. 其餘 X 一律不得成為合法行動；resolveCombat 被直接呼叫遇到 X 時
 *      回傳 outcome='N' 並附 rawOutcome='X'（對引擎而言等於無效果），
 *      legal-moves.js 用 rawOutcome 判斷是否生成行動。
 *
 * 已知的規格矛盾取捨（DESIGN §2.3 vs 勝負表）：
 *   - 「反飛彈：戰鬥機…（勝）」文字與勝負表 `matrix[飛彈][戰鬥機]='B'`
 *     衝突。此處以 §2.4「先查表、僅套用列出的覆寫」為準 → B（同歸於盡）。
 *
 * 回傳值一律為純資料：{ outcome, attackerKeyUsed, defenderKeyUsed, rawOutcome, special }
 */

import TABLE from './combat-table.json' with { type: 'json' };
import {
  PIECE_BY_KEY,
  LANDING_PROFILE,
  BOMBARD_PROFILE,
  AA_ATTACKER,
  FORT_PROFILE,
} from './pieces.js';

/** 原始勝負表（唯讀使用；不要修改） */
export const COMBAT_TABLE = TABLE;
/** 30 個棋名 */
export const COMBAT_NAMES = TABLE.names;
/** 圖例（給 UI 規則頁用） */
export const COMBAT_LEGEND = TABLE.legend;
/** 內部矩陣：matrix[守方名稱][攻方名稱] */
const MATRIX = TABLE.matrix;

/** 合法行動不允許出現的原始結果 */
export const X = 'X';

/** 行動特殊類型（與 DESIGN §3.1 的 special 欄位一致） */
export const SPECIAL = {
  LANDING: 'landing',
  BOMBARD: 'bombard',
  FORT: 'fort',
  ANTIAIR: 'antiair',
  MISSILE: 'missile',
  AIR: 'air',
  RAIL: 'rail',
  BATTLE: 'battle',
};

/** 取得棋子定義（key → pieces.js 定義） */
export function pieceDef(key) {
  return PIECE_BY_KEY[key] || null;
}

/** 取得棋子中文名（查表用） */
export function pieceNameOf(key) {
  return PIECE_BY_KEY[key]?.name || null;
}

/** 把「棋子物件 / 棋子 key / 中文名」正規化成 key */
export function keyOf(pieceOrKey) {
  if (!pieceOrKey) return null;
  if (typeof pieceOrKey === 'string') {
    if (PIECE_BY_KEY[pieceOrKey]) return pieceOrKey;
    // 也接受中文名（方便測試與 UI 直接呼叫）
    const found = Object.values(PIECE_BY_KEY).find((d) => d.name === pieceOrKey);
    return found ? found.key : pieceOrKey;
  }
  return pieceOrKey.key ?? null;
}

/** 防守方分類：'officer' 官兵 / 'weapon' 武器（含軍旗以外的其他） */
export function defenderCategory(defenderKey) {
  const def = PIECE_BY_KEY[defenderKey];
  return def && def.category === 'officer' ? 'officer' : 'weapon';
}

/**
 * 決定「攻方代入勝負表的名稱」（DESIGN §2.4 特殊映射）。
 * @param {string} attackerKey 攻擊方棋子 key
 * @param {string} defenderKey 防守方棋子 key
 * @param {{special?:string}} context 行動類型
 * @returns {string|null} 中文棋名
 */
export function attackerNameFor(attackerKey, defenderKey, context = {}) {
  const special = context.special || SPECIAL.BATTLE;
  const officerLike = defenderCategory(defenderKey) === 'officer';
  switch (special) {
    case SPECIAL.LANDING: {
      const profile = LANDING_PROFILE[attackerKey];
      if (profile) return officerLike ? profile.officer : profile.weapon;
      return pieceNameOf(attackerKey);
    }
    case SPECIAL.BOMBARD: {
      const profile = BOMBARD_PROFILE[attackerKey] || BOMBARD_PROFILE.gunboat;
      return officerLike ? profile.officer : profile.weapon;
    }
    case SPECIAL.FORT:
      return FORT_PROFILE;
    case SPECIAL.ANTIAIR:
      return AA_ATTACKER;
    case SPECIAL.MISSILE:
      return '飛彈';
    default:
      // walk / rail / sea / air 等一般戰鬥：以實際棋種代入
      return pieceNameOf(attackerKey);
  }
}

/**
 * 直接查勝負表（不套任何覆寫）。
 * @returns {'A'|'D'|'B'|'N'|'R'|'X'|undefined}
 */
export function lookupTable(attackerName, defenderName) {
  if (!attackerName || !defenderName) return undefined;
  return MATRIX[defenderName]?.[attackerName];
}

/**
 * 套用 DESIGN §2.4.3 的覆寫規則。
 * @returns {'A'|'D'|'B'|'N'|'R'|'FLAG'|null} null 表示沒有覆寫
 */
export function overrideOutcome(attackerKey, defenderKey, attackerName, special) {
  // 1. 軍旗：被任何敵棋攻擊 → 直接勝利（勝負表沒有軍旗列）
  if (defenderKey === 'flag') return 'FLAG';

  // 2. 工兵剋炮壘 / 炸彈（主動攻擊必勝）
  if (attackerKey === 'engineer') {
    if (defenderKey === 'fort') return 'A';
    if (defenderKey === 'bomb') return 'A';
  }

  // 3. 炮艦 ↔ 炮壘：先攻（攻擊方）勝
  if (special === SPECIAL.BOMBARD && defenderKey === 'fort') return 'A';
  if (special === SPECIAL.FORT && defenderKey === 'gunboat') return 'A';

  // 4. 潛水艇被飛彈、炮壘、戰鬥機攻擊 → 不分勝負
  //    （飛彈落空消滅由 engine 的「飛彈發射後必定消滅」處理）
  if (
    defenderKey === 'submarine' &&
    (attackerName === '飛彈' || attackerName === '炮壘' || attackerName === '戰鬥機')
  ) {
    return 'N';
  }

  return null;
}

/**
 * 不經任何「X→N」轉換的原始判定（供 legal-moves 判斷是否可生成行動）。
 * @returns {{outcome:string, rawOutcome:string, attackerKeyUsed:string|null, defenderKeyUsed:string|null, special:string}}
 */
export function rawOutcomeOf(attackerKey, defenderKey, context = {}) {
  const special = context.special || SPECIAL.BATTLE;
  const attackerName = attackerNameFor(attackerKey, defenderKey, { special });
  const defenderName = pieceNameOf(defenderKey);
  const over = overrideOutcome(attackerKey, defenderKey, attackerName, special);
  if (over) {
    return {
      outcome: over,
      rawOutcome: over,
      attackerKeyUsed: attackerName,
      defenderKeyUsed: defenderName,
      special,
    };
  }
  const raw = lookupTable(attackerName, defenderName);
  const outcome = raw ?? X;
  return {
    outcome,
    rawOutcome: outcome,
    attackerKeyUsed: attackerName,
    defenderKeyUsed: defenderName,
    special,
  };
}

/**
 * 戰鬥判定主函式。
 * @param {{key:string}} attacker 攻擊方棋子物件（或直接傳 key / 中文名）
 * @param {{key:string}} defender 防守方棋子物件（或直接傳 key / 中文名）
 * @param {{special?:string}} [context] 行動類型：'landing'|'bombard'|'fort'|'antiair'|'missile'
 * @returns {{outcome:'A'|'D'|'B'|'N'|'R'|'FLAG', attackerKeyUsed:string|null,
 *            defenderKeyUsed:string|null, rawOutcome:string, special:string}}
 */
export function resolveCombat(attacker, defender, context = {}) {
  const aKey = keyOf(attacker);
  const dKey = keyOf(defender);
  const res = rawOutcomeOf(aKey, dKey, context);
  // 對外契約不允許 'X'：X 表示「無法作用」，對引擎而言等同 N（雙方無損、攻方不動）。
  // legal-moves.js 會在生成行動時用 rawOutcome 排除掉 X 的組合。
  const outcome = res.rawOutcome === X ? 'N' : res.outcome;
  return {
    outcome,
    attackerKeyUsed: res.attackerKeyUsed,
    defenderKeyUsed: res.defenderKeyUsed,
    rawOutcome: res.rawOutcome,
    special: res.special,
  };
}

/**
 * 此交互是否允許成為合法行動（false = X 無法作用）。
 */
export function isInteractionAllowed(attacker, defender, context = {}) {
  const aKey = keyOf(attacker);
  const dKey = keyOf(defender);
  const res = rawOutcomeOf(aKey, dKey, context);
  return res.rawOutcome !== X;
}

/** 方便測試／UI：以兩個中文名直接查表（不套覆寫） */
export function tableLookupByName(attackerName, defenderName) {
  return lookupTable(attackerName, defenderName);
}

export default {
  COMBAT_TABLE,
  COMBAT_NAMES,
  COMBAT_LEGEND,
  SPECIAL,
  resolveCombat,
  rawOutcomeOf,
  attackerNameFor,
  isInteractionAllowed,
  lookupTable,
  tableLookupByName,
  pieceNameOf,
  pieceDef,
  keyOf,
};
