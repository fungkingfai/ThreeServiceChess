#!/usr/bin/env node
/**
 * 三軍棋 AI 測試（直接以 node 執行：`node tests/ai.test.mjs`）
 * ==================================================================
 * 使用真正的 core engine（src/core/engine.js）跑整合測試，外加 belief /
 * 戰鬥期望值 / 佈陣的單元測試。全部用 node:assert，無外部測試框架。
 *
 * 涵蓋：
 *   1. AI 用的勝負表副本與 core/combat-table.json 完全一致。
 *   2. 特殊戰鬥映射與 DESIGN 修正規則（工兵拆炮壘、炮艦砲擊炮壘、
 *      潛艇遇飛彈、軍旗奪旗…）。
 *   3. AI 佈陣：30 枚、合法區域、三城門誘餌、軍旗藏門、地雷/炮壘/行營/
 *      海軍/空軍配置合理。
 *   4. Belief：城門軍旗機率模型、移動/特殊行動線索、取樣世界一致性。
 *   5. AI vs AI：連續 60+ 回合不崩潰、每步都在 getLegalActions 內、
 *      getView 不洩漏敵方隱藏棋種、每步 < 2 秒。
 *   6. 公平性：AI 不能讀 game.state；交換敵方隱藏棋種後決策不變；
 *      snapshot 裡的隱藏 key 被刻意改成假值時決策也不變。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createGame } from '../src/core/engine.js';
import { PIECES, PIECE_BY_KEY } from '../src/core/pieces.js';
import {
  NODE,
  GATE_NODES,
  DEPLOY_ZONES,
  CAMP_NODES,
  ANCHOR_NODES,
  AIRPORT_NODES,
} from '../src/core/board.js';
import { createRng } from '../src/core/rng.js';
import { createAI } from '../src/ai/ai.js';
import { Belief } from '../src/ai/belief.js';
import { deployArmy } from '../src/ai/deploy.js';
import { COMBAT_MATRIX, COMBAT_NAMES } from '../src/ai/combat-data.js';
import {
  battleForecast,
  expectedBattle,
  isMovableKey,
  isStaticKey,
  valueOf,
  OUTCOME,
} from '../src/ai/combat-rules.js';
import { sameAction } from '../src/ai/engine-adapter.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/* ================================================================== */
/* 迷你測試框架                                                        */
/* ================================================================== */

const testResults = [];
let currentSection = '';

function section(title) {
  currentSection = title;
  console.log(`\n${title}`);
}

function test(name, fn) {
  const t0 = Date.now();
  try {
    fn();
    const ms = Date.now() - t0;
    testResults.push({ name: `${currentSection} / ${name}`, ok: true, ms });
    console.log(`  ✓ ${name}${ms > 50 ? `（${ms}ms）` : ''}`);
  } catch (err) {
    const ms = Date.now() - t0;
    testResults.push({ name: `${currentSection} / ${name}`, ok: false, ms, err });
    console.error(`  ✗ ${name}`);
    console.error(`      ${err && err.stack ? err.stack.split('\n').slice(0, 6).join('\n      ') : err}`);
  }
}

/* ================================================================== */
/* 公用工具                                                            */
/* ================================================================== */

/**
 * 安全包裝：只暴露 AI 允許使用的 API；讀 game.state 會直接丟錯。
 * 用來實際驗證「AI 不會偷看隱藏資訊」。
 */
function guardGame(real, hooks = {}) {
  const guard = {
    getView: (s) => real.getView(s),
    getLegalActions: (s) => real.getLegalActions(s),
    getActionsForPiece: (s, u) =>
      typeof real.getActionsForPiece === 'function' ? real.getActionsForPiece(s, u) : [],
    snapshot: () => (hooks.snapshot ? hooks.snapshot(real) : real.snapshot()),
    restore: (sn) => real.restore(sn),
    clone: () => guardGame(real.clone()),
    applyAction: (s, a) => real.applyAction(s, a),
    pass: (s) => real.pass(s),
    canAct: (s) => real.canAct(s),
    startPlay: () => real.startPlay(),
    deploy: (s, p) => real.deploy(s, p),
    isDeployed: (s) => (typeof real.isDeployed === 'function' ? real.isDeployed(s) : true),
    getPublicInfo: () => (typeof real.getPublicInfo === 'function' ? real.getPublicInfo() : null),
    get state() {
      throw new Error('AI 不得直接讀取 game.state（隱藏資訊作弊）');
    },
  };
  return guard;
}

/** 建立一局雙方都已由 AI 佈陣完成的遊戲 */
function createMatch({ seed, northDifficulty = 'normal', southDifficulty = 'normal', deploy = true }) {
  const game = createGame({ seed });
  const ais = {
    north: createAI({ side: 'north', difficulty: northDifficulty, seed: (seed ^ 0x1111) >>> 0 }),
    south: createAI({ side: 'south', difficulty: southDifficulty, seed: (seed ^ 0x2222) >>> 0 }),
  };
  if (deploy) {
    for (const side of ['north', 'south']) {
      const safe = guardGame(game);
      const placements = ais[side].deploy(safe);
      assert.ok(Array.isArray(placements) && placements.length === 30, `${side} AI 佈陣應有 30 枚`);
      const res = game.deploy(side, placements);
      assert.equal(res.ok, true, `${side} AI 佈陣被 engine 拒絕：${(res.errors || []).join('；')}`);
    }
    const started = game.startPlay();
    assert.ok(started && started.ok !== false, 'startPlay 失敗');
  }
  return { game, ais };
}

