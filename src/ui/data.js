/**
 * UI 資料層：把 core 的棋子資料與勝負表整理成畫面好用的形式
 * ------------------------------------------------------------------
 * - 唯讀匯入 src/core/pieces.js（棋子定義）與產生的 combat-data.js（勝負表）。
 * - 所有衍生資料（分組、勝負摘要、特殊行動判定）都在此計算一次並快取。
 * - 此檔只做「呈現用」的判定；實戰勝負一律以引擎為準。
 */

import {
  PIECES,
  PIECE_BY_KEY,
  BRANCH,
  LANDING_PROFILE,
  BOMBARD_PROFILE,
  AA_ATTACKER,
  FORT_PROFILE,
} from '../core/pieces.js';
import { COMBAT_MATRIX, COMBAT_NAMES } from './combat-data.js';

export { PIECES, PIECE_BY_KEY, BRANCH, COMBAT_MATRIX, COMBAT_NAMES };

/* ------------------------------------------------------------------ */
/* 基本對照表                                                          */
/* ------------------------------------------------------------------ */

export const SIDE_META = {
  south: { key: 'south', label: '南軍', short: '南', color: 'green', isPlayer: true, tagline: '玩家' },
  north: { key: 'north', label: '北軍', short: '北', color: 'red', isPlayer: false, tagline: 'AI' },
};

export const BRANCH_META = {
  army: { key: 'army', label: '陸軍', icon: 'army', color: 'gold', desc: '官兵與陸上武器，佔棋盤陸地。' },
  navy: { key: 'navy', label: '海軍', icon: 'navy', color: 'blue', desc: '五艘軍艦，只能部署於錨點、航行於海域。' },
  air: { key: 'air', label: '空軍', icon: 'air', color: 'cyan', desc: '戰鬥機與偵察機，部署於機場、沿航線飛行。' },
};

export const CATEGORY_META = {
  officer: { key: 'officer', label: '官兵', desc: '以階級比大小：上級勝下級。' },
  weapon: { key: 'weapon', label: '武器', desc: '各具特殊能力的陸上／海上／空中兵器。' },
  flag: { key: 'flag', label: '軍旗', desc: '勝負核心；被敵棋攻擊即告敗北。' },
};

export const MOVE_META = {
  land: { key: 'land', label: '陸行', desc: '每回合走相鄰陸地一格，或沿鐵路 1～3 站。' },
  sea: { key: 'sea', label: '航行', desc: '每回合走相鄰海域一格，或執行砲擊／兩棲登陸。' },
  air: { key: 'air', label: '飛行', desc: '沿同一行或列直線飛行任意距離，轉彎需停下。' },
  static: { key: 'static', label: '不可移動', desc: '佈陣後固定不動，只能被動迎擊。' },
};

export const DEPLOY_META = {
  anyLand: { key: 'anyLand', label: '本方陸地兵站（含城門）', short: '陸地' },
  coastal: { key: 'coastal', label: '本方海岸列（炮壘）', short: '海岸' },
  gate: { key: 'gate', label: '城門（軍旗限此；其餘陸軍棋子可當誘餌）', short: '城門' },
  anchor: { key: 'anchor', label: '本方五個錨點之一（海軍）', short: '錨點' },
  airport: { key: 'airport', label: '本方兩座機場之一（空軍）', short: '機場' },
};

/** 特殊能力標記 → 中文短標籤 */
export const TAG_META = {
  railway: '鐵路',
  engineer: '破雷／拆彈',
  mine: '佈雷',
  trap: '伏擊',
  fort: '沿岸砲擊',
  coastal: '海岸部署',
  gas: '毒氣',
  missile: '直線轟擊',
  bomb: '玉石俱焚',
  atomic: '核砲',
  tank: '裝甲',
  cannon: '火砲',
  aa: '防空',
  mg: '壓制',
  battleship: '艦隊旗艦',
  cruiser: '登陸艦',
  gunboat: '海對陸砲擊',
  destroyer: '反潛',
  submarine: '潛航',
  amphibious: '兩棲登陸',
  bombard: '砲擊',
  flag: '勝負核心',
  air: '空軍',
  fighter: '制空',
  scout: '偵察',
};

