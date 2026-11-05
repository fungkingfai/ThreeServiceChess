/**
 * 三軍棋棋盤資料（Three-Service Chess board）
 * ------------------------------------------------------------------
 * 棋盤：13 x 13 的方格點陣。
 *   - 北方陸地： row 0..4
 *   - 海洋：     row 5..7
 *   - 南方陸地： row 8..12
 *   所有 13*13=169 個格子節點都是「地面節點」（陸地或海洋），
 *   而「空中航線」則覆蓋全部節點（正交方向）。
 *
 * 棋盤特徵（參考臺史博典藏 2010.031.0527.0002 棋盤紙）：
 *   - 三座城門（gate）：每方各三座，軍旗只能佈於其中一座。
 *   - 兩座行營（camp）：每方各兩座，敵方陸軍不得攻擊營內棋子。
 *   - 四座機場（airport）：棋盤四角，每方兩座，空軍開局位置。
 *   - 五個錨點（anchor）：每方沿岸五個，海軍開局位置。
 *   - 鐵路（rail）：每方領地內一條橫貫鐵路，左右兩側跨海鐵橋相連，
 *     形成環形鐵道；陸軍沿鐵路一回合最多行三站。
 *   - 海岸線：陸地最靠海的一列為海岸節點，海軍可砲擊／登陸，
 *     炮壘可對相鄰海域開火。
 *
 * 座標約定：
 *   col = 0..12 （x 軸，西→東）
 *   row = 0..12 （z 軸，北→南；北方 = AI 或上家）
 *   world 座標： x = col - 6, z = row - 6（單位格），y 向上。
 *
 * 所有節點 id = row * 13 + col。
 */

export const COLS = 13;
export const ROWS = 13;
export const CELL = 1;

export function nodeId(col, row) {
  return row * COLS + col;
}
export function idToCR(id) {
  return { col: id % COLS, row: Math.floor(id / COLS) };
}
export function isInside(col, row) {
  return col >= 0 && col < COLS && row >= 0 && row < ROWS;
}

export const NORTH = 'north';
export const SOUTH = 'south';
export const SEA = 'sea';
export const SIDES = [NORTH, SOUTH];
export const otherSide = (side) => (side === NORTH ? SOUTH : NORTH);

/** 三個 zone 的 row 範圍 */
export const ZONE_ROWS = {
  north: [0, 4],
  sea: [5, 7],
  south: [8, 12],
};

export function zoneOfRow(row) {
  if (row <= 4) return NORTH;
  if (row >= 8) return SOUTH;
  return SEA;
}

/** 特徵節點（以 [col,row] 定義） */
export const GATE_CR = {
  north: [[2, 0], [6, 0], [10, 0]],
  south: [[2, 12], [6, 12], [10, 12]],
};
export const CAMP_CR = {
  north: [[1, 3], [11, 3]],
  south: [[1, 9], [11, 9]],
};
export const AIRPORT_CR = {
  north: [[0, 0], [12, 0]],
  south: [[0, 12], [12, 12]],
};
export const ANCHOR_COLS = [1, 4, 6, 8, 11];
export const ANCHOR_CR = {
  north: ANCHOR_COLS.map((c) => [c, 5]),
  south: ANCHOR_COLS.map((c) => [c, 7]),
};

/** 鐵路：橫貫 row 2（北）與 row 10（南），左右 col 0 / col 12 跨海。 */
export const RAIL_ROWS = { north: 2, south: 10 };
export const RAIL_BRIDGE_COLS = [0, 12];
export const BRIDGE_ROWS = [5, 6, 7];