/** 檢查 getView 是否洩漏敵方隱藏棋種（空軍除外） */
function assertViewHidesEnemyKeys(view, viewer, context = '') {
  for (const p of view.pieces) {
    if (!p || p.side === viewer) continue;
    if (p.branch === 'air') {
      assert.ok(p.key, `${context} 空軍棋子應永遠公開 uid=${p.uid}`);
      continue;
    }
    if (p.revealed) continue;
    assert.equal(p.key, null, `${context} getView(${viewer}) 洩漏敵方隱藏棋種 uid=${p.uid}`);
    assert.equal(p.name, null, `${context} getView(${viewer}) 洩漏敵方隱藏棋名 uid=${p.uid}`);
  }
}

/**
 * 跑一局 AI vs AI。
 * @returns {{
 *   plies:number, decisions:number, maxMs:number, winner:?string, reason:?string,
 *   sideDecisions:Object<string,number>, actionTypes:Object<string,number>
 * }}
 */
function runGame({ game, ais, maxPlies = 40, onPly = null }) {
  const stats = {
    plies: 0,
    decisions: 0,
    maxMs: 0,
    winner: null,
    reason: null,
    sideDecisions: { north: 0, south: 0 },
    actionTypes: {},
    attackActions: 0,
    maxMsByDifficulty: { easy: 0, normal: 0, hard: 0 },
  };
  for (let ply = 0; ply < maxPlies; ply++) {
    const view = game.getView('north');
    if (view.winner) {
      stats.winner = view.winner;
      stats.reason = view.winnerReason;
      break;
    }
    const side = view.sideToMove;
    assert.ok(side === 'north' || side === 'south', `sideToMove 異常：${side}`);
    const legal = game.getLegalActions(side);
    assert.ok(legal.length > 0, `${side} 回合卻沒有合法行動（phase=${view.phase}）`);
    const ai = ais[side];
    const t0 = Date.now();
    const action = ai.chooseAction(guardGame(game));
    const ms = Date.now() - t0;
    stats.maxMs = Math.max(stats.maxMs, ms);
    stats.maxMsByDifficulty[ai.difficulty] = Math.max(stats.maxMsByDifficulty[ai.difficulty], ms);
    assert.ok(ms < 2000, `${side}（${ai.difficulty}）決策超過 2 秒：${ms}ms`);
    assert.ok(action && typeof action.type === 'string', `${side} 未回傳合法行動物件`);
    assert.ok(
      legal.some((a) => sameAction(a, action)),
      `${side} 回傳的行動不在 getLegalActions 內：${JSON.stringify(action)}`,
    );
    assertViewHidesEnemyKeys(game.getView(side), side, `ply ${ply}`);
    const res = game.applyAction(side, action);
    assert.equal(res.ok, true, `${side} 的合法行動被 engine 拒絕：${res.error}`);
    stats.decisions++;
    stats.plies++;
    stats.sideDecisions[side]++;
    stats.actionTypes[action.type] = (stats.actionTypes[action.type] || 0) + 1;
    {
      const targetNode = action.to ?? action.target;
      const targetPiece =
        targetNode !== undefined && targetNode !== null
          ? view.pieces.find((p) => p.nodeId === targetNode && p.alive !== false)
          : null;
      const isAttack =
        ['fire', 'bombard', 'antiair', 'missile', 'land'].includes(action.type) ||
        (targetPiece && targetPiece.side !== side);
      if (isAttack) stats.attackActions = (stats.attackActions || 0) + 1;
    }
    if (onPly) onPly({ ply, side, action, result: res, view });
    if (res.winner) {
      stats.winner = res.winner;
      stats.reason = res.winnerReason;
      break;
    }
  }
  if (!stats.winner) {
    const v = game.getView('north');
    stats.winner = v.winner || null;
    stats.reason = v.winnerReason || null;
  }
  return stats;
}

/** 從 engine state 取出棋種 key（測試專用，僅用來驗證；AI 不得使用） */
function pieceKeyOf(game, uid) {
  const p = game.state.pieces.find((x) => x.uid === uid);
  return p ? p.key : null;
}

