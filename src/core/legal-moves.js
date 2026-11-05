/**
 * 三軍棋合法行動產生（legal-moves）
 * ------------------------------------------------------------------
 * 職責：依 DESIGN.md §2.2／§2.3／§3.1 產生某一方當前的所有合法行動。
 * 純函式、無狀態、不依賴 DOM，AI 會大量呼叫，需保持 < 50ms。
 *
 * 行動格式（DESIGN §3.1）：
 *   { type:'move', pieceUid, from, to, mode:'walk'|'rail'|'sea'|'air', path:[...], airPath?:[...] }
 *   { type:'land', pieceUid, from, to }            兩棲登陸（to 可為敵棋所在格）
 *   { type:'fire', pieceUid, from, target }         炮壘砲擊
 *   { type:'bombard', pieceUid, from, target }      炮艦砲擊
 *   { type:'antiair', pieceUid, from, target }      高射炮／炮艦防空
 *   { type:'missile', pieceUid, from, target }      飛彈直線轟擊
 *   { type:'recon', pieceUid, from, target }        偵察機偵察
 *   { type:'pass' }                                 不出棋（永遠排在最後）
 *
 * 規則重點：
 *   - 陸軍（含登陸後的海軍）：8 方向步行 1 格；在鐵路站可沿鐵路 1~3 站，
 *     不可穿越任何被佔用的車站（敵棋所在站可作為攻擊終點）。
 *   - 海軍：8 方向海域 1 格（不含跨海鐵橋站）；主力艦／巡洋艦可兩棲登陸
 *     相鄰海岸陸地節點（己方或敵方；空地＝上岸、敵棋＝登陸戰）。
 *   - 空軍：選一正交方向直線飛任意距離，可停在空節點或攻擊線上任一敵棋；
 *     不受途中棋子阻擋（但 engine 會處理飛越敵方高射炮／炮艦被擊落）。
 *     偵察機不做一般攻擊，改以 recon 行動讓目標曝光。
 *   - 城門平衡規則（house rule，Lead 裁定）：空軍（戰鬥機／偵察機）不得
 *     攻擊城門節點上的棋子、也不得停在城門格；可以飛越城門上空。
 *     偵察機的 recon 仍可揭露城門上的棋子。理由：避免空軍沿航線 2 回合
 *     直接斬首軍旗；軍旗必須靠陸軍（或登陸後的艦）攻破城門。
 *     另外三座城門可佈置任何陸軍棋子作為誘餌（見 engine.deploy）。
 *   - 行營保護：敵方陸軍（含鐵路移動與登陸後的艦）不得攻擊行營內的棋子；
 *     空軍／飛彈／砲擊不受此限。（本棋盤行營不在海岸列，故砲擊實際打不到。）
 *   - 勝負表為 X（無法作用）的交互不生成行動；炮壘砲擊、炮艦砲擊、防空、
 *     飛彈轟擊依 combat.js 的特殊映射判定是否合法。
 *   - 行動不含「結果是否划算」，連自殺攻擊也是合法行動（由玩家／AI 評估）。
 *   - 排序穩定：棋 uid 升序；每棋先移動類（to 升序）再特殊類（target 升序）；
 *     pass 最後。相同 state 必定得到相同順序。
 */

import {
  WALK_ADJ,
  SEA_ADJ,
  RAIL_ADJ,
  SEA_TO_LAND,
  LAND_TO_SEA,
  NODE,
  airLine,
  airDirection,
  gridDistance,
} from './board.js';
import { PIECE_BY_KEY } from './pieces.js';
import { isInteractionAllowed } from './combat.js';

const AIR_DIRS = ['n', 's', 'e', 'w'];

/* ------------------------------------------------------------------ */
/* 基本查詢                                                            */
/* ------------------------------------------------------------------ */

/** 建立「節點 → 存活棋子」索引（每格最多一枚） */
export function buildOccupancy(state) {
  const occ = new Map();
  if (!state || !Array.isArray(state.pieces)) return occ;
  for (const p of state.pieces) {
    if (p.alive && p.nodeId != null) occ.set(p.nodeId, p);
  }
  return occ;
}

