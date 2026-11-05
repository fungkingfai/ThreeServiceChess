/**
 * 三軍棋棋子資料（Three-Service Chess pieces）
 * ------------------------------------------------------------------
 * 每方 30 枚棋子，雙方棋子種類完全相同（各一枚）：
 *   陸軍 11 名官兵 + 11 種武器 + 軍旗 = 23 枚（佈於陸地）
 *   海軍 5 艘軍艦（佈於沿岸錨點）
 *   空軍 2 架飛機（佈於機場）
 *
 * combatKey 對應 src/core/combat-table.json 中的中文棋子名稱。
 */

export const BRANCH = { ARMY: 'army', NAVY: 'navy', AIR: 'air' };

/**
 * 棋子定義：
 *  key        程式識別碼
 *  name       中文棋名（與勝負表一致）
 *  short      棋子上的顯示文字
 *  branch     軍種 army / navy / air
 *  category   officer(官兵) / weapon(武器) / flag(軍旗)
 *  rank       官兵階級（11 最高，1 最低；非官兵為 0）
 *  move       land(陸行) / sea(航行) / air(飛行) / static(不可移動)
 *  deploy     anyLand / coastal / gate / anchor / airport
 *  tags       特殊能力標記
 *  desc       簡短規則說明（滑鼠提示用）
 *  art        給 3D 模型的造型提示
 */