/** Fisher–Yates（用 createRng 產生可重現順序） */
function shuffleWithRng(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 把「AI 看不到棋種的敵方棋子」的 key 互換（同軍種內），
 * 產生兩個公開資訊完全相同、但真實隱藏棋種不同的世界。
 */
function permuteHiddenEnemyKeys(game, aiSide, rng) {
  const clone = game.clone();
  const view = game.getView(aiSide);
  const hidden = view.pieces.filter(
    (p) => p.side !== aiSide && p.alive !== false && !p.key,
  );
  const groups = new Map();
  for (const p of hidden) {
    if (!groups.has(p.branch)) groups.set(p.branch, []);
    groups.get(p.branch).push(p.uid);
  }
  const pieces = clone.state.pieces;
  for (const uids of groups.values()) {
    if (uids.length < 2) continue;
    const keys = uids.map((uid) => {
      const target = pieces.find((x) => x.uid === uid);
      return target ? target.key : null;
    });
    shuffleWithRng(keys, rng);
    uids.forEach((uid, i) => {
      const target = pieces.find((x) => x.uid === uid);
      if (target && keys[i]) target.key = keys[i];
    });
  }
  return clone;
}

/** 兩個 view 的「公開資訊」是否完全一致 */
function viewPublicJson(view) {
  return JSON.stringify({
    phase: view.phase,
    turn: view.turn,
    sideToMove: view.sideToMove,
    winner: view.winner,
    flagRevealed: view.flagRevealed,
    deploy: view.deploy,
    pieces: view.pieces.map((p) => ({
      uid: p.uid,
      side: p.side,
      key: p.key,
      name: p.name,
      branch: p.branch,
      nodeId: p.nodeId,
      alive: p.alive,
      revealed: p.revealed,
      landed: p.landed,
    })),
    log: view.log,
  });
}

/** 同一局面的兩個「被下毒」snapshot：把敵方隱藏棋的 key 換成假值 */
function poisonSnapshotForAI(real, aiSide, view, fakeKeyForBranch) {
  const snap = real.snapshot();
  const hidden = view.pieces.filter((p) => p.side !== aiSide && p.alive !== false && !p.key);
  const hiddenSet = new Set(hidden.map((p) => p.uid));
  const branchByUid = new Map(hidden.map((p) => [p.uid, p.branch]));
  for (const piece of snap.state.pieces) {
    if (!hiddenSet.has(piece.uid)) continue;
    piece.key = fakeKeyForBranch(branchByUid.get(piece.uid));
  }
  return snap;
}

/* ================================================================== */
/* 1. 勝負表資料一致性                                                  */
/* ================================================================== */

section('§1 勝負表資料（AI 副本 vs core 權威檔）');

test('COMBAT_MATRIX 與 src/core/combat-table.json 完全一致', () => {
  const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/core/combat-table.json'), 'utf8'));
  assert.deepEqual([...COMBAT_NAMES].sort(), [...json.names].sort(), '棋名清單不一致');
  const defenderNames = Object.keys(json.matrix);
  assert.ok(defenderNames.length > 0, '勝負表沒有防守方');
  for (const d of defenderNames) {
    assert.ok(COMBAT_MATRIX[d], `AI 副本缺少防守方 ${d}`);
    for (const a of json.names) {
      assert.equal(
        COMBAT_MATRIX[d][a],
        json.matrix[d][a],
        `勝負表不一致：守 ${d} vs 攻 ${a}`,
      );
    }
  }
});

/* ================================================================== */
/* 2. 戰鬥規則 / 特殊映射                                               */
/* ================================================================== */

section('§2 戰鬥預測與特殊規則');

test('一般戰鬥查表正確（官兵階級、武器相剋）', () => {
  assert.equal(battleForecast('commander', 'army_group', 'normal').outcome, OUTCOME.ATTACK_WIN);
  assert.equal(battleForecast('commander', 'infantry', 'normal').outcome, OUTCOME.ATTACK_WIN);
  assert.equal(battleForecast('infantry', 'commander', 'normal').outcome, OUTCOME.DEFEND_WIN);
  assert.equal(battleForecast('bomb', 'commander', 'normal').outcome, OUTCOME.BOTH);
  assert.equal(battleForecast('engineer', 'mine', 'normal').outcome, OUTCOME.ATTACK_WIN);
  assert.equal(battleForecast('tank', 'trap', 'normal').outcome, OUTCOME.DEFEND_WIN);
});

test('DESIGN 修正規則：工兵拆炮壘、炮艦砲擊炮壘、潛艇遇飛彈', () => {
  const engineerVsFort = battleForecast('engineer', 'fort', 'normal');
  assert.ok(engineerVsFort && engineerVsFort.outcome === OUTCOME.ATTACK_WIN, '工兵攻擊炮壘應獲勝');
  const gunboatBombardFort = battleForecast('gunboat', 'fort', 'bombard');
  assert.ok(gunboatBombardFort && gunboatBombardFort.outcome === OUTCOME.ATTACK_WIN, '炮艦砲擊炮壘應獲勝');
  const fortFireGunboat = battleForecast('fort', 'gunboat', 'fire');
  assert.ok(fortFireGunboat && fortFireGunboat.outcome === OUTCOME.ATTACK_WIN, '炮壘砲擊炮艦應獲勝');
  const missileVsSub = battleForecast('missile', 'submarine', 'missile');
  assert.ok(missileVsSub && missileVsSub.outcome === OUTCOME.DRAW, '飛彈攻擊潛艇應為不分勝負');
  assert.equal(missileVsSub.attackerDies, true, '飛彈發射後必定消滅');
});

test('軍旗被任何棋子攻擊 ⇒ 奪旗勝利', () => {
  for (const attacker of ['engineer', 'infantry', 'commander', 'bomb', 'scout']) {
    const fc = battleForecast(attacker, 'flag', 'normal');
    assert.ok(fc, `${attacker} 應能攻擊軍旗`);
    assert.equal(fc.outcome, OUTCOME.FLAG);
    assert.equal(fc.flagCapture, true);
    assert.equal(fc.defenderDies, true);
  }
});

test('X（無法作用）不合法：AI 不會把它算成有效戰鬥', () => {
  assert.equal(battleForecast('destroyer', 'trap', 'normal'), null); // 驅逐艦 vs 陷阱＝無法作用
  assert.equal(battleForecast('engineer', 'submarine', 'normal'), null); // 陸軍 vs 潛艇＝無法作用
  assert.ok(battleForecast('infantry', 'trap', 'normal'), '一般可作用配對應有結果');
});

test('expectedBattle 對已知守方的期望值合理', () => {
  const commanderVsInfantry = expectedBattle('commander', new Map([['infantry', 1]]), 'normal');
  assert.equal(commanderVsInfantry.pWin, 1);
  assert.ok(commanderVsInfantry.exchange > 0);

  const engineerVsFort = expectedBattle('engineer', new Map([['fort', 1]]), 'normal');
  assert.equal(engineerVsFort.pWin, 1);

  const missileVsSub = expectedBattle('missile', new Map([['submarine', 1]]), 'missile');
  assert.equal(missileVsSub.attackerDiesProb, 1);
  assert.ok(missileVsSub.exchange < 0, '飛彈打潛艇應是虧本交換');

  // 城門誘餌模型：1/3 軍旗時，期望交換值應遠大於 0
  const vsGate = expectedBattle(
    'infantry',
    new Map([['flag', 1 / 3], ['trap', 1 / 3], ['infantry', 1 / 3]]),
    'normal',
  );
  assert.ok(vsGate.pFlag > 0.3, '應有 1/3 機率直接奪旗');
  assert.ok(vsGate.exchange > 10000, '奪旗期望值應遠大於一般交換');
});

/* ================================================================== */
/* 3. AI 佈陣                                                          */
/* ================================================================== */

section('§3 AI 佈陣');

test('deployArmy 產生 30 枚且每種一枚、節點不重複', () => {
  for (const side of ['north', 'south']) {
    for (const difficulty of ['easy', 'normal', 'hard']) {
      for (const seed of [1, 7, 42, 999]) {
        const { placements } = deployArmy({ side, difficulty, rng: createRng(seed) });
        assert.equal(placements.length, 30, `${side}/${difficulty}/seed${seed} 數量錯誤`);
        const keys = new Set(placements.map((p) => p.pieceKey));
        const nodes = new Set(placements.map((p) => p.nodeId));
        assert.equal(keys.size, 30, '棋子棋種重複');
        assert.equal(nodes.size, 30, '同一格放了兩枚棋');
        for (const def of PIECES) assert.ok(keys.has(def.key), `缺少棋子 ${def.key}`);
      }
    }
  }
});

test('deployArmy 的每枚棋都落在合法佈陣區', () => {
  const zoneCheck = {
    gate: (node, zones) => zones.gates.includes(node.id),
    anchor: (node, zones) => zones.anchors.includes(node.id),
    airport: (node, zones) => zones.airports.includes(node.id),
    coastal: (node, zones) => zones.coastal.includes(node.id),
    anyLand: (node, zones) => zones.allLand.includes(node.id),
  };
  for (const side of ['north', 'south']) {
    for (const difficulty of ['easy', 'normal', 'hard']) {
      const { placements } = deployArmy({ side, difficulty, rng: createRng(123) });
      const zones = DEPLOY_ZONES[side];
      for (const pl of placements) {
        const def = PIECE_BY_KEY[pl.pieceKey];
        const node = NODE[pl.nodeId];
        assert.ok(node, `未知節點 ${pl.nodeId}`);
        const checker = zoneCheck[def.deploy] || zoneCheck.anyLand;
        assert.ok(checker(node, zones), `${def.name} 佈在非法節點 ${pl.nodeId}（${def.deploy}）`);
      }
    }
  }
});

test('城門戰術：三門全放、剛好一枚軍旗、兩枚誘餌', () => {
  for (const side of ['north', 'south']) {
    for (const seed of [3, 11, 77, 512]) {
      const { placements } = deployArmy({ side, difficulty: 'normal', rng: createRng(seed) });
      const zones = DEPLOY_ZONES[side];
      const gatePieces = placements.filter((p) => zones.gates.includes(p.nodeId));
      assert.equal(gatePieces.length, 3, '三座城門應各有一枚棋');
      const flags = gatePieces.filter((p) => p.pieceKey === 'flag');
      assert.equal(flags.length, 1, '城門上應剛好一枚軍旗');
      assert.equal(new Set(gatePieces.map((p) => p.nodeId)).size, 3, '城門不可重複');
      for (const p of gatePieces) {
        const def = PIECE_BY_KEY[p.pieceKey];
        assert.equal(def.branch, 'army', '城門上只能放陸軍棋子');
      }
    }
  }
});

test('佈陣有戰術考量：炮壘海岸、總司令行營、地雷護旗門、海空定位', () => {
  for (const side of ['north', 'south']) {
    for (const seed of [5, 23, 88]) {
      const { placements, flagGate } = deployArmy({ side, difficulty: 'normal', rng: createRng(seed) });
      const zones = DEPLOY_ZONES[side];
      const byKey = new Map(placements.map((p) => [p.pieceKey, p.nodeId]));
      const flagNode = byKey.get('flag');
      assert.equal(flagNode, flagGate, '回傳的 flagGate 與實際軍旗位置不一致');
      assert.ok(zones.gates.includes(flagNode), '軍旗必須在城門');

      // 炮壘在海岸
      assert.ok(zones.coastal.includes(byKey.get('fort')), '炮壘應佈在海邊');
      // 總司令在行營（免受敵方陸軍攻擊）
      const commanderNode = NODE[byKey.get('commander')];
      assert.equal(commanderNode.kind, 'camp', '總司令應坐鎮行營');
      // 地雷掩護軍旗城門的進逼路線（相鄰格）
      const mineNode = byKey.get('mine');
      const gateNode = NODE[flagGate];
      const mine = NODE[mineNode];
      const mineDist = Math.max(Math.abs(mine.col - gateNode.col), Math.abs(mine.row - gateNode.row));
      assert.equal(mineDist, 1, '地雷應放在軍旗城門的相鄰格');
      // 陷阱是城門誘餌之一
      assert.ok(zones.gates.includes(byKey.get('trap')), '陷阱應擔任城門誘餌');
      // 海軍 5 艘各佔一錨點
      const navyNodes = ['battleship', 'cruiser', 'gunboat', 'destroyer', 'submarine'].map((k) => byKey.get(k));
      assert.equal(new Set(navyNodes).size, 5, '海軍錨點重複');
      for (const id of navyNodes) assert.ok(zones.anchors.includes(id), '海軍必須在錨點');
      // 空軍 2 架各佔一機場
      const airNodes = ['fighter', 'scout'].map((k) => byKey.get(k));
      for (const id of airNodes) assert.ok(zones.airports.includes(id), '空軍必須在機場');
      assert.notEqual(airNodes[0], airNodes[1], '兩架飛機不可同機場');
    }
  }
});

test('軍旗城門隨機（同一 AI 不同亂數會換門）', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const { flagGate } = deployArmy({ side: 'north', difficulty: 'normal', rng: createRng(seed) });
    seen.add(flagGate);
  }
  assert.ok(seen.size >= 2, '軍旗城門應該要隨機，不能永遠同一座');
});

