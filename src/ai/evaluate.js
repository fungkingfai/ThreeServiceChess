/**
 * 三軍棋 AI：局面評估與行動評分
 * ------------------------------------------------------------------
 * 所有評估都用「AI 應該知道的資訊」做：
 *   - 自己的棋子：完全已知。
 *   - 敵方棋子：已知棋種就直接用；未知棋種用 belief 的機率分布計算期望值。
 *   - 模擬世界（hard 難度）可傳入 worldKeys（belief 取樣結果）當作「相信的事實」。
 *
 * 內容：
 *   1. 棋盤機動距離預計算（陸路含鐵路、海路到敵岸）。
 *   2. 局面靜態評估：子力期望值、位置價值、軍旗安全、奪旗壓力。
 *   3. 行動評分：戰鬥期望、交換、佔位價值、被反擊風險、飛越擊落風險、
 *      偵察情報價值、終局衝旗等。
 */
import {
  NODE,
  WALK_ADJ,
  SEA_ADJ,
  RAIL_ADJ,
  LAND_TO_SEA,
  SEA_TO_LAND,
  GATE_NODES,
  airDirection,
  airLine,
  gridDistance,
  otherSide,
} from '../core/board.js';
import {
  PIECE_BY_KEY,
  valueOf,
  expectedBattle,
  battleForecast,
  isOfficerKey,
  isStaticKey,
  isNavyKey,
  isArmyKey,
  isAirKey,
  isMovableKey,
  branchOf,
  rankOf,
} from './combat-rules.js';

/* ================================================================== */
/* 常數與權重                                                          */
/* ================================================================== */

/** 奪旗／失旗的勝負權重（遠大於任何子力） */
export const FLAG_WIN = 60000;
export const FLAG_LOSS = 60000;

/** 敵方未知棋種分布為空時的回退（正常不應發生） */
const UNIFORM_FALLBACK = { army: 1 / 23, navy: 1 / 5, air: 1 / 2 };

/** 風險折扣：敵方不一定會把握每個攻擊機會 */
const RISK_DISCOUNT = 0.55;

/* ================================================================== */
/* 機動距離預計算（模組載入時算一次）                                  */
/* ================================================================== */

const INF = 1e9;

/**
 * 陸上棋子的移動圖：步行（成本 1）＋ 鐵路（成本 0.34/站，因為一回合可走 3 站）。
 * 跨海鐵橋站（zone=sea 的 bridge 節點）也在圖內。
 */
function buildLandGraph() {
  const edges = new Map();
  for (let id = 0; id < NODE.length || id < 169; id++) {
    const n = NODE[id];
    if (!n) continue;
    const list = [];
    // 步行（僅陸地節點、非機場；WALK_ADJ 已處理）
    for (const to of WALK_ADJ.get(id) || []) list.push({ to, cost: 1 });
    // 鐵路
    for (const to of RAIL_ADJ.get(id) || []) list.push({ to, cost: 0.34 });
    if (list.length) edges.set(id, list);
  }
  return edges;
}
const LAND_GRAPH = buildLandGraph();

function dijkstra(sources, edges) {
  const dist = new Float64Array(169).fill(INF);
  const visited = new Uint8Array(169);
  // 小型優先佇列（節點數少，線性掃描即可）
  let pq = [];
  for (const s of sources) {
    if (s == null) continue;
    dist[s] = 0;
    pq.push(s);
  }
  while (pq.length) {
    // 取目前距離最小者
    let bi = 0;
    for (let i = 1; i < pq.length; i++) if (dist[pq[i]] < dist[pq[bi]]) bi = i;
    const id = pq.splice(bi, 1)[0];
    if (visited[id]) continue;
    visited[id] = 1;
    const adj = edges.get(id) || [];
    for (const e of adj) {
      const nd = dist[id] + e.cost;
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        pq.push(e.to);
      }
    }
  }
  return dist;
}

/** 某方城門位置 */
function gatesOf(side) {
  return GATE_NODES[side].slice();
}

/** distToGates[side][nodeId] = 陸上棋子從 nodeId 機動到 side 城門的最短估計回合數 */
const LAND_DIST_TO_GATES = {
  north: dijkstra(gatesOf('north'), LAND_GRAPH),
  south: dijkstra(gatesOf('south'), LAND_GRAPH),
};

/** 逐城門的陸上機動距離：LAND_DIST_TO_GATE[side][gateNodeId][nodeId] */
const LAND_DIST_TO_GATE = { north: {}, south: {} };
for (const side of ['north', 'south']) {
  for (const gate of gatesOf(side)) {
    LAND_DIST_TO_GATE[side][gate] = dijkstra([gate], LAND_GRAPH);
  }
}

/** 陸上棋子從 nodeId 到指定城門的估計回合數（走＋鐵路） */
function landDistToGate(side, gateNode, nodeId) {
  const d = LAND_DIST_TO_GATE[side]?.[gateNode]?.[nodeId];
  return d === undefined ? INF : d;
}

/** 海域移動圖（不含鐵橋站；鐵橋不是海軍可走的節點） */
function buildSeaGraph() {
  const edges = new Map();
  for (let id = 0; id < 169; id++) {
    const list = [];
    for (const to of SEA_ADJ.get(id) || []) list.push({ to, cost: 1 });
    if (list.length) edges.set(id, list);
  }
  return edges;
}
const SEA_GRAPH = buildSeaGraph();

