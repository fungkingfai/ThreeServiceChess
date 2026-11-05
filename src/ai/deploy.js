/**
 * 三軍棋 AI：佈陣（Deploy）
 * ------------------------------------------------------------------
 * 產生合法且有戰術的 30 枚佈陣：
 *   - 軍旗：隨機藏在三座城門之一（中央城門略受偏好）。
 *   - 地雷／陷阱：掩護軍旗城門的進逼路線與要道。
 *   - 炮壘：海岸節點，優先覆蓋軍旗方向與中央海域（敵艦登陸熱區）。
 *   - 官兵與可動武器：主力集中鐵路列與中央縱線；總司令放行營躲避陸軍攻擊；
 *     高階官兵靠中線鐵路（機動/決戰），低階官兵與工兵靠前線（試探/拆雷）。
 *   - 海軍：五個錨點一對一；主力艦/巡洋艦/炮艦放中央錨點，驅逐艦/潛艇放兩翼。
 *   - 空軍：兩座機場一對一（戰鬥機、偵察機依難度可有不同擺法）。
 *
 * 僅使用 core/board.js 的公開佈陣區資料與 core/pieces.js 的棋種定義，
 * 不修改任何 core 檔案。
 */
import {
  NODE,
  DEPLOY_ZONES,
  GATE_NODES,
  WALK_ADJ,
  ANCHOR_NODES,
  AIRPORT_NODES,
  forwardRow,
} from '../core/board.js';
import {
  FULL_ROSTER,
  isOfficerKey,
  isMovableKey,
  isArmyKey,
  isNavyKey,
  isAirKey,
  valueOf,
  rankOf,
} from './combat-rules.js';

const LAND_MOVABLE = FULL_ROSTER.filter(
  (k) => isArmyKey(k) && isMovableKey(k) && !isAirKey(k) && k !== 'flag',
);
const NAVY = FULL_ROSTER.filter((k) => isNavyKey(k));
const AIR = FULL_ROSTER.filter((k) => isAirKey(k));

/**
 * 依難度與亂數產生 AI 佈陣。
 * @param {object} opts
 * @param {string} side 'north'|'south'
 * @param {string} difficulty easy|normal|hard
 * @param {Function} rng 可重現亂數（createRng(seed)）
 * @returns {{placements: {pieceKey:string,nodeId:number}[]}}
 */
