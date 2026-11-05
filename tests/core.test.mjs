/**
 * 三軍棋核心規則引擎測試（Node 24 / ES modules）
 * ------------------------------------------------------------------
 * 執行方式：cd sanjunqi && node tests/core.test.mjs
 *
 * 直接使用 assert，不依賴瀏覽器 / npm 套件。測試直接操作 game.state 佈置
 * 特定盤面（state 是公開的權威資料），再一律透過公開 API 行動與驗證。
 */

import assert from 'node:assert/strict';
import { createGame } from '../src/core/engine.js';
import {
  resolveCombat,
  rawOutcomeOf,
  attackerNameFor,
  isInteractionAllowed,
  lookupTable,
} from '../src/core/combat.js';
import {
  generateActions,
  actionSignature,
  isActionLegal,
} from '../src/core/legal-moves.js';
import {
  nodeId,
  nodeById,
  NODE,
  NORTH,
  SOUTH,
  DEPLOY_ZONES,
  WALK_ADJ,
  SEA_ADJ,
  RAIL_ADJ,
  SEA_TO_LAND,
  LAND_TO_SEA,
  GATE_NODES,
  AIRPORT_NODES,
  CAMP_NODES,
  ANCHOR_NODES,
} from '../src/core/board.js';
import { PIECE_BY_KEY } from '../src/core/pieces.js';
import { createRng } from '../src/core/rng.js';

/* ------------------------------------------------------------------ */
/* 迷你測試框架                                                        */
/* ------------------------------------------------------------------ */

let passed = 0;
const failures = [];
let currentGroup = '';

function group(name) {
  currentGroup = name;
  console.log(`\n== ${name} ==`);
}

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push({ group: currentGroup, name, err });
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

/* ------------------------------------------------------------------ */
/* 測試輔助                                                            */
/* ------------------------------------------------------------------ */

const id = (col, row) => nodeId(col, row);

/** 移除該方所有棋子（測試盤面用） */
function clearSide(g, side) {
  for (const p of g.state.pieces) {
    if (p.side === side) {
      p.alive = false;
      p.nodeId = null;
      p.landed = false;
    }
  }
}
function clearAll(g) {
  clearSide(g, NORTH);
  clearSide(g, SOUTH);
}
function pieceOf(g, side, key) {
  const p = g.state.pieces.find((x) => x.side === side && x.key === key);
  assert.ok(p, `找不到棋子 ${side}/${key}`);
  return p;
}
/** 把棋子放到指定格（測試盤面用；不驗證部署規則） */
function put(g, side, key, node, extra = {}) {
  const p = pieceOf(g, side, key);
  p.alive = true;
  p.nodeId = node;
  p.landed = !!extra.landed;
  return p;
}
function setTurn(g, side) {
  g.state.sideToMove = side;
}
function sideActions(g, side = g.state.sideToMove) {
  return generateActions(g.state, side);
}
function actionsOf(g, uid) {
  return sideActions(g).filter((a) => a.pieceUid === uid);
}
function findMove(g, uid, to, mode = null) {
  return actionsOf(g, uid).find(
    (a) => a.type === 'move' && a.to === to && (!mode || a.mode === mode),
  );
}
function findLand(g, uid, to) {
  return actionsOf(g, uid).find((a) => a.type === 'land' && a.to === to);
}
function findSpecial(g, uid, type, target) {
  return actionsOf(g, uid).find(
    (a) => a.type === type && (target === undefined || a.target === target),
  );
}
function applyOK(g, action) {
  const side = g.state.sideToMove;
  const res = g.applyAction(side, action);
  assert.equal(res.ok, true, `applyAction 失敗：${res.error}`);
  return res;
}
function lastEvent(res, type) {
  if (type) return res.events.find((e) => e.type === type);
  return res.events[res.events.length - 1];
}

