/**
 * 三軍棋 AI（AI 對手）
 * ==================================================================
 * 對外 API（DESIGN.md §3.4）：
 *   import { createAI } from './ai/ai.js';
 *   const ai = createAI({ side: 'north', difficulty: 'normal', seed });
 *   const placements = ai.deploy(game);     // [{pieceKey, nodeId}] × 30
 *   const action = ai.chooseAction(game);   // 合法行動物件
 *
 * 公平性：
 *   - chooseAction 只用 game.getView(side)、game.getLegalActions(side)、
 *     game.snapshot()/clone()/restore()/applyAction()。
 *   - 未知敵棋一律用 belief 的機率分布推理／取樣，絕不讀消失中的真 key。
 *   - hard 難度的模擬世界是「AI 相信的世界」，不是真實隱藏資訊。
 *
 * 難度：
 *   easy   貪心＋較大隨機擾動（不做威脅掃描，會犯錯但仍有基本攻守）
 *   normal 期望值評估（戰鬥期望、位置、威脅、軍旗安全、海空運用、終局衝旗）
 *   hard   normal 之上再做「取樣世界 2-ply」：我方行動 → 對手最佳回應抽樣
 */
import { createRng } from '../core/rng.js';
import { NODE, DEPLOY_ZONES, otherSide } from '../core/board.js';
import { valueOf, isStaticKey, isNavyKey, isAirKey } from './combat-rules.js';
import { Belief } from './belief.js';
import { deployArmy } from './deploy.js';
import * as EV from './evaluate.js';
import { createSimWorld, copyAction } from './engine-adapter.js';

/** 合法難度名稱 */
const DIFFICULTIES = ['easy', 'normal', 'hard'];

export function normalizeDifficulty(d) {
  return DIFFICULTIES.includes(d) ? d : 'normal';
}

/** 終局分數（遠大於任何局面評估） */
const TERMINAL_WIN = 1e6;

/**
 * 建立 AI。
 * @param {object} opts
 * @param {string} [opts.side='north']
 * @param {string} [opts.difficulty='normal']
 * @param {number} [opts.seed]
 * @returns {object} AI
 */
export function createAI({ side = 'north', difficulty = 'normal', seed = Date.now() >>> 0 } = {}) {
  const aiSide = side === 'south' ? 'south' : 'north';
  const enemySide = otherSide(aiSide);
  const rng = createRng((seed >>> 0) || 1);
  const beliefRng = createRng(((seed >>> 0) ^ 0x9e3779b9) >>> 0);
  const belief = new Belief({ side: aiSide, rng: beliefRng });

  let currentDifficulty = normalizeDifficulty(difficulty);
  let turns = 0;
  /** 自己的行動歷史：用來偵測原地打轉／同一枚棋反覆來回 */
  const history = {
    actions: [], // {pieceUid, from, to}（僅移動類）
    pieceCount: new Map(), // uid -> 移動次數
  };

  const ai = {
    side: aiSide,
    enemySide,
    seed,
    /** 最近一次決策統計（測試/除錯/回報效能用） */
    lastStats: null,

    get difficulty() {
      return currentDifficulty;
    },

    setDifficulty(d) {
      currentDifficulty = normalizeDifficulty(d);
    },

    /** 目前的 belief（測試/除錯用） */
    getBelief() {
      return belief;
    },

    /* -------------------------------------------------------------- */
    /* 佈陣                                                           */
    /* -------------------------------------------------------------- */
    deploy(game) {
      const deployRng = createRng(((seed >>> 0) ^ 0x27d4eb2d) >>> 0);
      let result;
      try {
        result = deployArmy({ side: aiSide, difficulty: currentDifficulty, rng: deployRng });
      } catch (err) {
        // 極端情況：退回簡單合法佈陣（仍會由 main.js/engine 再驗證）
        console.warn('[AI] 佈陣計算失敗，使用備援佈陣', err);
        result = fallbackDeploy(aiSide);
      }
      return result.placements;
    },

    /* -------------------------------------------------------------- */
    /* 決策                                                           */
    /* -------------------------------------------------------------- */
    chooseAction(game) {
      const t0 = now();
      const fail = (reason) => {
        ai.lastStats = { difficulty: currentDifficulty, ms: now() - t0, mode: 'fallback', reason };
        return { type: 'pass' };
      };
      if (!game || typeof game.getView !== 'function') return fail('no-game');

      let view = null;
      try {
        view = game.getView(aiSide);
      } catch (err) {
        return fail('getView-error');
      }
      if (!view) return fail('no-view');
      if (view.winner) return fail('game-over');

      // 更新推理（只使用 view）
      try {
        belief.update(view);
      } catch (err) {
        console.warn('[AI] belief 更新失敗', err);
      }

      let legal = [];
      try {
        legal = game.getLegalActions(aiSide) || [];
      } catch (err) {
        return fail('legal-error');
      }
      if (!Array.isArray(legal) || legal.length === 0) return fail('no-legal');

      const nonPass = legal.filter((a) => a && a.type !== 'pass');
      if (!nonPass.length) {
        ai.lastStats = { difficulty: currentDifficulty, ms: now() - t0, mode: 'pass-only' };
        return legal[legal.length - 1] || { type: 'pass' };
      }

      let ctx;
      try {
        ctx = EV.buildContext({ side: aiSide, view, belief });
      } catch (err) {
        console.warn('[AI] 局面分析失敗，退回隨機合法行動', err);
        ai.lastStats = { difficulty: currentDifficulty, ms: now() - t0, mode: 'random' };
        return nonPass[Math.floor(rng() * nonPass.length)];
      }

      turns++;
      let action = null;
      let mode = currentDifficulty;
      try {
        if (currentDifficulty === 'easy') {
          action = chooseEasy(ctx, nonPass, rng, history);
        } else if (currentDifficulty === 'hard') {
          action = chooseHard(game, view, ctx, nonPass, rng, history);
          if (!action) {
            action = chooseNormal(ctx, nonPass, rng, history);
            mode = 'normal(fallback)';
          }
        } else {
          action = chooseNormal(ctx, nonPass, rng, history);
        }
      } catch (err) {
        console.warn('[AI] 決策過程出錯，退回 greedy', err);
        action = chooseNormal(ctx, nonPass, rng, history);
        mode = 'greedy(fallback)';
      }
      if (!action) action = nonPass[0];
      recordHistory(history, action);
      ai.lastStats = {
        difficulty: currentDifficulty,
        ms: now() - t0,
        mode,
        turn: turns,
        candidates: nonPass.length,
        beliefKnown: belief.knownKeys.size,
        beliefUnknown: belief.unknownPieces().length,
      };
      return action;
    },
  };

  return ai;
}