export const PIECES = [
  // ---------------- 陸軍・官兵 ----------------
  {
    key: 'commander', name: '總司令', short: '總司令', branch: BRANCH.ARMY, category: 'officer',
    rank: 11, move: 'land', deploy: 'anyLand', tags: ['railway'],
    desc: '官兵最高階，勝所有官兵。被擊斃時軍旗位置會曝光。',
    art: 'general',
  },
  {
    key: 'army_group', name: '兵團司令', short: '兵團', branch: BRANCH.ARMY, category: 'officer',
    rank: 10, move: 'land', deploy: 'anyLand', tags: ['railway'],
    desc: '官兵第二階，僅敗於總司令。',
    art: 'officer_star',
  },
  {
    key: 'corps', name: '軍長', short: '軍長', branch: BRANCH.ARMY, category: 'officer',
    rank: 9, move: 'land', deploy: 'anyLand', tags: ['railway'],
    desc: '官兵第三階。',
    art: 'officer_star',
  },
  {
    key: 'division', name: '師長', short: '師長', branch: BRANCH.ARMY, category: 'officer',
    rank: 8, move: 'land', deploy: 'anyLand', tags: ['railway'],
    desc: '官兵第四階；主力艦登陸後戰力等同師長。',
    art: 'officer_star',
  },
  {
    key: 'brigade', name: '團長', short: '團長', branch: BRANCH.ARMY, category: 'officer',
    rank: 7, move: 'land', deploy: 'anyLand', tags: ['railway'],
    desc: '官兵第五階；巡洋艦登陸後戰力等同團長。',
    art: 'officer_star',
  },
  {
    key: 'battalion', name: '營長', short: '營長', branch: BRANCH.ARMY, category: 'officer',
    rank: 6, move: 'land', deploy: 'anyLand', tags: ['railway'],
    desc: '官兵第六階；炮艦攻擊沿海官兵時戰力等同營長。',
    art: 'officer_star',
  },
  {
    key: 'company', name: '連長', short: '連長', branch: BRANCH.ARMY, category: 'officer',
    rank: 5, move: 'land', deploy: 'anyLand', tags: ['railway'],
    desc: '官兵第七階。',
    art: 'officer_star',
  },
  {
    key: 'platoon', name: '排長', short: '排長', branch: BRANCH.ARMY, category: 'officer',
    rank: 4, move: 'land', deploy: 'anyLand', tags: ['railway'],
    desc: '官兵第八階。',
    art: 'officer_star',
  },
  {
    key: 'cavalry', name: '騎兵', short: '騎兵', branch: BRANCH.ARMY, category: 'officer',
    rank: 3, move: 'land', deploy: 'anyLand', tags: ['railway'],
    desc: '官兵第九階。',
    art: 'cavalry',
  },
  {
    key: 'infantry', name: '步兵', short: '步兵', branch: BRANCH.ARMY, category: 'officer',
    rank: 2, move: 'land', deploy: 'anyLand', tags: ['railway'],
    desc: '官兵第十階，官階最低。',
    art: 'infantry',
  },
  {
    key: 'engineer', name: '工兵', short: '工兵', branch: BRANCH.ARMY, category: 'officer',
    rank: 1, move: 'land', deploy: 'anyLand', tags: ['railway', 'engineer'],
    desc: '官階最低，但可拆除地雷、陷阱、毒氣、炸彈、炮壘；主動攻擊炸彈或炮壘必勝。',
    art: 'engineer',
  },
  // ---------------- 陸軍・武器 ----------------
  {
    key: 'mine', name: '地雷', short: '地雷', branch: BRANCH.ARMY, category: 'weapon',
    rank: 0, move: 'static', deploy: 'anyLand', tags: ['mine'],
    desc: '不可移動。碰觸者同歸於盡；唯工兵與戰鬥機可勝，偵察機則無勝負。',
    art: 'mine',
  },
  {
    key: 'trap', name: '陷阱', short: '陷阱', branch: BRANCH.ARMY, category: 'weapon',
    rank: 0, move: 'static', deploy: 'anyLand', tags: ['trap'],
    desc: '不可移動。勝所有官兵與武器，唯工兵可破；戰鬥機與偵察機不受影響。',
    art: 'trap',
  },
  {
    key: 'fort', name: '炮壘', short: '炮壘', branch: BRANCH.ARMY, category: 'weapon',
    rank: 0, move: 'static', deploy: 'coastal', tags: ['fort', 'coastal'],
    desc: '不可移動，佈於海岸。可砲擊相鄰海域的敵艦（潛艦除外）；亦能堅守海岸。',
    art: 'fort',
  },
  {
    key: 'gas', name: '毒氣', short: '毒氣', branch: BRANCH.ARMY, category: 'weapon',
    rank: 0, move: 'land', deploy: 'anyLand', tags: ['gas', 'railway'],
    desc: '可移動。勝所有官兵（工兵除外），敗於工兵及所有其他武器。',
    art: 'gas',
  },
  {
    key: 'missile', name: '飛彈', short: '飛彈', branch: BRANCH.ARMY, category: 'weapon',
    rank: 0, move: 'land', deploy: 'anyLand', tags: ['missile', 'railway'],
    desc: '可移動，或沿空中航線直線越過障礙轟擊：命中同歸於盡、陷阱不受損、不可攻擊城門與機場；會被戰鬥機擊落。',
    art: 'missile',
  },
  {
    key: 'bomb', name: '炸彈', short: '炸彈', branch: BRANCH.ARMY, category: 'weapon',
    rank: 0, move: 'land', deploy: 'anyLand', tags: ['bomb', 'railway'],
    desc: '可移動。與所有棋子同歸於盡（勝軍旗），唯敗於工兵、陷阱及戰鬥機。',
    art: 'bomb',
  },
  {
    key: 'atomic', name: '原子炮', short: '原子炮', branch: BRANCH.ARMY, category: 'weapon',
    rank: 0, move: 'land', deploy: 'anyLand', tags: ['atomic', 'railway'],
    desc: '可移動。勝所有武器與官兵；遇地雷、飛彈、炸彈同歸於盡，遇陷阱則敗，敗於戰鬥機。',
    art: 'atomic',
  },
  {
    key: 'tank', name: '坦克車', short: '坦克', branch: BRANCH.ARMY, category: 'weapon',
    rank: 0, move: 'land', deploy: 'anyLand', tags: ['tank', 'railway'],
    desc: '可移動。勝大炮、高射炮、炮壘、機關槍、毒氣及官兵；遇地雷、飛彈、炸彈同歸於盡，敗於陷阱與戰鬥機。',
    art: 'tank',
  },
  {
    key: 'cannon', name: '大炮', short: '大炮', branch: BRANCH.ARMY, category: 'weapon',
    rank: 0, move: 'land', deploy: 'anyLand', tags: ['cannon', 'railway'],
    desc: '可移動。勝高射炮、炮壘、機關槍、毒氣及官兵；敗於原子炮、坦克車、陷阱與戰鬥機。',
    art: 'cannon',
  },
  {
    key: 'aa', name: '高射炮', short: '高射炮', branch: BRANCH.ARMY, category: 'weapon',
    rank: 0, move: 'land', deploy: 'anyLand', tags: ['aa', 'railway'],
    desc: '可移動。可擊落兩格內敵機，敵機飛越上空亦遭擊落；地面戰勝炮壘、機關槍、毒氣及官兵。',
    art: 'aa',
  },
  {
    key: 'mg', name: '機關鎗', short: '機槍', branch: BRANCH.ARMY, category: 'weapon',
    rank: 0, move: 'land', deploy: 'anyLand', tags: ['mg', 'railway'],
    desc: '可移動。勝所有官兵與毒氣；遇地雷、飛彈、炸彈同歸於盡，敗於陷阱與戰鬥機。',
    art: 'mg',
  },
  // ---------------- 海軍 ----------------
  {
    key: 'battleship', name: '主力艦', short: '主力艦', branch: BRANCH.NAVY, category: 'weapon',
    rank: 0, move: 'sea', deploy: 'anchor', tags: ['battleship', 'amphibious'],
    desc: '海軍之首，勝其餘軍艦（潛艦除外）。可兩棲登陸：登陸後戰力等同師長（對武器則等同坦克車）。',
    art: 'battleship',
  },
  {
    key: 'cruiser', name: '巡洋艦', short: '巡洋艦', branch: BRANCH.NAVY, category: 'weapon',
    rank: 0, move: 'sea', deploy: 'anchor', tags: ['cruiser', 'amphibious'],
    desc: '勝炮艦、驅逐艦（敗於潛艦）。可兩棲登陸：登陸後等同團長（對武器則等同大炮）。',
    art: 'cruiser',
  },
  {
    key: 'gunboat', name: '炮艦', short: '炮艦', branch: BRANCH.NAVY, category: 'weapon',
    rank: 0, move: 'sea', deploy: 'anchor', tags: ['gunboat', 'bombard', 'aa'],
    desc: '可砲擊沿海陸上棋子（官兵比營長、武器比炮壘，攻擊炮壘勝）；亦可擊落附近敵機；與炮壘互擊時先攻者勝。',
    art: 'gunboat',
  },
  {
    key: 'destroyer', name: '驅逐艦', short: '驅逐艦', branch: BRANCH.NAVY, category: 'weapon',
    rank: 0, move: 'sea', deploy: 'anchor', tags: ['destroyer'],
    desc: '勝潛水艇，敗於其他軍艦。',
    art: 'destroyer',
  },
  {
    key: 'submarine', name: '潛水艇', short: '潛艇', branch: BRANCH.NAVY, category: 'weapon',
    rank: 0, move: 'sea', deploy: 'anchor', tags: ['submarine'],
    desc: '勝主力艦、巡洋艦、炮艦；唯敗於驅逐艦。被飛彈、炮壘、戰鬥機攻擊時不受影響（飛彈落空除去）。',
    art: 'submarine',
  },
  // ---------------- 空軍 ----------------
  {
    key: 'fighter', name: '戰鬥機', short: '戰鬥機', branch: BRANCH.AIR, category: 'weapon',
    rank: 0, move: 'air', deploy: 'airport', tags: ['fighter', 'air'],
    desc: '沿航線直線飛行，可無限遠，轉彎須停。勝所有棋子，但敗於高射炮與炮艦；與戰鬥機互碰先攻者勝；飛越敵方高射炮或炮艦上空會被擊落。',
    art: 'fighter',
  },
  {
    key: 'scout', name: '偵察機', short: '偵察機', branch: BRANCH.AIR, category: 'weapon',
    rank: 0, move: 'air', deploy: 'airport', tags: ['scout', 'air'],
    desc: '沿航線直線飛行。可偵察同一直線上的敵方棋子，使其曝光；無戰鬥力，敗於戰鬥機、高射炮、炮艦。',
    art: 'scout',
  },
  // ---------------- 軍旗 ----------------
  {
    key: 'flag', name: '軍旗', short: '軍旗', branch: BRANCH.ARMY, category: 'flag',
    rank: 0, move: 'static', deploy: 'gate', tags: ['flag'],
    desc: '不可移動，佈於三座城門之一。被任何敵棋攻擊即告敗北。',
    art: 'flag',
  },
];