test('createAI.deploy 產生 engine 可接受的佈陣（雙方）', () => {
  for (const side of ['north', 'south']) {
    const ai = createAI({ side, difficulty: 'normal', seed: 4242 });
    const game = createGame({ seed: 4242 });
    const safe = guardGame(game);
    const placements = ai.deploy(safe);
    assert.equal(placements.length, 30);
    const res = game.deploy(side, placements);
    assert.equal(res.ok, true, `${side}：${(res.errors || []).join('；')}`);
    assert.equal(res.complete, true);
  }
});

test('同 seed 的 AI 佈陣可重現', () => {
  const a = createAI({ side: 'north', difficulty: 'normal', seed: 777 });
  const b = createAI({ side: 'north', difficulty: 'normal', seed: 777 });
  const pa = a.deploy(guardGame(createGame({ seed: 1 })));
  const pb = b.deploy(guardGame(createGame({ seed: 1 })));
  assert.deepEqual(pa, pb, '同 seed 的佈陣應一致');
});

/* ================================================================== */
/* 4. Belief 推理                                                      */
/* ================================================================== */

section('§4 Belief 隱藏資訊推理');

/** 找出合成視圖中的敵方城門棋 */
function enemyGatePiecesOf(view, viewer) {
  return view.pieces.filter(
    (p) => p.side !== viewer && p.alive !== false && NODE[p.nodeId]?.kind === 'gate',
  );
}