/* ================================================================== */
/* 難度：easy                                                         */
/* ================================================================== */

/** 貪心＋隨機擾動：只看立即戰鬥期望與位置，不做風險掃描 */
function chooseEasy(ctx, legalActions, rng, history) {
  const ranked = EV.rankActions(ctx, legalActions, { cheap: true });
  for (const r of ranked) {
    r.score = r.score + (rng() - 0.5) * 45;
    r.score += strategicModifiers(ctx, r, rng, 'easy', history);
  }
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  // 35% 機率從前段亂選，讓簡單難度有破綻
  if (rng() < 0.35 && ranked.length > 1) {
    const k = Math.min(ranked.length, 5);
    return ranked[1 + Math.floor(rng() * (k - 1))].action;
  }
  return ranked[0].action;
}

/* ================================================================== */
/* 難度：normal                                                       */
/* ================================================================== */

/** 期望值＋威脅評估：完整評分後取最佳 */
function chooseNormal(ctx, legalActions, rng, history) {
  const ranked = EV.rankActions(ctx, legalActions, {});
  for (const r of ranked) {
    r.score = r.score + strategicModifiers(ctx, r, rng, 'normal', history);
  }
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0].action;
}

/* ================================================================== */
/* 難度：hard                                                         */
/* ================================================================== */

/**
 * 取樣世界 2-ply：
 *   候選行動（normal 前 K 名）× 多個 belief 取樣世界
 *   每個世界：我方行動 → 對手最佳回應（前 3 名加權抽樣）→ 評估終局/局面
 * 取平均最佳者。任何步驟失敗都退回 normal。
 */
