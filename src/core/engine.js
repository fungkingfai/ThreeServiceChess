/**
 * 三軍棋核心引擎（engine）
 * ------------------------------------------------------------------
 * 唯一權威狀態機：佈陣 → 對戰 → 勝負。提供 DESIGN.md §3.1 的完整 API：
 *   createGame / game.deploy / autoDeploy / startPlay / getView / getLegalActions /
 *   applyAction / getActionsForPiece / canAct / pass / snapshot / restore / clone /
 *   getPublicInfo（另補 isDeployed / surrender 便利 API）。
 *
 * 設計原則：
 *   - 純 JS ES module：不得 import three.js / DOM / src/ai / src/ui。
 *   - state 為純 JSON 可序列化資料（AI 用 snapshot/restore/clone 快速模擬）。
 *   - applyAction 不留任何全域狀態；戰鬥完全決定性（勝負表），不需隨機。
 *   - 隱藏資訊：state.revealed[side] 表示「該方是否已知此棋棋種」；getView 嚴格遮蔽。
 *   - 事件流格式依 DESIGN §3.1：move / battle / reveal / flagExposed / win / pass / deploy。
 *
 * 規則細節取捨（規格未明處）：
 *   - 城門平衡規則（house rule，Lead 裁定）：
 *       (a) 三座城門可佈置「任何陸軍棋子」（含軍旗、官兵、可動武器、地雷、陷阱；
 *           每門一格），因此敵方只看到「某城門有棋背」，無法確定軍旗位置。
 *           軍旗仍只能佈在城門（deploy='gate' → zone.gates）。
 *       (b) 空軍（戰鬥機／偵察機）不得攻擊城門節點上的棋子、也不得停在城門格；
 *           可以飛越城門上空。偵察機 recon 仍可揭露城門上的棋子。
 *           飛彈原本就不可選城門／機場。軍旗只能靠陸軍（或登陸後）攻破城門。
 *   - 兩棲登陸：可登陸己方或敵方相鄰海岸節點；登陸後成為一般陸上棋子
 *     （可在鐵路站使用鐵路，依 Lead 確認）。
 *   - 行營保護：任何「行營」節點內的棋子都不受敵方陸軍（含鐵路、登陸後艦）攻擊；
 *     空軍攻擊、飛彈、砲擊不受限。（本棋盤行營不在海岸列，砲擊實際打不到。）
 *   - 飛越擊落：飛機以 air mode 移動（含攻擊移動，不含 recon）時，若途中（不含終點）
 *     經過敵方高射炮或炮艦所在節點立即被擊落，該回合結束；開火方曝光。
 *   - 飛彈發射後必定消滅；對潛水艇依覆寫為 N（潛艇無損、飛彈落空消滅）。
 *   - 戰鬥參與者曝光受 revealOnBattle 控制；偵察／總司令陣亡／飛越擊落為規則曝光。
 *   - 無子可動：輪到某方且無任何（非 pass）合法行動時判負；雙方同時無子可動則和局。
 *   - 總司令陣亡：其擁有者的軍旗城門位置對敵方曝光（flagExposed + reveal event）。
 */

import { NORTH, SOUTH, SIDES, otherSide, NODE, DEPLOY_ZONES } from './board.js';
import { PIECES, PIECE_BY_KEY } from './pieces.js';
import { createRng, randomSeed } from './rng.js';
import { resolveCombat } from './combat.js';
import {
  generateActions,
  generateActionsForPiece,
  sideHasActions,
  isActionLegal,
  pieceByUid,
  pieceAtNode,
  movePathFor,
} from './legal-moves.js';

/** 深拷貝純資料（state 必為純 JSON；不使用 structuredClone 以確保契約） */
function deepCopy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/** 依 pieces.js 的 deploy 欄位取得該棋可佈陣的節點清單 */
function allowedDeployNodes(def, zone) {
  switch (def.deploy) {
    case 'gate':
      return zone.gates;
    case 'anchor':
      return zone.anchors;
    case 'airport':
      return zone.airports;
    case 'coastal':
      return zone.coastal;
    case 'anyLand':
    default:
      return zone.allLand;
  }
}