/**
 * 建立合成視圖（只給 belief 用），讓測試可以精準控制局面。
 * @param {object} opts { side, gatePieces, log, moveMap }
 */
function buildSyntheticView({ side = 'south', gatePieces = 3, log = [], moveMap = new Map() } = {}) {
  const enemy = side === 'north' ? 'south' : 'north';
  const pieces = [];
  let uid = 1;
  const push = (pSide, key, nodeId, revealed = false) => {
    const def = PIECE_BY_KEY[key];
    const visible = pSide === side || revealed;
    pieces.push({
      uid: uid++,
      side: pSide,
      key: visible ? key : null,
      name: visible ? def.name : null,
      branch: def.branch,
      nodeId: moveMap.get(uid - 1) ?? nodeId,
      alive: true,
      revealed: visible,
      landed: false,
      category: visible ? def.category : null,
    });
  };
  // 敵方城門：可控制幾枚未移動的城門棋（flag/trap/infantry 依序）
  const enemyGates = GATE_NODES[enemy];
  const gateKeys = ['flag', 'trap', 'infantry'];
  const usedKeys = new Set();
  const usedNodes = new Set();
  for (let i = 0; i < Math.min(gatePieces, 3); i++) {
    push(enemy, gateKeys[i], enemyGates[i]);
    usedKeys.add(gateKeys[i]);
    usedNodes.add(enemyGates[i]);
  }
  // 其餘敵棋塞進敵方合法佈陣區（海軍錨點、空軍機場、其他陸地）
  const enemyZone = DEPLOY_ZONES[enemy];
  const freeLand = enemyZone.allLand.filter((id) => !usedNodes.has(id) && NODE[id].kind !== 'gate');
  // 確保至少幾枚棋在海岸列（真 engine 佈陣一定有炮壘在海岸，belief 的炮壘約束才可解）
  const coastalFirst = freeLand.filter((id) => NODE[id].coastal);
  const inland = freeLand.filter((id) => !NODE[id].coastal);
  const landSlots = [...coastalFirst.slice(0, 3), ...inland, ...coastalFirst.slice(3)];
  for (const def of PIECES) {
    if (usedKeys.has(def.key)) continue;
    let nodeId;
    if (def.branch === 'air') {
      nodeId = AIRPORT_NODES[enemy][def.key === 'fighter' ? 0 : 1];
    } else if (def.branch === 'navy') {
      const navyOrder = ['battleship', 'cruiser', 'gunboat', 'destroyer', 'submarine'];
      nodeId = ANCHOR_NODES[enemy][navyOrder.indexOf(def.key)];
    } else {
      nodeId = landSlots.shift();
    }
    if (nodeId === undefined || usedNodes.has(nodeId)) continue;
    usedNodes.add(nodeId);
    push(enemy, def.key, nodeId, def.branch === 'air'); // 空軍永遠公開
  }
  // 我方：全部放在我方領土（已知棋種）
  const myZone = DEPLOY_ZONES[side];
  let myCount = 0;
  const mySlots = [...myZone.allLand];
  for (const def of PIECES) {
    let nodeId = mySlots[myCount++];
    if (nodeId === undefined) nodeId = mySlots[0];
    push(side, def.key, nodeId, true);
  }
  return {
    phase: 'play',
    turn: 1,
    sideToMove: side,
    winner: null,
    winnerReason: null,
    flagRevealed: { [side]: false, [enemy]: false },
    deploy: { north: true, south: true },
    pieces,
    log,
    lastEvent: log.length ? log[log.length - 1] : null,
  };
}

test('三城門誘餌：三枚未移動城門棋各有約 1/3 機率是軍旗', () => {
  const view = buildSyntheticView({ gatePieces: 3 });
  const belief = new Belief({ side: 'south' });
  belief.update(view);
  const enemyGatePieces = enemyGatePiecesOf(view, 'south');
  assert.equal(enemyGatePieces.length, 3, '合成局面應有三枚敵方城門棋');
  for (const piece of enemyGatePieces) {
    const dist = belief.getDistribution(piece.uid);
    const pFlag = dist.get('flag') || 0;
    assert.ok(pFlag > 0.25 && pFlag < 0.42, `城門棋的軍旗機率應約 1/3，實得 ${pFlag}`);
  }
  const gateDist = belief.flagGateDistribution();
  let sum = 0;
  for (const p of gateDist.values()) sum += p;
  assert.ok(Math.abs(sum - 1) < 0.05, `軍旗城門分布應總和 1，實得 ${sum}`);
  assert.equal(gateDist.size, 3);
});