function chooseHard(game, view, ctx, legalActions, rng, history) {
  const t0 = now();
  const BUDGET_MS = 1600;

  // 1) 先用完整評估排出候選
  const ranked = EV.rankActions(ctx, legalActions, {});
  for (const r of ranked) r.score = r.score + strategicModifiers(ctx, r, rng, 'hard', history);
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);

  const K = Math.min(12, ranked.length);
  if (K === 0) return null;
  const candidates = ranked.slice(0, K);
  // 只有一個候選時不需模擬
  if (candidates.length === 1) return candidates[0].action;
  // 若最佳候選已大幅領先（例如直接奪旗），直接採用
  if (candidates[0].score - (candidates[1]?.score ?? -Infinity) > 30000) {
    return candidates[0].action;
  }

  const WORLD_COUNT = 8;
  const sums = new Array(K).fill(0);
  const counts = new Array(K).fill(0);
  let worldsBuilt = 0;

  for (let w = 0; w < WORLD_COUNT; w++) {
    if (now() - t0 > BUDGET_MS) break;
    const world = createSimWorld({
      game,
      view,
      belief: ctx.belief,
      aiSide: ctx.side,
      rng,
    });
    if (!world) break; // engine 不支援 snapshot/clone → 放棄模擬
    worldsBuilt++;
    const sim = world.game;
    let baseSnap;
    try {
      baseSnap = sim.snapshot();
    } catch (err) {
      break;
    }
    const oppSide = otherSide(ctx.side);

    for (let i = 0; i < candidates.length; i++) {
      if (now() - t0 > BUDGET_MS) break;
      let score;
      try {
        sim.restore(baseSnap);
        const res = sim.applyAction(ctx.side, copyAction(candidates[i].action));
        if (!res || res.ok === false) continue;
        // 立即分出勝負
        const immediate = terminalScore(res.winner, ctx.side);
        if (immediate !== null) {
          sums[i] += immediate;
          counts[i] += 1;
          continue;
        }
        // 對手最佳回應（以 AI 相信的世界做對手評估；取前 3 名加權抽樣）
        if (!respondForOpponent(sim, world, oppSide, ctx.side, rng)) continue;
        // 回應後是否終局
        const afterView = sim.getView(ctx.side);
        const term = terminalScore(afterView?.winner, ctx.side);
        if (term !== null) {
          sums[i] += term;
          counts[i] += 1;
          continue;
        }
        // 局面評估（用取樣世界當作已知事實）
        score = EV.evaluateView({
          side: ctx.side,
          view: afterView,
          worldKeys: world.worldKeys,
        });
        sums[i] += score;
        counts[i] += 1;
      } catch (err) {
        // 單一候選/世界失敗不影響其他
        continue;
      }
    }
  }

  if (worldsBuilt === 0) return null;

  // 2) 平均分數＋一點 1-ply 正則化，避免取樣雜訊蓋過基本判斷
  let bestIdx = 0;
  let bestValue = -Infinity;
  for (let i = 0; i < K; i++) {
    if (counts[i] === 0) continue;
    const mean = sums[i] / counts[i];
    const value = mean + candidates[i].score * 0.08;
    if (value > bestValue) {
      bestValue = value;
      bestIdx = i;
    }
  }
  return candidates[bestIdx].action;
}

/**
 * 讓對手在模擬世界中走出「合理的最佳回應」。
 * 以取樣世界的完整資訊評估（模擬世界是 AI 相信的世界，不是真實隱藏資訊）。
 * @returns {boolean} 是否成功
 */
function respondForOpponent(sim, world, oppSide, aiSide, rng) {
  const oppLegal = sim.getLegalActions(oppSide) || [];
  if (!oppLegal.length) {
    try {
      sim.pass ? sim.pass(oppSide) : null;
    } catch (err) {
      /* 忽略 */
    }
    return true;
  }
  const nonPass = oppLegal.filter((a) => a && a.type !== 'pass');
  if (!nonPass.length) {
    try {
      sim.pass ? sim.pass(oppSide) : null;
    } catch (err) {
      /* 忽略 */
    }
    return true;
  }
  const oppView = sim.getView(oppSide);
  const oppCtx = EV.buildContext({ side: oppSide, view: oppView, worldKeys: world.worldKeys });
  const ranked = EV.rankActions(oppCtx, nonPass, { cheap: true });
  // 前 3 名加權抽樣：對手不一定永遠挑最佳（也讓 AI 的評估較穩健）
  const k = Math.min(3, ranked.length);
  const weights = [0.62, 0.26, 0.12].slice(0, k);
  let r = rng() * weights.reduce((s, w) => s + w, 0);
  let pick = ranked[0];
  for (let i = 0; i < k; i++) {
    r -= weights[i];
    if (r <= 0) {
      pick = ranked[i];
      break;
    }
  }
  const res = sim.applyAction(oppSide, copyAction(pick.action));
  return !!res;
}

/** 終局分數轉換；非終局回傳 null */
function terminalScore(winner, mySide) {
  if (!winner) return null;
  if (winner === mySide) return TERMINAL_WIN;
  if (winner === 'draw' || winner === 'tie') return 0;
  return -TERMINAL_WIN;
}