/** 戰鬥結果代碼 → 文案（F 為軍旗特例） */
export const RESULT_META = {
  A: {
    code: 'A', key: 'attack', label: '攻擊方勝', short: '攻勝', tone: 'attack', icon: 'sword',
    desc: '防守方棋子被消滅，攻擊方存活並佔領目標格。',
    engine: 'A（攻擊方勝）',
  },
  D: {
    code: 'D', key: 'defend', label: '防守方勝', short: '守勝', tone: 'defend', icon: 'shield',
    desc: '攻擊方棋子被消滅，防守方留在原地。',
    engine: 'D（防守方勝）',
  },
  B: {
    code: 'B', key: 'both', label: '同歸於盡', short: '同盡', tone: 'both', icon: 'skull',
    desc: '雙方棋子同時被消滅，目標格清空。',
    engine: 'B（同歸於盡）',
  },
  N: {
    code: 'N', key: 'draw', label: '不分勝負', short: '不分', tone: 'draw', icon: 'minus',
    desc: '雙方皆存活，攻擊方退回原格，本回合結束。',
    engine: 'N（不分勝負）',
  },
  R: {
    code: 'R', key: 'scout', label: '偵察成功', short: '偵察', tone: 'scout', icon: 'eye',
    desc: '不發生戰鬥；目標棋種對偵察方曝光。',
    engine: 'R（偵察）',
  },
  X: {
    code: 'X', key: 'invalid', label: '無法作用', short: '無效', tone: 'invalid', icon: 'close',
    desc: '此組合在規則中不存在，或彼此無法互動（引擎不會產生這種行動）。',
    engine: 'X（無法作用）',
  },
  F: {
    code: 'F', key: 'flag', label: '奪旗勝利', short: '奪旗', tone: 'flag', icon: 'flag',
    desc: '軍旗被任何敵棋攻擊即告失守，攻擊方立即獲得勝利。',
    engine: 'FLAG（奪旗）',
  },
};

/** 特殊行動 → 顯示文案；key 對應 engine 事件的 special 欄位 */
export const SPECIAL_META = {
  landing: { key: 'landing', label: '兩棲登陸', desc: '軍艦駛向相鄰海岸，以登陸戰力決勝。' },
  bombard: { key: 'bombard', label: '炮艦砲擊', desc: '炮艦自海上砲擊相鄰海岸的陸上棋子。' },
  fort: { key: 'fort', label: '炮壘砲擊', desc: '炮壘自岸際砲擊相鄰海域的敵艦。' },
  antiair: { key: 'antiair', label: '防空攔截', desc: '高射炮或炮艦對空開火。' },
  missile: { key: 'missile', label: '飛彈轟擊', desc: '飛彈沿直線越過障礙，對遠方目標同歸於盡。' },
  air: { key: 'air', label: '空中戰鬥', desc: '飛機沿航線直線交戰。' },
  rail: { key: 'rail', label: '鐵路突擊', desc: '沿鐵路 1～3 站移動後接戰。' },
  campProtect: { key: 'campProtect', label: '行營保護', desc: '敵方陸軍無法攻擊行營內的棋子。' },
  recon: { key: 'recon', label: '空中偵察', desc: '偵察機使直線上的敵棋曝光。' },
};

export const DIFFICULTY_META = {
  easy: { key: 'easy', label: '簡單', desc: '貪心＋隨機，適合先熟悉規則。' },
  normal: { key: 'normal', label: '普通', desc: '期望值評估與威脅判斷，標準挑戰。' },
  hard: { key: 'hard', label: '困難', desc: '取樣世界 2-ply 搜尋，會設陷阱與藏旗。' },
};

export const DEFAULT_SETTINGS = {
  sound: true,
  revealOnBattle: true,
  difficulty: 'normal',
  viewHints: true,
};