test('只有一枚未移動城門棋 ⇒ 必是軍旗', () => {
  const view = buildSyntheticView({ gatePieces: 1 });
  const belief = new Belief({ side: 'south' });
  belief.update(view);
  const gates = enemyGatePiecesOf(view, 'south');
  assert.equal(gates.length, 1);
  const dist = belief.getDistribution(gates[0].uid);
  assert.ok((dist.get('flag') || 0) > 0.95, '唯一未移動城門棋必為軍旗');
});

test('地雷/陷阱/炮壘/軍旗不會移動：移動過的敵棋排除靜止棋種', () => {
  const view = buildSyntheticView({
    gatePieces: 3,
    log: [{ type: 'move', uid: 5, side: 'north', mode: 'walk', from: 40, to: 41 }],
  });
  const belief = new Belief({ side: 'south' });
  belief.update(view);
  const dist = belief.getDistribution(5);
  assert.ok(dist.size > 0, '應有候選棋種');
  for (const key of dist.keys()) {
    assert.ok(!isStaticKey(key), `移動過的棋不應是 ${key}`);
  }
});

test('特殊行動線索：用過炮艦砲擊 ⇒ 炮艦；用過飛彈 ⇒ 飛彈', () => {
  // 合成視圖中：uid 26 = 炮艦（海軍）、uid 17 = 飛彈（陸軍）
  const view = buildSyntheticView({
    gatePieces: 3,
    log: [
      { type: 'battle', attackerUid: 26, defenderUid: 900, special: 'bombard', outcome: 'A', eliminated: [], reveal: [] },
      { type: 'battle', attackerUid: 17, defenderUid: 901, special: 'missile', outcome: 'B', eliminated: [], reveal: [] },
    ],
  });
  const belief = new Belief({ side: 'south' });
  belief.update(view);
  assert.deepEqual([...belief.getDistribution(26).keys()], ['gunboat'], '用過炮艦砲擊必為炮艦');
  assert.deepEqual([...belief.getDistribution(17).keys()], ['missile'], '用過飛彈必為飛彈');
});

test('sampleWorld 產生一致世界：不重複、軍種相符、軍旗只在城門', () => {
  const view = buildSyntheticView({ gatePieces: 3 });
  const belief = new Belief({ side: 'south' });
  belief.update(view);
  const unknowns = belief.unknownPieces();
  assert.ok(unknowns.length > 0, '應有未知敵棋');
  const { assignment, ok } = belief.sampleWorld(view, createRng(2024));
  assert.equal(ok, true, '取樣世界應成功');
  assert.equal(assignment.size, unknowns.length, '每枚未知敵棋都應被指定棋種');
  const usedKeys = new Set();
  for (const [uid, key] of assignment) {
    assert.ok(!usedKeys.has(key), `棋種 ${key} 重複取樣`);
    usedKeys.add(key);
    const piece = view.pieces.find((p) => p.uid === uid);
    assert.ok(piece, `未知 uid ${uid}`);
    assert.equal(PIECE_BY_KEY[key].branch, piece.branch, '取樣棋種軍種必須相符');
    if (key === 'flag') {
      assert.equal(NODE[piece.nodeId].kind, 'gate', '軍旗只能出現在城門');
    }
  }
  // 城門三枚棋中應剛好有一枚被取樣為軍旗
  const gateFlags = unknowns.filter((p) => NODE[p.nodeId].kind === 'gate' && assignment.get(p.uid) === 'flag');
  assert.equal(gateFlags.length, 1, '取樣世界應剛好有一枚軍旗在城門');
});

test('真 engine 的 getView 餵給 belief 也能正常推理', () => {
  const { game } = createMatch({ seed: 555 });
  const view = game.getView('north');
  const belief = new Belief({ side: 'north' });
  belief.update(view);
  assertViewHidesEnemyKeys(view, 'north');
  const unknowns = belief.unknownPieces();
  // 敵方 30 枚 - 空軍 2 枚（永遠公開）
  assert.equal(unknowns.length, 28, `未知敵棋應為 28，實得 ${unknowns.length}`);
  const gateDist = belief.flagGateDistribution();
  let sum = 0;
  for (const p of gateDist.values()) sum += p;
  assert.ok(Math.abs(sum - 1) < 0.05, '軍旗城門分布應總和 1');
  const { assignment, ok } = belief.sampleWorld(view, createRng(99));
  assert.equal(ok, true);
  assert.equal(assignment.size, 28);
  const keys = new Set(assignment.values());
  assert.equal(keys.size, 28, '取樣棋種不應重複');
});

/* ================================================================== */
/* 5. AI vs AI 長時間對戰                                              */
/* ================================================================== */

section('§5 AI vs AI 連續對戰（合法性、隱藏資訊、效能）');

const matchAggregate = {
  decisions: 0,
  games: 0,
  maxPliesInGame: 0,
  maxMsNormal: 0,
  maxMsHard: 0,
  maxMsEasy: 0,
  winners: [],
  actionTypes: {},
  attackActions: 0,
};

test('連續 60+ 回合：每步合法、不洩漏隱藏棋種、每步 < 2 秒', () => {
  const targetDecisions = 60;
  const maxGames = 10;
  let games = 0;
  while (matchAggregate.decisions < targetDecisions && games < maxGames) {
    games++;
    const seed = 1000 + games * 37;
    const { game, ais } = createMatch({ seed, northDifficulty: 'normal', southDifficulty: 'normal' });
    const stats = runGame({ game, ais, maxPlies: 40 });
    matchAggregate.decisions += stats.decisions;
    matchAggregate.maxPliesInGame = Math.max(matchAggregate.maxPliesInGame, stats.plies);
    matchAggregate.maxMsNormal = Math.max(matchAggregate.maxMsNormal, stats.maxMs);
    matchAggregate.attackActions = (matchAggregate.attackActions || 0) + (stats.attackActions || 0);
    if (stats.winner) matchAggregate.winners.push(stats.winner);
    for (const [k, v] of Object.entries(stats.actionTypes)) {
      matchAggregate.actionTypes[k] = (matchAggregate.actionTypes[k] || 0) + v;
    }
    console.log(
      `    game${games}: seed=${seed} plies=${stats.plies} winner=${stats.winner || '-'} ` +
        `maxMs=${stats.maxMs} types=${JSON.stringify(stats.actionTypes)}`,
    );
  }
  assert.ok(
    matchAggregate.decisions >= targetDecisions,
    `應連續跑滿 ${targetDecisions} 步，實得 ${matchAggregate.decisions} 步`,
  );
  assert.ok(matchAggregate.maxPliesInGame >= 20, 'AI vs AI 至少應能打到 20+ 回合而不速崩');
});