/** 建立初始狀態（雙方 30 枚棋子皆未佈陣） */
function createInitialState({ seed, revealOnBattle }) {
  const pieces = [];
  let uid = 1;
  for (const side of [NORTH, SOUTH]) {
    for (const def of PIECES) {
      pieces.push({
        uid: uid++,
        key: def.key,
        side,
        nodeId: null,
        alive: true,
        landed: false,
        // 己方永遠知道自己的棋；空軍永遠公開（下方統一設定）
        revealed: { north: side === NORTH, south: side === SOUTH },
      });
    }
  }
  for (const p of pieces) {
    if (PIECE_BY_KEY[p.key].branch === 'air') p.revealed = { north: true, south: true };
  }
  return {
    version: 1,
    phase: 'deploy',
    turn: 1,
    moveCount: 0,
    sideToMove: null,
    winner: null,
    winnerReason: null,
    deploy: { north: false, south: false },
    flagRevealed: { north: false, south: false },
    revealOnBattle: !!revealOnBattle,
    seed,
    pieces,
    log: [],
  };
}

/** 雙方棋子初始 uid 數量 */
const TOTAL_PIECES = PIECES.length * SIDES.length;

export class Game {
  /**
   * @param {{seed?:number, revealOnBattle?:boolean, autoDeploy?:boolean}} [options]
   */
  constructor(options = {}) {
    const seed = Number.isInteger(options.seed) ? options.seed >>> 0 : randomSeed();
    this.state = createInitialState({
      seed,
      revealOnBattle: options.revealOnBattle !== false,
    });
    this.idCounter = TOTAL_PIECES + 1;
    this._rng = createRng(seed);
    if (options.autoDeploy) {
      this.autoDeploy(NORTH);
      this.autoDeploy(SOUTH);
    }
  }

  /* ---------------------------------------------------------------- */
  /* 佈陣                                                             */
  /* ---------------------------------------------------------------- */

  /**
   * 設定某方佈陣（placements 為該方完整清單；可分批呼叫，每次以最新完整清單為準）。
   * 佈陣區依 pieces.js 的 deploy 欄位：
   *   anyLand → 全部陸地（現在含城門，可放誘餌）；gate → 三座城門（僅軍旗）；
   *   coastal → 海岸列（炮壘）；anchor → 錨點（海軍）；airport → 機場（空軍）。
   * @param {'north'|'south'} side
   * @param {Array<{pieceKey:string,nodeId:number}>} placements
   * @returns {{ok:boolean, errors:string[], placements?:Array, complete?:boolean}}
   */
  deploy(side, placements) {
    const st = this.state;
    if (!SIDES.includes(side)) return { ok: false, errors: ['未知陣營'] };
    if (st.phase !== 'deploy') return { ok: false, errors: ['已開始對戰，無法重新佈陣'] };
    if (!Array.isArray(placements)) return { ok: false, errors: ['placements 必須是陣列'] };

    const errors = [];
    const zone = DEPLOY_ZONES[side];
    const seenKeys = new Set();
    const seenNodes = new Map();
    const enemyOccupied = new Set(
      st.pieces.filter((p) => p.side !== side && p.nodeId != null).map((p) => p.nodeId),
    );

    placements.forEach((pl, i) => {
      const def = PIECE_BY_KEY[pl?.pieceKey];
      const label = def ? def.name : String(pl?.pieceKey);
      if (!def) {
        errors.push(`第 ${i + 1} 筆：未知棋子 ${label}`);
        return;
      }
      if (seenKeys.has(def.key)) {
        errors.push(`${label} 重複配置`);
        return;
      }
      seenKeys.add(def.key);
      const nodeId = pl.nodeId;
      if (!Number.isInteger(nodeId) || !NODE[nodeId]) {
        errors.push(`${label} 的座標無效`);
        return;
      }
      if (seenNodes.has(nodeId)) {
        errors.push(`${label} 與 ${seenNodes.get(nodeId)} 搶同一格`);
        return;
      }
      seenNodes.set(nodeId, label);
      if (enemyOccupied.has(nodeId)) {
        errors.push(`${label} 不可放在敵方區域`);
        return;
      }
      if (!allowedDeployNodes(def, zone).includes(nodeId)) {
        errors.push(`${label} 不可佈於此地（佈陣區：${def.deploy}）`);
      }
    });

    if (errors.length) return { ok: false, errors };

    // 驗證通過 → 原子套用（先清空該方，再放上本次清單）
    const sidePieces = st.pieces.filter((p) => p.side === side);
    for (const p of sidePieces) p.nodeId = null;
    for (const pl of placements) {
      const piece = sidePieces.find((p) => p.key === pl.pieceKey);
      if (piece) piece.nodeId = pl.nodeId;
    }
    st.deploy[side] = sidePieces.every((p) => p.nodeId != null);
    st.log.push({ type: 'deploy', side });
    return {
      ok: true,
      errors: [],
      placements: placements.map((pl) => ({ pieceKey: pl.pieceKey, nodeId: pl.nodeId })),
      complete: st.deploy[side],
    };
  }