/** 目標側海岸對應的海域節點（海軍從這些格可砲擊/登陸該側） */
function seaNodesAdjacentToCoast(side) {
  const out = [];
  for (let seaId = 0; seaId < 169; seaId++) {
    const n = NODE[seaId];
    if (!n || n.zone !== 'sea') continue;
    const lands = SEA_TO_LAND.get(seaId) || [];
    if (lands.some((lid) => NODE[lid]?.zone === side)) out.push(seaId);
  }
  return out;
}
const SEA_COAST = {
  north: seaNodesAdjacentToCoast('north'),
  south: seaNodesAdjacentToCoast('south'),
};
/** 海軍距離敵方海岸（可登陸/砲擊位置）的回合估計 */
const SEA_DIST_TO_COAST = {
  north: dijkstra(SEA_COAST.north, SEA_GRAPH),
  south: dijkstra(SEA_COAST.south, SEA_GRAPH),
};

const distToGates = (side, nodeId) => LAND_DIST_TO_GATES[side]?.[nodeId] ?? INF;
const seaDistToCoast = (side, nodeId) => SEA_DIST_TO_COAST[side]?.[nodeId] ?? INF;

/* ================================================================== */
/* 小工具                                                              */
/* ================================================================== */

const isLandZone = (node) => node && (node.zone === 'north' || node.zone === 'south');

/** 該 node 是否在該方領土 */
function inTerritory(nodeId, side) {
  return NODE[nodeId]?.zone === side;
}

/** 把 0..1 的機率轉成合理的期望值尺度 */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/* ================================================================== */
/* Context：一次決策內共用的局面資訊                                   */
/* ================================================================== */

/**
 * @param {object} opts
 * @param {string} opts.side AI 陣營
 * @param {object} opts.view getView(side) 結果
 * @param {object} [opts.belief] Belief 實例（用於未知敵棋分布）
 * @param {Map<number,string>} [opts.worldKeys] 模擬世界用：uid→key 的「已知」棋種
 */
export function buildContext({ side, view, belief = null, worldKeys = null }) {
  const enemy = otherSide(side);
  const pieces = (view.pieces || []).filter((p) => p && p.alive !== false);
  const byUid = new Map();
  const occ = new Map();
  for (const p of pieces) {
    byUid.set(p.uid, p);
    occ.set(p.nodeId, p);
  }
  const ownPieces = pieces.filter((p) => p.side === side);
  const enemyPieces = pieces.filter((p) => p.side === enemy);
  const ownFlag = ownPieces.find((p) => p.key === 'flag') || null;

  // 敵方軍旗位置：若 belief 已知（總司令陣亡/偵察）就用；否則用分布
  let enemyFlagNode = null;
  if (belief) {
    enemyFlagNode = belief.enemyFlagGate;
    if (enemyFlagNode === null) {
      for (const p of enemyPieces) {
        if (p.key === 'flag') enemyFlagNode = p.nodeId;
      }
    }
  } else {
    for (const p of enemyPieces) if (p.key === 'flag') enemyFlagNode = p.nodeId;
  }
  const enemyFlagDist = new Map();
  if (enemyFlagNode !== null) {
    enemyFlagDist.set(enemyFlagNode, 1);
  } else if (belief) {
    for (const [k, v] of belief.flagGateDistribution()) enemyFlagDist.set(k, v);
  } else {
    for (const g of gatesOf(enemy)) enemyFlagDist.set(g, 1 / 3);
  }

  const ctx = {
    side,
    enemy,
    view,
    belief,
    worldKeys,
    pieces,
    byUid,
    occ,
    ownPieces,
    enemyPieces,
    ownFlag,
    enemyFlagNode,
    enemyFlagDist,
    ownFlagRevealed: !!(view.flagRevealed && view.flagRevealed[side]),
    _distCache: new Map(),
    _keyCache: new Map(),
    aggression: 1,
    turn: view.turn ?? 1,
  };
  // 終局／優勢時提高進攻慾望（鼓勵衝旗）
  const enemyCount = enemyPieces.length;
  const ownMaterial = ownMaterialScore(ctx);
  const enemyMaterial = enemyMaterialScore(ctx);
  const materialEdge = ownMaterial - enemyMaterial;
  const turn = view.turn ?? 1;
  ctx.aggression = clamp(
    1 + (30 - enemyCount) / 30 * 0.35 + (materialEdge > 0 ? 0.1 : 0) + Math.min(0.25, turn / 160),
    1,
    1.8,
  );
  return ctx;
}

/** 取得棋子棋種；未知回傳 null */
export function keyOf(ctx, piece) {
  if (!piece) return null;
  if (piece.key) return piece.key;
  if (ctx._keyCache.has(piece.uid)) return ctx._keyCache.get(piece.uid);
  let k = null;
  if (ctx.worldKeys && ctx.worldKeys.has(piece.uid)) k = ctx.worldKeys.get(piece.uid);
  ctx._keyCache.set(piece.uid, k);
  return k;
}