/** 以 uid 找棋子 */
export function pieceByUid(state, uid) {
  if (!state || !Array.isArray(state.pieces)) return null;
  return state.pieces.find((p) => p.uid === uid) || null;
}

/** 取得節點上的存活棋子（可傳入既有 occupancy 加速） */
export function pieceAtNode(state, nodeId, occ = null) {
  if (occ) return occ.get(nodeId) || null;
  if (!state || !Array.isArray(state.pieces)) return null;
  return state.pieces.find((p) => p.alive && p.nodeId === nodeId) || null;
}

/** 棋子定義 */
export function defOf(piece) {
  return PIECE_BY_KEY[piece?.key] || null;
}

/** 是否空軍棋子 */
export function isAirPiece(piece) {
  return defOf(piece)?.branch === 'air';
}

/**
 * 目前移動語意：
 *   'air'   空軍
 *   'sea'   海軍（未登陸）
 *   'land'  陸軍 或 已登陸的海軍（依一般陸上規則行動，含鐵路）
 *   'static' 不可移動（地雷／陷阱／炮壘／軍旗）
 */
export function movementKind(piece) {
  const def = defOf(piece);
  if (!def) return 'static';
  if (def.branch === 'air') return 'air';
  if (def.branch === 'navy') return piece.landed ? 'land' : 'sea';
  return def.move === 'static' ? 'static' : 'land';
}

function tagsOf(piece) {
  return defOf(piece)?.tags || [];
}

/** 產生行動時的空軍航線（含起點與終點） */
function airPathArray(from, to) {
  const dir = airDirection(from, to);
  if (!dir) return [from];
  const line = airLine(from, dir);
  const path = [from];
  for (const node of line) {
    path.push(node);
    if (node === to) break;
  }
  return path;
}

function makeMove(piece, to, mode, path, extra = null) {
  const action = {
    type: 'move',
    pieceUid: piece.uid,
    from: piece.nodeId,
    to,
    mode,
    path,
  };
  if (extra) Object.assign(action, extra);
  return action;
}

function isEnemyAt(occ, nodeId, side) {
  const p = occ.get(nodeId);
  return !!p && p.side !== side ? p : null;
}

/* ------------------------------------------------------------------ */
/* 各類移動                                                            */
/* ------------------------------------------------------------------ */

/** 陸軍步行 1 格（8 方向；行營保護） */
function generateWalk(piece, occ, out) {
  const side = piece.side;
  const from = piece.nodeId;
  for (const to of WALK_ADJ.get(from) || []) {
    const target = occ.get(to) || null;
    if (target && target.side === side) continue; // 己方佔用
    if (target) {
      // 行營保護：敵方陸軍不得攻擊營內棋子（空軍／飛彈另有行動）
      if (NODE[to]?.kind === 'camp') continue;
      if (!isInteractionAllowed(piece, target, {})) continue; // X 不生成
    }
    out.push(makeMove(piece, to, 'walk', [from, to]));
  }
}

/**
 * 鐵路移動 1~3 站：BFS，被佔用的車站會阻擋後續延伸。
 * 敵棋所在站可作為攻擊終點（但仍不繼續延伸）。
 */
function generateRail(piece, occ, out) {
  const side = piece.side;
  const from = piece.nodeId;
  const visited = new Set([from]);
  let frontier = [{ node: from, path: [from] }];
  for (let step = 0; step < 3; step++) {
    const next = [];
    for (const cur of frontier) {
      for (const to of RAIL_ADJ.get(cur.node) || []) {
        if (visited.has(to)) continue;
        visited.add(to);
        const target = occ.get(to) || null;
        if (target && target.side === side) continue; // 己方佔用：阻擋
        const path = [...cur.path, to];
        if (target) {
          if (NODE[to]?.kind === 'camp') continue; // 行營保護（鐵路到行營不可能，保險）
          if (!isInteractionAllowed(piece, target, {})) continue;
          out.push(makeMove(piece, to, 'rail', path));
          // 敵棋站：不繼續延伸
        } else {
          out.push(makeMove(piece, to, 'rail', path));
          next.push({ node: to, path });
        }
      }
    }
    frontier = next;
  }
}