/* ------------------------------------------------------------------ */
/* 棋子查詢                                                            */
/* ------------------------------------------------------------------ */

export const PIECE_BY_NAME = Object.fromEntries(PIECES.map((p) => [p.name, p]));

/** 官階序：總司令 = 1，工兵 = 11（僅官兵） */
export function officerOrdinal(piece) {
  if (!piece || piece.category !== 'officer') return 0;
  return 12 - piece.rank;
}

/** 棋子階級／類別說明 */
export function pieceTierLabel(piece) {
  if (!piece) return '';
  if (piece.category === 'officer') return `官兵第 ${12 - piece.rank} 階`;
  if (piece.category === 'flag') return '勝負核心';
  if (piece.branch === 'navy') return '海軍艦艇';
  if (piece.branch === 'air') return '空軍機種';
  return '陸軍武器';
}

/** 依軍種分組（托盤、圖鑑共用） */
export function groupPieces(pieces = PIECES) {
  const pick = (fn) => pieces.filter(fn);
  return [
    { id: 'officer', title: '陸軍・官兵', caption: '以階級定勝負', branch: 'army', items: pick((p) => p.category === 'officer').sort((a, b) => b.rank - a.rank) },
    { id: 'weapon', title: '陸軍・武器', caption: '特殊能力各異', branch: 'army', items: pick((p) => p.branch === 'army' && p.category === 'weapon') },
    { id: 'navy', title: '海軍・艦隊', caption: '部署於錨點', branch: 'navy', items: pick((p) => p.branch === 'navy') },
    { id: 'air', title: '空軍・航空隊', caption: '部署於機場', branch: 'air', items: pick((p) => p.branch === 'air') },
    { id: 'flag', title: '軍旗', caption: '藏於城門', branch: 'army', items: pick((p) => p.category === 'flag') },
  ];
}

/** 每方棋子數（30） */
export const PIECE_COUNT = PIECES.length;

/* ------------------------------------------------------------------ */
/* 勝負表查詢（含數位版覆寫）                                          */
/* ------------------------------------------------------------------ */

/** 原始勝負表：matrix[防守方][攻擊方] */
export function rawCombat(defenderName, attackerName) {
  return COMBAT_MATRIX?.[defenderName]?.[attackerName] || 'X';
}

const OVERRIDES = [];

/**
 * 數位版判定：先查原表，再套用 DESIGN §2.4.3 的覆寫規則。
 * 回傳 { code, rawCode, overridden, note, mode, attackerName, defenderName }
 */