  /**
   * 自動佈陣（合法、有基本戰術考量），會直接套用並回傳 30 筆 placements。
   * @param {'north'|'south'} side
   * @returns {Array<{pieceKey:string,nodeId:number}>}
   */
  autoDeploy(side) {
    const st = this.state;
    if (st.phase !== 'deploy' || !SIDES.includes(side)) return [];
    const zone = DEPLOY_ZONES[side];
    const rng = this._rng;
    const placements = [];
    const used = new Set();
    /** 放入並記錄（nodeId 必須唯一；重複則略過） */
    const place = (pieceKey, nodeId) => {
      if (nodeId == null || used.has(nodeId)) return false;
      placements.push({ pieceKey, nodeId });
      used.add(nodeId);
      return true;
    };

    // 1. 軍旗：三座城門隨機一座（隱藏位置）
    const flagGate = rng.pick([...zone.gates]);
    place('flag', flagGate);

    // 2. 城門誘餌：另兩座城門放地雷／陷阱，讓敵方無法從「哪個城門有棋」
    //    判斷軍旗（三門都有一枚棋背）。敵方陸軍攻門時也可能先踩雷。
    const decoyGates = rng.shuffle(zone.gates.filter((gid) => gid !== flagGate));
    place('mine', decoyGates[0]);
    place('trap', decoyGates[1]);

    // 3. 空軍：兩座機場一對一
    const airports = rng.shuffle([...zone.airports]);
    place('fighter', airports[0]);
    place('scout', airports[1]);

    // 4. 海軍：五個錨點一對一
    const anchors = rng.shuffle([...zone.anchors]);
    ['battleship', 'cruiser', 'gunboat', 'destroyer', 'submarine'].forEach((key, i) =>
      place(key, anchors[i]),
    );

    // 5. 炮壘：海岸節點（優先中段，方便封鎖航道）
    const coastal = rng.shuffle([...zone.coastal]);
    const midCoastal = coastal.filter((id) => {
      const c = NODE[id].col;
      return c >= 3 && c <= 9;
    });
    place('fort', midCoastal[0] ?? coastal[0]);

    // 6. 其餘 20 枚陸上棋子：高階軍官藏後方、可動武器放中前線、其餘補位
    const free = rng.shuffle(zone.allLand.filter((id) => !used.has(id)));
    /** 從剩餘空地中挑一格（不標記；由 place 標記，確保唯一） */
    const take = (pred) => {
      const idx = free.findIndex((id) => !used.has(id) && pred(id));
      if (idx >= 0) return free[idx];
      for (const id of free) {
        if (!used.has(id)) return id;
      }
      return null;
    };
    const rearRows = side === NORTH ? [0, 1] : [12, 11];
    const frontRows = side === NORTH ? [3, 4] : [8, 9];
    const isRear = (id) => rearRows.includes(NODE[id].row);
    const isFront = (id) => frontRows.includes(NODE[id].row);

    // 高階軍官藏後方
    for (const key of ['commander', 'army_group', 'corps', 'division', 'brigade']) {
      place(key, take(isRear) ?? take(() => true));
    }
    // 可動武器放中前線
    for (const key of ['atomic', 'tank', 'cannon', 'aa', 'mg', 'bomb', 'missile', 'gas']) {
      place(key, take(isFront) ?? take(() => true));
    }
    // 其餘軍官補位
    for (const key of ['battalion', 'company', 'platoon', 'cavalry', 'infantry', 'engineer']) {
      place(key, take(() => true));
    }

    this.deploy(side, placements);
    return placements.map((pl) => ({ pieceKey: pl.pieceKey, nodeId: pl.nodeId }));
  }

  /** 某方是否已完成佈陣 */
  isDeployed(side) {
    return !!this.state.deploy[side];
  }