/** 海軍 8 方向航行 1 格 */
function generateSeaMove(piece, occ, out) {
  const side = piece.side;
  const from = piece.nodeId;
  for (const to of SEA_ADJ.get(from) || []) {
    const target = occ.get(to) || null;
    if (target && target.side === side) continue;
    if (target && !isInteractionAllowed(piece, target, {})) continue;
    out.push(makeMove(piece, to, 'sea', [from, to]));
  }
}

/** 兩棲登陸：海域 → 相鄰海岸陸地（空地或敵棋；己方佔用不可） */
function generateLanding(piece, occ, out) {
  const side = piece.side;
  const from = piece.nodeId;
  for (const to of SEA_TO_LAND.get(from) || []) {
    const target = occ.get(to) || null;
    if (target && target.side === side) continue;
    if (target && !isInteractionAllowed(piece, target, { special: 'landing' })) continue;
    out.push({ type: 'land', pieceUid: piece.uid, from, to });
    // 註：己方相鄰海岸空地亦可上岸（登陸後成為一般陸上棋子，可再走／搭鐵路）
  }
}

/**
 * 空軍直線飛行：
 *   - 空節點：可停（偵察機、戰鬥機皆可）。
 *   - 敵棋：僅戰鬥機可攻擊（偵察機無戰鬥力，改以 recon 行動）。
 *   - 不受途中棋子阻擋；飛越敵方高射炮／炮艦被擊落由 engine 判定。
 *   - 路線上任一節點皆可為終點（可飛越敵棋攻擊更後面的目標）。
 */
function generateAirMove(piece, occ, out) {
  const side = piece.side;
  const from = piece.nodeId;
  const isFighter = piece.key === 'fighter';
  for (const dir of AIR_DIRS) {
    const line = airLine(from, dir);
    const path = [from];
    for (const node of line) {
      path.push(node);
      const target = occ.get(node) || null;
      const extra = { airPath: path.slice(1, -1) };
      const isGate = NODE[node]?.kind === 'gate';
      if (isGate) {
        // 城門平衡規則：空軍不得攻擊或停留在城門節點（但可飛越上空）
      } else if (!target) {
        out.push(makeMove(piece, node, 'air', [...path], extra));
      } else if (target.side !== side && isFighter) {
        if (isInteractionAllowed(piece, target, { special: 'air' })) {
          out.push(makeMove(piece, node, 'air', [...path], extra));
        }
      }
      // 任何棋子都可飛越，繼續延伸（含城門上空）
    }
  }
}

/* ------------------------------------------------------------------ */
/* 特殊行動                                                            */
/* ------------------------------------------------------------------ */

/** 炮壘砲擊：相鄰海域的敵方棋子 */
function generateFire(piece, occ, out) {
  const from = piece.nodeId;
  for (const targetId of LAND_TO_SEA.get(from) || []) {
    const target = isEnemyAt(occ, targetId, piece.side);
    if (!target) continue;
    if (!isInteractionAllowed(piece, target, { special: 'fort' })) continue;
    out.push({ type: 'fire', pieceUid: piece.uid, from, target: targetId });
  }
}

/** 炮艦砲擊：相鄰海岸的敵方陸上棋子（可打行營，但本棋盤行營不在海岸列） */
function generateBombard(piece, occ, out) {
  const from = piece.nodeId;
  for (const targetId of SEA_TO_LAND.get(from) || []) {
    const target = isEnemyAt(occ, targetId, piece.side);
    if (!target) continue;
    if (!isInteractionAllowed(piece, target, { special: 'bombard' })) continue;
    out.push({ type: 'bombard', pieceUid: piece.uid, from, target: targetId });
  }
}