/**
 * 取得棋子棋種分布（key→機率）。
 * @returns {Map<string,number>}
 */
export function distOf(ctx, piece) {
  if (!piece) return new Map();
  const known = keyOf(ctx, piece);
  if (known) return new Map([[known, 1]]);
  if (ctx._distCache.has(piece.uid)) return ctx._distCache.get(piece.uid);
  let dist = null;
  if (ctx.belief && piece.side === ctx.enemy) {
    dist = ctx.belief.getDistribution(piece.uid);
  }
  if (!dist || dist.size === 0) {
    // 回退：依軍種均勻
    const branch = piece.branch || 'army';
    dist = new Map();
    const keys = Object.keys(PIECE_BY_KEY).filter((k) => branchOf(k) === branch);
    for (const k of keys) dist.set(k, 1 / keys.length);
  }
  ctx._distCache.set(piece.uid, dist);
  return dist;
}

/** 該棋子的期望棋種價值 */
export function expectedPieceValue(ctx, piece) {
  const known = keyOf(ctx, piece);
  if (known) return valueOf(known);
  let v = 0;
  for (const [k, p] of distOf(ctx, piece)) v += valueOf(k) * p;
  return v;
}

/** 自己存活棋子總價值（已知） */
function ownMaterialScore(ctx) {
  let v = 0;
  for (const p of ctx.ownPieces) {
    const k = keyOf(ctx, p);
    if (k && k !== 'flag') v += valueOf(k);
  }
  return v;
}

/** 敵方存活棋子期望總價值 */
function enemyMaterialScore(ctx) {
  let v = 0;
  for (const p of ctx.enemyPieces) {
    if (p.key === 'flag') continue;
    v += expectedPieceValue(ctx, p);
  }
  return v;
}

/* ================================================================== */
/* 攻擊可達性（近似合法行動生成，用於威脅評估）                        */
/* ================================================================== */

/**
 * 某敵棋（依其候選棋種 key）下一回合能否攻擊 targetNodeId。
 * targetKey 為目標棋種（'flag' 表示軍旗），用於對空/特殊判定。
 */
export function canKeyAttackNode(ctx, piece, key, fromNodeId, targetNodeId, targetKey = null, opts = {}) {
  const from = NODE[fromNodeId];
  const to = NODE[targetNodeId];
  if (!from || !to || !key) return false;
  const targetIsCamp = to.kind === 'camp';
  const targetIsAirPiece = targetKey ? isAirKey(targetKey) : false;
  const excludeUid = opts.excludeUid;

  // ---- 陸上行動（含已登陸艦） ----
  const actsAsLand = (isArmyKey(key) || piece.landed) && !isAirKey(key) && !(isNavyKey(key) && !piece.landed);
  if (isNavyKey(key) && !piece.landed) {
    // 海軍
    if (to.zone === 'sea') {
      return (SEA_ADJ.get(fromNodeId) || []).includes(targetNodeId);
    }
    // 對陸：需相鄰海岸
    if (!(SEA_TO_LAND.get(fromNodeId) || []).includes(targetNodeId)) return false;
    if (targetIsCamp) return true; // 海軍不受行營保護限制
    if (key === 'gunboat') return true; // 砲擊
    if (key === 'battleship' || key === 'cruiser') return true; // 兩棲登陸
    return false;
  }

  if (isAirKey(key)) {
    if (key !== 'fighter') return false; // 偵察機無戰鬥力（R 不算攻擊）
    // 城門平衡規則：空軍不得攻擊城門（可飛越），軍旗只能被陸軍／登陸部隊攻破
    if (to.kind === 'gate') return false;
    return canAirReach(ctx, fromNodeId, targetNodeId, excludeUid);
  }

  if (isStaticKey(key)) {
    if (key === 'fort') {
      // 炮壘砲擊相鄰海域
      return to.zone === 'sea' && (LAND_TO_SEA.get(fromNodeId) || []).includes(targetNodeId);
    }
    return false;
  }

  // ---- 陸軍可動棋 ----
  // 對空（高射炮）
  if (targetIsAirPiece && key === 'aa') {
    if (gridDistance(fromNodeId, targetNodeId) <= 2) return true;
  }
  // 飛彈：沿行列直線，不可打城門/機場
  if (key === 'missile') {
    if (to.kind === 'gate' || to.kind === 'airport') {
      // 飛彈不能打城門/機場
    } else if (from.col === to.col || from.row === to.row) {
      return true; // 可越過任何棋子
    }
  }
  // 行營保護：敵方陸軍不能攻擊行營內棋子
  if (targetIsCamp && actsAsLand) return false;
  // 步行 1 格（機場不能走）
  if (from.kind !== 'airport' && !targetIsCamp) {
    if ((WALK_ADJ.get(fromNodeId) || []).includes(targetNodeId)) return true;
  }
  // 鐵路 1~3 站，不可穿過佔用車站
  if (from.rail && to.rail) {
    if (railReachWithin3(ctx, fromNodeId, targetNodeId, 3, excludeUid)) return true;
  }
  return false;
}