test('同一局連續 60 步不中斷（不崩潰、不卡死）', () => {
  // easy vs easy 通常能打超過 60 步，用最壞情況重試幾個 seed
  let best = 0;
  let lastStats = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const seed = 5000 + attempt * 97;
    const { game, ais } = createMatch({ seed, northDifficulty: 'easy', southDifficulty: 'easy' });
    const stats = runGame({ game, ais, maxPlies: 70 });
    lastStats = stats;
    best = Math.max(best, stats.plies);
    matchAggregate.decisions += stats.decisions;
    matchAggregate.maxPliesInGame = Math.max(matchAggregate.maxPliesInGame, stats.plies);
    matchAggregate.maxMsEasy = Math.max(matchAggregate.maxMsEasy, stats.maxMs);
    if (best >= 60) break;
  }
  console.log(`    連續對戰步數：${best}（最後一局 winner=${(lastStats && lastStats.winner) || '-'}）`);
  assert.ok(best >= 60, `同一局應至少連續跑 60 步，實得 ${best} 步`);
});

test('hard 難度：決策合法、每步 < 2 秒、能實際完成戰鬥', () => {
  const seed = 2024;
  const { game, ais } = createMatch({ seed, northDifficulty: 'hard', southDifficulty: 'normal' });
  const stats = runGame({ game, ais, maxPlies: 16 });
  matchAggregate.maxMsHard = Math.max(matchAggregate.maxMsHard, stats.maxMs);
  matchAggregate.decisions += stats.decisions;
  console.log(
    `    hard vs normal: plies=${stats.plies} maxMs=${stats.maxMs} winner=${stats.winner || '-'} ` +
      `types=${JSON.stringify(stats.actionTypes)}`,
  );
  assert.ok(stats.sideDecisions.north > 0, 'hard AI 應至少行動一次');
  assert.ok(stats.maxMs < 2000, `hard 決策超過 2 秒：${stats.maxMs}ms`);
});

test('easy 難度：決策合法且不會卡死', () => {
  const { game, ais } = createMatch({ seed: 3030, northDifficulty: 'easy', southDifficulty: 'easy' });
  const stats = runGame({ game, ais, maxPlies: 14 });
  matchAggregate.maxMsEasy = stats.maxMs;
  matchAggregate.decisions += stats.decisions;
  assert.ok(stats.decisions >= 5, 'easy AI 應能正常行棋');
  assert.ok(stats.maxMs < 2000);
});

test('同 seed 的 AI 決策可重現（公平性測試的基礎）', () => {
  const seed = 4040;
  const { game } = createMatch({ seed, deploy: true });
  const before = game.getView('north');
  assert.ok(!before.winner, '測試局面不應已結束');
  const aiA = createAI({ side: 'north', difficulty: 'normal', seed: 999 });
  const aiB = createAI({ side: 'north', difficulty: 'normal', seed: 999 });
  const actA = aiA.chooseAction(guardGame(game));
  const actB = aiB.chooseAction(guardGame(game));
  assert.ok(sameAction(actA, actB), '同 seed 的 AI 對同一局面應做出相同決策');
});

/* ================================================================== */
/* 6. 公平性（不得偷看隱藏資訊）                                       */
/* ================================================================== */

section('§6 公平性：不偷看敵方隱藏棋種');

test('AI 只使用允許的 API（讀 game.state 會立刻爆錯）', () => {
  const { game, ais } = createMatch({ seed: 606 });
  // guardGame 的 state getter 會丟錯；所有以上對戰都已用 guardGame 跑過。
  // 這裡再做一次明確驗證：guard 包裝本身確實會阻擋偷看。
  const safe = guardGame(game);
  assert.equal(typeof safe.getView, 'function');
  assert.throws(() => safe.state, /不得直接讀取 game\.state/);
  const ai = createAI({ side: 'north', difficulty: 'normal', seed: 1 });
  const action = ai.chooseAction(safe);
  assert.ok(action && action.type);
  // 用真正遊戲物件跑也應正常（AI 不依賴 wrapper 才能運作）
  const action2 = ais.north.chooseAction(guardGame(game));
  assert.ok(action2 && action2.type);
});