/** 建立節點表 */
function buildNodes() {
  const nodes = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const id = nodeId(col, row);
      const zone = zoneOfRow(row);
      const node = {
        id,
        col,
        row,
        x: col - 6,
        z: row - 6,
        zone, // 'north' | 'sea' | 'south'
        kind: 'normal', // 'normal' | 'gate' | 'camp' | 'airport' | 'anchor' | 'bridge'
        side: zone === SEA ? null : zone, // 領地所屬
        rail: false, // 是否為鐵路車站
        coastal: false, // 陸地且與海相鄰
        gate: null, // 城門編號 0..2
        anchorOwner: null, // 錨點所屬方
        bridge: false, // 跨海鐵橋站
      };
      nodes.push(node);
    }
  }
  const at = (col, row) => nodes[nodeId(col, row)];

  for (const side of SIDES) {
    GATE_CR[side].forEach(([c, r], i) => {
      const n = at(c, r);
      n.kind = 'gate';
      n.gate = i;
    });
    for (const [c, r] of CAMP_CR[side]) at(c, r).kind = 'camp';
    for (const [c, r] of AIRPORT_CR[side]) at(c, r).kind = 'airport';
    for (const [c, r] of ANCHOR_CR[side]) {
      const n = at(c, r);
      n.kind = 'anchor';
      n.anchorOwner = side;
    }
  }

  // 鐵路車站
  for (const side of SIDES) {
    const rr = RAIL_ROWS[side];
    for (let c = 0; c < COLS; c++) at(c, rr).rail = true;
  }
  for (const c of RAIL_BRIDGE_COLS) {
    for (let r = RAIL_ROWS.north; r <= RAIL_ROWS.south; r++) {
      at(c, r).rail = true;
      if (BRIDGE_ROWS.includes(r)) {
        at(c, r).bridge = true;
        at(c, r).kind = 'bridge';
      }
    }
  }

  // 海岸節點
  for (const node of nodes) {
    if (node.zone === SEA) continue;
    for (let dc = -1; dc <= 1; dc++) {
      const nr = node.zone === NORTH ? node.row + 1 : node.row - 1;
      if (!isInside(node.col + dc, nr)) continue;
      if (at(node.col + dc, nr).zone === SEA) {
        node.coastal = true;
        break;
      }
    }
  }
  return nodes;
}

export const NODES = buildNodes();
export const NODE = Object.fromEntries(NODES.map((n) => [n.id, n]));

export function nodeAt(col, row) {
  if (!isInside(col, row)) return null;
  return NODES[nodeId(col, row)];
}
export function nodeById(id) {
  return NODE[id] ?? null;
}

/* ------------------------------------------------------------------ */
/* 相鄰關係                                                           */
/* ------------------------------------------------------------------ */

const DIRECTIONS8 = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

function buildAdjacency() {
  /** 陸上步行相鄰（僅陸地節點，不含機場，不含跨海鐵橋） */
  const walk = new Map();
  /** 海上航行相鄰（僅海域節點，不含鐵橋站） */
  const sea = new Map();
  /** 鐵路相鄰（車站之間，含跨海鐵橋） */
  const rail = new Map();

  for (const n of NODES) {
    walk.set(n.id, []);
    sea.set(n.id, []);
    rail.set(n.id, []);
  }

  for (const n of NODES) {
    if (n.zone !== SEA && n.kind !== 'airport') {
      for (const [dc, dr] of DIRECTIONS8) {
        const m = nodeAt(n.col + dc, n.row + dr);
        if (!m || m.zone === SEA || m.kind === 'airport') continue;
        walk.get(n.id).push(m.id);
      }
    }
    if (n.zone === SEA && !n.bridge) {
      for (const [dc, dr] of DIRECTIONS8) {
        const m = nodeAt(n.col + dc, n.row + dr);
        if (!m || m.zone !== SEA || m.bridge) continue;
        sea.get(n.id).push(m.id);
      }
    }
  }

  // 鐵路邊
  const railEdges = [];
  const addRail = (a, b) => {
    if (a == null || b == null) return;
    if (!a.rail || !b.rail) return;
    railEdges.push([a.id, b.id]);
    rail.get(a.id).push(b.id);
    rail.get(b.id).push(a.id);
  };
  // 橫貫鐵路
  for (const side of SIDES) {
    const r = RAIL_ROWS[side];
    for (let c = 0; c < COLS - 1; c++) addRail(nodeAt(c, r), nodeAt(c + 1, r));
  }
  // 左右跨海 + 連接各方的縱向鐵路（col 0 / 12，row 2..10）
  for (const c of RAIL_BRIDGE_COLS) {
    for (let r = RAIL_ROWS.north; r < RAIL_ROWS.south; r++) {
      addRail(nodeAt(c, r), nodeAt(c, r + 1));
    }
  }

  // 去重
  for (const [key, list] of rail) {
    const seen = new Set();
    rail.set(key, list.filter((v) => (seen.has(v) ? false : (seen.add(v), true))));
  }

  return { walk, sea, rail, railEdges };
}