export function resolveCombat(attackerName, defenderName, mode = 'normal') {
  const attacker = PIECE_BY_NAME[attackerName];
  const defender = PIECE_BY_NAME[defenderName];
  if (!attacker || !defender) {
    return { code: 'X', rawCode: 'X', overridden: false, mode, attackerName, defenderName, note: '未知棋子。' };
  }
  // 軍旗：除了飛彈（不可攻擊城門）之外，任何攻擊都直接奪旗
  if (defender.category === 'flag') {
    if (mode === 'missile') {
      return {
        code: 'X', rawCode: 'F', overridden: true, mode, attackerName, defenderName,
        note: '飛彈不可攻擊城門／機場，因此無法直接轟擊軍旗。',
      };
    }
    if (attacker.category === 'flag') {
      return { code: 'X', rawCode: 'X', overridden: false, mode, attackerName, defenderName, note: '軍旗不可移動，無法主動攻擊。' };
    }
    return {
      code: 'F', rawCode: 'F', overridden: false, mode, attackerName, defenderName,
      note: '軍旗被任何敵棋攻擊即失守，攻擊方立即獲勝（不論結果是否同歸於盡）。',
    };
  }

  // 特殊行動：以代打戰力查表
  let profile = null;
  let profileLabel = '';
  if (mode === 'landing') {
    const map = LANDING_PROFILE[attacker.key];
    if (!map) return invalidMode(mode, attackerName, defenderName, '只有主力艦與巡洋艦可以兩棲登陸。');
    const isOfficer = defender.category === 'officer';
    profile = isOfficer ? map.officer : map.weapon;
    profileLabel = `登陸戰力比照「${profile}」`;
  } else if (mode === 'bombard') {
    if (attacker.key !== 'gunboat') return invalidMode(mode, attackerName, defenderName, '只有炮艦可以執行海對陸砲擊。');
    const isOfficer = defender.category === 'officer';
    profile = isOfficer ? BOMBARD_PROFILE.gunboat.officer : BOMBARD_PROFILE.gunboat.weapon;
    profileLabel = `砲擊戰力比照「${profile}」`;
  } else if (mode === 'fort') {
    if (attacker.key !== 'fort') return invalidMode(mode, attackerName, defenderName, '只有炮壘可以執行岸際砲擊。');
    profile = FORT_PROFILE;
    profileLabel = '以炮壘戰力判定';
  } else if (mode === 'antiair') {
    if (!['aa', 'gunboat'].includes(attacker.key)) return invalidMode(mode, attackerName, defenderName, '只有高射炮與炮艦可以對空開火。');
    if (defender.branch !== 'air') return invalidMode(mode, attackerName, defenderName, '防空火力只能攻擊飛機。');
    profile = AA_ATTACKER;
    profileLabel = '以高射炮戰力判定';
  } else if (mode === 'missile') {
    if (attacker.key !== 'missile') return invalidMode(mode, attackerName, defenderName, '只有飛彈可以執行直線轟擊。');
    profile = '飛彈';
    profileLabel = '以飛彈戰力判定';
  }

  if (profile) {
    let code = rawCombat(defenderName, profile);
    let subjectName = defenderName;
    let attackerLabel = `${attackerName}（${profileLabel}）`;
    // 潛水艇對飛彈：原表為 X，數位版視為不分勝負（飛彈落空消滅）
    if (code === 'X' && defender.key === 'submarine' && ['飛彈', '炮壘', '戰鬥機'].includes(profile)) {
      code = 'N';
      return {
        code, rawCode: 'X', overridden: true, mode, attackerName, defenderName,
        note: `潛水艇對${profile}原本無法作用；數位版以「不分勝負」處理（飛彈則落空消滅）。`,
        attackerLabel, profile,
      };
    }
    return {
      code, rawCode: code, overridden: false, mode, attackerName, defenderName,
      note: `${profileLabel}後查表：守方「${subjectName}」對攻方「${profile}」＝ ${RESULT_META[code]?.short || code}。`,
      attackerLabel, profile,
    };
  }

  // 一般戰鬥
  let rawCode = rawCombat(defenderName, attackerName);
  let code = rawCode;
  let overridden = false;
  let note = '';

  // 覆寫：工兵主動攻擊炮壘 → 工兵勝
  if (attacker.key === 'engineer' && defender.key === 'fort') {
    code = 'A';
    overridden = true;
    note = '原勝負表記為炮壘勝；數位版依「工兵可破壞炮壘」判定工兵勝。';
  }
  // 覆寫：潛水艇被飛彈攻擊 → 不分勝負（原表 X）
  if (defender.key === 'submarine' && attacker.key === 'missile') {
    code = 'N';
    overridden = true;
    note = '原勝負表為無法作用；數位版視為不分勝負，飛彈落空消滅。';
  }

  if (rawCode === 'X' && !overridden) {
    note = '此組合在正常移動中不會發生（引擎不會產生這種合法行動）。';
  }
  return { code, rawCode, overridden, mode, attackerName, defenderName, note };
}

function invalidMode(mode, attackerName, defenderName, note) {
  return { code: 'X', rawCode: 'X', overridden: true, mode, attackerName, defenderName, note: `此行動模式不適用：${note}` };
}

/** 取得結果代碼的中文資料 */
export function resultMeta(code) {
  return RESULT_META[code] || RESULT_META.X;
}

/* ------------------------------------------------------------------ */
/* 勝負摘要（規則頁／圖鑑用）                                          */
/* ------------------------------------------------------------------ */