  /**
   * 雙方佈陣完成 → 進入對戰，北軍先手。
   * @returns {{ok:boolean, error?:string}}
   */
  startPlay() {
    const st = this.state;
    if (st.phase !== 'deploy') return { ok: false, error: '已不在佈陣階段' };
    if (!st.deploy.north || !st.deploy.south) {
      return { ok: false, error: '雙方尚未完成佈陣' };
    }
    st.phase = 'play';
    st.sideToMove = NORTH;
    st.turn = 1;
    st.moveCount = 0;
    return { ok: true };
  }

  /* ---------------------------------------------------------------- */
  /* 視圖（隱藏資訊）                                                  */
  /* ---------------------------------------------------------------- */

  /** 單一棋子對某視角的呈現（嚴格遮蔽棋種） */
  _viewPiece(piece, viewer) {
    const def = PIECE_BY_KEY[piece.key];
    const visible =
      piece.side === viewer ||
      def.branch === 'air' || // 空軍永遠公開
      !!(piece.revealed && piece.revealed[viewer]);
    return {
      uid: piece.uid,
      side: piece.side,
      key: visible ? piece.key : null,
      name: visible ? def.name : null,
      branch: def.branch, // 陸／海／空軍種永遠可見（棋背顏色）
      nodeId: piece.nodeId,
      alive: piece.alive,
      revealed: visible, // 此視角是否已知棋種
      landed: !!piece.landed,
      category: visible ? def.category : null,
      short: visible ? def.short : null,
      art: visible ? def.art : null,
    };
  }

  /**
   * 給某方看的視圖（一般 UI / AI 都應該用這個，不要直接讀 game.state）。
   * @param {'north'|'south'} side
   */
  getView(side) {
    if (!SIDES.includes(side)) throw new Error(`getView: 未知陣營 ${side}`);
    const st = this.state;
    // 只讓指定方看到與其相關的 reveal 事件（例如己方偵察機的回報）
    const log = st.log.filter(
      (e) => e.type !== 'reveal' || e.toSide == null || e.toSide === side,
    );
    return {
      phase: st.phase,
      turn: st.turn,
      sideToMove: st.sideToMove,
      winner: st.winner,
      winnerReason: st.winnerReason,
      flagRevealed: { ...st.flagRevealed },
      deploy: { ...st.deploy },
      revealOnBattle: st.revealOnBattle,
      pieces: st.pieces.map((p) => this._viewPiece(p, side)),
      log: deepCopy(log),
      lastEvent: log.length ? deepCopy(log[log.length - 1]) : null,
    };
  }

  /* ---------------------------------------------------------------- */
  /* 合法行動                                                          */
  /* ---------------------------------------------------------------- */

  /** 某方全部合法行動（含 pass；非該方回合回傳 []） */
  getLegalActions(side) {
    return generateActions(this.state, side);
  }

  /** 供 UI 高亮：某枚棋子的合法行動（不含 pass） */
  getActionsForPiece(side, uid) {
    return generateActionsForPiece(this.state, side, uid);
  }

  /** 某方是否還有任何合法行動（不含 pass） */
  canAct(side) {
    if (this.state.phase !== 'play') return false;
    return sideHasActions(this.state, side);
  }

  /** 直接 pass（換手） */
  pass(side) {
    return this.applyAction(side, { type: 'pass' });
  }

  /* ---------------------------------------------------------------- */
  /* 套用行動                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * 套用一個合法行動。
   * @returns {{ok:true, events:Array, winner?:string, winnerReason?:string}|{ok:false, error:string}}
   */
  applyAction(side, action) {
    const st = this.state;
    if (st.phase !== 'play') return { ok: false, error: '尚未開始對戰' };
    if (side !== st.sideToMove) return { ok: false, error: '尚未輪到該方' };
    if (!action || typeof action.type !== 'string') return { ok: false, error: '缺少行動' };
    if (!isActionLegal(st, side, action)) return { ok: false, error: '非法行動' };

    const events = [];
    const piece = action.type === 'pass' ? null : pieceByUid(st, action.pieceUid);
    switch (action.type) {
      case 'pass':
        events.push({ type: 'pass', side });
        break;
      case 'move':
        this._applyMoveAction(st, piece, action, events);
        break;
      case 'land':
        this._applyLanding(st, piece, action, events);
        break;
      case 'fire':
        this._applyScoredAttack(st, piece, action, 'fort', events);
        break;
      case 'bombard':
        this._applyScoredAttack(st, piece, action, 'bombard', events);
        break;
      case 'antiair':
        this._applyScoredAttack(st, piece, action, 'antiair', events);
        break;
      case 'missile':
        this._applyScoredAttack(st, piece, action, 'missile', events);
        break;
      case 'recon':
        this._applyRecon(st, piece, action, events);
        break;
      default:
        return { ok: false, error: '未知行動類型' };
    }

    // 先完成回合結算（可能追加 win 事件），再整批寫入事件日誌
    this._finishTurn(st, events);
    for (const ev of events) st.log.push(ev);

    const result = { ok: true, events };
    if (st.winner) {
      result.winner = st.winner;
      result.winnerReason = st.winnerReason;
    }
    return result;
  }