/* ================================================================== */
/* 策略微調（各難度共用，塑造 AI 性格）                                 */
/* ================================================================== */

/** 記錄自己實際採用的行動（供反打轉判斷） */
function recordHistory(history, action) {
  if (!action) return;
  if (action.type === 'move' || action.type === 'land') {
    if (action.to === undefined) return;
    history.actions.push({
      pieceUid: action.pieceUid,
      from: action.from,
      to: action.to,
    });
    if (history.actions.length > 24) history.actions.shift();
    history.pieceCount.set(action.pieceUid, (history.pieceCount.get(action.pieceUid) || 0) + 1);
  }
}

/**
 * 在純期望值之外加入「風格」修正：
 *   - 不確定時用便宜棋試探（工兵、步兵、偵察機、海軍）。
 *   - 確定敵方強棋時迴避（避免送頭）。
 *   - 軍旗附近保留防守（敵軍逼近時不把守軍調走）。
 *   - 終局敢於衝旗（敵方棋子少時往城門加壓）。
 *   - 適度隨機，讓同一局面不至於完全死板。
 */
function strategicModifiers(ctx, entry, rng, difficulty, history) {
  const action = entry.action;
  const piece = ctx.byUid.get(action.pieceUid);
  if (!piece) return 0;
  const ownKey = EV.keyOf(ctx, piece);
  const ownValue = ownKey ? valueOf(ownKey) : 30;
  const targetNodeId = action.to ?? action.target;
  const target = targetNodeId !== undefined && targetNodeId !== null ? ctx.occ.get(targetNodeId) : null;
  const fromNodeId = action.from ?? piece.nodeId;
  let bonus = 0;

  // ---------- 1. 未知敵棋：便宜棋試探、城門加壓 ----------
  if (target && target.side === ctx.enemy && !target.key) {
    const cert = ctx.belief ? ctx.belief.certainty(target.uid) : 0.5;
    const probe = (1 - cert) * (ownValue <= 42 ? 11 : 3.5);
    bonus += probe;
    // 目標在城門且從未移動 → 很可能是軍旗，值得強攻
    const node = NODE[targetNodeId];
    if (node && node.kind === 'gate') {
      const pFlag = ctx.belief ? ctx.belief.getDistribution(target.uid).get('flag') || 0 : 0;
      bonus += 18 + pFlag * 120;
    }
  }

  // ---------- 2. 確定強敵：不要盲目送頭（除非交換有利） ----------
  if (target && target.key) {
    const tv = valueOf(target.key);
    if (tv - ownValue > 45 && ownValue < 48) bonus -= 18;
    // 能穩贏的便宜棋吃掉有價值目標 → 鼓勵
    if (tv >= 60 && ownValue <= 40) bonus += 6;
  }

  // ---------- 3. 軍旗防守：敵軍逼近旗門時，別把守軍調遠 ----------
  if (ctx.ownFlag && !isStaticKey(ownKey)) {
    const danger = EV.ownFlagDanger(ctx);
    if (danger > 0.08) {
      const flagNode = NODE[ctx.ownFlag.nodeId];
      const fromNode = NODE[fromNodeId];
      if (flagNode && fromNode) {
        const dFrom = Math.max(
          Math.abs(fromNode.col - flagNode.col),
          Math.abs(fromNode.row - flagNode.row),
        );
        const destNode = targetNodeId !== undefined ? NODE[targetNodeId] : null;
        const dTo = destNode
          ? Math.max(Math.abs(destNode.col - flagNode.col), Math.abs(destNode.row - flagNode.row))
          : dFrom;
        if (dFrom <= 2 && dTo > dFrom) bonus -= danger * 55;
        else if (dTo < dFrom) bonus += danger * 25;
      }
    }
  }

  // ---------- 3.5 已知敵方軍旗位置：全力追擊（陸軍才能破門） ----------
  if (ctx.enemyFlagNode !== null && (action.type === 'move' || action.type === 'land')) {
    const dest = targetNodeId !== undefined ? NODE[targetNodeId] : null;
    if (dest && ownKey && !isNavyKey(ownKey) && !isAirKey(ownKey) && !piece.landed ? true : dest && ownKey) {
      const gn = NODE[ctx.enemyFlagNode];
      const from = NODE[fromNodeId];
      if (gn && from) {
        const dTo = Math.max(Math.abs(gn.col - dest.col), Math.abs(gn.row - dest.row));
        const dFrom = Math.max(Math.abs(gn.col - from.col), Math.abs(gn.row - from.row));
        bonus += (dFrom - dTo) * 15 * ctx.aggression;
        if (dTo <= 1) bonus += 35; // 下一手就能攻城門
      }
    }
  }

  // ---------- 4. 終局：敢於衝旗 ----------
  if (ctx.enemyPieces.length <= 14) {
    const dest = targetNodeId !== undefined ? NODE[targetNodeId] : null;
    if (dest) {
      for (const gateNode of ctx.enemyFlagDist.keys()) {
        const gn = NODE[gateNode];
        if (!gn) continue;
        const d = Math.max(Math.abs(gn.col - dest.col), Math.abs(gn.row - dest.row));
        if (d <= 2) bonus += (3 - d) * 6 * ctx.aggression;
      }
    }
  }
  if (ctx.enemyPieces.length <= 8) {
    const dest = targetNodeId !== undefined ? NODE[targetNodeId] : null;
    if (dest && ctx.enemyFlagDist.has(targetNodeId)) bonus += 40;
    // 靠近敵方城門的行動
    for (const gateNode of ctx.enemyFlagDist.keys()) {
      if (targetNodeId === undefined) continue;
      const gn = NODE[gateNode];
      if (!gn || !dest) continue;
      const d = Math.max(Math.abs(gn.col - dest.col), Math.abs(gn.row - dest.row));
      if (d <= 2) bonus += (3 - d) * 8;
    }
    if (action.type === 'move' || action.type === 'land') bonus += 4;
  }

  // ---------- 5. 反打轉：不要同一枚棋原地來回／無限循環 ----------
  if (history && (action.type === 'move' || action.type === 'land') && action.to !== undefined) {
    const dest = action.to;
    const myHist = history.actions.filter((h) => h.pieceUid === action.pieceUid);
    const recent = myHist.slice(-5);
    // 立即原路折返（最具破壞性的循環）
    const last = recent[recent.length - 1];
    if (last && last.from === dest && last.to === fromNodeId) bonus -= 26;
    // 最近走過同一格
    for (const h of recent) {
      if (h.to === dest) bonus -= 9;
    }
    // 同一枚棋連續行動太多手
    let streak = 0;
    for (let i = history.actions.length - 1; i >= 0; i--) {
      if (history.actions[i].pieceUid === action.pieceUid) streak++;
      else break;
    }
    if (streak >= 2) bonus -= 7 * streak;
    // 早期鼓勵調動還沒動過的棋（避免只動同一枚）
    const timesMoved = history.pieceCount.get(action.pieceUid) || 0;
    if (timesMoved === 0 && ctx.enemyPieces.length > 16) bonus += 2.5;
  }

  // ---------- 6. 適度隨機 ----------
  if (difficulty === 'easy') bonus += (rng() - 0.5) * 40;
  else if (difficulty === 'normal') bonus += (rng() - 0.5) * 1.2;
  else bonus += (rng() - 0.5) * 0.6;

  return bonus;
}