/** 防空：高射炮／炮艦攻擊 gridDistance ≤ 2 的敵機 */
function generateAntiair(piece, state, occ, out) {
  const from = piece.nodeId;
  for (const target of state.pieces) {
    if (!target.alive || target.nodeId == null || target.side === piece.side) continue;
    if (!isAirPiece(target)) continue;
    if (gridDistance(from, target.nodeId) > 2) continue;
    if (!isInteractionAllowed(piece, target, { special: 'antiair' })) continue;
    out.push({ type: 'antiair', pieceUid: piece.uid, from, target: target.nodeId });
  }
}

/** 飛彈轟擊：同一行／列直線任意距離；不可選城門、機場；可越過任何棋子 */
function generateMissile(piece, state, out) {
  const from = piece.nodeId;
  for (const target of state.pieces) {
    if (!target.alive || target.nodeId == null || target.side === piece.side) continue;
    if (target.nodeId === from) continue;
    if (airDirection(from, target.nodeId) === null) continue;
    const node = NODE[target.nodeId];
    if (!node || node.kind === 'gate' || node.kind === 'airport') continue; // 不可打城門／機場
    if (!isInteractionAllowed(piece, target, { special: 'missile' })) continue;
    out.push({ type: 'missile', pieceUid: piece.uid, from, target: target.nodeId });
  }
}

/** 偵察：同一行／列直線上的敵棋（不需移動）；已公開或已知的目標不重複生成 */
function generateRecon(piece, state, out) {
  const side = piece.side;
  const from = piece.nodeId;
  for (const target of state.pieces) {
    if (!target.alive || target.nodeId == null || target.side === side) continue;
    if (target.nodeId === from) continue;
    if (airDirection(from, target.nodeId) === null) continue;
    const def = defOf(target);
    if (!def) continue;
    if (def.branch === 'air') continue; // 空軍永遠公開，偵察無意義
    if (target.revealed?.[side]) continue; // 已對己方曝光
    out.push({ type: 'recon', pieceUid: piece.uid, from, target: target.nodeId });
  }
}

/* ------------------------------------------------------------------ */
/* 單一棋子的行動                                                       */
/* ------------------------------------------------------------------ */

const SPECIAL_ORDER = { fire: 0, bombard: 1, antiair: 2, missile: 3, recon: 4 };

/** 產生單一棋子的所有合法行動（不含 pass） */
function actionsForPiece(state, piece, occ) {
  const out = [];
  const from = piece.nodeId;
  if (!piece.alive || from == null) return out;
  const def = defOf(piece);
  if (!def) return out;

  const kind = movementKind(piece);
  const moves = [];
  const specials = [];

  if (kind === 'land') {
    generateWalk(piece, occ, moves);
    if (NODE[from]?.rail) generateRail(piece, occ, moves); // 登陸後艦亦可使用鐵路
  } else if (kind === 'sea') {
    generateSeaMove(piece, occ, moves);
    if (tagsOf(piece).includes('amphibious')) generateLanding(piece, occ, moves);
  } else if (kind === 'air') {
    generateAirMove(piece, occ, moves);
  }

  if (tagsOf(piece).includes('fort')) generateFire(piece, occ, specials);
  if (tagsOf(piece).includes('bombard')) generateBombard(piece, occ, specials);
  if (tagsOf(piece).includes('aa')) generateAntiair(piece, state, occ, specials);
  if (tagsOf(piece).includes('missile')) generateMissile(piece, state, specials);
  if (tagsOf(piece).includes('scout')) generateRecon(piece, state, specials);

  // 移動類：to 升序；特殊類：target 升序（同 target 依 SPECIAL_ORDER）
  moves.sort((a, b) => a.to - b.to);
  specials.sort(
    (a, b) => a.target - b.target || SPECIAL_ORDER[a.type] - SPECIAL_ORDER[b.type],
  );
  return out.concat(moves, specials);
}

/* ------------------------------------------------------------------ */
/* 對外 API                                                            */
/* ------------------------------------------------------------------ */

/**
 * 產生某方全部合法行動（含 pass，永遠最後一個）。
 * @param {object} state 權威 state（或 game 物件；會自動取 .state）
 * @param {'north'|'south'} side
 * @returns {Array<object>}
 */