  /** 一般移動（步行／鐵路／航行／飛行）；目標有敵棋則發生戰鬥 */
  _applyMoveAction(st, piece, action, events) {
    const from = piece.nodeId;
    const to = action.to;
    const target = pieceAtNode(st, to);
    const path = movePathFor(st, piece, action);

    // 飛越擊落（空軍移動時，途中經過敵方高射炮／炮艦）
    if (action.mode === 'air') {
      const shooter = this._findInterceptor(st, piece.side, path);
      if (shooter) {
        this._resolveFlyover(st, piece, shooter, path, events);
        return;
      }
    }

    if (!target) {
      piece.nodeId = to;
      events.push({
        type: 'move',
        uid: piece.uid,
        side: piece.side,
        from,
        to,
        path,
        mode: action.mode,
      });
      return;
    }

    const special =
      action.mode === 'air' ? 'air' : action.mode === 'rail' ? 'rail' : undefined;
    this._battle(st, piece, target, { special, moveTo: to, from }, events);
  }

  /** 兩棲登陸：空地＝上岸；敵棋＝登陸戰 */
  _applyLanding(st, piece, action, events) {
    const from = piece.nodeId;
    const to = action.to;
    const target = pieceAtNode(st, to);
    if (!target) {
      piece.nodeId = to;
      piece.landed = true;
      events.push({
        type: 'move',
        uid: piece.uid,
        side: piece.side,
        from,
        to,
        path: [from, to],
        mode: 'land',
      });
      return;
    }
    this._battle(st, piece, target, { special: 'landing', moveTo: to, from }, events);
  }

  /** 砲擊／轟擊／防空等「不移動的計分攻擊」 */
  _applyScoredAttack(st, piece, action, special, events) {
    const target = pieceAtNode(st, action.target);
    if (!target || !target.alive) return;
    this._battle(
      st,
      piece,
      target,
      { special, moveTo: null, from: piece.nodeId },
      events,
    );
  }

  /** 偵察機偵察：目標對己方曝光（不戰鬥、不移動） */
  _applyRecon(st, piece, action, events) {
    const target = pieceAtNode(st, action.target);
    if (!target || !target.alive) return;
    const side = piece.side;
    if (!target.revealed[side]) {
      target.revealed[side] = true;
      if (target.key === 'flag') st.flagRevealed[target.side] = true;
      events.push({
        type: 'reveal',
        uid: target.uid,
        toSide: side,
        source: 'scout',
        key: target.key,
      });
    }
  }

  /** 找出空軍航線上的第一個敵方高射炮／炮艦（不含終點） */
  _findInterceptor(st, planeSide, path) {
    for (let i = 1; i < path.length - 1; i++) {
      const p = pieceAtNode(st, path[i]);
      if (!p || p.side === planeSide) continue;
      if (p.key === 'aa' || p.key === 'gunboat') return p;
    }
    return null;
  }

  /**
   * 飛越擊落：飛機消滅、防空方存活，該回合結束。
   *
   * 事件欄位語意（給 UI 動畫與 AI belief 的契約，勿混淆）：
   *   attackerUid = 被擊落的飛機（名義上的攻方／受害者）
   *   defenderUid = 開火的敵方高射炮或炮艦（實際造成擊落者）
   *   from = 飛機起點、to = 開火方所在節點、path = 飛機原訂航線
   *   outcome = 'D'（防守方／開火方勝）、eliminated = [飛機]、occupied = false
   *   special = 'antiair'、intercepted = true
   *   reveal 一律包含開火方與飛機（規則曝光：飛機公開、開火方擁有者已知、
   *   飛機擁有者目擊被誰擊落），不受 revealOnBattle 設定影響。
   */
  _resolveFlyover(st, plane, shooter, path, events) {
    const from = plane.nodeId;
    plane.alive = false;
    shooter.revealed = { north: true, south: true };
    plane.revealed = { north: true, south: true }; // 空軍本來就公開
    events.push({
      type: 'battle',
      attackerUid: plane.uid,
      defenderUid: shooter.uid,
      from,
      to: shooter.nodeId,
      path, // 額外欄位：被擊落位置供動畫使用
      outcome: 'D',
      reveal: [
        { uid: shooter.uid, key: shooter.key },
        { uid: plane.uid, key: plane.key },
      ],
      eliminated: [plane.uid],
      occupied: false,
      special: 'antiair',
      intercepted: true,
    });
  }