export const PIECE_BY_KEY = Object.fromEntries(PIECES.map((p) => [p.key, p]));
export const PIECE_KEYS = PIECES.map((p) => p.key);
export const PIECE_COUNT = PIECES.length; // 30

/** 官兵階級名稱（由高到低） */
export const OFFICER_NAMES = PIECES.filter((p) => p.category === 'officer')
  .sort((a, b) => b.rank - a.rank)
  .map((p) => p.name);

/** 登陸戰力對照：登陸後官兵比／武器比 */
export const LANDING_PROFILE = {
  battleship: { officer: '師長', weapon: '坦克車' },
  cruiser: { officer: '團長', weapon: '大炮' },
};

/** 炮艦砲擊沿海戰力對照 */
export const BOMBARD_PROFILE = {
  gunboat: { officer: '營長', weapon: '炮壘' },
};

/** 對空攻擊使用的戰力（高射炮、炮艦） */
export const AA_ATTACKER = '高射炮';

/** 炮壘使用的戰力 */
export const FORT_PROFILE = '炮壘';

export function isOfficer(key) {
  return PIECE_BY_KEY[key]?.category === 'officer';
}
export function isMovable(key) {
  const p = PIECE_BY_KEY[key];
  return !!p && p.move !== 'static';
}

export default PIECES;