const ADJ = buildAdjacency();
export const WALK_ADJ = ADJ.walk;
export const SEA_ADJ = ADJ.sea;
export const RAIL_ADJ = ADJ.rail;
export const RAIL_EDGES = ADJ.railEdges;

/* ------------------------------------------------------------------ */
/* 海岸相鄰（陸 ↔ 海）                                                */
/* ------------------------------------------------------------------ */

function buildCoastal() {
  /** seaId -> [{landId}]  海軍可砲擊／登陸的海岸陸地節點 */
  const seaToLand = new Map();
  /** landId -> [seaId]  炮壘可攻擊的相鄰海域節點 */
  const landToSea = new Map();
  for (const n of NODES) {
    seaToLand.set(n.id, []);
    landToSea.set(n.id, []);
  }
  for (const land of NODES) {
    if (land.zone === SEA) continue;
    const seaRow = land.zone === NORTH ? land.row + 1 : land.row - 1;
    for (let dc = -1; dc <= 1; dc++) {
      const m = nodeAt(land.col + dc, seaRow);
      if (!m || m.zone !== SEA) continue;
      seaToLand.get(m.id).push(land.id);
      landToSea.get(land.id).push(m.id);
    }
  }
  return { seaToLand, landToSea };
}
const COASTAL = buildCoastal();
export const SEA_TO_LAND = COASTAL.seaToLand;
export const LAND_TO_SEA = COASTAL.landToSea;

/* ------------------------------------------------------------------ */
/* 佈陣區域                                                           */
/* ------------------------------------------------------------------ */

function buildDeployZones() {
  const zones = {};
  for (const side of SIDES) {
    const [r0, r1] = ZONE_ROWS[side];
    const land = [];
    const anyLand = [];
    const coastal = [];
    for (let row = r0; row <= r1; row++) {
      for (let col = 0; col < COLS; col++) {
        const n = nodeAt(col, row);
        if (n.kind === 'airport') continue;
        // 城門也可佈置任何陸軍棋子（作為軍旗誘餌），故納入 allLand；
        // 但仍有獨立的 gates 清單供「軍旗」使用。
        anyLand.push(n.id);
        if (row === r0 || row === r1) land.push(n.id);
        if (n.coastal) coastal.push(n.id);
      }
    }
    // 後方三列 = 一般陸軍佈陣區（含鐵路列）
    const rear = [];
    const rearRows = side === NORTH ? [0, 1, 2] : [12, 11, 10];
    for (const row of rearRows) {
      for (let col = 0; col < COLS; col++) {
        const n = nodeAt(col, row);
        if (n.kind === 'airport' || n.kind === 'gate') continue;
        rear.push(n.id);
      }
    }
    zones[side] = {
      rearLand: rear,
      allLand: anyLand,
      coastal,
      gates: GATE_CR[side].map(([c, r]) => nodeId(c, r)),
      anchors: ANCHOR_CR[side].map(([c, r]) => nodeId(c, r)),
      airports: AIRPORT_CR[side].map(([c, r]) => nodeId(c, r)),
    };
  }
  return zones;
}
export const DEPLOY_ZONES = buildDeployZones();