/** 以「攻擊方」為主角的摘要：能擊敗誰、敗給誰、同歸於盡、不分勝負 */
export function buildAttackSummary() {
  const summary = {};
  for (const attacker of PIECES) {
    const bucket = { wins: [], loses: [], both: [], draws: [], scouts: [], invalid: [], flags: [] };
    for (const defender of PIECES) {
      const { code } = resolveCombat(attacker.name, defender.name, 'normal');
      const name = defender.name;
      if (code === 'A') bucket.wins.push(name);
      else if (code === 'D') bucket.loses.push(name);
      else if (code === 'B') bucket.both.push(name);
      else if (code === 'N') bucket.draws.push(name);
      else if (code === 'R') bucket.scouts.push(name);
      else if (code === 'F') bucket.flags.push(name);
      else bucket.invalid.push(name);
    }
    summary[attacker.name] = bucket;
  }
  return summary;
}

/** 以「防守方」為主角的摘要：能擋下誰、被誰擊敗… */
export function buildDefendSummary() {
  const summary = {};
  for (const defender of PIECES) {
    const bucket = { beats: [], losesTo: [], both: [], draws: [], scouts: [], invalid: [], flags: [] };
    for (const attacker of PIECES) {
      const { code } = resolveCombat(attacker.name, defender.name, 'normal');
      const name = attacker.name;
      if (code === 'A') bucket.losesTo.push(name);
      else if (code === 'D') bucket.beats.push(name);
      else if (code === 'B') bucket.both.push(name);
      else if (code === 'N') bucket.draws.push(name);
      else if (code === 'R') bucket.scouts.push(name);
      else if (code === 'F') bucket.flags.push(name);
      else bucket.invalid.push(name);
    }
    summary[defender.name] = bucket;
  }
  return summary;
}

export const ATTACK_SUMMARY = buildAttackSummary();
export const DEFEND_SUMMARY = buildDefendSummary();

/** 特殊戰力對照（規則頁用） */
export const SPECIAL_PROFILES = [
  {
    id: 'landing',
    title: '兩棲登陸',
    icon: 'navy',
    pieces: ['主力艦', '巡洋艦'],
    lines: [
      '主力艦登陸：對官兵比照「師長」，對武器比照「坦克車」。',
      '巡洋艦登陸：對官兵比照「團長」，對武器比照「大炮」。',
      '登陸成功後該艦成為陸上棋子（不再能下海），但可改用陸上規則行動。',
    ],
  },
  {
    id: 'bombard',
    title: '炮艦砲擊',
    icon: 'navy',
    pieces: ['炮艦'],
    lines: [
      '攻擊相鄰海岸的敵方陸上棋子，自身不移動。',
      '對官兵比照「營長」，對武器比照「炮壘」。',
      '可攻擊行營內的棋子（行營只擋敵方陸軍）。',
    ],
  },
  {
    id: 'fort',
    title: '炮壘砲擊',
    icon: 'army',
    pieces: ['炮壘'],
    lines: [
      '攻擊相鄰海域的敵艦，自身不移動；戰力以「炮壘」代入。',
      '對潛水艇＝不分勝負；對炮艦＝攻擊方（炮壘）勝。',
    ],
  },
  {
    id: 'antiair',
    title: '防空／對空',
    icon: 'air',
    pieces: ['高射炮', '炮艦'],
    lines: [
      '高射炮可攻擊直線距離 2 格內的敵機；炮艦同樣可對空開火。',
      '以「高射炮」戰力代入勝負表；飛機飛越敵方高射炮或炮艦上空時會被自動擊落。',
    ],
  },
  {
    id: 'missile',
    title: '飛彈轟擊',
    icon: 'army',
    pieces: ['飛彈'],
    lines: [
      '沿同一行／列直線攻擊任意距離，可越過任何棋子。',
      '不可攻擊城門與機場；發射後飛彈必定理場（除命中陷阱時由陷阱存活）。',
      '以「飛彈」戰力代入勝負表；對潛水艇＝不分勝負（飛彈落空消滅）。',
    ],
  },
  {
    id: 'recon',
    title: '空中偵察',
    icon: 'air',
    pieces: ['偵察機'],
    lines: [
      '偵察同一行／列直線上的任一敵棋，使其對己方永久曝光（不移動）。',
      '偵察機無戰鬥力：敗給戰鬥機、高射炮、炮艦；與飛彈同歸於盡。',
    ],
  },
];