  /**
   * 戰鬥結算（一般／登陸／砲擊／防空／飛彈共用）。
   * opts: { special?, moveTo?, from? }
   *   special: 'air'|'rail'|'landing'|'fort'|'bombard'|'antiair'|'missile'
   *   moveTo: 攻方獲勝後要佔領的節點（null = 不移動）
   */
  _battle(st, attacker, defender, opts, events) {
    const from = opts.from ?? attacker.nodeId;
    const to = opts.moveTo ?? defender.nodeId;
    const special = opts.special;
    const res = resolveCombat(attacker, defender, special ? { special } : {});
    const rawX = res.rawOutcome === 'X';
    const outcome = rawX ? 'N' : res.outcome;

    const atkDies = outcome === 'B' || outcome === 'D' || special === 'missile';
    const defDies = outcome === 'A' || outcome === 'B' || outcome === 'FLAG';
    const occupied =
      !!opts.moveTo && (outcome === 'A' || outcome === 'FLAG') && !atkDies;

    // 戰鬥雙方對彼此（及雙方玩家）公開棋種（設定可關）
    let revealList = [];
    if (st.revealOnBattle && !rawX) {
      attacker.revealed.north = true;
      attacker.revealed.south = true;
      defender.revealed.north = true;
      defender.revealed.south = true;
      revealList = [
        { uid: attacker.uid, key: attacker.key },
        { uid: defender.uid, key: defender.key },
      ];
    }
    // R = 偵察：目標只對攻方曝光，不戰鬥（一般為偵察機專用）
    if (outcome === 'R') defender.revealed[attacker.side] = true;

    const eliminated = [];
    if (defDies) {
      defender.alive = false;
      eliminated.push(defender.uid);
    }
    if (atkDies) {
      attacker.alive = false;
      eliminated.push(attacker.uid);
    }
    if (occupied) {
      attacker.nodeId = to;
      if (special === 'landing') attacker.landed = true;
    }
    // 軍旗被攻擊 → 直接勝利
    if (outcome === 'FLAG') {
      st.winner = attacker.side;
      st.winnerReason = 'flag';
    }

    events.push({
      type: 'battle',
      attackerUid: attacker.uid,
      defenderUid: defender.uid,
      from,
      to,
      outcome,
      reveal: revealList,
      eliminated,
      occupied,
      special: special || undefined,
    });

    // 總司令陣亡 → 其擁有者的軍旗位置對敵方公開
    for (const uid of eliminated) {
      const p = pieceByUid(st, uid);
      if (p && p.key === 'commander') this._exposeFlag(st, p.side, events);
    }
  }

  /** 總司令陣亡：軍旗城門位置對敵方曝光 */
  _exposeFlag(st, ownerSide, events) {
    if (st.flagRevealed[ownerSide]) return;
    st.flagRevealed[ownerSide] = true;
    const enemy = otherSide(ownerSide);
    const flagPiece = st.pieces.find((p) => p.side === ownerSide && p.key === 'flag');
    events.push({ type: 'flagExposed', side: ownerSide });
    if (flagPiece) {
      flagPiece.revealed[enemy] = true;
      events.push({
        type: 'reveal',
        uid: flagPiece.uid,
        toSide: enemy,
        source: 'commander',
        key: flagPiece.key,
      });
    }
  }