/* ================================================================== */
/* 備援                                                               */
/* ================================================================== */

const now = () =>
  typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

/** 備援佈陣：只在 deployArmy 意外拋錯時使用（保守但合法） */
function fallbackDeploy(side) {
  const zones = DEPLOY_ZONE_FALLBACK(side);
  const placements = [];
  const used = new Set();
  const put = (pieceKey, ids) => {
    for (const id of ids) {
      if (!used.has(id)) {
        used.add(id);
        placements.push({ pieceKey, nodeId: id });
        return true;
      }
    }
    return false;
  };
  put('flag', zones.gates);
  put('mine', zones.allLand);
  put('trap', zones.allLand);
  put('fort', zones.coastal);
  for (const key of [
    'commander', 'army_group', 'corps', 'division', 'brigade', 'battalion',
    'company', 'platoon', 'cavalry', 'infantry', 'engineer',
    'gas', 'missile', 'bomb', 'atomic', 'tank', 'cannon', 'aa', 'mg',
  ]) put(key, zones.allLand);
  for (const key of ['battleship', 'cruiser', 'gunboat', 'destroyer', 'submarine']) put(key, zones.anchors);
  for (const key of ['fighter', 'scout']) put(key, zones.airports);
  return { placements };
}

function DEPLOY_ZONE_FALLBACK(side) {
  const z = DEPLOY_ZONES[side];
  return {
    allLand: z.allLand,
    coastal: z.coastal,
    gates: z.gates,
    anchors: z.anchors,
    airports: z.airports,
  };
}

export default createAI;