/** 空軍直線可達性（含飛越擊落判定） */
export function canAirReach(ctx, fromNodeId, toNodeId, excludeUid = null) {
  if (fromNodeId === toNodeId) return false;
  const dir = airDirection(fromNodeId, toNodeId);
  if (!dir) return false;
  const line = airLine(fromNodeId, dir);
  const targetIdx = line.indexOf(toNodeId);
  if (targetIdx < 0) return false;
  // 檢查中途是否飛越敵方（＝AI 我方）高射炮或炮艦
  for (let i = 0; i < targetIdx; i++) {
    const nodeId = line[i];
    const blocker = ctx.occ.get(nodeId);
    if (!blocker || blocker.side === ctx.enemy) continue;
    if (blocker.uid === excludeUid) continue;
    const bk = keyOf(ctx, blocker);
    if (bk === 'aa' || bk === 'gunboat') return false;
  }
  return true;
}

/** 鐵路 3 站內是否可達（中途車站不可被佔用） */
export function railReachWithin3(ctx, fromId, toId, maxSteps = 3, excludeUid = null) {
  if (fromId === toId) return false;
  const visited = new Set([fromId]);
  let frontier = [fromId];
  for (let step = 0; step < maxSteps; step++) {
    const next = [];
    for (const id of frontier) {
      for (const to of RAIL_ADJ.get(id) || []) {
        if (visited.has(to)) continue;
        if (to === toId) return true;
        const occupant = ctx.occ.get(to);
        if (occupant && occupant.uid !== excludeUid) continue; // 不可穿過有棋子的站
        visited.add(to);
        next.push(to);
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return false;
}

/** 敵棋攻擊某格時會使用的特殊判定類型 */
function specialForAttack(ctx, piece, key, fromNodeId, targetNodeId, targetKey) {
  const to = NODE[targetNodeId];
  if (!to) return 'normal';
  if (key === 'missile') return 'missile';
  if (key === 'fort' && to.zone === 'sea') return 'fire';
  if (targetKey && isAirKey(targetKey) && (key === 'aa' || key === 'gunboat')) return 'antiair';
  if (isNavyKey(key) && !piece.landed && to.zone !== 'sea') {
    if (key === 'gunboat') return 'bombard';
    if (key === 'battleship' || key === 'cruiser') return 'landing';
  }
  return 'normal';
}

/** 敵棋攻擊某格（以目標棋種 targetKey）的機率（依候選棋種分布） */
export function attackProbabilityToNode(ctx, piece, targetNodeId, targetKey = null, opts = {}) {
  const dist = distOf(ctx, piece);
  let p = 0;
  for (const [key, prob] of dist) {
    if (prob <= 0) continue;
    if (canKeyAttackNode(ctx, piece, key, piece.nodeId, targetNodeId, targetKey, opts)) p += prob;
  }
  return p;
}

/* ================================================================== */
/* 威脅評估                                                            */
/* ================================================================== */

/**
 * 估算「敵方下一回合對 targetNodeId 上我方棋子」的期望交換值（我方視角，負＝虧）。
 * @param {object} ctx
 * @param {number} targetNodeId
 * @param {string} targetKey 我方棋子棋種
 * @param {object} opts { deadUids:Set, excludeUid }
 */
export function estimateNodeRisk(ctx, targetNodeId, targetKey, opts = {}) {
  const dead = opts.deadUids || null;
  let risk = 0;
  for (const p of ctx.enemyPieces) {
    if (dead && dead.has(p.uid)) continue;
    if (p.uid === opts.excludeUid) continue;
    const dist = distOf(ctx, p);
    for (const [key, prob] of dist) {
      if (prob <= 0) continue;
      if (!canKeyAttackNode(ctx, p, key, p.nodeId, targetNodeId, targetKey, opts)) continue;
      const special = specialForAttack(ctx, p, key, p.nodeId, targetNodeId, targetKey);
      const fc = battleForecast(key, targetKey, special);
      if (!fc) continue;
      let ex = 0;
      if (fc.flagCapture) ex -= FLAG_LOSS;
      else {
        if (fc.defenderDies) ex -= valueOf(targetKey);
        if (fc.attackerDies) ex += valueOf(key); // 敵人攻擊也可能賠上棋子
      }
      risk += prob * ex;
    }
  }
  return risk * (opts.discount ?? RISK_DISCOUNT);
}

/**
 * 我方軍旗危險程度（0~1，1＝幾乎必被奪旗）。
 * 若敵方不知道旗位，乘上「盲猜」折減。
 */
export function ownFlagDanger(ctx) {
  if (!ctx.ownFlag) return 0;
  const nodeId = ctx.ownFlag.nodeId;
  let danger = 0;
  for (const p of ctx.enemyPieces) {
    const prob = attackProbabilityToNode(ctx, p, nodeId, 'flag');
    if (prob > 0) danger += prob;
  }
  danger = clamp(danger, 0, 1.2);
  const knowledge = ctx.ownFlagRevealed ? 1 : 0.3;
  return danger * knowledge;
}

/** 敵方軍旗位置的「我方奪旗壓力」（0~1 左右） */
export function enemyFlagPressure(ctx) {
  if (!ctx.enemyFlagDist.size) return 0;
  let pressure = 0;
  for (const [gateNode, gateProb] of ctx.enemyFlagDist) {
    if (gateProb <= 0) continue;
    // 是否有任何我方棋子下一回合可直接攻擊該城門（＝奪旗）
    let canCapture = 0;
    for (const p of ctx.ownPieces) {
      const key = keyOf(ctx, p);
      if (!key || key === 'flag') continue;
      if (canKeyAttackNode(ctx, p, key, p.nodeId, gateNode, 'flag')) {
        canCapture = Math.max(canCapture, 1);
        break;
      }
    }
    pressure += gateProb * (canCapture ? 1 : 0.25);
  }
  return clamp(pressure, 0, 1);
}

/* ================================================================== */
/* 位置價值                                                            */
/* ================================================================== */

/**
 * 單一棋子放在某節點的位置價值（不含子力本身）。
 * @param {object} ctx
 * @param {number} nodeId
 * @param {string} key
 */
export function unitPositionScore(ctx, nodeId, key) {
  const node = NODE[nodeId];
  if (!node || !key) return 0;
  const v = valueOf(key);

  // ---- 靜止陸軍 ----
  if (isStaticKey(key) && isArmyKey(key)) {
    if (key === 'flag') return 0; // 軍旗價值由 flagSafety 處理
    if (key === 'fort') {
      let s = 6;
      // 覆蓋的相鄰海域格
      const seaTiles = LAND_TO_SEA.get(nodeId) || [];
      s += seaTiles.length * 1.2;
      // 附近敵艦愈多愈有價值
      for (const seaId of seaTiles) {
        const occ = ctx.occ.get(seaId);
        if (occ && occ.side === ctx.enemy) s += expectedPieceValue(ctx, occ) * 0.3;
      }
      // 海岸安全（內陸少數位置更好）
      s += node.coastal ? 1 : -2;
      return s;
    }
    // 地雷／陷阱：愈靠近我方軍旗與敵軍進逼路線愈有價值
    let s = 2;
    if (ctx.ownFlag) {
      const flagNode = NODE[ctx.ownFlag.nodeId];
      if (flagNode) {
        const d = Math.max(Math.abs(node.col - flagNode.col), Math.abs(node.row - flagNode.row));
        s += Math.max(0, 4 - d) * 1.6;
      }
    }
    // 鐵路/中央要道
    if (node.rail) s += 1.5;
    if (node.kind === 'camp') s += 2;
    return s;
  }

  // ---- 陸上可動棋（含登陸艦） ----
  if (isLandZone(node) || (!isNavyKey(key) && !isAirKey(key) && isMovableKey(key))) {
    let s = 0;
    // 往敵方城門的機動距離（含鐵路，已考慮跨海鐵橋路線）
    const dEnemy = distToGates(ctx.enemy, nodeId);
    if (ctx.enemyFlagNode !== null) {
      // 已知敵方軍旗位置 → 全力朝該城門逼近
      const dFlag = landDistToGate(ctx.enemy, ctx.enemyFlagNode, nodeId);
      if (dFlag < INF) {
        s -= Math.min(dFlag, 16) * (isOfficerKey(key) && rankOf(key) >= 8 ? 2.4 : 3.1);
        if (dFlag <= 2) s += 12;
      }
    } else if (dEnemy < INF) {
      s -= Math.min(dEnemy, 14) * (isOfficerKey(key) && rankOf(key) >= 8 ? 1.5 : 1.9);
    }
    // 鐵路站＝機動主動脈
    if (node.rail) s += 4.5;
    // 進入敵方領土
    if (inTerritory(nodeId, ctx.enemy)) s += 7;
    // 中央控制
    s += Math.max(0, 4 - Math.abs(node.col - 6)) * 0.45;
    // 行營保護高價值棋
    if (node.kind === 'camp') s += v > 45 ? 6 : 1.5;
    // 軍旗防守：低價棋靠近己方旗門
    if (ctx.ownFlag) {
      const flagNode = NODE[ctx.ownFlag.nodeId];
      if (flagNode) {
        const d = Math.max(Math.abs(node.col - flagNode.col), Math.abs(node.row - flagNode.row));
        if (v <= 48) s += Math.max(0, 3 - d) * 0.8;
        if (ctx.ownFlagRevealed && d <= 2) s += 2.5;
      }
    }
    // 高階官兵：避免太深入敵陣被圍（風險已在行動評分處理）
    if (isOfficerKey(key) && rankOf(key) >= 9 && inTerritory(nodeId, ctx.enemy)) s -= 2.5;
    return s;
  }

  // ---- 海軍 ----
  if (isNavyKey(key)) {
    let s = 0;
    const seaDist = seaDistToCoast(ctx.enemy, nodeId);
    if (seaDist < INF) s -= Math.min(seaDist, 12) * 1.1;
    // 中央海域控制
    s += Math.max(0, 3 - Math.abs(node.col - 6)) * 0.5;
    // 砲擊/登陸機會
    const adjacentLand = SEA_TO_LAND.get(nodeId) || [];
    for (const landId of adjacentLand) {
      const occ = ctx.occ.get(landId);
      if (occ && occ.side === ctx.enemy) {
        if (key === 'gunboat') s += expectedPieceValue(ctx, occ) * 0.22;
        if (key === 'battleship' || key === 'cruiser') s += expectedPieceValue(ctx, occ) * 0.08;
      } else if (!occ && (key === 'battleship' || key === 'cruiser')) {
        s += 1.2; // 登陸空岸的選項
      }
    }
    if (key === 'submarine') s += 2.5; // 潛艇在開闊海域難以被發現
    return s;
  }

  // ---- 空軍 ----
  if (isAirKey(key)) {
    let s = 0;
    if (key === 'fighter') {
      // 同一行列上的敵棋都是潛在目標（城門上的棋不能攻擊）
      for (const enemyPiece of ctx.enemyPieces) {
        const n = NODE[enemyPiece.nodeId];
        if (!n || n.kind === 'gate') continue;
        if (n.col === node.col || n.row === node.row) s += expectedPieceValue(ctx, enemyPiece) * 0.18;
      }
      s += Math.max(0, 3 - Math.abs(node.col - 6)) * 0.3;
    } else {
      // 偵察機：情報價值
      for (const enemyPiece of ctx.enemyPieces) {
        const n = NODE[enemyPiece.nodeId];
        if (!n) continue;
        if (n.col === node.col || n.row === node.row) s += 1.5;
      }
      s += 1;
    }
    return s;
  }
  return 0;
}

/* ================================================================== */
/* 局面評估                                                            */
/* ================================================================== */

/**
 * 靜態局面評估（AI 視角，分數越高越好）。
 * @param {object} ctx buildContext 結果
 */
export function evaluateContext(ctx) {
  let score = 0;

  // 1) 子力期望值
  const ownMat = ownMaterialScore(ctx);
  const enemyMat = enemyMaterialScore(ctx);
  score += ownMat - enemyMat * 0.95;

  // 2) 位置價值
  for (const p of ctx.ownPieces) {
    const k = keyOf(ctx, p);
    if (!k) continue;
    if (k === 'flag') continue;
    score += unitPositionScore(ctx, p.nodeId, k);
  }

  // 3) 軍旗安全（極重要）
  const danger = ownFlagDanger(ctx);
  score -= danger * FLAG_LOSS * 0.5;

  // 4) 奪旗壓力
  score += enemyFlagPressure(ctx) * FLAG_WIN * 0.12 * ctx.aggression;
  if (ctx.enemyFlagNode !== null) {
    // 已知敵旗位置：用最接近的陸上棋子距離給予強烈攻勢分
    let closest = INF;
    for (const p of ctx.ownPieces) {
      const k = keyOf(ctx, p);
      if (!k || k === 'flag' || isNavyKey(k) || isAirKey(k)) continue;
      const d = landDistToGate(ctx.enemy, ctx.enemyFlagNode, p.nodeId);
      if (d < closest) closest = d;
    }
    if (closest < INF) score += Math.max(0, 10 - closest) * 18 * ctx.aggression;
  }

  // 5) 終局衝旗：敵方棋子很少時，直接往敵方城門方向加壓
  if (ctx.enemyPieces.length <= 6 && ctx.enemyFlagDist.size) {
    for (const p of ctx.ownPieces) {
      const k = keyOf(ctx, p);
      if (!k || k === 'flag' || !isMovableKey(k)) continue;
      let best = INF;
      for (const gateNode of ctx.enemyFlagDist.keys()) {
        const d = isNavyKey(k)
          ? seaDistToCoast(ctx.enemy, p.nodeId) * 2
          : distToGates(ctx.enemy, gateNode);
        best = Math.min(best, d);
      }
      score += Math.max(0, 6 - best) * 2;
    }
  }

  // 6) 殘存棋子數（避免同歸於盡式自殺）
  score += ctx.ownPieces.length * 0.5;

  return score;
}

/** 便利函式：直接以 view 評估 */
export function evaluateView({ side, view, belief = null, worldKeys = null }) {
  return evaluateContext(buildContext({ side, view, belief, worldKeys }));
}

/* ================================================================== */
/* 行動評分                                                            */
/* ================================================================== */

/**
 * 對單一行動評分（AI 視角，越高越好）。
 *
 * @param {object} ctx
 * @param {object} action 合法行動（engine.getLegalActions 的其中一項）
 * @param {object} opts { cheap:boolean（省略部分掃描，供 hard 難度對手回應使用） }
 * @returns {{score:number, detail:object}}
 */
export function scoreAction(ctx, action, opts = {}) {
  const cheap = !!opts.cheap;
  const detail = { type: action.type };
  let score = 0;

  if (!action || action.type === 'pass') {
    // 讓子＝失去先手；只在真的無事可做時才該選
    return { score: -6 - ctx.ownPieces.length * 0.05, detail: { pass: true } };
  }

  const piece = ctx.byUid.get(action.pieceUid);
  if (!piece) return { score: -1e9, detail: { error: 'piece-not-found' } };
  const key = keyOf(ctx, piece);
  if (!key) return { score: -1e9, detail: { error: 'unknown-own-key' } };
  const from = action.from ?? piece.nodeId;
  const pieceValue = valueOf(key);

  // ---------- 戰鬥期望計算 ----------
  const battleAt = (targetNodeId, special, extra = {}) => {
    const target = ctx.occ.get(targetNodeId);
    if (!target || target.side !== ctx.enemy) {
      return { value: 0, target: null, ev: null };
    }
    const targetDist = distOf(ctx, target);
    const ev = expectedBattle(key, targetDist, special);
    let value = ev.exchange;
    // 佔位後的位置價值（只有攻方勝且存活才佔位）
    if (ev.pWin > 0 && !extra.noOccupy) {
      const posDelta = unitPositionScore(ctx, targetNodeId, key) - unitPositionScore(ctx, from, key);
      value += ev.pWin * posDelta;
    }
    // 若目標是軍旗，直接視為必勝（expectedBattle 已把 FLAG_VALUE 計入 exchange）
    detail.battle = {
      targetUid: target.uid,
      special,
      pWin: ev.pWin,
      pLose: ev.pLose,
      pBoth: ev.pBoth,
      pDraw: ev.pDraw,
      pRecon: ev.pRecon,
      pFlag: ev.pFlag,
      exchange: ev.exchange,
    };
    return { value, target, ev };
  };

  /**
   * 我方棋子佔位後，敵方下一回合的反擊風險。
   * 只把「負期望」當成主要懲罰；「正期望」代表敵人攻擊會吃虧（誘餌效果），
   * 但不能假設對手一定會上鉤，因此只給很小的加分，避免 AI 靠「站著引誘」
   * 無限來回擺盪。
   */
  const addOccupancyRisk = (destNodeId, deadUids) => {
    if (cheap) return;
    const risk = estimateNodeRisk(ctx, destNodeId, key, { deadUids, excludeUid: piece.uid });
    // 終局／優勢時更敢冒險（divide by aggression）
    const factor = (0.65 + (pieceValue > 60 ? 0.25 : 0)) / Math.max(1, ctx.aggression * 0.9);
    if (risk < 0) score += risk * factor;
    else score += risk * 0.1;
  };

  /** 空軍飛行路線的飛越擊落風險 */
  const addOverflightRisk = () => {
    if (cheap || action.type !== 'move' || action.mode !== 'air') return;
    // engine 契約：air 行動提供 airPath（起訖之間的中間節點）
    const path = Array.isArray(action.airPath) && action.airPath.length
      ? action.airPath
      : Array.isArray(action.path) && action.path.length
        ? action.path.slice(1, -1)
        : inferAirPath(from, action.to).slice(0, -1);
    if (!path || !path.length) return;
    let loss = 0;
    for (const nodeId of path) {
      if (nodeId === action.to) continue;
      if (nodeId === from) continue;
      const blocker = ctx.occ.get(nodeId);
      if (!blocker || blocker.side !== ctx.enemy) continue;
      const bd = distOf(ctx, blocker);
      const pAA = (bd.get('aa') || 0) + (bd.get('gunboat') || 0);
      if (pAA > 0) loss += pAA * pieceValue;
    }
    if (loss > 0) {
      detail.overflightLoss = loss;
      score -= loss * 0.95;
    }
  };

  /* ---------------- 各類行動 ---------------- */

  if (action.type === 'move') {
    const to = action.to;
    const target = ctx.occ.get(to);
    if (target && target.side === ctx.enemy) {
      // 移動攻擊
      const special = action.mode === 'land' ? 'landing' : 'normal';
      const b = battleAt(to, special);
      score += b.value * (target?.key === 'flag' ? 1 : ctx.aggression);
      // 勝利佔位後的風險
      if (b.ev && b.ev.pWin > 0) {
        const deadUids = new Set();
        if (b.ev.pWin >= 0.999) deadUids.add(target.uid);
        addOccupancyRisk(to, deadUids);
      }
      // 擊殺敵方「軍旗威脅者」的額外價值
      if (!cheap && ctx.ownFlag) {
        const threatProb = attackProbabilityToNode(ctx, target, ctx.ownFlag.nodeId, 'flag');
        if (threatProb > 0 && b.ev) {
          const killProb = b.ev.defenderDiesProb || 0;
          const knowledge = ctx.ownFlagRevealed ? 1 : 0.3;
          score += killProb * threatProb * knowledge * FLAG_LOSS * 0.25 * ctx.aggression;
        }
      }
      // 我方是偵察機「攻擊」→ 依勝負表多為 R（不過引擎通常給 recon 行動）
      if (key === 'scout') score += 2;
      addOverflightRisk();
    } else {
      // 移動到空位（或登陸空岸）
      const posDelta = unitPositionScore(ctx, to, key) - unitPositionScore(ctx, from, key);
      score += posDelta;
      // 進入敵方領土、逼近城門的攻勢加權
      if (inTerritory(to, ctx.enemy)) score += 2 * ctx.aggression;
      addOccupancyRisk(to, null);
      addOverflightRisk();
      // 移動到敵方城門鄰近格：對未知軍旗的壓力
      score += gatePressureForNode(ctx, to) * 0.6;
    }
    detail.to = to;
    detail.from = from;
    detail.posDelta = unitPositionScore(ctx, to, key) - unitPositionScore(ctx, from, key);
    return { score, detail };
  }

  if (action.type === 'fire' || action.type === 'bombard' || action.type === 'antiair') {
    const targetNodeId = action.target ?? action.to;
    const special = action.type === 'fire' ? 'fire' : action.type === 'bombard' ? 'bombard' : 'antiair';
    const b = battleAt(targetNodeId, special);
    score += b.value * ctx.aggression;
    // 特殊攻擊不移動，但攻擊者可能被反擊（火力平台通常安全，估小）
    if (!cheap && b.ev && b.ev.pLose > 0.3) {
      score -= b.ev.pLose * pieceValue * 0.15;
    }
    detail.to = targetNodeId;
    return { score, detail };
  }

  if (action.type === 'land') {
    const to = action.to;
    const target = ctx.occ.get(to);
    if (target && target.side === ctx.enemy) {
      const b = battleAt(to, 'landing');
      score += b.value * ctx.aggression;
      if (b.ev && b.ev.pWin > 0.5) addOccupancyRisk(to, b.ev.pWin >= 0.999 ? new Set([target.uid]) : null);
      // 登陸奪旗
      if (target.key === 'flag') score += FLAG_WIN * 0.5;
    } else {
      // 登陸空岸：踏上敵方領土，位置價值 + 攻勢
      const posDelta = unitPositionScore(ctx, to, key) - unitPositionScore(ctx, from, key);
      score += posDelta + 4 * ctx.aggression;
      addOccupancyRisk(to, null);
      score += gatePressureForNode(ctx, to) * 0.7;
    }
    detail.to = to;
    return { score, detail };
  }

  if (action.type === 'missile') {
    const targetNodeId = action.target ?? action.to;
    const b = battleAt(targetNodeId, 'missile', { noOccupy: true });
    score += b.value * ctx.aggression;
    // 飛彈本身消失，但 targetDist 未知時 exchange 已計入；補上「發射成本」的保守修正
    if (b.ev && b.ev.pDraw > 0.5) score -= pieceValue * 0.2;
    detail.to = targetNodeId;
    return { score, detail };
  }

  if (action.type === 'recon') {
    const targetNodeId = action.target ?? action.to;
    const target = ctx.occ.get(targetNodeId);
    if (target && target.side === ctx.enemy) {
      const known = !!keyOf(ctx, target);
      const certainty = known ? 1 : ctx.belief ? ctx.belief.certainty(target.uid) : 0.5;
      let info = (1 - certainty) * (14 + expectedPieceValue(ctx, target) * 0.25);
      // 城門上的目標：可能直接揭穿軍旗位置
      if (NODE[targetNodeId]?.kind === 'gate') {
        const flagProb = known ? 0 : ctx.belief ? ctx.belief.getDistribution(target.uid).get('flag') || 0 : 0.3;
        info += flagProb * 80;
      }
      score += info;
      detail.infoGain = info;
    }
    // 偵察機停在原地：下一回合被擊落的風險
    if (!cheap) {
      const risk = estimateNodeRisk(ctx, from, key, { excludeUid: piece.uid });
      score += (risk < 0 ? risk * 0.35 : risk * 0.05);
    }
    return { score, detail };
  }

  return { score: 0, detail };
}

/** 某節點對「奪取未知/已知敵方軍旗」的壓力分 */
function gatePressureForNode(ctx, nodeId) {
  let p = 0;
  const n = NODE[nodeId];
  if (!n) return 0;
  if (ctx.enemyFlagNode !== null) {
    const gn = NODE[ctx.enemyFlagNode];
    if (gn) {
      const d = Math.max(Math.abs(gn.col - n.col), Math.abs(gn.row - n.row));
      if (d <= 4) p += (5 - d) * 9 * ctx.aggression; // 已知軍旗：強力吸引
    }
    return p;
  }
  for (const [gateNode, prob] of ctx.enemyFlagDist) {
    const gn = NODE[gateNode];
    if (!gn) continue;
    const d = Math.max(Math.abs(gn.col - n.col), Math.abs(gn.row - n.row));
    if (d <= 3) p += prob * (4 - d) * 3.5;
  }
  return p;
}

/** 從 from 到 to 的空中直線路徑（不含 from，含 to） */
export function inferAirPath(from, to) {
  const dir = airDirection(from, to);
  if (!dir) return [];
  const line = airLine(from, dir);
  const idx = line.indexOf(to);
  if (idx < 0) return [];
  return line.slice(0, idx + 1);
}

/**
 * 批次評分並排序。
 * @returns {{action:object, score:number, detail:object}[]} 分數由高到低
 */
export function rankActions(ctx, actions, opts = {}) {
  const out = [];
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    let r;
    try {
      r = scoreAction(ctx, a, opts);
    } catch (err) {
      r = { score: -1e9, detail: { error: String(err && err.message) } };
    }
    out.push({ action: a, score: r.score, detail: r.detail, index: i });
  }
  out.sort((a, b) => b.score - a.score || a.index - b.index);
  return out;
}

export default {
  buildContext,
  evaluateContext,
  evaluateView,
  scoreAction,
  rankActions,
  estimateNodeRisk,
  ownFlagDanger,
  enemyFlagPressure,
  unitPositionScore,
  canKeyAttackNode,
  attackProbabilityToNode,
  keyOf,
  distOf,
  expectedPieceValue,
  inferAirPath,
  FLAG_WIN,
  FLAG_LOSS,
};