  /** 結束回合：勝負檢查、判「無子可動」、換手與回合數 */
  _finishTurn(st, events) {
    if (st.winner) {
      st.phase = 'over';
      events.push({ type: 'win', winner: st.winner, reason: st.winnerReason });
      return;
    }
    const mover = st.sideToMove;
    const next = otherSide(mover);
    const nextCanAct = sideHasActions(st, next);
    if (!nextCanAct) {
      const moverCanAct = sideHasActions(st, mover);
      st.sideToMove = next; // 顯示為輪到但無子可動的一方
      st.phase = 'over';
      if (moverCanAct) {
        st.winner = mover;
        st.winnerReason = 'nomoves';
      } else {
        st.winner = 'draw';
        st.winnerReason = 'draw';
      }
      events.push({ type: 'win', winner: st.winner, reason: st.winnerReason });
      return;
    }
    st.moveCount += 1;
    if (next === NORTH) st.turn += 1; // 南北各走一步 = 一回合
    st.sideToMove = next;
  }

  /* ---------------------------------------------------------------- */
  /* 投降 / 統計                                                       */
  /* ---------------------------------------------------------------- */

  /** 投降（UI 按鈕用） */
  surrender(side) {
    const st = this.state;
    if (!SIDES.includes(side)) return { ok: false, error: '未知陣營' };
    if (st.phase === 'over') return { ok: false, error: '對戰已結束' };
    st.winner = otherSide(side);
    st.winnerReason = 'surrender';
    st.phase = 'over';
    const events = [{ type: 'win', winner: st.winner, reason: st.winnerReason }];
    st.log.push(...events);
    return { ok: true, events, winner: st.winner, winnerReason: st.winnerReason };
  }

  /** 給 HUD：各軍種存活數、被消滅棋子清單等公開統計 */
  getPublicInfo() {
    const st = this.state;
    const counts = {
      north: { army: 0, navy: 0, air: 0, total: 0 },
      south: { army: 0, navy: 0, air: 0, total: 0 },
    };
    const eliminated = [];
    for (const p of st.pieces) {
      const def = PIECE_BY_KEY[p.key];
      if (p.alive) {
        counts[p.side][def.branch] += 1;
        counts[p.side].total += 1;
      } else {
        const known = def.branch === 'air' || p.revealed.north || p.revealed.south;
        eliminated.push({
          uid: p.uid,
          side: p.side,
          key: known ? p.key : null,
          name: known ? def.name : null,
          branch: def.branch,
        });
      }
    }
    return {
      phase: st.phase,
      turn: st.turn,
      sideToMove: st.sideToMove,
      winner: st.winner,
      winnerReason: st.winnerReason,
      deploy: { ...st.deploy },
      flagRevealed: { ...st.flagRevealed },
      counts,
      aliveTotal: { north: counts.north.total, south: counts.south.total },
      eliminated,
    };
  }

  /* ---------------------------------------------------------------- */
  /* 快照 / 回溯（AI 模擬用）                                          */
  /* ---------------------------------------------------------------- */

  /**
   * 深拷貝快照：{ version, idCounter, state }（純 JSON 可序列化）。
   * AI 可在 snapshot.state.pieces 上改寫未曝光敵棋的 key 做「相信的世界」，
   * 再 restore 到 clone 上模擬（戰鬥只看 key）。
   */
  snapshot() {
    return {
      version: 1,
      idCounter: this.idCounter,
      state: deepCopy(this.state),
    };
  }

  /** 還原快照（接受 snapshot() 的結果，或直接傳 state） */
  restore(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('restore: 快照格式錯誤');
    }
    const state = snapshot.state ?? snapshot;
    if (!state || !Array.isArray(state.pieces)) {
      throw new Error('restore: 快照缺少 state.pieces');
    }
    this.state = deepCopy(state);
    if (Number.isInteger(snapshot.idCounter)) this.idCounter = snapshot.idCounter;
    return this;
  }

  /** 深拷貝出獨立 Game（AI 快速模擬用） */
  clone() {
    const g = new Game({
      seed: this.state.seed,
      revealOnBattle: this.state.revealOnBattle,
    });
    g.idCounter = this.idCounter;
    g.state = deepCopy(this.state);
    return g;
  }

  /** 除錯用：目前局面的人類可讀摘要 */
  describe() {
    const st = this.state;
    return {
      phase: st.phase,
      turn: st.turn,
      sideToMove: st.sideToMove,
      winner: st.winner,
      alive: st.pieces.filter((p) => p.alive).length,
    };
  }
}

/**
 * 建立一局遊戲。
 * @param {{seed?:number, revealOnBattle?:boolean, autoDeploy?:boolean}} [options]
 * @returns {Game}
 */
export function createGame(options = {}) {
  return new Game(options);
}

export default createGame;