export function deployArmy({ side = 'north', difficulty = 'normal', rng }) {
  const zones = DEPLOY_ZONES[side];
  const used = new Set();
  const placements = [];
  const place = (pieceKey, node) => {
    const id = typeof node === 'number' ? node : node?.id;
    if (id === undefined || id === null || used.has(id)) return false;
    used.add(id);
    placements.push({ pieceKey, nodeId: id });
    return true;
  };

  /* ---------------- 1. 軍旗：三城門隨機 ---------------- */
  const gates = GATE_NODES[side].slice();
  // 中央城門稍微偏好（兩側城門也常被選，保留不可預測性）
  const gateWeights = gates.map((g) => (NODE[g].col === 6 ? 1.25 : 1));
  const flagGate = weightedPick(gates, gateWeights, rng);
  place('flag', flagGate);

  /* ---------------- 2. 城門誘餌＋地雷掩護要道 ---------------- */
  // 新規則（Lead 裁決）：三座城門都可佈任何陸軍棋子，敵方無法從位置判斷軍旗。
  // 戰術：軍旗佔一門；另兩門放「誘餌」——陷阱（剋制所有官兵與武器）＋
  // 步兵（官階最低的官兵，可反制前來拆門的工兵）。地雷放軍旗門前的進逼路線。
  const flagNode = NODE[flagGate];
  const otherGates = gates.filter((g) => g !== flagGate);
  const gateOrder = rng() < 0.5 ? otherGates : otherGates.slice().reverse();
  // 陷阱放第一誘餌門，步兵放第二誘餌門（皆為便宜且能懲罰盲目攻門的棋子）
  const decoyTrapGate = gateOrder[0];
  const decoyInfantryGate = gateOrder[1];
  if (decoyTrapGate !== undefined) place('trap', decoyTrapGate);
  if (decoyInfantryGate !== undefined) place('infantry', decoyInfantryGate);

  // 地雷：放在軍旗城門的進逼路線上（城門相鄰格中最可能被直衝的一格）
  const approach = (WALK_ADJ.get(flagGate) || []).filter(
    (id) => NODE[id] && !used.has(id) && isDeployableLand(id, zones),
  );
  const rankedApproach = approach
    .map((id) => {
      const n = NODE[id];
      let sc = rng() * 1.5;
      sc += (6 - Math.abs(n.col - 6)) * 0.25; // 中央路線
      sc += n.rail ? 0.8 : 0;
      if (Math.abs(n.col - 6) <= 2) sc += 0.6;
      // 與軍旗城門同縱線的下一格＝敵軍最可能直衝的格
      if (n.col === flagNode.col) sc += 1.4;
      return { id, s: sc };
    })
    .sort((a, b) => b.s - a.s)
    .map((x) => x.id);
  const mineNode = rankedApproach[0] ?? pickFreeLand(zones, used, rng);
  if (mineNode !== undefined) place('mine', mineNode);

  /* ---------------- 3. 炮壘：海岸（優先旗門方向與中央海域） ---------------- */
  const coastal = zones.coastal.filter((id) => !used.has(id));
  const fortNode = weightedPick(
    coastal,
    coastal.map((id) => {
      const n = NODE[id];
      let s = 1 + rng() * 1.2;
      s += Math.max(0, 4 - Math.abs(n.col - flagNode.col)) * 0.5; // 覆蓋旗門海路
      s += (6 - Math.abs(n.col - 6)) * 0.35; // 中央海域敵艦多
      if (n.col === 0 || n.col === 12) s += 0.6; // 海峽死角
      // 岸邊有兩個以上相鄰海域較有砲擊機會
      return s;
    }),
    rng,
  );
  if (fortNode !== undefined) place('fort', fortNode);

  /* ---------------- 4. 官兵與可動武器：分層配置 ---------------- */
  const placedKeysSoFar = new Set(placements.map((p) => p.pieceKey));
  const remainingLand = LAND_MOVABLE.filter((k) => !placedKeysSoFar.has(k));
  // 總司令優先放行營（行營不受敵方陸軍攻擊，可避免陣亡曝光軍旗）
  const camps = zones.allLand.filter((id) => NODE[id]?.kind === 'camp' && !used.has(id));
  const commander = remainingLand.splice(remainingLand.indexOf('commander'), 1)[0];
  const commanderNode = camps.length ? weightedPick(camps, camps.map(() => 1 + rng()), rng) : null;
  if (commanderNode !== undefined && commanderNode !== null) place(commander, commanderNode);
  else place(commander, pickBestLandNode(commander, zones, used, rng, side, flagGate));

  // 其餘依「價值×機動性」由高到低挑位置，避免高階官兵被擠到死角
  remainingLand.sort((a, b) => valueOf(b) - valueOf(a) + (rng() - 0.5) * 6);
  for (const key of remainingLand) {
    const node = pickBestLandNode(key, zones, used, rng, side, flagGate);
    if (node !== undefined) place(key, node);
    else {
      const fallback = pickFreeLand(zones, used, rng);
      if (fallback !== undefined) place(key, fallback);
    }
  }

  /* ---------------- 5. 海軍：五錨點一對一 ---------------- */
  const anchors = ANCHOR_NODES[side].slice().sort((a, b) => NODE[a].col - NODE[b].col);
  const center = anchors[Math.floor(anchors.length / 2)];
  const flank = anchors.filter((a) => a !== center);
  const navy = NAVY.slice();
  // 主力艦/巡洋艦/炮艦優先中央錨點（中央海域控制＋砲擊覆蓋）
  const major = ['battleship', 'cruiser', 'gunboat'].filter((k) => navy.includes(k));
  const minor = navy.filter((k) => !major.includes(k));
  // 順序依難度微調：困難時炮艦也可放中央附近
  if (difficulty === 'hard') major.sort((a, b) => valueOf(b) - valueOf(a));
  else major.sort(() => rng() - 0.5);
  const shuffledFlank = flank.slice().sort(() => rng() - 0.5);
  const navyAssign = [];
  navyAssign.push([major.shift() ?? minor.pop(), center]);
  // 剩餘中央鄰近錨點（col 4/8）給另外兩艘主力
  const near = shuffledFlank.splice(0, Math.max(0, Math.min(2, major.length)));
  for (const node of near) navyAssign.push([major.shift() ?? minor.pop(), node]);
  for (const node of shuffledFlank) navyAssign.push([minor.pop() ?? major.shift(), node]);
  for (const [key, node] of navyAssign) {
    if (key && node !== undefined) place(key, node);
  }
  // 保險：任何未放置的海軍補到空錨點
  for (const key of navy) {
    if (placements.some((p) => p.pieceKey === key)) continue;
    const free = anchors.find((a) => !used.has(a));
    if (free !== undefined) place(key, free);
    else break;
  }

  /* ---------------- 6. 空軍：兩機場一對一 ---------------- */
  const airports = AIRPORT_NODES[side].slice();
  const air = AIR.slice().sort(() => rng() - 0.5);
  for (let i = 0; i < 2; i++) {
    if (airports[i] !== undefined && air[i]) place(air[i], airports[i]);
  }

  /* ---------------- 7. 驗證：30 枚、每種一枚、合法區域 ---------------- */
  const placedKeys = new Set(placements.map((p) => p.pieceKey));
  const missing = FULL_ROSTER.filter((k) => !placedKeys.has(k));
  // 任何漏網之魚塞進剩餘合法節點（理論上不會發生）
  for (const key of missing) {
    const node = fallbackNodeFor(key, zones, used, rng);
    if (node !== undefined) place(key, node);
  }

  return { placements, flagGate };
}

