/**
 * 三軍棋 AI：engine 對接層（公平模擬世界）
 * ------------------------------------------------------------------
 * AI 的 hard 難度需要「以自己相信的世界」做 2-ply 模擬：
 *   1. game.snapshot() 取得權威狀態（純資料）。
 *   2. 依 belief 對每枚「我方視角看不到棋種」的敵棋取樣 key，寫回 snapshot。
 *   3. game.clone() 取得獨立 Game，再 restore 這份「取樣世界」。
 *   4. 在 clone 上 applyAction / getLegalActions / getView。
 *
 * 公平性鐵則：
 *   - 這裡「絕對不讀」敵方未曝光棋子的 key。
 *   - 只依 getView 判定哪些 uid 對我方隱藏，再無條件覆寫成 belief 取樣值。
 *
 * engine 契約（rules-engine 確認）：
 *   snapshot() -> { version, idCounter, state:{ pieces:[{uid,key,side,nodeId,...}], ... } }
 *   restore(snapshot) 深拷貝；戰鬥只看 piece.key。
 */
import { PIECE_BY_KEY } from '../core/pieces.js';

/** 從 snapshot 找出棋子陣列（相容 {state:{pieces}} 與 {pieces} 兩種封裝） */
export function snapshotPieces(snapshot) {
  if (!snapshot) return null;
  const state = snapshot.state ?? snapshot;
  const container = state.pieces ?? snapshot.pieces;
  if (Array.isArray(container)) return container;
  if (container && typeof container === 'object') return Object.values(container);
  return null;
}

/**
 * 把 belief 取樣結果寫進 snapshot（只覆寫對我方隱藏的敵棋）。
 * @param {object} snapshot game.snapshot() 的深拷貝
 * @param {object} view 我方 getView(side)
 * @param {string} aiSide 我方陣營
 * @param {Map<number,string>} assignment uid→取樣棋種
 * @returns {number} 覆寫的棋子數
 */
export function maskSnapshot(snapshot, view, aiSide, assignment) {
  const pieces = snapshotPieces(snapshot);
  if (!pieces || !assignment) return 0;
  // 先由 view 決定「哪些 uid 對我隱藏」，避免讀 snapshot 裡的敵方真 key
  const hiddenUids = new Set();
  for (const p of view?.pieces || []) {
    if (p && p.side !== aiSide && p.alive !== false && !p.key) hiddenUids.add(p.uid);
  }
  let n = 0;
  for (const piece of pieces) {
    if (!piece || !hiddenUids.has(piece.uid)) continue;
    const sampled = assignment.get(piece.uid);
    if (!sampled) continue;
    piece.key = sampled;
    // engine 以 key 推導 name/branch，這裡仍補上以相容其他實作
    if (PIECE_BY_KEY[sampled]) {
      if ('name' in piece) piece.name = PIECE_BY_KEY[sampled].name;
      if ('branch' in piece) piece.branch = PIECE_BY_KEY[sampled].branch;
    }
    n++;
  }
  return n;
}

/**
 * 建立一個「取樣世界」的獨立 Game。
 * @returns {null|{game:object, assignment:Map, worldKeys:Map, masked:number}}
 */
export function createSimWorld({ game, view, belief, aiSide, rng }) {
  if (!game || typeof game.snapshot !== 'function' || typeof game.clone !== 'function') return null;
  let snap;
  try {
    snap = game.snapshot();
  } catch (err) {
    return null;
  }
  if (!snap) return null;

  const { assignment, ok } = belief.sampleWorld(view, rng);
  if (!assignment) return null;
  const masked = maskSnapshot(snap, view, aiSide, assignment);
  // 公平性保險：所有「對我隱藏」的敵棋都必須被取樣值覆寫，
  // 只要漏了任何一枚就拒絕這個模擬世界（避免用到真 key）。
  const hiddenCount = (view?.pieces || []).filter(
    (p) => p && p.side !== aiSide && p.alive !== false && !p.key,
  ).length;
  if (masked < hiddenCount) return null;

  let simGame = null;
  try {
    simGame = game.clone();
    if (!simGame || typeof simGame.restore !== 'function') return null;
    simGame.restore(snap);
  } catch (err) {
    return null;
  }

  // worldKeys：AI 相信的世界裡每枚棋的棋種（含自己與已曝光敵棋）
  const worldKeys = new Map();
  for (const p of view?.pieces || []) {
    if (!p) continue;
    const key = p.key || assignment.get(p.uid);
    if (key) worldKeys.set(p.uid, key);
  }

  return { game: simGame, assignment, worldKeys, masked, ok };
}

/** 兩個合法行動是否等價（main.js 的 actionAllowed 規則） */
export function sameAction(a, b) {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.pieceUid !== b.pieceUid) return false;
  const ta = a.to ?? a.target ?? null;
  const tb = b.to ?? b.target ?? null;
  return ta === tb;
}

/** 深拷貝行動（避免模擬時被 engine 內部引用影響） */
export function copyAction(action) {
  if (!action) return action;
  const copy = { ...action };
  if (Array.isArray(action.path)) copy.path = action.path.slice();
  if (Array.isArray(action.airPath)) copy.airPath = action.airPath.slice();
  return copy;
}

export default { snapshotPieces, maskSnapshot, createSimWorld, sameAction, copyAction };