/* ------------------------------------------------------------------ */
/* 空中航線                                                           */
/* ------------------------------------------------------------------ */

/** 空中節點 = 棋盤內全部節點（機場也含在內） */
export const AIR_NODES = NODES.map((n) => n.id);

/** 從某節點往某方向延伸的航線節點（含起點後第一個到邊界），dir: 'n'|'s'|'e'|'w' */
export function airLine(fromId, dir) {
  const n = NODE[fromId];
  const out = [];
  const d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[dir];
  if (!d) return out;
  let c = n.col + d[0];
  let r = n.row + d[1];
  while (isInside(c, r)) {
    out.push(nodeId(c, r));
    c += d[0];
    r += d[1];
  }
  return out;
}

/** 兩個節點是否在同一航線直線上（回傳方向），否則 null */
export function airDirection(aId, bId) {
  const a = NODE[aId], b = NODE[bId];
  if (a.col === b.col) return b.row < a.row ? 'n' : 's';
  if (a.row === b.row) return b.col < a.col ? 'w' : 'e';
  return null;
}

/** 空中距離（棋盤格 Chebyshev 距離） */
export function gridDistance(aId, bId) {
  const a = NODE[aId], b = NODE[bId];
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

/* ------------------------------------------------------------------ */
/* 常用集合                                                           */
/* ------------------------------------------------------------------ */

export const GATE_NODES = {
  north: DEPLOY_ZONES.north.gates,
  south: DEPLOY_ZONES.south.gates,
};
export const CAMP_NODES = {
  north: CAMP_CR.north.map(([c, r]) => nodeId(c, r)),
  south: CAMP_CR.south.map(([c, r]) => nodeId(c, r)),
};
export const AIRPORT_NODES = {
  north: DEPLOY_ZONES.north.airports,
  south: DEPLOY_ZONES.south.airports,
};
export const ANCHOR_NODES = {
  north: DEPLOY_ZONES.north.anchors,
  south: DEPLOY_ZONES.south.anchors,
};
export const BRIDGE_NODES = NODES.filter((n) => n.bridge).map((n) => n.id);
export const RAIL_NODES = NODES.filter((n) => n.rail).map((n) => n.id);

export function isCampNode(id) {
  const n = NODE[id];
  return !!n && n.kind === 'camp';
}
export function isGateNode(id) {
  const n = NODE[id];
  return !!n && n.kind === 'gate';
}
export function isAirportNode(id) {
  const n = NODE[id];
  return !!n && n.kind === 'airport';
}
export function isSeaNode(id) {
  return NODE[id]?.zone === SEA;
}
export function isLandNode(id) {
  const z = NODE[id]?.zone;
  return z === NORTH || z === SOUTH;
}

/** 陣營方向：北方玩家的「前線」是 row 4，南方玩家是 row 8 */
export function forwardRow(side) {
  return side === NORTH ? 4 : 8;
}
export function startRow(side) {
  return side === NORTH ? 0 : 12;
}

/** 給渲染用的節點分類顏色 / 圖示 key */
export function nodeFeature(id) {
  const n = NODE[id];
  if (!n) return 'none';
  if (n.kind !== 'normal') return n.kind;
  if (n.coastal) return 'coast';
  if (n.rail) return 'rail';
  return 'none';
}

export default {
  COLS, ROWS, CELL, NODES, NODE, WALK_ADJ, SEA_ADJ, RAIL_ADJ, RAIL_EDGES,
  SEA_TO_LAND, LAND_TO_SEA, DEPLOY_ZONES, GATE_NODES, CAMP_NODES,
  AIRPORT_NODES, ANCHOR_NODES, BRIDGE_NODES, RAIL_NODES,
  NORTH, SOUTH, SEA, SIDES, ZONE_ROWS,
};