/** 數位版覆寫規則清單（規則頁列出） */
export const HOUSE_RULES = [
  { id: 'engineer-fort', title: '工兵拆炮壘', text: '工兵主動攻擊炮壘時判定工兵勝（炮壘消滅），原勝負表記為炮壘勝。' },
  { id: 'gunboat-fort', title: '炮艦先攻勝', text: '炮艦攻擊炮壘、或炮壘攻擊炮艦時，攻擊方勝。' },
  { id: 'sub-missile', title: '潛艇與飛彈', text: '潛水艇被飛彈攻擊時視為不分勝負（飛彈落空消滅）；被炮壘、戰鬥機攻擊亦不分勝負。' },
  { id: 'flag', title: '軍旗即勝', text: '軍旗被任何敵棋攻擊即直接勝利（含同歸於盡的攻方）；飛彈不可攻擊城門，故不能直接轟擊軍旗。' },
  { id: 'camp', title: '行營保護', text: '敵方陸軍不得攻擊行營內的棋子；海軍砲擊、空軍與飛彈不受此限。' },
  { id: 'no-x', title: '不產生無效行動', text: '原勝負表中「無法作用（X）」的組合，引擎不會產生對應的合法行動。' },
  { id: 'gate-decoy', title: '城門誘餌', text: '三座城門都可以放置陸軍棋子（軍旗、官兵、可移動武器、地雷、陷阱皆可，一門一格）；軍旗仍只能藏在三門之一，敵方必須攻破城門才能確定。' },
  { id: 'air-gate', title: '空軍與城門', text: '空軍不可攻擊或停留在城門節點（可飛越）；偵察機仍可偵察城門上的棋子。' },
];

/* ------------------------------------------------------------------ */
/* 其他小工具                                                          */
/* ------------------------------------------------------------------ */

/** 依 key 或物件取得棋子定義 */
export function toPiece(value) {
  if (!value) return null;
  if (typeof value === 'string') return PIECE_BY_KEY[value] || null;
  if (value.key && PIECE_BY_KEY[value.key]) {
    // 允許合併外部欄位（uid / side / nodeId…），以 core 定義為基底
    return { ...PIECE_BY_KEY[value.key], ...value };
  }
  if (value.name && PIECE_BY_NAME[value.name]) return { ...PIECE_BY_NAME[value.name], ...value };
  return value;
}

/** 依 key 取得棋子定義 */
export function pieceByKey(key) {
  return PIECE_BY_KEY[key] || null;
}

/** 依名稱取得棋子定義 */
export function pieceByName(name) {
  return PIECE_BY_NAME[name] || null;
}

/** 棋子所屬軍種中文 */
export function branchLabel(branch) {
  return BRANCH_META[branch]?.label || '未知';
}

/** 依棋子列出可讀的佈陣位置 */
export function deployLabel(piece) {
  return DEPLOY_META[piece?.deploy]?.short || '—';
}

export default {
  PIECES, PIECE_BY_KEY, PIECE_BY_NAME, COMBAT_MATRIX, COMBAT_NAMES,
  SIDE_META, BRANCH_META, CATEGORY_META, MOVE_META, DEPLOY_META, TAG_META,
  RESULT_META, SPECIAL_META, DIFFICULTY_META, DEFAULT_SETTINGS,
  groupPieces, resolveCombat, rawCombat, resultMeta,
  ATTACK_SUMMARY, DEFEND_SUMMARY, SPECIAL_PROFILES, HOUSE_RULES,
  toPiece, pieceByKey, pieceByName, branchLabel, deployLabel, pieceTierLabel,
};