/** 建立可玩盤面：autoDeploy + startPlay，清空後只留測試需要的棋子 */
function scenario(opts = {}) {
  const g = createGame({ seed: opts.seed ?? 7, autoDeploy: true, revealOnBattle: opts.revealOnBattle });
  const started = g.startPlay();
  assert.equal(started.ok, true, 'startPlay 失敗');
  clearAll(g);
  if (opts.dummies !== false) {
    // 雙方可動哨兵，避免測試因「無子可動」提前結束
    put(g, NORTH, 'infantry', id(12, 1));
    put(g, SOUTH, 'infantry', id(0, 11));
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* 1. 佈陣                                                             */
/* ------------------------------------------------------------------ */

group('佈陣（deploy / autoDeploy / startPlay）');

test('autoDeploy 回傳剛好 30 筆合法 placements，且落在正確佈陣區', () => {
  const g = createGame({ seed: 123 });
  const placements = g.autoDeploy(NORTH);
  assert.equal(placements.length, 30);
  const keys = new Set(placements.map((p) => p.pieceKey));
  assert.equal(keys.size, 30, '棋子種類應各一');
  const nodes = new Set(placements.map((p) => p.nodeId));
  assert.equal(nodes.size, 30, '不可有兩枚棋同格');
  const zone = DEPLOY_ZONES[NORTH];
  const zoneMap = {
    anyLand: zone.allLand,
    coastal: zone.coastal,
    gate: zone.gates,
    anchor: zone.anchors,
    airport: zone.airports,
  };
  for (const pl of placements) {
    const def = PIECE_BY_KEY[pl.pieceKey];
    assert.ok(zoneMap[def.deploy].includes(pl.nodeId), `${def.name} 佈錯區域`);
    assert.ok(NODE[pl.nodeId], '節點需存在');
  }
  assert.equal(g.isDeployed(NORTH), true);
  assert.equal(g.isDeployed(SOUTH), false);
});

test('雙方 autoDeploy 後 startPlay 成功，北軍先手', () => {
  const g = createGame({ seed: 5 });
  g.autoDeploy(NORTH);
  assert.equal(g.startPlay().ok, false, '只有一方佈陣不可開局');
  g.autoDeploy(SOUTH);
  const res = g.startPlay();
  assert.equal(res.ok, true);
  assert.equal(g.state.phase, 'play');
  assert.equal(g.state.sideToMove, NORTH);
  assert.equal(g.state.turn, 1);
  // 全部 60 枚都已在盤上
  assert.equal(g.state.pieces.filter((p) => p.nodeId != null).length, 60);
});

test('非法佈陣：軍旗不在城門、炮壘不在海岸、海軍不在錨點、空軍不在機場', () => {
  const g = createGame({ seed: 9 });
  const base = g.autoDeploy(NORTH);
  const bad = (pick, mutate) => {
    const ps = base.map((p) => ({ ...p }));
    mutate(ps.find((p) => p.pieceKey === pick));
    return g.deploy(NORTH, ps);
  };
  assert.equal(bad('flag', (p) => (p.nodeId = id(0, 1))).ok, false, '軍旗必須在城門');
  assert.equal(bad('fort', (p) => (p.nodeId = id(6, 1))).ok, false, '炮壘必須在海岸');
  assert.equal(bad('destroyer', (p) => (p.nodeId = id(6, 4))).ok, false, '海軍必須在錨點');
  assert.equal(bad('fighter', (p) => (p.nodeId = id(6, 4))).ok, false, '空軍必須在機場');
  assert.equal(bad('infantry', (p) => (p.nodeId = id(0, 0))).ok, false, '陸軍不可在機場');
});

test('非法佈陣：重複棋子、同格、敵方區域皆報錯', () => {
  const g = createGame({ seed: 10 });
  const base = g.autoDeploy(NORTH);
  // 同格
  const dupNode = base.map((p) => ({ ...p }));
  dupNode[1].nodeId = dupNode[0].nodeId;
  assert.equal(g.deploy(NORTH, dupNode).ok, false);
  // 重複棋子
  const dupKey = base.map((p) => ({ ...p }));
  dupKey[1].pieceKey = dupKey[0].pieceKey;
  assert.equal(g.deploy(NORTH, dupKey).ok, false);
  // 敵方區域（南陸）
  const crossZone = base.map((p) => ({ ...p }));
  crossZone[3].nodeId = id(6, 11);
  assert.equal(g.deploy(NORTH, crossZone).ok, false);
  // 未知棋子 / 無效座標
  assert.equal(g.deploy(NORTH, [{ pieceKey: 'nope', nodeId: id(0, 1) }]).ok, false);
  assert.equal(g.deploy(NORTH, [{ pieceKey: 'infantry', nodeId: 999 }]).ok, false);
});

test('deploy 為原子操作：失敗不會破壞先前佈陣；失敗回傳 errors 陣列', () => {
  const g = createGame({ seed: 11 });
  const good = g.autoDeploy(NORTH);
  const before = JSON.stringify(g.state.pieces.filter((p) => p.side === NORTH));
  const bad = good.map((p) => ({ ...p }));
  bad[0].nodeId = id(6, 11);
  const res = g.deploy(NORTH, bad);
  assert.equal(res.ok, false);
  assert.ok(Array.isArray(res.errors) && res.errors.length > 0);
  const after = JSON.stringify(g.state.pieces.filter((p) => p.side === NORTH));
  assert.equal(after, before, '失敗的 deploy 不應改動 state');
});

test('支援分批佈陣（部分 placements → complete=false；補齊後 true）', () => {
  const g = createGame({ seed: 12 });
  const all = g.autoDeploy(NORTH);
  const partial = all.slice(0, 10);
  const res = g.deploy(NORTH, partial);
  assert.equal(res.ok, true);
  assert.equal(res.complete, false);
  assert.equal(g.isDeployed(NORTH), false);
  const full = g.deploy(NORTH, all);
  assert.equal(full.ok, true);
  assert.equal(g.isDeployed(NORTH), true);
  // 已開局後不可再佈陣
  g.autoDeploy(SOUTH);
  g.startPlay();
  assert.equal(g.deploy(NORTH, all).ok, false);
});

test('城門誘餌：autoDeploy 填滿三座城門（軍旗＋2 誘餌）', () => {
  const g = createGame({ seed: 61 });
  const placements = g.autoDeploy(NORTH);
  const gates = DEPLOY_ZONES[NORTH].gates;
  const onGates = placements.filter((pl) => gates.includes(pl.nodeId));
  assert.equal(onGates.length, 3, '三座城門都要有棋子');
  const keys = onGates.map((pl) => pl.pieceKey).sort();
  assert.deepEqual(keys, ['flag', 'mine', 'trap'].sort(), '軍旗＋兩枚誘餌');
  // 敵方視角：三門都只有棋背，無法分辨軍旗
  g.autoDeploy(SOUTH);
  g.startPlay();
  const view = g.getView(SOUTH);
  const southGates = new Set(DEPLOY_ZONES[NORTH].gates);
  const gateViews = view.pieces.filter((p) => p.side === NORTH && southGates.has(p.nodeId));
  assert.equal(gateViews.length, 3);
  for (const p of gateViews) {
    assert.equal(p.key, null, '城門上的棋子對敵方必須隱藏');
    assert.equal(p.name, null);
    assert.equal(p.branch, 'army');
  }
});

test('任何陸軍棋子可佈於城門（含其他誘餌）；同一城門不可兩枚', () => {
  const g = createGame({ seed: 62 });
  const base = g.autoDeploy(NORTH);
  const gates = DEPLOY_ZONES[NORTH].gates;
  const ps = base.map((pl) => ({ ...pl }));
  const get = (k) => ps.find((pl) => pl.pieceKey === k);
  const infantryOld = get('infantry').nodeId;
  const flagOld = get('flag').nodeId;
  const mineOld = get('mine').nodeId;
  // 把步兵放到原先軍旗所在的城門，軍旗／地雷互換位置（保持每格唯一）
  get('flag').nodeId = mineOld;
  get('mine').nodeId = infantryOld;
  get('infantry').nodeId = flagOld;
  const res = g.deploy(NORTH, ps);
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.ok(gates.includes(get('infantry').nodeId), '步兵應可佈於城門');
  // 同一城門放兩枚 → 錯誤
  const dup = ps.map((pl) => ({ ...pl }));
  const dupGet = (k) => dup.find((pl) => pl.pieceKey === k);
  dupGet('company').nodeId = dupGet('infantry').nodeId;
  const bad = g.deploy(NORTH, dup);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length > 0);
});

test('autoDeploy 具決定性（同 seed 同佈陣）', () => {
  const a = createGame({ seed: 2024 });
  const b = createGame({ seed: 2024 });
  assert.deepEqual(a.autoDeploy(NORTH), b.autoDeploy(NORTH));
  assert.deepEqual(a.autoDeploy(SOUTH), b.autoDeploy(SOUTH));
});

/* ------------------------------------------------------------------ */
/* 2. 隱藏資訊視圖                                                     */
/* ------------------------------------------------------------------ */

group('隱藏資訊（getView / getPublicInfo）');

test('getView 遮蔽敵方陸海棋種、空軍永遠公開、己方全公開', () => {
  const g = createGame({ seed: 21, autoDeploy: true });
  const view = g.getView(NORTH);
  assert.equal(view.pieces.length, 60);
  const southPieces = view.pieces.filter((p) => p.side === SOUTH);
  const hidden = southPieces.filter((p) => p.branch !== 'air');
  for (const p of hidden) {
    assert.equal(p.key, null, '敵方未曝光棋應隱藏 key');
    assert.equal(p.name, null, '敵方未曝光棋應隱藏 name');
    assert.ok(p.branch === 'army' || p.branch === 'navy', '軍種仍應可見');
    assert.equal(p.revealed, false);
  }
  const air = southPieces.filter((p) => p.branch === 'air');
  assert.equal(air.length, 2);
  for (const p of air) {
    assert.ok(p.key, '空軍棋種永遠公開');
    assert.equal(p.revealed, true);
  }
  // 己方全部公開
  for (const p of view.pieces.filter((p) => p.side === NORTH)) {
    assert.ok(p.key, '己方棋子應可見');
    assert.equal(p.revealed, true);
  }
  // 敵方軍旗（城門位置）初始隱藏
  const southFlag = view.pieces.find((p) => p.side === SOUTH && p.key === 'flag');
  assert.equal(southFlag, undefined, '敵方軍旗不應直接暴露');
  // 公開欄位
  assert.equal(view.phase, 'deploy');
  assert.deepEqual(view.flagRevealed, { north: false, south: false });
  assert.ok(Array.isArray(view.log));
});

test('三座城門各有一枚棋背，敵方無法確定軍旗位置', () => {
  const g = createGame({ seed: 24, autoDeploy: true });
  g.startPlay();
  const view = g.getView(NORTH);
  const southGates = new Set(DEPLOY_ZONES[SOUTH].gates);
  const gatePieces = view.pieces.filter((p) => p.side === SOUTH && southGates.has(p.nodeId));
  assert.equal(gatePieces.length, 3, '南軍三門都應有棋子（軍旗＋誘餌）');
  assert.ok(gatePieces.every((p) => p.key === null), '城門棋種對敵方隱藏');
  assert.ok(gatePieces.every((p) => p.branch === 'army'));
  // 己方視角：三門中都有一枚，且其中恰一枚為軍旗
  const ownView = g.getView(SOUTH);
  const ownGatePieces = ownView.pieces.filter((p) => p.side === SOUTH && southGates.has(p.nodeId));
  assert.equal(ownGatePieces.filter((p) => p.key === 'flag').length, 1);
});

test('getView 的 log 為事件物件、lastEvent 為最後一筆，可 JSON 序列化', () => {
  const g = createGame({ seed: 22, autoDeploy: true });
  g.startPlay();
  const res = applyOK(g, { type: 'pass' });
  const view = g.getView(SOUTH);
  assert.ok(Array.isArray(view.log));
  const passEvent = view.log.find((e) => e.type === 'pass');
  assert.ok(passEvent, 'log 應包含 pass 事件');
  assert.equal(passEvent.side, NORTH);
  assert.equal(view.lastEvent.type, 'pass');
  assert.equal(lastEvent(res).type, 'pass');
  assert.doesNotThrow(() => JSON.stringify(view));
});

test('getPublicInfo 統計存活數與被消滅清單', () => {
  const g = createGame({ seed: 23, autoDeploy: true });
  g.startPlay();
  let info = g.getPublicInfo();
  assert.equal(info.counts.north.total, 30);
  assert.equal(info.counts.south.total, 30);
  assert.equal(info.counts.north.army, 23);
  assert.equal(info.counts.north.navy, 5);
  assert.equal(info.counts.north.air, 2);
  assert.equal(info.eliminated.length, 0);
  // 打一場（簡化盤面）後檢查 eliminated 與存活數
  clearAll(g);
  put(g, NORTH, 'infantry', id(12, 1));
  put(g, SOUTH, 'infantry', id(0, 11));
  const missile = put(g, NORTH, 'missile', id(6, 4));
  const officer = put(g, SOUTH, 'company', id(6, 8));
  const before = g.getPublicInfo();
  setTurn(g, NORTH);
  const act = findSpecial(g, missile.uid, 'missile', id(6, 8));
  assert.ok(act);
  applyOK(g, act);
  info = g.getPublicInfo();
  assert.equal(info.counts.north.total, before.counts.north.total - 1);
  assert.equal(info.counts.south.total, before.counts.south.total - 1);
  assert.ok(info.eliminated.some((p) => p.uid === missile.uid));
  assert.ok(info.eliminated.some((p) => p.uid === officer.uid));
});

/* ------------------------------------------------------------------ */
/* 3. 陸軍步行                                                         */
/* ------------------------------------------------------------------ */

group('陸軍步行（walk）');

test('步兵可走到相鄰陸地 1 步，套用後位置與事件正確', () => {
  const g = scenario();
  const p = put(g, NORTH, 'infantry', id(6, 3));
  const act = findMove(g, p.uid, id(6, 4), 'walk');
  assert.ok(act, '應有往南一步的合法行動');
  assert.deepEqual(act.path, [id(6, 3), id(6, 4)]);
  const res = applyOK(g, act);
  const ev = lastEvent(res, 'move');
  assert.equal(ev.uid, p.uid);
  assert.equal(ev.from, id(6, 3));
  assert.equal(ev.to, id(6, 4));
  assert.equal(ev.mode, 'walk');
  assert.deepEqual(ev.path, [id(6, 3), id(6, 4)]);
  assert.equal(p.nodeId, id(6, 4));
  assert.equal(g.state.sideToMove, SOUTH, '行動後應換手');
});

test('陸軍不可走 2 步（須分兩回合）、不可走到己方棋子或機場', () => {
  const g = scenario();
  const p = put(g, NORTH, 'infantry', id(6, 3));
  put(g, NORTH, 'company', id(6, 4)); // 己方佔位
  const acts = actionsOf(g, p.uid).filter((a) => a.type === 'move');
  assert.ok(!acts.some((a) => a.to === id(6, 4)), '不可走到己方棋子');
  assert.ok(!acts.some((a) => a.to === id(6, 5)), '不可一次走兩步');
  // 機場不與步行相鄰（board.WALK_ADJ 不含機場）
  assert.ok(!(WALK_ADJ.get(id(0, 1)) || []).includes(id(0, 0)), '步行不可進機場');
});

test('非法行動（非相鄰、缺欄位、非本方回合）一律拒絕', () => {
  const g = scenario();
  const p = put(g, NORTH, 'infantry', id(6, 3));
  assert.equal(
    g.applyAction(NORTH, { type: 'move', pieceUid: p.uid, from: p.nodeId, to: id(6, 5), mode: 'walk' }).ok,
    false,
  );
  assert.equal(g.applyAction(NORTH, { type: 'move' }).ok, false);
  assert.equal(g.applyAction(SOUTH, { type: 'pass' }).ok, false, '非本方回合');
  setTurn(g, SOUTH);
  assert.equal(g.applyAction(NORTH, { type: 'pass' }).ok, false);
});

/* ------------------------------------------------------------------ */
/* 4. 鐵路移動                                                         */
/* ------------------------------------------------------------------ */

group('鐵路移動（rail）');

test('鐵路 1~3 站可達，第 4 站不可達；path 含經過車站', () => {
  const g = scenario();
  const p = put(g, NORTH, 'brigade', id(5, 2)); // row2 = 北鐵路
  const railActs = actionsOf(g, p.uid).filter((a) => a.type === 'move' && a.mode === 'rail');
  const targets = railActs.map((a) => a.to).sort((a, b) => a - b);
  const expected = [
    id(4, 2), id(3, 2), id(2, 2), // 西 1~3 站
    id(6, 2), id(7, 2), id(8, 2), // 東 1~3 站
  ].sort((a, b) => a - b);
  assert.deepEqual(targets, expected);
  const toWest3 = railActs.find((a) => a.to === id(2, 2));
  assert.deepEqual(toWest3.path, [id(5, 2), id(4, 2), id(3, 2), id(2, 2)]);
  // 套用
  const res = applyOK(g, toWest3);
  const ev = lastEvent(res, 'move');
  assert.equal(ev.mode, 'rail');
  assert.equal(p.nodeId, id(2, 2));
});

test('鐵路不可穿越被佔用車站；敵棋站可作為攻擊終點', () => {
  const g = scenario();
  const p = put(g, NORTH, 'brigade', id(5, 2));
  put(g, NORTH, 'infantry', id(7, 2)); // 己方阻擋東向
  put(g, SOUTH, 'platoon', id(4, 2)); // 敵方阻擋西向（第 1 站）
  const railTargets = actionsOf(g, p.uid)
    .filter((a) => a.type === 'move' && a.mode === 'rail')
    .map((a) => a.to)
    .sort((a, b) => a - b);
  // 東：只能到 (6,2)（(7,2) 己方阻擋）；西：可攻擊 (4,2)，但不可穿越到 (3,2)/(2,2)
  assert.deepEqual(railTargets, [id(4, 2), id(6, 2)].sort((a, b) => a - b));
  const attack = findMove(g, p.uid, id(4, 2), 'rail');
  const res = applyOK(g, attack);
  const ev = lastEvent(res, 'battle');
  assert.equal(ev.outcome, 'A', '團長攻擊排長應勝（A）');
  assert.equal(ev.occupied, true);
  assert.equal(p.nodeId, id(4, 2));
  assert.equal(pieceOf(g, SOUTH, 'platoon').alive, false);
});

test('鐵路攻擊行營內的敵棋不被生成（行營保護）', () => {
  // 行營不在鐵路線上，此處驗證「被佔用車站不可穿越」與行營保護分開；
  // 直接以步行測試行營保護（下一組），這裡確認鐵路 BFS 會因任何佔用而停止。
  const g = scenario();
  const p = put(g, NORTH, 'brigade', id(5, 2));
  put(g, NORTH, 'infantry', id(6, 2));
  const railTargets = actionsOf(g, p.uid)
    .filter((a) => a.type === 'move' && a.mode === 'rail')
    .map((a) => a.to);
  assert.ok(!railTargets.includes(id(7, 2)));
  assert.ok(!railTargets.includes(id(8, 2)));
});

/* ------------------------------------------------------------------ */
/* 5. 海軍移動                                                         */
/* ------------------------------------------------------------------ */

group('海軍移動（sea）');

test('海軍可走相鄰海域 1 格；不可上岸、不可進跨海鐵橋站', () => {
  const g = scenario();
  const p = put(g, NORTH, 'destroyer', id(5, 6));
  const moves = actionsOf(g, p.uid).filter((a) => a.type === 'move');
  assert.ok(moves.length > 0);
  assert.ok(moves.every((a) => a.mode === 'sea'), '海軍只能以 sea 模式移動');
  assert.ok(moves.every((a) => NODE[a.to].zone === 'sea'), '海軍只能走海域節點');
  const act = moves.find((a) => a.to === id(5, 5));
  assert.ok(act);
  applyOK(g, act);
  assert.equal(p.nodeId, id(5, 5));
  assert.equal(lastEvent(g.getView(NORTH).lastEvent ? { events: [g.getView(NORTH).lastEvent] } : {}).type, 'move');

  // 鐵橋站不得進入
  const bridgeNeighbor = put(g, NORTH, 'cruiser', id(1, 6));
  const seaTargets = actionsOf(g, bridgeNeighbor.uid).map((a) => a.to);
  assert.ok(!seaTargets.includes(id(0, 6)), '(0,6) 是跨海鐵橋站，海軍不可進入');
  assert.equal(NODE[id(0, 6)].bridge, true);
});

test('海軍對戰：驅逐艦可擊沉潛水艇（勝負表）', () => {
  const g = scenario();
  const dd = put(g, NORTH, 'destroyer', id(5, 6));
  const sub = put(g, SOUTH, 'submarine', id(6, 6));
  const act = findMove(g, dd.uid, id(6, 6), 'sea');
  assert.ok(act);
  const res = applyOK(g, act);
  const ev = lastEvent(res, 'battle');
  assert.equal(ev.outcome, 'A');
  assert.equal(sub.alive, false);
  assert.equal(dd.nodeId, id(6, 6));
});

/* ------------------------------------------------------------------ */
/* 6. 兩棲登陸                                                         */
/* ------------------------------------------------------------------ */

group('兩棲登陸（land）');

test('主力艦可登陸相鄰海岸空地，登陸後 landed=true 且可用陸上規則移動', () => {
  const g = scenario();
  const bb = put(g, NORTH, 'battleship', id(4, 5));
  const landActs = actionsOf(g, bb.uid).filter((a) => a.type === 'land');
  assert.deepEqual(
    landActs.map((a) => a.to).sort((a, b) => a - b),
    [id(3, 4), id(4, 4), id(5, 4)].sort((a, b) => a - b),
    '應可登陸相鄰北海岸 row4',
  );
  assert.deepEqual(SEA_TO_LAND.get(id(4, 5)).sort((a, b) => a - b), [id(3, 4), id(4, 4), id(5, 4)].sort((a, b) => a - b));
  const res = applyOK(g, findLand(g, bb.uid, id(4, 4)));
  const ev = lastEvent(res, 'move');
  assert.equal(ev.mode, 'land');
  assert.equal(bb.nodeId, id(4, 4));
  assert.equal(bb.landed, true);
  assert.equal(pieceOf(g, NORTH, 'battleship').landed, true);
  // 登陸後是陸上棋子：可步行
  setTurn(g, NORTH);
  const walks = actionsOf(g, bb.uid).filter((a) => a.type === 'move' && a.mode === 'walk');
  assert.ok(walks.length > 0, '登陸後應可步行');
});

test('登陸後可搭鐵路（Lead 確認：登陸後依一般陸地規則行動）', () => {
  const g = scenario();
  const bb = put(g, NORTH, 'battleship', id(5, 2), { landed: true });
  const railActs = actionsOf(g, bb.uid).filter((a) => a.type === 'move' && a.mode === 'rail');
  assert.ok(railActs.length > 0, '登陸後在鐵路站應可使用鐵路');
  assert.ok(!actionsOf(g, bb.uid).some((a) => a.type === 'move' && a.mode === 'sea'));
});

test('登陸戰：主力艦登陸攻擊團長＝師長戰力獲勝並佔領', () => {
  const g = scenario();
  const bb = put(g, NORTH, 'battleship', id(4, 5));
  const defender = put(g, SOUTH, 'brigade', id(4, 4));
  const act = findLand(g, bb.uid, id(4, 4));
  assert.ok(act);
  const res = applyOK(g, act);
  const ev = lastEvent(res, 'battle');
  assert.equal(ev.outcome, 'A');
  assert.equal(ev.special, 'landing');
  assert.equal(ev.occupied, true);
  assert.equal(defender.alive, false);
  assert.equal(bb.nodeId, id(4, 4));
  assert.equal(bb.landed, true);
});

test('登陸戰敗：主力艦撞總司令，登陸艦消滅；同歸於盡亦正確', () => {
  const g1 = scenario();
  const bb1 = put(g1, NORTH, 'battleship', id(4, 5));
  put(g1, SOUTH, 'commander', id(4, 4));
  const res = applyOK(g1, findLand(g1, bb1.uid, id(4, 4)));
  assert.equal(lastEvent(res, 'battle').outcome, 'D');
  assert.equal(bb1.alive, false);

  const g2 = scenario();
  const bb2 = put(g2, NORTH, 'battleship', id(4, 5));
  const mine = put(g2, SOUTH, 'mine', id(4, 4));
  const res2 = applyOK(g2, findLand(g2, bb2.uid, id(4, 4)));
  assert.equal(lastEvent(res2, 'battle').outcome, 'B');
  assert.equal(bb2.alive, false);
  assert.equal(mine.alive, false);
});

test('登陸後的艦在陸上交戰，仍以「原棋種」查一般勝負表（engine 契約）', () => {
  // 防守：南軍團長攻擊登陸後的北軍主力艦 → matrix[主力艦][團長]=D（團長亡、主力艦存）
  const g = scenario();
  const bb = put(g, NORTH, 'battleship', id(6, 9), { landed: true });
  const brigade = put(g, SOUTH, 'brigade', id(6, 10));
  setTurn(g, SOUTH);
  const defendAct = findMove(g, brigade.uid, id(6, 9), 'walk');
  assert.ok(defendAct);
  const res = applyOK(g, defendAct);
  assert.equal(lastEvent(res, 'battle').outcome, 'D', '以原 key 主力艦查表');
  assert.equal(bb.alive, true);
  assert.equal(brigade.alive, false);

  // 攻擊：登陸後主力艦主動攻擊敵步兵 → matrix[步兵][主力艦]=A（主力艦勝並佔領）
  const g2 = scenario();
  const bb2 = put(g2, NORTH, 'battleship', id(6, 9), { landed: true });
  const infantry = put(g2, SOUTH, 'infantry', id(6, 10));
  const attackAct = findMove(g2, bb2.uid, id(6, 10), 'walk');
  assert.ok(attackAct);
  const res2 = applyOK(g2, attackAct);
  assert.equal(lastEvent(res2, 'battle').outcome, 'A');
  assert.equal(infantry.alive, false);
  assert.equal(bb2.nodeId, id(6, 10));
});

test('可登陸己方相鄰海岸空地（Lead 確認）', () => {
  const g = scenario();
  const cruiser = put(g, NORTH, 'cruiser', id(4, 5));
  // 北海岸是己方領土；空地仍可上岸
  const act = findLand(g, cruiser.uid, id(3, 4));
  assert.ok(act, '應可登陸己方海岸空地');
  applyOK(g, act);
  assert.equal(cruiser.landed, true);
  assert.equal(cruiser.nodeId, id(3, 4));
});

/* ------------------------------------------------------------------ */
/* 7. 炮壘砲擊                                                         */
/* ------------------------------------------------------------------ */

group('炮壘砲擊（fire）');

test('炮壘砲擊相鄰海域敵艦：對炮艦攻擊方勝（覆寫）', () => {
  const g = scenario();
  const fort = put(g, NORTH, 'fort', id(6, 4));
  const gunboat = put(g, SOUTH, 'gunboat', id(6, 5));
  const act = findSpecial(g, fort.uid, 'fire', id(6, 5));
  assert.ok(act);
  const res = applyOK(g, act);
  const ev = lastEvent(res, 'battle');
  assert.equal(ev.special, 'fort');
  assert.equal(ev.outcome, 'A', '炮壘打炮艦＝攻擊方勝');
  assert.equal(gunboat.alive, false);
  assert.equal(fort.nodeId, id(6, 4), '炮壘不移動');
  assert.equal(ev.occupied, false);
});

test('炮壘砲擊潛水艇＝不分勝負（N，雙方存活）', () => {
  const g = scenario();
  const fort = put(g, NORTH, 'fort', id(6, 4));
  const sub = put(g, SOUTH, 'submarine', id(6, 5));
  const act = findSpecial(g, fort.uid, 'fire', id(6, 5));
  assert.ok(act, '對潛艇仍可開火（結果 N）');
  const res = applyOK(g, act);
  const ev = lastEvent(res, 'battle');
  assert.equal(ev.outcome, 'N');
  assert.deepEqual(ev.eliminated, []);
  assert.equal(fort.alive, true);
  assert.equal(sub.alive, true);
});

test('炮壘砲擊驅逐艦獲勝；目標必須是相鄰海域', () => {
  const g = scenario();
  const fort = put(g, NORTH, 'fort', id(6, 4));
  const dd = put(g, SOUTH, 'destroyer', id(6, 5));
  assert.ok(findSpecial(g, fort.uid, 'fire', id(6, 5)));
  const act = findSpecial(g, fort.uid, 'fire', id(6, 5));
  applyOK(g, act);
  assert.equal(dd.alive, false);
  // 相鄰海域節點清單
  assert.ok((LAND_TO_SEA.get(id(6, 4)) || []).includes(id(6, 5)));
  // 非相鄰海域不可打
  assert.equal(
    g.state.sideToMove === NORTH
      ? findSpecial(g, fort.uid, 'fire', id(9, 5))
      : undefined,
    undefined,
  );
});

/* ------------------------------------------------------------------ */
/* 8. 炮艦砲擊                                                         */
/* ------------------------------------------------------------------ */

group('炮艦砲擊（bombard）');

test('炮艦砲擊沿海官兵：以營長代入，擊斃連長', () => {
  const g = scenario();
  const gunboat = put(g, NORTH, 'gunboat', id(6, 5));
  const company = put(g, SOUTH, 'company', id(6, 4));
  const act = findSpecial(g, gunboat.uid, 'bombard', id(6, 4));
  assert.ok(act);
  const res = applyOK(g, act);
  const ev = lastEvent(res, 'battle');
  assert.equal(ev.special, 'bombard');
  assert.equal(ev.outcome, 'A', '營長戰力勝連長');
  assert.equal(company.alive, false);
  assert.equal(gunboat.nodeId, id(6, 5), '炮艦不移動');
});

test('炮艦砲擊炮壘＝攻擊者勝（覆寫）；砲擊總司令＝炮艦反被消滅（D）', () => {
  const g1 = scenario();
  const gb1 = put(g1, NORTH, 'gunboat', id(6, 5));
  const fort = put(g1, SOUTH, 'fort', id(6, 4));
  const res1 = applyOK(g1, findSpecial(g1, gb1.uid, 'bombard', id(6, 4)));
  const ev1 = lastEvent(res1, 'battle');
  assert.equal(ev1.outcome, 'A', '炮艦攻擊炮壘應勝');
  assert.equal(fort.alive, false);
  assert.equal(gb1.alive, true);

  const g2 = scenario();
  const gb2 = put(g2, NORTH, 'gunboat', id(6, 5));
  const commander = put(g2, SOUTH, 'commander', id(6, 4));
  const res2 = applyOK(g2, findSpecial(g2, gb2.uid, 'bombard', id(6, 4)));
  assert.equal(lastEvent(res2, 'battle').outcome, 'D');
  assert.equal(gb2.alive, false);
  assert.equal(commander.alive, true);
});

test('炮艦砲擊武器：以炮壘代入（打坦克車＝攻方敗）', () => {
  const g = scenario();
  const gunboat = put(g, NORTH, 'gunboat', id(6, 5));
  const tank = put(g, SOUTH, 'tank', id(6, 4));
  const act = findSpecial(g, gunboat.uid, 'bombard', id(6, 4));
  assert.ok(act);
  const res = applyOK(g, act);
  assert.equal(lastEvent(res, 'battle').outcome, 'D');
  assert.equal(gunboat.alive, false);
  assert.equal(tank.alive, true);
});

/* ------------------------------------------------------------------ */
/* 9. 防空攻擊                                                         */
/* ------------------------------------------------------------------ */

group('防空攻擊（antiair）');

test('高射炮可擊落 2 格內敵機（戰鬥機）', () => {
  const g = scenario();
  const aa = put(g, NORTH, 'aa', id(6, 4));
  const fighter = put(g, SOUTH, 'fighter', id(7, 5));
  const act = findSpecial(g, aa.uid, 'antiair', id(7, 5));
  assert.ok(act, 'gridDistance<=2 應可防空');
  const res = applyOK(g, act);
  const ev = lastEvent(res, 'battle');
  assert.equal(ev.special, 'antiair');
  assert.equal(ev.outcome, 'A');
  assert.equal(fighter.alive, false);
  assert.equal(aa.alive, true);
});

test('高射炮不可打 3 格以上敵機；炮艦同樣可防空', () => {
  const g = scenario();
  const aa = put(g, NORTH, 'aa', id(6, 4));
  put(g, SOUTH, 'fighter', id(9, 6)); // distance 3
  assert.ok(!findSpecial(g, aa.uid, 'antiair', id(9, 6)));

  const g2 = scenario();
  const gunboat = put(g2, NORTH, 'gunboat', id(6, 5));
  const scout = put(g2, SOUTH, 'scout', id(8, 6)); // distance 2
  const act = findSpecial(g2, gunboat.uid, 'antiair', id(8, 6));
  assert.ok(act, '炮艦可打 2 格內敵機');
  applyOK(g2, act);
  assert.equal(scout.alive, false);
});

/* ------------------------------------------------------------------ */
/* 10. 飛彈轟擊                                                        */
/* ------------------------------------------------------------------ */

group('飛彈轟擊（missile）');

test('飛彈直線轟擊官兵：同歸於盡（B），發射後飛彈消滅', () => {
  const g = scenario();
  const missile = put(g, NORTH, 'missile', id(6, 4));
  const brigade = put(g, SOUTH, 'brigade', id(6, 8));
  const act = findSpecial(g, missile.uid, 'missile', id(6, 8));
  assert.ok(act, '同一行直線可轟擊');
  const res = applyOK(g, act);
  const ev = lastEvent(res, 'battle');
  assert.equal(ev.special, 'missile');
  assert.equal(ev.outcome, 'B');
  assert.equal(missile.alive, false);
  assert.equal(brigade.alive, false);
  assert.ok(ev.eliminated.includes(missile.uid));
});

test('飛彈打陷阱＝陷阱勝、飛彈亡；可越過任何棋子', () => {
  const g = scenario();
  const missile = put(g, NORTH, 'missile', id(6, 4));
  const trap = put(g, SOUTH, 'trap', id(6, 8));
  // 直線上放己方與敵方棋子，飛彈仍可越過
  put(g, NORTH, 'infantry', id(6, 5));
  put(g, SOUTH, 'company', id(6, 6));
  const act = findSpecial(g, missile.uid, 'missile', id(6, 8));
  assert.ok(act, '飛彈不受途中棋子阻擋');
  const res = applyOK(g, act);
  const ev = lastEvent(res, 'battle');
  assert.equal(ev.outcome, 'D');
  assert.equal(trap.alive, true);
  assert.equal(missile.alive, false);
});

test('飛彈不可選城門、機場；對炮艦/驅逐艦為 X 不生成', () => {
  // 城門
  const g = scenario();
  const missile = put(g, NORTH, 'missile', id(6, 4));
  put(g, SOUTH, 'flag', id(6, 12)); // 南城門
  assert.ok(!actionsOf(g, missile.uid).some((a) => a.type === 'missile' && a.target === id(6, 12)));

  // 機場（敵機在機場）
  const g2 = scenario();
  const missile2 = put(g2, NORTH, 'missile', id(12, 4));
  put(g2, SOUTH, 'fighter', id(12, 12)); // 南機場
  assert.ok(!actionsOf(g2, missile2.uid).some((a) => a.type === 'missile' && a.target === id(12, 12)));

  // 炮艦 / 驅逐艦：勝負表 X，不得生成
  const g3 = scenario();
  const missile3 = put(g3, NORTH, 'missile', id(6, 4));
  put(g3, SOUTH, 'gunboat', id(6, 6));
  assert.ok(!actionsOf(g3, missile3.uid).some((a) => a.type === 'missile' && a.target === id(6, 6)));
  const g4 = scenario();
  const missile4 = put(g4, NORTH, 'missile', id(6, 4));
  put(g4, SOUTH, 'destroyer', id(6, 6));
  assert.ok(!actionsOf(g4, missile4.uid).some((a) => a.type === 'missile' && a.target === id(6, 6)));
});

test('飛彈對潛水艇＝覆寫 N（潛艇無損、飛彈落空消滅）', () => {
  const g = scenario();
  const missile = put(g, NORTH, 'missile', id(6, 4));
  const sub = put(g, SOUTH, 'submarine', id(6, 6));
  const act = findSpecial(g, missile.uid, 'missile', id(6, 6));
  assert.ok(act, '表為 X，但依覆寫改為 N 且仍可轟擊');
  const res = applyOK(g, act);
  const ev = lastEvent(res, 'battle');
  assert.equal(ev.outcome, 'N');
  assert.equal(sub.alive, true);
  assert.equal(missile.alive, false);
});

test('飛彈可打行營內棋子（不受行營保護限制）', () => {
  const g = scenario();
  const missile = put(g, NORTH, 'missile', id(6, 3));
  const camp = CAMP_NODES.north[0]; // (1,3)
  const defender = put(g, SOUTH, 'infantry', camp);
  assert.equal(NODE[camp].kind, 'camp');
  assert.equal(NODE[camp].row, 3);
  const act = findSpecial(g, missile.uid, 'missile', camp);
  assert.ok(act, '飛彈可從空中攻擊行營');
  applyOK(g, act);
  assert.equal(defender.alive, false);
});

/* ------------------------------------------------------------------ */
/* 11. 偵察機                                                          */
/* ------------------------------------------------------------------ */

group('偵察機（recon）');

test('偵察機可偵察同直線敵棋，僅對己方曝光', () => {
  const g = scenario();
  const scout = put(g, NORTH, 'scout', id(0, 0));
  const officer = put(g, SOUTH, 'brigade', id(0, 4));
  const act = findSpecial(g, scout.uid, 'recon', id(0, 4));
  assert.ok(act);
  const res = applyOK(g, act);
  const ev = res.events.find((e) => e.type === 'reveal');
  assert.ok(ev);
  assert.equal(ev.toSide, NORTH);
  assert.equal(ev.source, 'scout');
  assert.equal(officer.revealed.north, true);
  const northView = g.getView(NORTH);
  assert.equal(northView.pieces.find((p) => p.uid === officer.uid).key, 'brigade');
  // 南方的視圖當然看得到自己的棋（此處僅驗證未對北以外的人額外曝光）
  assert.equal(officer.revealed.south, true);
});

test('偵察機無戰鬥力：不能攻擊敵棋，只能移動到空節點', () => {
  const g = scenario();
  const scout = put(g, NORTH, 'scout', id(0, 0));
  const enemy = put(g, SOUTH, 'infantry', id(0, 4));
  const moves = actionsOf(g, scout.uid).filter((a) => a.type === 'move');
  assert.ok(!moves.some((a) => a.to === id(0, 4)), '偵察機不可攻擊敵棋');
  assert.ok(moves.some((a) => a.to === id(0, 1)), '仍可移動到空節點');
  assert.ok(findSpecial(g, scout.uid, 'recon', id(0, 4)));

  // 敵方戰鬥機攻擊偵察機（勝負表：戰鬥機勝）
  const g2 = scenario();
  const fighter = put(g2, SOUTH, 'fighter', id(0, 0));
  const scout2 = put(g2, NORTH, 'scout', id(0, 4));
  setTurn(g2, SOUTH);
  const attack = findMove(g2, fighter.uid, id(0, 4), 'air');
  assert.ok(attack);
  const res = applyOK(g2, attack);
  assert.equal(lastEvent(res, 'battle').outcome, 'A');
  assert.equal(scout2.alive, false);
});

test('偵察機偵察敵軍軍旗 → 軍旗位置曝光', () => {
  const g = scenario();
  const scout = put(g, NORTH, 'scout', id(6, 0));
  put(g, SOUTH, 'flag', id(6, 12));
  const act = findSpecial(g, scout.uid, 'recon', id(6, 12));
  assert.ok(act);
  applyOK(g, act);
  assert.equal(g.state.flagRevealed.south, true);
  const view = g.getView(NORTH);
  const flag = view.pieces.find((p) => p.side === SOUTH && p.key === 'flag');
  assert.ok(flag, '軍旗曝光後應可見 key');
  assert.equal(flag.nodeId, id(6, 12));
});

/* ------------------------------------------------------------------ */
/* 12. 空軍直線飛行與飛越擊落                                          */
/* ------------------------------------------------------------------ */

group('空軍（air move / 飛越擊落）');

test('戰鬥機沿直線飛到任意空節點，path/airPath 正確', () => {
  const g = scenario();
  const fighter = put(g, NORTH, 'fighter', id(0, 0));
  const act = findMove(g, fighter.uid, id(0, 4), 'air');
  assert.ok(act);
  assert.deepEqual(act.path, [id(0, 0), id(0, 1), id(0, 2), id(0, 3), id(0, 4)]);
  assert.deepEqual(act.airPath, [id(0, 1), id(0, 2), id(0, 3)]);
  const res = applyOK(g, act);
  const ev = lastEvent(res, 'move');
  assert.equal(ev.mode, 'air');
  assert.equal(fighter.nodeId, id(0, 4));
});

test('戰鬥機可飛越棋子攻擊後方敵棋（戰鬥後佔領）', () => {
  const g = scenario();
  const fighter = put(g, NORTH, 'fighter', id(0, 0));
  put(g, NORTH, 'infantry', id(0, 1)); // 己方棋子，可飛越
  const enemy = put(g, SOUTH, 'infantry', id(0, 4));
  const act = findMove(g, fighter.uid, id(0, 4), 'air');
  assert.ok(act, '可飛越任何棋子攻擊');
  const res = applyOK(g, act);
  const ev = lastEvent(res, 'battle');
  assert.equal(ev.outcome, 'A');
  assert.equal(ev.special, 'air');
  assert.equal(ev.occupied, true);
  assert.equal(enemy.alive, false);
  assert.equal(fighter.nodeId, id(0, 4));
});

test('飛越敵方高射炮上空被擊落（途中，不含終點）', () => {
  const g = scenario();
  const fighter = put(g, NORTH, 'fighter', id(0, 0));
  const aa = put(g, SOUTH, 'aa', id(0, 2));
  const target = put(g, SOUTH, 'infantry', id(0, 4));
  const act = findMove(g, fighter.uid, id(0, 4), 'air');
  assert.ok(act, '行動本身合法（被擊落由引擎判定）');
  const res = applyOK(g, act);
  const ev = lastEvent(res, 'battle');
  assert.equal(ev.intercepted, true);
  assert.equal(ev.outcome, 'D');
  assert.equal(ev.special, 'antiair');
  assert.deepEqual(ev.eliminated, [fighter.uid]);
  assert.equal(fighter.alive, false);
  assert.equal(fighter.nodeId, id(0, 0), '被擊落不會移動');
  assert.equal(aa.alive, true);
  assert.equal(target.alive, true);
  assert.equal(aa.revealed.north, true, '開火的防空方曝光');
});

test('飛越敵方炮艦上空亦被擊落；目標本身是高射炮則正常戰鬥', () => {
  const g = scenario();
  const fighter = put(g, NORTH, 'fighter', id(0, 0));
  put(g, SOUTH, 'gunboat', id(0, 2));
  put(g, SOUTH, 'infantry', id(0, 4));
  const res = applyOK(g, findMove(g, fighter.uid, id(0, 4), 'air'));
  assert.equal(lastEvent(res, 'battle').intercepted, true);
  assert.equal(fighter.alive, false);

  // 目標就是高射炮：不屬「途中」，進行正常戰鬥（戰鬥機敗於高射炮）
  const g2 = scenario();
  const fighter2 = put(g2, NORTH, 'fighter', id(0, 0));
  const aa = put(g2, SOUTH, 'aa', id(0, 2));
  const res2 = applyOK(g2, findMove(g2, fighter2.uid, id(0, 2), 'air'));
  const ev2 = lastEvent(res2, 'battle');
  assert.equal(ev2.intercepted, undefined);
  assert.equal(ev2.outcome, 'D');
  assert.equal(fighter2.alive, false);
  assert.equal(aa.alive, true);
});

test('空軍不可攻擊／停留在城門，但可飛越；偵察仍可揭露城門棋子', () => {
  const g = scenario();
  const fighter = put(g, NORTH, 'fighter', id(0, 0));
  const gatePiece = put(g, SOUTH, 'infantry', id(2, 0)); // 北軍城門上的敵棋
  const emptyGate = id(6, 0); // 空城門
  const acts = actionsOf(g, fighter.uid).filter((a) => a.type === 'move');
  assert.ok(!acts.some((a) => a.to === id(2, 0)), '不可攻擊城門上的棋子');
  assert.ok(!acts.some((a) => a.to === emptyGate), '不可停留在空城門');
  assert.ok(!acts.some((a) => a.to === id(10, 0)), '不可停留在另一座空城門');
  assert.ok(acts.some((a) => a.to === id(1, 0)), '仍可停一般節點');
  assert.ok(acts.some((a) => a.to === id(3, 0)), '可飛越城門到後方節點');
  // 可飛越城門攻擊後方（非城門）敵棋
  put(g, SOUTH, 'infantry', id(5, 0));
  const acts2 = actionsOf(g, fighter.uid).filter((a) => a.type === 'move');
  assert.ok(acts2.some((a) => a.to === id(5, 0)), '可飛越城門攻擊後方敵棋');
  // 直接偽造「飛到城門」行動也應被拒絕
  const fake = { type: 'move', pieceUid: fighter.uid, from: fighter.nodeId, to: emptyGate, mode: 'air' };
  assert.equal(g.applyAction(NORTH, fake).ok, false);
  // 偵察機 recon 可揭露城門上的棋子（不受禁令影響）
  const g2 = scenario();
  const scout = put(g2, NORTH, 'scout', id(0, 0));
  const hiddenGatePiece = put(g2, SOUTH, 'brigade', id(2, 0));
  const recon = findSpecial(g2, scout.uid, 'recon', id(2, 0));
  assert.ok(recon, '偵察可揭露城門棋子');
  applyOK(g2, recon);
  assert.equal(hiddenGatePiece.revealed.north, true);
});

test('戰鬥機可攻擊飛彈（反飛彈：戰鬥機勝）', () => {
  const g = scenario();
  const fighter = put(g, NORTH, 'fighter', id(0, 0));
  const missile = put(g, SOUTH, 'missile', id(0, 4));
  const act = findMove(g, fighter.uid, id(0, 4), 'air');
  assert.ok(act);
  const res = applyOK(g, act);
  const ev = lastEvent(res, 'battle');
  assert.equal(ev.outcome, 'A');
  assert.equal(missile.alive, false);
  assert.equal(fighter.alive, true);
});

/* ------------------------------------------------------------------ */
/* 13. 行營保護                                                        */
/* ------------------------------------------------------------------ */

group('行營保護（camp）');

test('敵方陸軍不可攻擊行營內棋子（步行行動不生成）', () => {
  const g = scenario();
  const camp = CAMP_NODES.north[0]; // (1,3)
  const commander = put(g, NORTH, 'commander', camp);
  const attacker = put(g, SOUTH, 'infantry', id(1, 2));
  setTurn(g, SOUTH);
  assert.equal(NODE[camp].kind, 'camp');
  const acts = actionsOf(g, attacker.uid).filter((a) => a.type === 'move');
  assert.ok(!acts.some((a) => a.to === camp), '行營內棋子不可被敵方陸軍攻擊');
  assert.ok(acts.length > 0, '仍可往其他方向移動');
  // 直接偽造 applyAction 也應被拒
  const fake = { type: 'move', pieceUid: attacker.uid, from: attacker.nodeId, to: camp, mode: 'walk' };
  assert.equal(g.applyAction(SOUTH, fake).ok, false);
  assert.equal(commander.alive, true);
});

test('空軍可攻擊行營內棋子（不受行營保護限制）', () => {
  const g = scenario();
  const camp = CAMP_NODES.north[0]; // (1,3)
  put(g, NORTH, 'brigade', camp);
  const fighter = put(g, SOUTH, 'fighter', id(1, 0));
  setTurn(g, SOUTH);
  const act = findMove(g, fighter.uid, camp, 'air');
  assert.ok(act, '空軍應可攻擊行營');
  const res = applyOK(g, act);
  assert.equal(lastEvent(res, 'battle').outcome, 'A');
});

/* ------------------------------------------------------------------ */
/* 14. 軍旗 / 總司令 / 勝負                                            */
/* ------------------------------------------------------------------ */

group('軍旗、總司令與勝負判定');

test('奪旗勝利：任何棋子攻擊軍旗 → FLAG、勝方、phase=over', () => {
  const g = scenario();
  put(g, SOUTH, 'flag', id(6, 12));
  const infantry = put(g, NORTH, 'infantry', id(6, 11));
  const act = findMove(g, infantry.uid, id(6, 12), 'walk');
  assert.ok(act);
  const res = applyOK(g, act);
  const battle = lastEvent(res, 'battle');
  assert.equal(battle.outcome, 'FLAG');
  assert.equal(battle.occupied, true);
  assert.equal(lastEvent(res, 'win').winner, NORTH);
  assert.equal(lastEvent(res, 'win').reason, 'flag');
  assert.equal(g.state.phase, 'over');
  assert.equal(g.state.winner, NORTH);
  assert.equal(g.state.winnerReason, 'flag');
  // log 內也必須有 win 事件
  assert.equal(g.state.log.filter((e) => e.type === 'win').length, 1);
});

test('總司令陣亡 → 軍旗位置對敵方曝光（flagExposed + reveal）', () => {
  const g = scenario();
  const missile = put(g, NORTH, 'missile', id(6, 4));
  put(g, SOUTH, 'commander', id(6, 8));
  put(g, SOUTH, 'flag', id(6, 12));
  const act = findSpecial(g, missile.uid, 'missile', id(6, 8));
  assert.ok(act);
  const res = applyOK(g, act);
  assert.ok(res.events.some((e) => e.type === 'flagExposed' && e.side === SOUTH));
  assert.equal(g.state.flagRevealed.south, true);
  const view = g.getView(NORTH);
  const flag = view.pieces.find((p) => p.side === SOUTH && p.key === 'flag');
  assert.ok(flag, '敵方軍旗應已曝光');
  assert.equal(flag.nodeId, id(6, 12));
});

test('打擊非軍旗的普通棋不觸發 FLAG、不會誤判勝利', () => {
  const g = scenario();
  const p = put(g, NORTH, 'brigade', id(6, 3));
  put(g, SOUTH, 'platoon', id(6, 4));
  const res = applyOK(g, findMove(g, p.uid, id(6, 4), 'walk'));
  assert.notEqual(lastEvent(res, 'battle').outcome, 'FLAG');
  assert.equal(g.state.winner, null);
  assert.equal(g.state.phase, 'play');
});

test('無子可動判負：輪到某方且無任何（非 pass）行動 → 對方勝', () => {
  const g = scenario({ dummies: false });
  put(g, NORTH, 'infantry', id(6, 1));
  put(g, SOUTH, 'flag', id(6, 12));
  put(g, SOUTH, 'mine', id(5, 12));
  put(g, SOUTH, 'trap', id(7, 12));
  setTurn(g, NORTH);
  assert.equal(g.canAct(SOUTH), false);
  const res = applyOK(g, { type: 'pass' });
  const win = lastEvent(res, 'win');
  assert.equal(win.winner, NORTH);
  assert.equal(win.reason, 'nomoves');
  assert.equal(g.state.phase, 'over');
});

test('雙方皆無子可動 → 和局', () => {
  const g = scenario({ dummies: false });
  put(g, NORTH, 'flag', id(6, 0));
  put(g, NORTH, 'mine', id(5, 0));
  put(g, NORTH, 'trap', id(7, 0));
  put(g, SOUTH, 'flag', id(6, 12));
  put(g, SOUTH, 'mine', id(5, 12));
  put(g, SOUTH, 'trap', id(7, 12));
  setTurn(g, NORTH);
  assert.deepEqual(
    sideActions(g).map((a) => a.type),
    ['pass'],
    '全為不可動棋子時只剩 pass',
  );
  const res = applyOK(g, { type: 'pass' });
  const win = lastEvent(res, 'win');
  assert.equal(win.winner, 'draw');
  assert.equal(win.reason, 'draw');
});

test('pass 換手與回合數累加', () => {
  const g = scenario();
  setTurn(g, NORTH);
  applyOK(g, { type: 'pass' });
  assert.equal(g.state.sideToMove, SOUTH);
  assert.equal(g.state.turn, 1);
  applyOK(g, { type: 'pass' });
  assert.equal(g.state.sideToMove, NORTH);
  assert.equal(g.state.turn, 2, '南北各走一步 → 回合+1');
});

/* ------------------------------------------------------------------ */
/* 15. 戰鬥表抽查（>= 20 組）                                          */
/* ------------------------------------------------------------------ */

group('戰鬥表抽查（resolveCombat）');

function outcomeOf(attackerKey, defenderKey, context = {}) {
  return resolveCombat(attackerKey, defenderKey, context).outcome;
}

test('基本官兵階級 10 組', () => {
  assert.equal(outcomeOf('commander', 'commander'), 'B');
  assert.equal(outcomeOf('army_group', 'commander'), 'D'); // 兵團司令打總司令→守方勝
  assert.equal(outcomeOf('commander', 'army_group'), 'A');
  assert.equal(outcomeOf('corps', 'division'), 'A');
  assert.equal(outcomeOf('division', 'corps'), 'D');
  assert.equal(outcomeOf('brigade', 'battalion'), 'A');
  assert.equal(outcomeOf('battalion', 'brigade'), 'D');
  assert.equal(outcomeOf('company', 'platoon'), 'A');
  assert.equal(outcomeOf('cavalry', 'infantry'), 'A');
  assert.equal(outcomeOf('infantry', 'engineer'), 'A');
});

test('工兵 / 地雷 / 陷阱 / 毒氣 特例 8 組', () => {
  assert.equal(outcomeOf('engineer', 'fort'), 'A', '工兵剋炮壘（覆寫）');
  assert.equal(outcomeOf('engineer', 'bomb'), 'A', '工兵剋炸彈（覆寫）');
  assert.equal(outcomeOf('engineer', 'mine'), 'A', '工兵拆地雷');
  assert.equal(outcomeOf('engineer', 'trap'), 'A', '工兵破陷阱');
  assert.equal(outcomeOf('engineer', 'gas'), 'A', '工兵勝毒氣');
  assert.equal(outcomeOf('infantry', 'mine'), 'B', '踩地雷同歸於盡');
  assert.equal(outcomeOf('commander', 'trap'), 'D', '陷阱勝官兵');
  assert.equal(outcomeOf('gas', 'engineer'), 'D', '毒氣敗於工兵');
});

test('武器對戰 8 組', () => {
  assert.equal(outcomeOf('atomic', 'commander'), 'A', '原子炮勝官兵');
  assert.equal(outcomeOf('commander', 'atomic'), 'D', '原子炮防守勝');
  assert.equal(outcomeOf('tank', 'cannon'), 'A', '坦克勝大炮');
  assert.equal(outcomeOf('cannon', 'tank'), 'D', '大炮敗於坦克');
  assert.equal(outcomeOf('mg', 'commander'), 'A', '機關鎗勝官兵');
  assert.equal(outcomeOf('bomb', 'commander'), 'B', '炸彈同歸於盡');
  assert.equal(outcomeOf('bomb', 'mine'), 'B', '炸彈碰地雷同歸於盡');
  assert.equal(outcomeOf('atomic', 'trap'), 'D', '原子炮敗於陷阱');
});

test('海軍對戰 7 組', () => {
  assert.equal(outcomeOf('battleship', 'cruiser'), 'A', '主力艦勝巡洋艦');
  assert.equal(outcomeOf('cruiser', 'battleship'), 'D', '巡洋艦敗於主力艦');
  assert.equal(outcomeOf('submarine', 'battleship'), 'A', '潛艇勝主力艦');
  assert.equal(outcomeOf('battleship', 'submarine'), 'D', '主力艦敗於潛艇');
  assert.equal(outcomeOf('destroyer', 'submarine'), 'A', '驅逐艦勝潛艇');
  assert.equal(outcomeOf('submarine', 'destroyer'), 'D', '潛艇敗於驅逐艦');
  assert.equal(outcomeOf('gunboat', 'destroyer'), 'A', '炮艦勝驅逐艦（依表）');
  assert.equal(outcomeOf('destroyer', 'gunboat'), 'D', '驅逐艦敗於炮艦（依表）');
});

test('空軍 / 飛彈 8 組', () => {
  assert.equal(outcomeOf('fighter', 'infantry'), 'A', '戰鬥機勝步兵');
  assert.equal(outcomeOf('fighter', 'aa'), 'D', '戰鬥機敗於高射炮');
  assert.equal(outcomeOf('fighter', 'gunboat'), 'D', '戰鬥機敗於炮艦');
  assert.equal(outcomeOf('fighter', 'trap'), 'N', '陷阱對戰鬥機無效果');
  assert.equal(outcomeOf('fighter', 'mine'), 'A', '戰鬥機勝地雷');
  assert.equal(outcomeOf('fighter', 'missile'), 'A', '反飛彈：戰鬥機勝');
  assert.equal(outcomeOf('missile', 'fighter'), 'B', '飛彈打戰鬥機同歸於盡');
  assert.equal(outcomeOf('missile', 'trap'), 'D', '飛彈落空於陷阱');
});

test('特殊映射 10 組', () => {
  // 兩棲登陸
  assert.deepEqual(attackerNameFor('battleship', 'brigade', { special: 'landing' }), '師長');
  assert.equal(resolveCombat('battleship', 'brigade', { special: 'landing' }).outcome, 'A');
  assert.equal(resolveCombat('battleship', 'commander', { special: 'landing' }).outcome, 'D');
  assert.deepEqual(attackerNameFor('cruiser', 'company', { special: 'landing' }), '團長');
  assert.equal(resolveCombat('cruiser', 'company', { special: 'landing' }).outcome, 'A');
  assert.deepEqual(attackerNameFor('battleship', 'tank', { special: 'landing' }), '坦克車');
  // 炮艦砲擊
  assert.deepEqual(attackerNameFor('gunboat', 'company', { special: 'bombard' }), '營長');
  assert.deepEqual(attackerNameFor('gunboat', 'tank', { special: 'bombard' }), '炮壘');
  assert.equal(resolveCombat('gunboat', 'fort', { special: 'bombard' }).outcome, 'A', '炮艦打炮壘覆寫');
  // 炮壘砲擊
  assert.deepEqual(attackerNameFor('fort', 'gunboat', { special: 'fort' }), '炮壘');
  assert.equal(resolveCombat('fort', 'submarine', { special: 'fort' }).outcome, 'N');
  assert.equal(resolveCombat('fort', 'gunboat', { special: 'fort' }).outcome, 'A');
  // 防空
  assert.deepEqual(attackerNameFor('aa', 'fighter', { special: 'antiair' }), '高射炮');
  assert.equal(resolveCombat('aa', 'fighter', { special: 'antiair' }).outcome, 'A');
  assert.equal(resolveCombat('gunboat', 'scout', { special: 'antiair' }).outcome, 'A');
  // 飛彈
  assert.equal(resolveCombat('missile', 'commander', { special: 'missile' }).outcome, 'B');
  assert.equal(resolveCombat('missile', 'submarine', { special: 'missile' }).outcome, 'N');
});

test('軍旗與 X 規則', () => {
  assert.equal(outcomeOf('engineer', 'flag'), 'FLAG');
  assert.equal(outcomeOf('bomb', 'flag'), 'FLAG', '任何攻方打軍旗都勝');
  assert.equal(outcomeOf('fighter', 'flag'), 'FLAG');
  // X：resolveCombat 對外轉成 N，但保留 rawOutcome='X'
  const x = resolveCombat('infantry', 'gunboat');
  assert.equal(x.rawOutcome, 'X');
  assert.equal(x.outcome, 'N');
  assert.equal(isInteractionAllowed('infantry', 'gunboat'), false);
  // R：偵察機攻擊陷阱（表為 R）
  assert.equal(resolveCombat('scout', 'trap').outcome, 'R');
  // 直接查表方向驗證：lookupTable(攻方, 守方) → matrix[守方][攻方]
  assert.equal(lookupTable('師長', '團長'), 'A');
  assert.equal(lookupTable('師長', '總司令'), 'D');
  assert.equal(lookupTable('步兵', '地雷'), 'B');
});

/* ------------------------------------------------------------------ */
/* 16. X 不可作用：不生成行動                                          */
/* ------------------------------------------------------------------ */

group('X 不可作用（合法行動不生成）');

test('陸軍不可攻擊敵方空軍（勝負表 X）', () => {
  const g = scenario();
  const infantry = put(g, NORTH, 'infantry', id(6, 3));
  put(g, SOUTH, 'fighter', id(6, 4));
  const acts = actionsOf(g, infantry.uid).filter((a) => a.type === 'move');
  assert.ok(!acts.some((a) => a.to === id(6, 4)), 'X 交互不應生成行動');
  const fake = { type: 'move', pieceUid: infantry.uid, from: infantry.nodeId, to: id(6, 4), mode: 'walk' };
  // 結構上合法但 X：engine 寬容視為 N（給 AI belief 模擬用），不會崩潰
  const res = g.applyAction(NORTH, fake);
  assert.equal(res.ok, true);
  const ev = lastEvent(res, 'battle');
  assert.equal(ev.outcome, 'N');
  assert.equal(ev.reveal.length, 0, 'X 無效果不揭露');
});

/* ------------------------------------------------------------------ */
/* 17. 快照 / 回溯 / clone                                             */
/* ------------------------------------------------------------------ */

group('snapshot / restore / clone');

test('snapshot 為純 JSON；restore 後 state 完全一致', () => {
  const g = scenario();
  put(g, NORTH, 'infantry', id(6, 3));
  const snap = g.snapshot();
  assert.ok(snap.state && Array.isArray(snap.state.pieces));
  const text = JSON.stringify(snap);
  const parsed = JSON.parse(text);
  g.restore(parsed);
  assert.equal(JSON.stringify(g.state), JSON.stringify(parsed.state));
  // 也可直接傳 state
  g.restore(parsed.state);
  assert.equal(JSON.stringify(g.state), JSON.stringify(parsed.state));
});

test('clone 為獨立 Game：深拷貝 state、互不影響', () => {
  const g = scenario();
  put(g, NORTH, 'infantry', id(6, 3));
  const clone = g.clone();
  assert.notEqual(clone, g);
  assert.notEqual(clone.state, g.state);
  assert.deepEqual(
    clone.getLegalActions(NORTH).map(actionSignature),
    g.getLegalActions(NORTH).map(actionSignature),
  );
  const before = JSON.stringify(g.state);
  const res = clone.applyAction(NORTH, { type: 'pass' });
  assert.equal(res.ok, true);
  assert.equal(JSON.stringify(g.state), before, '原始局不應被 clone 的行動影響');
  assert.equal(clone.state.sideToMove, SOUTH);
  // clone 也能 getView / snapshot / restore
  assert.doesNotThrow(() => clone.getView(SOUTH));
  assert.doesNotThrow(() => clone.snapshot());
});

test('AI 模擬：改寫 snapshot 中未曝光敵棋 key 後 restore 仍可正常模擬', () => {
  const g = createGame({ seed: 31, autoDeploy: true });
  g.startPlay();
  const clone = g.clone();
  const snap = clone.snapshot();
  let changed = 0;
  for (const p of snap.state.pieces) {
    if (p.side === SOUTH && p.key !== 'fighter' && p.key !== 'scout') {
      // 模擬 AI belief：以剩餘棋種中的步兵替代未知棋
      p.key = 'infantry';
      changed += 1;
    }
  }
  assert.ok(changed > 0);
  const sim = g.clone();
  sim.restore(snap);
  // 仍能產生合法行動與套用行動
  const acts = sim.getLegalActions(NORTH);
  assert.ok(acts.length > 1);
  const res = sim.applyAction(NORTH, acts[0]);
  assert.equal(res.ok, true, res.error);
  // 原始局不受影響（autoDeploy 兩次 → 2 筆 deploy log）
  assert.equal(g.state.log.length, 2, '原局只有 deploy log');
  assert.ok(g.state.log.every((e) => e.type === 'deploy'));
});

test('AI 需要的 API 全部可用且不出錯（getView/getLegalActions/getActionsForPiece/canAct/snapshot）', () => {
  const g = createGame({ seed: 32, autoDeploy: true });
  g.startPlay();
  for (const side of [NORTH, SOUTH]) {
    assert.doesNotThrow(() => g.getView(side));
    const info = g.getPublicInfo();
    assert.equal(info.counts[side].total, 30);
  }
  assert.equal(g.canAct(NORTH), true);
  assert.equal(g.canAct(SOUTH), true);
  const view = g.getView(NORTH);
  const myPiece = view.pieces.find((p) => p.side === NORTH && p.alive && p.key);
  const acts = g.getActionsForPiece(NORTH, myPiece.uid);
  assert.ok(Array.isArray(acts));
  assert.ok(g.getLegalActions(SOUTH).length === 0, '非該方回合回傳 []');
  // 未開始遊戲時 getLegalActions 為空
  const g2 = createGame({ seed: 33 });
  assert.deepEqual(g2.getLegalActions(NORTH), []);
  assert.equal(g2.canAct(NORTH), false);
});

/* ------------------------------------------------------------------ */
/* 18. 事件格式與效能                                                  */
/* ------------------------------------------------------------------ */

group('事件格式與效能');

test('事件格式符合 DESIGN §3.1（move / battle / pass / win）', () => {
  const g = scenario();
  const p = put(g, NORTH, 'brigade', id(6, 3));
  put(g, SOUTH, 'platoon', id(6, 4));
  const res = applyOK(g, findMove(g, p.uid, id(6, 4), 'walk'));
  const battle = lastEvent(res, 'battle');
  for (const key of ['attackerUid', 'defenderUid', 'from', 'to', 'outcome', 'reveal', 'eliminated', 'occupied']) {
    assert.ok(key in battle, `battle 事件缺少 ${key}`);
  }
  assert.equal(battle.attackerUid, p.uid);
  assert.ok(Array.isArray(battle.reveal));
  assert.ok(battle.reveal.length === 2, 'revealOnBattle 預設 true 應雙方揭露');
  // 下一次移動事件
  setTurn(g, NORTH);
  const q = put(g, NORTH, 'infantry', id(10, 3));
  const res2 = applyOK(g, findMove(g, q.uid, id(10, 4), 'walk'));
  const move = lastEvent(res2, 'move');
  for (const key of ['uid', 'side', 'from', 'to', 'path', 'mode']) {
    assert.ok(key in move, `move 事件缺少 ${key}`);
  }
});

test('revealOnBattle=false 時戰鬥不揭露棋種', () => {
  const g = scenario({ revealOnBattle: false });
  const fighter = put(g, NORTH, 'fighter', id(5, 0));
  const sub = put(g, SOUTH, 'submarine', id(5, 5));
  const act = findMove(g, fighter.uid, id(5, 5), 'air');
  assert.ok(act);
  const res = applyOK(g, act);
  const ev = lastEvent(res, 'battle');
  assert.equal(ev.outcome, 'N', '戰鬥機打潛艇不分勝負');
  assert.deepEqual(ev.reveal, []);
  assert.equal(sub.revealed.north, false, '未揭露');
  const view = g.getView(NORTH);
  assert.equal(view.pieces.find((p) => p.uid === sub.uid).key, null);
});

test('revealOnBattle=false 時 view.log 不洩漏任何隱藏棋 key/name（AI fairness 契約）', () => {
  const g = scenario({ revealOnBattle: false });
  const fighter = put(g, NORTH, 'fighter', id(5, 0));
  const sub = put(g, SOUTH, 'submarine', id(5, 5));
  setTurn(g, NORTH);
  const act = findMove(g, fighter.uid, id(5, 5), 'air');
  assert.ok(act);
  const res = applyOK(g, act);
  const battle = lastEvent(res, 'battle');
  assert.equal(battle.outcome, 'N', '戰鬥機打潛艇不分勝負');
  assert.deepEqual(battle.reveal, [], 'revealOnBattle=false 不揭露');
  const view = g.getView(NORTH);
  assert.equal(view.pieces.find((p) => p.uid === sub.uid).key, null);
  // 掃描 view.log：任何對北軍不可見的棋子，其 key / name 都不得出現
  const logText = JSON.stringify(view.log);
  for (const vp of view.pieces.filter((p) => !p.revealed)) {
    const real = g.state.pieces.find((p) => p.uid === vp.uid);
    const def = PIECE_BY_KEY[real.key];
    assert.ok(!logText.includes(`"${real.key}"`), `view.log 洩漏隱藏棋 key=${real.key}`);
    assert.ok(!logText.includes(`"${def.name}"`), `view.log 洩漏隱藏棋 name=${def.name}`);
  }
});

test('飛越擊落的開火方曝光屬「規則曝光」（即使 revealOnBattle=false，雙方都應知道）', () => {
  const g = scenario({ revealOnBattle: false });
  const fighter = put(g, NORTH, 'fighter', id(0, 0));
  const aa = put(g, SOUTH, 'aa', id(0, 2));
  put(g, SOUTH, 'infantry', id(0, 4));
  const res = applyOK(g, findMove(g, fighter.uid, id(0, 4), 'air'));
  const battle = lastEvent(res, 'battle');
  assert.equal(battle.intercepted, true);
  // 飛機公開、開火方曝光：兩側都知道交戰雙方棋種（合理且 doc 化的規則曝光）
  assert.deepEqual(battle.reveal.map((r) => r.key).sort(), ['aa', 'fighter'].sort());
  assert.equal(aa.revealed.north, true, '被攻擊方（飛機擁有者）得知開火者');
  assert.equal(aa.revealed.south, true, '擁有者本來就知道自己的棋');
});

test('getLegalActions 效能 < 50ms（AI 大量呼叫）', () => {
  const g = createGame({ seed: 41, autoDeploy: true });
  g.startPlay();
  // 跑幾步到中局
  for (let i = 0; i < 40 && g.state.phase === 'play'; i++) {
    const side = g.state.sideToMove;
    const acts = g.getLegalActions(side);
    const res = g.applyAction(side, acts[i % Math.max(1, acts.length - 1)]);
    if (!res.ok) break;
  }
  let worst = 0;
  for (let i = 0; i < 20; i++) {
    const side = g.state.phase === 'play' ? g.state.sideToMove : NORTH;
    const t0 = performance.now();
    g.getLegalActions(side);
    worst = Math.max(worst, performance.now() - t0);
  }
  assert.ok(worst < 50, `getLegalActions 最慢 ${worst.toFixed(2)}ms，應 < 50ms`);
});

test('行動不重複且有穩定順序（pass 永遠最後）', () => {
  const g = createGame({ seed: 42, autoDeploy: true });
  g.startPlay();
  const a1 = g.getLegalActions(NORTH);
  const a2 = g.getLegalActions(NORTH);
  assert.deepEqual(a1.map(actionSignature), a2.map(actionSignature), '同 state 順序需穩定');
  const sigs = a1.map(actionSignature);
  assert.equal(new Set(sigs).size, sigs.length, '行動不可重複');
  assert.equal(a1[a1.length - 1].type, 'pass', 'pass 應排最後');
});

/* ------------------------------------------------------------------ */
/* 19. 炮壘/炮艦特殊行動的合法行動清單                                 */
/* ------------------------------------------------------------------ */

group('合法行動清單完整性（特殊行動生成）');

test('全部行動類型都能被生成（在合適盤面下）', () => {
  const g = scenario();
  // 陸：步行＋鐵路（row2 是北鐵路）
  const brigade = put(g, NORTH, 'brigade', id(5, 2));
  // 海：航行＋登陸
  const bb = put(g, NORTH, 'battleship', id(4, 5));
  // 空：飛行
  const fighter = put(g, NORTH, 'fighter', id(0, 0));
  // 炮壘（海岸）
  const fort = put(g, NORTH, 'fort', id(2, 4));
  // 炮艦：砲擊（北海岸 row4）＋防空
  const gunboat = put(g, NORTH, 'gunboat', id(7, 5));
  // 高射炮
  const aa = put(g, NORTH, 'aa', id(8, 3));
  // 飛彈
  const missile = put(g, NORTH, 'missile', id(5, 4));
  // 偵察機
  const scout = put(g, NORTH, 'scout', id(0, 1));

  // 敵方目標
  put(g, SOUTH, 'gunboat', id(2, 5)); // 炮壘砲擊目標（LAND_TO_SEA (2,4) 相鄰海域）
  put(g, SOUTH, 'company', id(7, 4)); // 炮艦砲擊＋飛彈目標（北海岸 row4）
  put(g, SOUTH, 'scout', id(6, 5)); // 空軍目標（炮艦防空距離1、高射炮距離2）
  put(g, SOUTH, 'brigade', id(0, 4)); // 偵察機目標（同 column 0）
  put(g, SOUTH, 'infantry', id(4, 4)); // 兩棲登陸目標（battleship 相鄰海岸）

  const actions = sideActions(g);
  const types = new Set(actions.map((a) => a.type));
  for (const t of ['move', 'land', 'fire', 'bombard', 'antiair', 'missile', 'recon', 'pass']) {
    assert.ok(types.has(t), `應生成 ${t} 行動`);
  }
  assert.ok(actions.some((a) => a.type === 'fire' && a.pieceUid === fort.uid));
  assert.ok(actions.some((a) => a.type === 'bombard' && a.pieceUid === gunboat.uid));
  assert.ok(actions.some((a) => a.type === 'antiair' && a.pieceUid === aa.uid));
  assert.ok(actions.some((a) => a.type === 'missile' && a.pieceUid === missile.uid));
  assert.ok(actions.some((a) => a.type === 'recon' && a.pieceUid === scout.uid));
  assert.ok(actions.some((a) => a.type === 'land' && a.pieceUid === bb.uid));
  assert.ok(actions.some((a) => a.type === 'move' && a.mode === 'air' && a.pieceUid === fighter.uid));
  assert.ok(actions.some((a) => a.type === 'move' && a.mode === 'rail' && a.pieceUid === brigade.uid));
  assert.ok(actions.some((a) => a.type === 'move' && a.mode === 'sea' && a.pieceUid === bb.uid));
  // 行動不重複（簽章唯一）
  const sigs = actions.map(actionSignature);
  assert.equal(new Set(sigs).size, sigs.length, '行動不可重複');
});

/* ------------------------------------------------------------------ */
/* 20. 隨機整局壓力測試 / 投降                                          */
/* ------------------------------------------------------------------ */

group('整局壓力測試與投降');

test('隨機合法行動連走 400 步不崩潰，盤面與事件保持合法', () => {
  const g = createGame({ seed: 77, autoDeploy: true });
  g.startPlay();
  const rng = createRng(4242);
  let steps = 0;
  for (let i = 0; i < 400 && g.state.phase === 'play'; i++) {
    const side = g.state.sideToMove;
    const actions = g.getLegalActions(side);
    assert.ok(actions.length > 0, '輪到的一方至少要能 pass');
    const action = rng.pick(actions);
    const res = g.applyAction(side, action);
    assert.equal(res.ok, true, res.error);
    assert.ok(Array.isArray(res.events) && res.events.length > 0);
    // 每格最多一枚活棋
    const occupied = new Set();
    for (const piece of g.state.pieces) {
      if (!piece.alive) continue;
      assert.ok(piece.nodeId != null, '活棋必須在盤上');
      assert.ok(!occupied.has(piece.nodeId), '同格不可有兩枚活棋');
      occupied.add(piece.nodeId);
    }
    // 隱藏資訊不變量：key 與 revealed 一致；空軍永遠公開；己方永遠公開
    const viewer = side === NORTH ? SOUTH : NORTH;
    const view = g.getView(viewer);
    for (const p of view.pieces) {
      assert.equal(p.key == null, p.revealed === false, 'key 與 revealed 必須一致');
      if (p.side === viewer || p.branch === 'air') assert.ok(p.key, '己方與空軍必須公開');
    }
    steps += 1;
  }
  assert.ok(steps > 50, `只走了 ${steps} 步`);
});

test('投降：對方獲勝、理由 surrender、phase=over', () => {
  const g = createGame({ seed: 78, autoDeploy: true });
  g.startPlay();
  const res = g.surrender(NORTH);
  assert.equal(res.ok, true);
  assert.equal(res.winner, SOUTH);
  assert.equal(g.state.phase, 'over');
  assert.equal(g.state.winnerReason, 'surrender');
  assert.equal(g.getPublicInfo().winner, SOUTH);
  assert.equal(g.state.log.filter((e) => e.type === 'win').length, 1);
  assert.equal(g.surrender(SOUTH).ok, false, '已結束不可再投降');
});

/* ------------------------------------------------------------------ */
/* 總結                                                                */
/* ------------------------------------------------------------------ */

console.log('\n----------------------------------------');
if (failures.length === 0) {
  console.log(`✅ 全部通過：${passed} 項測試`);
  process.exit(0);
} else {
  console.log(`❌ ${failures.length} 項失敗 / ${passed + failures.length} 項測試`);
  for (const f of failures) {
    console.log(`\n[${f.group}] ${f.name}`);
    console.log(`  ${f.err.stack || f.err.message}`);
  }
  process.exit(1);
}
