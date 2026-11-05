/**
 * 棋盤示意圖資料（規則頁專用）
 * ------------------------------------------------------------------
 * 依 DESIGN.md §1 的座標約定（13×13、北陸/海洋/南陸、環形鐵路、
 * 城門、行營、機場、錨點）建立純資料，供規則頁以 CSS Grid 繪製示意圖。
 * 不匯入 src/core/board.js（UI 只讀棋子與勝負表），避免與核心耦合。
 */

export const COLS = 13;
export const ROWS = 13;

export const GATES = {
  north: [[2, 0], [6, 0], [10, 0]],
  south: [[2, 12], [6, 12], [10, 12]],
};

export const CAMPS = {
  north: [[1, 3], [11, 3]],
  south: [[1, 9], [11, 9]],
};

export const AIRPORTS = {
  north: [[0, 0], [12, 0]],
  south: [[0, 12], [12, 12]],
};

export const ANCHOR_COLS = [1, 4, 6, 8, 11];
export const ANCHORS = {
  north: ANCHOR_COLS.map((c) => [c, 5]),
  south: ANCHOR_COLS.map((c) => [c, 7]),
};

export const ZONE_ROWS = { north: [0, 4], sea: [5, 7], south: [8, 12] };
export const RAIL_ROWS = { north: 2, south: 10 };
export const RAIL_COLS = [0, 12];
export const BRIDGE_ROWS = [5, 6, 7];
export const COASTAL_ROWS = { north: 4, south: 8 };

/** 後方三列＝一般陸軍佈陣區（示意圖著色用） */
export const REAR_ROWS = { north: [0, 1, 2], south: [10, 11, 12] };

const key = (col, row) => `${col},${row}`;
const gateSet = new Set([...GATES.north, ...GATES.south].map(([c, r]) => key(c, r)));
const campSet = new Set([...CAMPS.north, ...CAMPS.south].map(([c, r]) => key(c, r)));
const airportSet = new Set([...AIRPORTS.north, ...AIRPORTS.south].map(([c, r]) => key(c, r)));
const anchorNorth = new Set(ANCHORS.north.map(([c, r]) => key(c, r)));
const anchorSouth = new Set(ANCHORS.south.map(([c, r]) => key(c, r)));
const bridgeSet = new Set();
for (const c of RAIL_COLS) for (const r of BRIDGE_ROWS) bridgeSet.add(key(c, r));
const railSet = new Set();
for (const r of Object.values(RAIL_ROWS)) for (let c = 0; c < COLS; c++) railSet.add(key(c, r));
for (const c of RAIL_COLS) for (let r = RAIL_ROWS.north; r <= RAIL_ROWS.south; r++) railSet.add(key(c, r));

export function zoneOfRow(row) {
  if (row <= ZONE_ROWS.north[1]) return 'north';
  if (row >= ZONE_ROWS.south[0]) return 'south';
  return 'sea';
}

/** 單一節點資料 */
export function boardCell(col, row) {
  const k = key(col, row);
  const zone = zoneOfRow(row);
  const isGate = gateSet.has(k);
  const isCamp = campSet.has(k);
  const isAirport = airportSet.has(k);
  const isAnchor = anchorNorth.has(k) || anchorSouth.has(k);
  const isBridge = bridgeSet.has(k);
  const isRail = railSet.has(k);
  const coastal = zone !== 'sea' && row === COASTAL_ROWS[zone];
  const rear = zone !== 'sea' && REAR_ROWS[zone].includes(row);
  return {
    col, row, zone,
    gate: isGate,
    camp: isCamp,
    airport: isAirport,
    anchor: isAnchor,
    anchorOwner: anchorNorth.has(k) ? 'north' : anchorSouth.has(k) ? 'south' : null,
    bridge: isBridge,
    rail: isRail,
    coastal,
    rear,
    // 一般棋子可佈陣（陸地、非機場、非城門）
    deployable: zone !== 'sea' && !isGate && !isAirport,
    // 佈陣區（後方三列，一般陸軍）
    rearDeploy: rear && !isGate && !isAirport,
    railH: isRail && [RAIL_ROWS.north, RAIL_ROWS.south].includes(row) && ![RAIL_COLS[0], RAIL_COLS[1]].includes(col),
    railV: isRail && RAIL_COLS.includes(col) && !bridgeSet.has(k),
  };
}

/** 全部 169 個節點（row-major） */
export function buildBoardCells() {
  const out = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) out.push(boardCell(col, row));
  }
  return out;
}

/** 座標標籤：欄位 A–M */
export function colLabel(col) {
  return String.fromCharCode(65 + col);
}

/** 圖例 */
export const MAP_LEGEND = [
  { id: 'north', label: '北陸（AI 紅方）', swatch: 'north', desc: 'AI 的領地；最靠近海洋的一列（第 5 列）為北岸。' },
  { id: 'sea', label: '海洋（中央海域）', swatch: 'sea', desc: '海軍航行區；海域節點不含跨海鐵橋站。' },
  { id: 'south', label: '南陸（玩家綠方）', swatch: 'south', desc: '玩家的領地；第 9 列為南岸，炮壘可由此砲擊。' },
  { id: 'gate', label: '城門（3 座）', swatch: 'gate', desc: '軍旗只能藏在其中一座；被敵棋攻擊即敗北。' },
  { id: 'camp', label: '行營（2 座）', swatch: 'camp', desc: '營內棋子不受敵方陸軍攻擊（海軍、空軍、飛彈仍可）。' },
  { id: 'airport', label: '機場（2 座）', swatch: 'airport', desc: '空軍開局位置；飛彈不可攻擊機場。' },
  { id: 'anchor', label: '錨點（5 個）', swatch: 'anchor', desc: '海軍開局位置，一艦一錨點。' },
  { id: 'rail', label: '鐵路／跨海鐵橋', swatch: 'rail', desc: '陸軍每回合可沿鐵路移動 1～3 站；兩側鐵橋跨海連接南北。' },
  { id: 'coast', label: '海岸列', swatch: 'coast', desc: '北岸（第 5 列）與南岸（第 9 列）：炮壘限定佈陣於此。' },
];

export default {
  COLS, ROWS, GATES, CAMPS, AIRPORTS, ANCHORS, ANCHOR_COLS,
  ZONE_ROWS, RAIL_ROWS, RAIL_COLS, BRIDGE_ROWS, COASTAL_ROWS, REAR_ROWS,
  zoneOfRow, boardCell, buildBoardCells, colLabel, MAP_LEGEND,
};