test('偷看測試：交換敵方隱藏棋種後，AI 決策必須不變', () => {
  // 先建立一個有隱藏棋種的中局
  let setup = null;
  for (let attempt = 0; attempt < 8 && !setup; attempt++) {
    const seed = 7070 + attempt * 13;
    const { game, ais } = createMatch({ seed, northDifficulty: 'normal', southDifficulty: 'normal' });
    const stats = runGame({ game, ais, maxPlies: 6 });
    if (!game.getView('north').winner && stats.plies >= 4) {
      setup = game;
    }
  }
  assert.ok(setup, '找不到合適的中局來做公平性測試');
  const baseView = setup.getView('north');
  assert.ok(baseView.pieces.some((p) => p.side === 'south' && !p.key && p.branch !== 'air'), '應有隱藏敵棋');

  for (const difficulty of ['normal', 'hard']) {
    const aiSeed = difficulty === 'normal' ? 31415 : 27182;
    // 建立兩個「公開資訊完全相同、隱藏棋種不同」的世界
    let variantA = null;
    let variantB = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const cloneA = permuteHiddenEnemyKeys(setup, 'north', createRng(100 + attempt));
      const cloneB = permuteHiddenEnemyKeys(setup, 'north', createRng(200 + attempt));
      const legalA = cloneA.getLegalActions('north');
      const legalB = cloneB.getLegalActions('north');
      const vA = cloneA.getView('north');
      const vB = cloneB.getView('north');
      if (viewPublicJson(vA) !== viewPublicJson(vB)) continue;
      if (JSON.stringify(legalA) !== JSON.stringify(legalB)) continue;
      // 真實隱藏棋種必須真的不同，否則測試沒有意義
      let diff = 0;
      for (const p of vA.pieces) {
        if (p.side === 'north' || !p.alive || p.branch === 'air') continue;
        const realA = pieceKeyOf(cloneA, p.uid);
        const realB = pieceKeyOf(cloneB, p.uid);
        if (realA !== realB) diff++;
      }
      if (diff === 0) continue;
      variantA = cloneA;
      variantB = cloneB;
      break;
    }
    assert.ok(variantA && variantB, `${difficulty}：找不到隱藏棋種不同的等價局面`);
    const aiA = createAI({ side: 'north', difficulty, seed: aiSeed });
    const aiB = createAI({ side: 'north', difficulty, seed: aiSeed });
    const actA = aiA.chooseAction(guardGame(variantA));
    const actB = aiB.chooseAction(guardGame(variantB));
    assert.ok(
      sameAction(actA, actB),
      `${difficulty}：隱藏棋種不同導致 AI 決策改變（可能偷看）\nA=${JSON.stringify(actA)}\nB=${JSON.stringify(actB)}`,
    );
  }
});

test('偷看測試：snapshot 內隱藏棋種被換成假值時決策仍不變', () => {
  const { game } = createMatch({ seed: 8080, northDifficulty: 'normal', southDifficulty: 'normal' });
  // 讓局面動幾步，製造更多隱藏資訊
  const tempAIs = {
    north: createAI({ side: 'north', difficulty: 'normal', seed: 1 }),
    south: createAI({ side: 'south', difficulty: 'normal', seed: 2 }),
  };
  runGame({ game, ais: tempAIs, maxPlies: 4 });
  const view = game.getView('north');
  if (view.winner) return; // 極少數情況（例如速勝）直接略過

  for (const difficulty of ['normal', 'hard']) {
    const aiSeed = difficulty === 'normal' ? 555 : 666;
    const aiReal = createAI({ side: 'north', difficulty, seed: aiSeed });
    const actReal = aiReal.chooseAction(guardGame(game));

    // 把 snapshot 中所有「對 north 隱藏」的敵棋 key 換成同軍種的假值
    const fakeForBranch = (branch) =>
      branch === 'navy' ? 'destroyer' : branch === 'air' ? 'scout' : 'infantry';
    const poisoned = guardGame(game, {
      snapshot: (real) => poisonSnapshotForAI(real, 'north', view, fakeForBranch),
    });
    const aiPoisoned = createAI({ side: 'north', difficulty, seed: aiSeed });
    const actPoisoned = aiPoisoned.chooseAction(poisoned);
    assert.ok(
      sameAction(actReal, actPoisoned),
      `${difficulty}：snapshot 假 key 影響了決策（AI 可能直接使用 snapshot 內真 key）`,
    );
  }
});

/* ================================================================== */
/* 7. 決策品質抽樣                                                     */
/* ================================================================== */

section('§7 AI 決策品質（基本行為檢查）');

test('AI 不會整場只動同一枚棋（反打轉機制）', () => {
  const { game, ais } = createMatch({ seed: 9090, northDifficulty: 'normal', southDifficulty: 'normal' });
  const movedUids = new Set();
  const stats = runGame({
    game,
    ais,
    maxPlies: 20,
    onPly: ({ side, action }) => {
      if (side === 'north' && action.type !== 'pass') movedUids.add(action.pieceUid);
    },
  });
  assert.ok(stats.decisions > 0);
  assert.ok(movedUids.size >= 2, `AI 只動了 ${movedUids.size} 枚棋，疑似卡住`);
});

test('AI vs AI 實戰會主動攻擊（不是只會走位）', () => {
  assert.ok(
    (matchAggregate.attackActions || 0) > 0,
    `整段 AI vs AI 對戰完全沒有攻擊行動（attackActions=${matchAggregate.attackActions || 0}）`,
  );
});

/* ================================================================== */
/* 結果                                                                */
/* ================================================================== */

const failed = testResults.filter((r) => !r.ok);
const passed = testResults.filter((r) => r.ok);
const totalMs = testResults.reduce((s, r) => s + r.ms, 0);

console.log('\n' + '='.repeat(64));
console.log(
  `AI 測試結果：${passed.length} 通過 / ${failed.length} 失敗（共 ${testResults.length} 項，${(totalMs / 1000).toFixed(2)}s）`,
);
console.log(
  `AI vs AI：${matchAggregate.decisions} 步、最長單局 ${matchAggregate.maxPliesInGame} 步；` +
    `決策耗時 normal 最慢 ${matchAggregate.maxMsNormal}ms、hard 最慢 ${matchAggregate.maxMsHard}ms、` +
    `easy 最慢 ${matchAggregate.maxMsEasy}ms`,
);
console.log(`動作分布：${JSON.stringify(matchAggregate.actionTypes)}`);
if (failed.length) {
  console.log('\n失敗項目：');
  for (const f of failed) console.log(`  ✗ ${f.name}`);
  process.exitCode = 1;
} else {
  console.log('全部通過 ✓');
}