/* ------------------------------------------------------------------ */
/* 輔助                                                                */
/* ------------------------------------------------------------------ */

function isDeployableLand(id, zones) {
  return zones.allLand.includes(id);
}

function weightedPick(items, weights, rng) {
  if (!items.length) return undefined;
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return items[Math.floor(rng() * items.length)];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function pickFreeLand(zones, used, rng) {
  const free = zones.allLand.filter((id) => !used.has(id));
  if (!free.length) return undefined;
  return free[Math.floor(rng() * free.length)];
}

/**
 * 為某枚陸上可動棋挑最佳節點（隨機加權，避免每局完全一樣）。
 * @returns {number|undefined}
 */
function pickBestLandNode(key, zones, used, rng, side, flagGate) {
  const free = zones.allLand.filter((id) => !used.has(id));
  if (!free.length) return undefined;
  const scored = free.map((id) => {
    const n = NODE[id];
    let s = rng() * 1.6;
    const centerCol = 6;
    const distCenter = Math.abs(n.col - centerCol);
    const isForward = n.row === forwardRow(side);

    // 中央縱線控制
    s += Math.max(0, 5 - distCenter) * 0.5;
    // 鐵路列＝機動主動脈
    if (n.rail) s += 2.2;
    // 前線壓迫
    if (isForward) s += 1.8;
    // 行營＝保護（只給中高價值棋）
    if (n.kind === 'camp') s += valueOf(key) > 45 ? 2.6 : 0.8;
    // 海岸節點：一般陸軍小加成（壓制登陸）
    if (n.coastal) s += 0.35;
    // 離敵方越近越好（北軍 row 越大＝越前）
    const advance = side === 'north' ? n.row : 12 - n.row;
    s += advance * 0.12;

    if (isOfficerKey(key)) {
      const rank = rankOf(key);
      // 高階官兵偏中央鐵路/後方指揮，低階官兵偏前線
      s += rank >= 8 ? Math.max(0, 3 - advance) * 0.6 : advance * 0.1;
      s += distCenter === 0 && n.rail ? 0.8 : 0;
    } else {
      switch (key) {
        case 'aa':
          // 高射炮守機場/中央，讓敵機不敢飛越
          s += (n.rail ? 0.6 : 0) + Math.max(0, 3 - distCenter) * 0.4;
          break;
        case 'tank':
        case 'atomic':
        case 'cannon':
        case 'mg':
          s += n.rail ? 1.0 : 0;
          s += isForward ? 1.0 : 0;
          break;
        case 'missile':
          // 飛彈沿行列直線轟擊：中央行列價值高
          s += (6 - distCenter) * 0.55;
          s += n.rail ? 0.5 : 0;
          break;
        case 'engineer':
          // 工兵要上前拆雷／拆炮壘
          s += advance * 0.25;
          break;
        case 'gas':
        case 'bomb':
          s += advance * 0.2 + (isForward ? 0.7 : 0);
          break;
        default:
          break;
      }
    }

    // 軍旗防守：保留部分棋子（中低階）在旗門附近
    const gate = NODE[flagGate];
    if (gate) {
      const cheb = Math.max(Math.abs(n.col - gate.col), Math.abs(n.row - gate.row));
      if (valueOf(key) <= 46) s += Math.max(0, 3 - cheb) * 0.45;
    }
    return { id, s };
  });
  scored.sort((a, b) => b.s - a.s);
  // 從前段隨機挑一個（增加佈陣多樣性）
  const topK = Math.min(4, scored.length);
  const pick = scored[Math.floor(rng() * topK)];
  return pick.id;
}

function fallbackNodeFor(key, zones, used, rng) {
  const { side = 'north' } = zones;
  if (isNavyKey(key)) {
    const free = zones.anchors.find((a) => !used.has(a));
    if (free !== undefined) return free;
  }
  if (isAirKey(key)) {
    const free = zones.airports.find((a) => !used.has(a));
    if (free !== undefined) return free;
  }
  if (key === 'fort') {
    const free = zones.coastal.find((a) => !used.has(a));
    if (free !== undefined) return free;
  }
  if (key === 'flag') {
    const free = zones.gates.find((a) => !used.has(a));
    if (free !== undefined) return free;
  }
  return pickFreeLand(zones, used, rng);
}

export default deployArmy;