export function generateActions(state, side) {
  if (!state || state.phase !== 'play' || state.sideToMove !== side) return [];
  const occ = buildOccupancy(state);
  const pieces = state.pieces
    .filter((p) => p.alive && p.side === side)
    .sort((a, b) => a.uid - b.uid);
  const actions = [];
  for (const piece of pieces) actions.push(...actionsForPiece(state, piece, occ));
  actions.push({ type: 'pass' });
  return actions;
}

/** 兼容別名：可傳 game 物件或 state */
export function getLegalActions(gameOrState, side) {
  const state = gameOrState && gameOrState.state ? gameOrState.state : gameOrState;
  return generateActions(state, side);
}

/** 產生單一棋子的合法行動（供 UI 高亮 `getActionsForPiece`） */
export function generateActionsForPiece(state, side, uid) {
  if (!state || state.phase !== 'play' || state.sideToMove !== side) return [];
  const piece = pieceByUid(state, uid);
  if (!piece || !piece.alive || piece.side !== side) return [];
  return actionsForPiece(state, piece, buildOccupancy(state));
}

/** 該方是否還有任何可行動（不含 pass）；用於「無子可動判負」 */
export function sideHasActions(state, side) {
  if (!state || state.phase !== 'play') return false;
  const occ = buildOccupancy(state);
  const pieces = state.pieces
    .filter((p) => p.alive && p.side === side)
    .sort((a, b) => a.uid - b.uid);
  for (const piece of pieces) {
    if (actionsForPiece(state, piece, occ).length > 0) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* 路徑與合法性驗證                                                     */
/* ------------------------------------------------------------------ */

/**
 * 鐵路 BFS 路徑（1~3 站、被佔用站阻擋）；不可達回傳 null。
 * 回傳 path 含起點與終點。
 */
export function railPathBetween(occ, from, to, side) {
  if (from === to) return null;
  if (!NODE[from]?.rail || !NODE[to]?.rail) return null;
  const visited = new Set([from]);
  let frontier = [{ node: from, path: [from] }];
  for (let step = 0; step < 3; step++) {
    const next = [];
    for (const cur of frontier) {
      for (const nxt of RAIL_ADJ.get(cur.node) || []) {
        if (visited.has(nxt)) continue;
        visited.add(nxt);
        const target = occ.get(nxt) || null;
        if (target && target.side === side) continue; // 己方佔用：阻擋
        const path = [...cur.path, nxt];
        if (nxt === to) return path;
        if (target) continue; // 敵棋阻擋延伸
        next.push({ node: nxt, path });
      }
    }
    frontier = next;
  }
  return null;
}

/** 計算 action 的移動路徑（含起點與終點），供事件動畫使用 */
export function movePathFor(state, piece, action) {
  const from = piece.nodeId;
  if (action?.type === 'move') {
    switch (action.mode) {
      case 'walk':
      case 'sea':
        return [from, action.to];
      case 'rail': {
        const occ = buildOccupancy(state);
        return railPathBetween(occ, from, action.to, piece.side) || [from, action.to];
      }
      case 'air':
        return airPathArray(from, action.to);
      default:
        return [from, action.to];
    }
  }
  if (action?.type === 'land') return [from, action.to];
  return [from];
}

/**
 * 結構合法性驗證（engine applyAction 用）：
 * 只檢查「移動幾何、目標是否敵我、行營保護、特殊行動範圍」等不依賴隱藏棋種
 * 的條件；勝負表 X 的互動在此不擋（讓 AI 以 belief 改寫 snapshot 後的模擬
 * 仍可套用行動，X 於結算時視為 N 無效果）。getLegalActions 則會照實際棋種
 * 過濾 X。
 */
export function isActionLegal(state, side, action) {
  if (!state || state.phase !== 'play' || state.sideToMove !== side) return false;
  if (!action || typeof action.type !== 'string') return false;
  if (action.type === 'pass') return true;

  const piece = pieceByUid(state, action.pieceUid);
  if (!piece || !piece.alive || piece.side !== side || piece.nodeId == null) return false;
  if (action.from != null && action.from !== piece.nodeId) return false;

  const from = piece.nodeId;
  const occ = buildOccupancy(state);
  const kind = movementKind(piece);
  const tags = tagsOf(piece);

  switch (action.type) {
    case 'move': {
      const to = action.to;
      if (!Number.isInteger(to) || to === from) return false;
      const target = occ.get(to) || null;
      if (target && target.side === side) return false;
      if (action.mode === 'walk') {
        if (kind !== 'land') return false;
        if (!(WALK_ADJ.get(from) || []).includes(to)) return false;
        if (target && NODE[to]?.kind === 'camp') return false; // 行營保護
        return true;
      }
      if (action.mode === 'rail') {
        if (kind !== 'land' || !NODE[from]?.rail) return false;
        if (target && NODE[to]?.kind === 'camp') return false;
        return railPathBetween(occ, from, to, side) !== null;
      }
      if (action.mode === 'sea') {
        if (kind !== 'sea') return false;
        return (SEA_ADJ.get(from) || []).includes(to);
      }
      if (action.mode === 'air') {
        if (kind !== 'air') return false;
        if (airDirection(from, to) === null) return false;
        // 城門平衡規則：空軍不得攻擊或停在城門節點
        if (NODE[to]?.kind === 'gate') return false;
        // 偵察機無戰鬥力：只能飛到空節點
        if (piece.key !== 'fighter' && target) return false;
        return true;
      }
      return false;
    }
    case 'land': {
      if (kind !== 'sea' || !tags.includes('amphibious')) return false;
      const to = action.to;
      if (!Number.isInteger(to) || to === from) return false;
      if (!(SEA_TO_LAND.get(from) || []).includes(to)) return false;
      const target = occ.get(to) || null;
      if (target && target.side === side) return false;
      return true;
    }
    case 'fire': {
      if (!tags.includes('fort')) return false;
      const target = isEnemyAt(occ, action.target, side);
      if (!target) return false;
      return (LAND_TO_SEA.get(from) || []).includes(action.target);
    }
    case 'bombard': {
      if (!tags.includes('bombard')) return false;
      const target = isEnemyAt(occ, action.target, side);
      if (!target) return false;
      return (SEA_TO_LAND.get(from) || []).includes(action.target);
    }
    case 'antiair': {
      if (!tags.includes('aa')) return false;
      const target = isEnemyAt(occ, action.target, side);
      if (!target || !isAirPiece(target)) return false;
      return gridDistance(from, action.target) <= 2;
    }
    case 'missile': {
      if (!tags.includes('missile')) return false;
      const target = isEnemyAt(occ, action.target, side);
      if (!target) return false;
      if (airDirection(from, action.target) === null) return false;
      const node = NODE[action.target];
      if (!node || node.kind === 'gate' || node.kind === 'airport') return false;
      return true;
    }
    case 'recon': {
      if (!tags.includes('scout')) return false;
      const target = isEnemyAt(occ, action.target, side);
      if (!target) return false;
      return airDirection(from, action.target) !== null;
    }
    default:
      return false;
  }
}

/** 行動的唯一簽章（除錯／比對用；相同行動 → 相同字串） */
export function actionSignature(action) {
  if (!action || !action.type) return '';
  if (action.type === 'pass') return 'pass';
  const pid = action.pieceUid;
  if (action.type === 'move') {
    return `move:${pid}:${action.from}:${action.to}:${action.mode}`;
  }
  if (action.type === 'land') return `land:${pid}:${action.from}:${action.to}`;
  return `${action.type}:${pid}:${action.from}:${action.target}`;
}

export default {
  getLegalActions,
  generateActions,
  generateActionsForPiece,
  sideHasActions,
  isActionLegal,
  movePathFor,
  railPathBetween,
  buildOccupancy,
  pieceByUid,
  pieceAtNode,
  movementKind,
  actionSignature,
};
