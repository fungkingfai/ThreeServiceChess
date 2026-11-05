/**
 * 三軍棋 AI：對手手牌推理（Belief）
 * ------------------------------------------------------------------
 * 公平性核心：AI 只能看 game.getView(side)（敵方未曝光棋的 key/name 為 null），
 * 本模組負責把「應該知道的資訊」轉成每枚未知敵棋的棋種機率分布：
 *
 *   1. 剩餘棋種池：從 30 棋種扣掉所有已曝光（含陣亡）的敵棋。
 *   2. 觀察線索（不偷看）：
 *      - 移動過 ⇒ 不可能是地雷／陷阱／炮壘／軍旗（不可移動棋種）。
 *      - 用過鐵路／步行／海上航行 ⇒ 對應軍種的可動棋種。
 *      - 用過砲擊（fire）⇒ 炮壘；bombard⇒炮艦；land⇒主力艦/巡洋艦；
 *        antiair⇒高射炮或炮艦；missile⇒飛彈；recon⇒偵察機。
 *      - 從未移動且位於城門 ⇒ 極可能是軍旗（其他棋種不能佈在城門）。
 *      - 從未移動且位於海岸佈陣列 ⇒ 可能是炮壘。
 *      - 戰鬥結果（若未自動曝光）⇒ 依勝負表過濾「打得出這個結果」的棋種。
 *   3. 取樣世界：對每枚未知敵棋抽一個一致的棋種（不重複、符合線索），
 *      供 AI 做 snapshot/clone 模擬（hard 難度 2-ply）。
 *
 * 注意：本模組「不會」讀取 game.state，只接受 getView 的結果。
 */
import { NODE, GATE_NODES, DEPLOY_ZONES, RAIL_ADJ, otherSide } from '../core/board.js';
import { createRng } from '../core/rng.js';
import {
  FULL_ROSTER,
  ARMY_KEYS,
  NAVY_KEYS,
  AIR_KEYS,
  branchOf,
  isStaticKey,
  isOfficerKey,
  isNavyKey,
  isArmyKey,
  valueOf,
  expectedValue,
  battleForecast,
} from './combat-rules.js';

const POOL_BY_BRANCH = { army: ARMY_KEYS, navy: NAVY_KEYS, air: AIR_KEYS };

/** 敵方特殊行動事件代碼 → 對應能力標記 */
const SPECIAL_TO_ACTION = {
  landing: 'land',
  bombard: 'bombard',
  fort: 'fire',
  antiair: 'antiair',
  missile: 'missile',
  recon: 'recon',
};

const ACTION_TYPES = new Set(['move', 'fire', 'bombard', 'land', 'antiair', 'missile', 'recon', 'pass']);

export class Belief {
  /**
   * @param {object} opts
   * @param {string} opts.side AI 自己的陣營（'north'|'south'）
   * @param {Function} [opts.rng] 可重現亂數
   */
  constructor({ side = 'north', rng = null } = {}) {
    this.side = side;
    this.enemy = otherSide(side);
    this.rng = rng || createRng(0x5a17c3);
    this.reset();
  }

  reset() {
    /** uid -> 觀察紀錄 */
    this.uidInfo = new Map();
    /** 已曝光（含陣亡）的敵方棋種 key */
    this.knownKeys = new Set();
    /** 已確認陣亡的敵方棋種 */
    this.deadKeys = new Set();
    /** 已知敵方軍旗所在城門 nodeId（總司令陣亡或偵察曝光後） */
    this.enemyFlagGate = null;
    this.view = null;
    this.firstViewDone = false;
    this.observedFromStart = false;
    this.hasFullHistory = false;
    this.enemyUids = new Set();
    this._seenEvents = new Set();
    this._distCache = new Map();
    this._gateFlagCache = null;
  }

  /** 是否可信「從未移動代表仍在部署位置」 */
  get trustDeployment() {
    return this.observedFromStart || this.hasFullHistory;
  }

  /* ================================================================ */
  /* 更新觀察                                                          */
  /* ================================================================ */

  /**
   * 用最新的 getView(side) 更新推理。每次 chooseAction 前呼叫。
   * @param {object} view
   */
  update(view) {
    if (!view) return this;
    this.view = view;
    this._distCache.clear();
    this._gateFlagCache = null;

    const pieces = Array.isArray(view.pieces) ? view.pieces : [];
    const enemyPieces = pieces.filter((p) => p && p.side === this.enemy);

    if (!this.firstViewDone) {
      this.firstViewDone = true;
      // log 是完整事件陣列時，可從中重建整場移動史
      this.hasFullHistory = Array.isArray(view.log);
      // AI 若是先手（第一回合、還沒有人動過），必然看到的是初始部署
      this.observedFromStart = !!(
        view.sideToMove === this.side &&
        (view.turn === undefined || view.turn <= 1) &&
        (!Array.isArray(view.log) || view.log.length === 0)
      );
    }
    if (Array.isArray(view.log) && view.log.length) this.hasFullHistory = true;

    // ---- 1. 建立/更新每枚敵棋的觀察紀錄 ----
    this.enemyUids = new Set();
    for (const p of enemyPieces) {
      if (p.uid === undefined || p.uid === null) continue;
      this.enemyUids.add(p.uid);
      let info = this.uidInfo.get(p.uid);
      if (!info) {
        info = {
          uid: p.uid,
          firstNode: p.nodeId ?? null,
          lastNode: p.nodeId ?? null,
          moved: false,
          modes: new Set(),
          actions: new Set(),
          battles: [],
          everAlive: false,
          branch: p.branch ?? null,
          landed: !!p.landed,
          knownKey: null,
          dead: false,
        };
        this.uidInfo.set(p.uid, info);
      }
      const alive = p.alive !== false;
      if (alive) info.everAlive = true;
      info.alive = alive;
      info.branch = p.branch ?? info.branch;
      if (p.landed !== undefined) info.landed = !!p.landed;
      if (info.lastNode !== null && info.lastNode !== undefined && alive && p.nodeId !== info.lastNode) {
        // 位置改變但 log 沒提供 mode 時，至少能確定「移動過」並推測移動方式
        info.moved = true;
        info.modes.add(this._inferMode(info.lastNode, p.nodeId, info));
      }
      info.lastNode = p.nodeId ?? info.lastNode;
      info.firstNode = info.firstNode ?? p.nodeId;
      if (p.key) {
        info.knownKey = p.key;
        this.knownKeys.add(p.key);
        if (!alive) this.deadKeys.add(p.key);
        if (p.key === 'flag' && alive && NODE[p.nodeId]?.kind === 'gate') this.enemyFlagGate = p.nodeId;
      }
      if (!alive) info.dead = true;
      // 若 engine 直接提供軍旗位置（部分實作會放在 view）
      if (this.enemyFlagGate === null && p.key === 'flag' && alive) this.enemyFlagGate = p.nodeId ?? null;
    }
    if (view.flagRevealed && view.flagRevealed[this.enemy]) {
      // engine 可能提供 flagGate 或 flagNodeId 欄位
      const hint = view.flagGate ?? view.flagGateNode ?? view.enemyFlagGate ?? null;
      if (typeof hint === 'number') this.enemyFlagGate = hint;
    }

    // ---- 2. 從事件紀錄更新移動/行動能力線索 ----
    this._scanLog(view.log);

    // ---- 3. 找出敵方軍旗所在城門（若已被曝光，view 中軍旗棋種已知） ----
    if (this.enemyFlagGate === null) {
      for (const p of enemyPieces) {
        if (p.key === 'flag' && p.alive !== false && NODE[p.nodeId]?.kind === 'gate') {
          this.enemyFlagGate = p.nodeId;
          break;
        }
      }
    }
    return this;
  }

  _inferMode(fromId, toId, info) {
    const a = NODE[fromId];
    const b = NODE[toId];
    if (!a || !b) return 'walk';
    if (a.zone === 'sea' && b.zone === 'sea') return 'sea';
    const railA = RAIL_ADJ.get(fromId) || [];
    if (railA.includes(toId)) return 'rail';
    if (info.landed) return 'walk';
    return 'walk';
  }

  /** 掃描視圖 log（事件物件），抽取出敵方移動與行動能力線索 */
  _scanLog(log) {
    if (!Array.isArray(log)) return;
    for (const ev of log) {
      if (!ev || typeof ev !== 'object') continue;
      const sig = this._eventSignature(ev);
      if (this._seenEvents.has(sig)) continue;
      this._seenEvents.add(sig);
      this._applyEvent(ev);
    }
  }

  _eventSignature(ev) {
    const parts = [
      ev.type, ev.uid, ev.side, ev.pieceUid, ev.attackerUid, ev.defenderUid,
      ev.from, ev.to, ev.target, ev.mode, ev.outcome, ev.special, ev.turn,
      ev.unit, ev.text,
    ];
    return parts.map((v) => (v === undefined || v === null ? '' : String(v))).join('|');
  }

  _applyEvent(ev) {
    const uidOf = (u) => (this.enemyUids.has(u) ? u : null);
    let uid = uidOf(ev.uid ?? ev.pieceUid);

    // 移動事件：記錄移動方式
    if (uid !== null && (ev.type === 'move' || ev.mode)) {
      this._markMoved(uid, ev.mode || null, ev);
    }
    // 行動類型事件（若 engine 直接記錄行動）
    if (uid !== null && ACTION_TYPES.has(ev.type) && ev.type !== 'move' && ev.type !== 'pass') {
      this._markAction(uid, ev.type, ev);
    }
    if (uid !== null && ev.type === 'reveal' && ev.toSide === this.side) {
      const info = this.uidInfo.get(uid);
      if (info && ev.key) {
        info.knownKey = ev.key;
        this.knownKeys.add(ev.key);
      }
    }

    // 戰鬥事件
    if (ev.type === 'battle') {
      const aUid = uidOf(ev.attackerUid);
      const dUid = uidOf(ev.defenderUid);
      const special = ev.special || 'normal';
      // 飛越擊落：attackerUid 是被擊落的飛機（受害者），真正的行動者是 defenderUid
      const intercepted = !!ev.intercepted;
      const outcome = ev.outcome ?? null;
      const elim = Array.isArray(ev.eliminated) ? ev.eliminated : [];
      const reveal = Array.isArray(ev.reveal) ? ev.reveal : [];
      for (const r of reveal) {
        if (r && r.uid !== undefined && this.enemyUids.has(r.uid) && r.key) {
          const info = this.uidInfo.get(r.uid);
          if (info) info.knownKey = r.key;
          this.knownKeys.add(r.key);
        }
      }

      if (aUid !== null) {
        const info = this.uidInfo.get(aUid);
        if (info) {
          if (!intercepted) {
            // 會「移動」的攻擊：一般移動攻擊、鐵路、空襲、兩棲登陸；
            // 遠距火力（砲擊／砲壘／防空／飛彈）不移動，不可當成移動證據。
            const movesByAttack = !['fort', 'bombard', 'antiair', 'missile'].includes(special);
            if (movesByAttack) info.moved = true;
            const act = SPECIAL_TO_ACTION[special];
            if (act) info.actions.add(act);
            if (special === 'air') info.modes.add('air');
            if (special === 'rail') info.modes.add('rail');
            if (ev.mode) info.modes.add(ev.mode);
          }
          info.battles.push({
            role: 'attacker',
            special,
            outcome,
            died: elim.includes(aUid),
            opponentKey: this._keyOfOwnUid(ev.defenderUid),
            opponentDied: elim.includes(ev.defenderUid),
          });
        }
      }
      if (dUid !== null) {
        const info = this.uidInfo.get(dUid);
        if (info) {
          if (intercepted) {
            // 飛越擊落：開火方（高射炮／炮艦）洩漏了「防空行動能力」
            info.actions.add('antiair');
          }
          info.battles.push({
            role: 'defender',
            special,
            outcome,
            died: elim.includes(dUid),
            opponentKey: this._keyOfOwnUid(ev.attackerUid),
            opponentDied: elim.includes(ev.attackerUid),
          });
        }
      }
    }
  }

  _markMoved(uid, mode, ev) {
    const info = this.uidInfo.get(uid);
    if (!info) return;
    info.moved = true;
    if (mode) info.modes.add(mode);
    if (ev && ev.special === 'air') info.modes.add('air');
  }

  _markAction(uid, action, ev) {
    const info = this.uidInfo.get(uid);
    if (!info) return;
    info.actions.add(action);
    if (action === 'land') info.moved = true;
    if (ev && ev.mode) info.modes.add(ev.mode);
  }

  /** 找己方（AI 自己）棋子 key（AI 一定知道自己的棋） */
  _keyOfOwnUid(uid) {
    if (uid === undefined || uid === null) return null;
    const pieces = this.view?.pieces || [];
    for (const p of pieces) {
      if (p.uid === uid && p.side === this.side) return p.key || null;
    }
    return null;
  }

  /* ================================================================ */
  /* 剩餘棋種與候選分布                                                */
  /* ================================================================ */

  /** 敵方尚未曝光的棋種池（可能包含未曝光即陣亡的棋） */
  remainingPool() {
    return FULL_ROSTER.filter((k) => !this.knownKeys.has(k));
  }

  /** 從 view 找某 uid 的棋子 */
  pieceOf(uid) {
    const pieces = this.view?.pieces || [];
    return pieces.find((p) => p.uid === uid) || null;
  }

  /** 所有「存活但棋種未知」的敵棋 */
  unknownPieces() {
    const pieces = this.view?.pieces || [];
    return pieces.filter(
      (p) => p && p.side === this.enemy && p.alive !== false && !p.key,
    );
  }

  /** 所有存活敵棋 */
  aliveEnemyPieces() {
    const pieces = this.view?.pieces || [];
    return pieces.filter((p) => p && p.side === this.enemy && p.alive !== false);
  }

  /**
   * 每枚未知敵棋的候選棋種與權重。
   * @param {number} uid
   * @returns {{key:string, weight:number}[]}
   */
  getCandidates(uid) {
    if (this._distCache.has(uid)) return this._distCache.get(uid).candidates;
    const p = this.pieceOf(uid);
    if (!p || p.side !== this.enemy || p.alive === false) return [];
    if (p.key) return [{ key: p.key, weight: 1 }];

    const info = this.uidInfo.get(uid) || {};
    // 事件紀錄已曝光棋種（例如偵察回報）但 view 尚未同步時，也視為已知
    if (info.knownKey) return [{ key: info.knownKey, weight: 1 }];
    const landed = !!p.landed;
    const branch = this._branchOfPiece(p, info, landed);
    const pool = this.remainingPool();
    let branchPool = pool.filter((k) => branchOf(k) === branch);
    if (!branchPool.length) branchPool = POOL_BY_BRANCH[branch] || pool.slice();

    const candidates = [];
    for (const key of branchPool) {
      const w = this._candidateWeight(p, info, key, landed, branch);
      if (w > 0) candidates.push({ key, weight: w });
    }
    if (!candidates.length) {
      // 資料異常時回退成均勻分布，確保 AI 不會崩潰
      for (const key of branchPool) candidates.push({ key, weight: 1 });
    }
    this._applyGateFlagPrior(uid, candidates);
    const entry = { candidates };
    this._distCache.set(uid, entry);
    return candidates;
  }

  _branchOfPiece(p, info, landed) {
    if (p.branch) return p.branch;
    if (landed) return 'navy';
    if (info.branch) return info.branch;
    // 由位置猜測：海上 ⇒ 海軍；機場 ⇒ 空軍；其餘陸軍
    const node = NODE[p.nodeId];
    if (node && node.zone === 'sea') return 'navy';
    if (node && node.kind === 'airport') return 'air';
    return 'army';
  }

  /**
   * 單一（棋、棋種）組合的權重。0＝與觀察矛盾，直接排除。
   */
  _candidateWeight(p, info, key, landed, branch) {
    const node = NODE[p.nodeId];
    if (!node) return 0;
    const moved = !!info.moved;
    const actions = info.actions || new Set();
    const modes = info.modes || new Set();
    const trust = this.trustDeployment;

    // ---- (1) 特殊行動能力線索（硬性） ----
    if (actions.size) {
      if (actions.has('fire') && key !== 'fort') return 0;
      if (actions.has('missile') && key !== 'missile') return 0;
      if (actions.has('recon') && key !== 'scout') return 0;
      if (actions.has('bombard') && key !== 'gunboat') return 0;
      if (actions.has('land') && key !== 'battleship' && key !== 'cruiser') return 0;
      if (actions.has('antiair')) {
        if (isArmyKey(key) && key !== 'aa') return 0;
        if (isNavyKey(key) && key !== 'gunboat') return 0;
        if (branchOf(key) === 'air') return 0;
      }
    }

    // ---- (2) 移動能力線索（硬性） ----
    if (!landed) {
      if (moved) {
        if (isStaticKey(key)) return 0; // 地雷/陷阱/炮壘/軍旗不可能移動
      }
      if (modes.has('sea') && !isNavyKey(key)) return 0;
      if (modes.has('land') && !(isNavyKey(key) || isArmyKey(key))) return 0;
      if (modes.has('walk') && !isArmyKey(key)) return 0;
      if (modes.has('rail') && !isArmyKey(key)) return 0;
    }

    // ---- (3) 與觀察到的戰鬥結果是否一致 ----
    if (!this._battleFilterOK(info, key)) return 0;

    let w = 1;

    // ---- (4) 部署位置先驗 ----
    if (!landed && !moved && trust) {
      const zone = DEPLOY_ZONES[this.enemy];
      if (key === 'flag') {
        // 軍旗只能佈在城門且永遠不能移動（真正的機率由 _gateFlagInfo 調整）
        if (!GATE_NODES[this.enemy].includes(node.id)) return 0;
      } else if (key === 'fort') {
        if (!zone.coastal.includes(node.id)) return 0;
        w *= 2.4; // 海岸未動的棋，炮壘機率高（它只能佈在海岸且不能動）
      } else if (isStaticKey(key)) {
        // 地雷/陷阱只能佈在 allLand（不含機場/城門）
        if (!zone.allLand.includes(node.id)) return 0;
        w *= key === 'mine' || key === 'trap' ? 1.5 : 1;
      }
    } else {
      // 資訊不完整時用軟性先驗
      if (key === 'fort' && node.coastal && !moved) w *= 1.8;
      if ((key === 'mine' || key === 'trap') && !moved) w *= 1.3;
      // 軍旗機率由 _gateFlagInfo 統一調整；此處只保留非城門的微量可能（實際上會再歸零）
    }

    // 軍旗只能永遠待在城門（規則硬限制；非城門格不可能是軍旗）
    if (key === 'flag' && node.kind !== 'gate') return 0;
    if (key === 'flag' && this.enemyFlagGate !== null && node.id !== this.enemyFlagGate) return 0;

    // 已確認的軍旗位置：其他棋種若在該城門上反而是「非旗」線索（先驗微調）
    if (key !== 'flag' && this.enemyFlagGate !== null && node.id === this.enemyFlagGate) {
      w *= 1.1;
    }

    // ---- (5) 戰術先驗（不強，只影響取樣傾向） ----
    if (!moved && !landed) {
      if (isOfficerKey(key)) {
        // 高階官兵通常坐鎮後方/中央要道
        const row = node.row;
        const backRow = this.enemy === 'north' ? 0 : 12;
        const depth = Math.abs(row - backRow);
        w *= 1 + Math.max(0, 4 - depth) * 0.06;
      }
      if (key === 'commander') w *= 1.05;
      if (node.kind === 'camp') w *= 1.2; // 行營保護高價值棋
      if (node.kind === 'gate' && (key === 'mine' || key === 'trap')) w *= 0.5; // 城門只能放旗，前題已排除
    }
    if (node.zone === 'sea' && isNavyKey(key)) w *= 1.0;
    if (landed && isNavyKey(key)) w *= 1.0;

    return w;
  }

  /**
   * 若戰鬥沒有自動曝光棋種，用「打出來的結果」過濾候選。
   * 例如：某未知守方被總司令攻擊後存活 ⇒ 排除會被總司令消滅的棋種。
   */
  _battleFilterOK(info, candidateKey) {
    const battles = info?.battles;
    if (!battles || !battles.length) return true;
    for (const b of battles) {
      if (!b.outcome || !b.opponentKey) continue;
      let fc = null;
      if (b.role === 'defender') {
        fc = battleForecast(b.opponentKey, candidateKey, b.special || 'normal');
      } else if (b.role === 'attacker') {
        fc = battleForecast(candidateKey, b.opponentKey, b.special || 'normal');
      }
      if (!fc) continue; // 資訊不足（例如代打者不明）時不排除
      // 死傷狀況必須一致
      if (b.role === 'defender') {
        if (!!fc.defenderDies !== !!b.died) return false;
        if (!!fc.attackerDies !== !!b.opponentDied) return false;
      } else {
        if (!!fc.attackerDies !== !!b.died) return false;
        if (!!fc.defenderDies !== !!b.opponentDied) return false;
      }
    }
    return true;
  }

  /**
   * 城門「軍旗誘餌」機率模型（Lead 裁決的新規則）：
   * 三座城門都可佈任何陸軍棋子；軍旗永遠不會移動，因此
   * 「所有從未移動過的敵方城門棋子」之中「恰好有一枚」是軍旗。
   * 若這樣子的棋有 k 枚，則每一枚是軍旗的邊際機率為 1/k。
   * 若 k=1，該枚必為軍旗（其他棋種機率歸零）。
   */
  _gateFlagInfo() {
    if (this._gateFlagCache) return this._gateFlagCache;
    const uids = new Set();
    for (const p of this.aliveEnemyPieces()) {
      if (p.branch !== 'army' || p.landed) continue;
      const node = NODE[p.nodeId];
      if (!node || node.kind !== 'gate') continue;
      const info = this.uidInfo.get(p.uid);
      if (info && info.moved) continue; // 移動過就不可能是軍旗
      uids.add(p.uid);
    }
    const info = {
      uids,
      k: uids.size,
      flagKnown: this.knownKeys.has('flag') || this.enemyFlagGate !== null,
    };
    this._gateFlagCache = info;
    return info;
  }

  /**
   * 套用城門軍旗先驗：調整候選權重使「未移動城門棋是軍旗」的機率 = 1/k。
   * @param {number} uid
   * @param {{key:string,weight:number}[]} candidates
   */
  _applyGateFlagPrior(uid, candidates) {
    const info = this._gateFlagInfo();
    if (!info.uids.has(uid) || info.k <= 0) return;
    if (info.flagKnown) return; // 軍旗已曝光，剩下的城門棋都是誘餌
    const flagEntry = candidates.find((c) => c.key === 'flag');
    if (info.k <= 1) {
      // 只剩這一枚未移動的城門棋 → 必是軍旗
      if (!flagEntry) return;
      candidates.length = 0;
      candidates.push({ key: 'flag', weight: 1 });
      return;
    }
    const others = candidates.filter((c) => c.key !== 'flag');
    let othersSum = 0;
    for (const c of others) othersSum += c.weight;
    if (othersSum <= 0) return;
    // 令 flag 權重 wf 滿足 wf/(wf+othersSum) = 1/k  ⇒ wf = othersSum/(k-1)
    const wf = othersSum / (info.k - 1);
    if (flagEntry) flagEntry.weight = wf;
    else candidates.push({ key: 'flag', weight: wf });
  }

  /**
   * 某枚未知敵棋的棋種分布（key → 機率，總和 1）。
   * @param {number} uid
   * @returns {Map<string, number>}
   */
  getDistribution(uid) {
    const p = this.pieceOf(uid);
    if (!p) return new Map();
    if (p.key) return new Map([[p.key, 1]]);
    const cached = this._distCache.get(uid);
    if (cached && cached.dist) return cached.dist;
    const candidates = this.getCandidates(uid);
    let total = 0;
    for (const c of candidates) total += c.weight;
    const dist = new Map();
    if (total <= 0) {
      for (const c of candidates) dist.set(c.key, 1 / Math.max(1, candidates.length));
    } else {
      for (const c of candidates) dist.set(c.key, c.weight / total);
    }
    this._distCache.set(uid, { candidates, dist });
    return dist;
  }

  /** 對某枚敵棋「哪個棋種」的確定程度（0~1，1＝已確定） */
  certainty(uid) {
    const dist = this.getDistribution(uid);
    let max = 0;
    for (const p of dist.values()) max = Math.max(max, p);
    return max;
  }

  /** 敵方軍旗在三個城門的機率分布（nodeId → 機率） */
  flagGateDistribution() {
    const out = new Map();
    if (this.enemyFlagGate !== null) {
      out.set(this.enemyFlagGate, 1);
      return out;
    }
    for (const p of this.unknownPieces()) {
      const node = NODE[p.nodeId];
      if (!node || node.kind !== 'gate') continue;
      const dist = this.getDistribution(p.uid);
      const pf = dist.get('flag') || 0;
      if (pf > 0) out.set(p.nodeId, (out.get(p.nodeId) || 0) + pf);
    }
    // 若完全沒有候選（例如還沒看到城門棋子），假設三個城門均勻
    if (out.size === 0) {
      for (const g of GATE_NODES[this.enemy]) out.set(g, 1 / 3);
    }
    return out;
  }

  /** 敵方剩餘總價值期望（存活棋） */
  enemyMaterial() {
    let v = 0;
    for (const p of this.aliveEnemyPieces()) {
      if (p.key) v += valueOf(p.key);
      else v += expectedValue(this.getDistribution(p.uid));
    }
    return v;
  }

  /* ================================================================ */
  /* 取樣世界                                                          */
  /* ================================================================ */

  /**
   * 依 belief 抽一個「一致的世界」：每枚未知敵棋指定一個棋種。
   * 只用於 AI 內部模擬，不影響真實遊戲。
   * @param {object} [view] 可選，會先 update
   * @param {Function} [rng]
   * @returns {{assignment: Map<number,string>, ok:boolean, uncertain:number}}
   */
  sampleWorld(view = null, rng = this.rng) {
    if (view) this.update(view);
    const unknowns = this.unknownPieces();
    const entries = unknowns.map((p) => ({ uid: p.uid, list: this.getCandidates(p.uid) }));
    // 候選越少越先排，降低回溯失敗率
    entries.sort((a, b) => a.list.length - b.list.length);

    const used = new Set();
    const assignment = new Map();
    let nodes = 0;
    const NODE_LIMIT = 5000;

    const rec = (i) => {
      if (i >= entries.length) return true;
      if (++nodes > NODE_LIMIT) return false;
      const { uid, list } = entries[i];
      const avail = list.filter((c) => c.weight > 0 && !used.has(c.key));
      if (!avail.length) return false;
      // 加權隨機順序（Efraimidis–Spirakis：r = u^(1/w)）
      const order = avail
        .map((c) => ({ key: c.key, r: Math.pow(rng(), 1 / Math.max(1e-9, c.weight)) }))
        .sort((a, b) => b.r - a.r);
      for (const c of order) {
        used.add(c.key);
        assignment.set(uid, c.key);
        if (rec(i + 1)) return true;
        used.delete(c.key);
        assignment.delete(uid);
      }
      return false;
    };

    let ok = rec(0);
    if (!ok) {
      // 放寬限制（只保證同軍種、不重複），避免極端情況 AI 卡死
      assignment.clear();
      used.clear();
      ok = this._looseAssign(unknowns, assignment, used);
    }
    return { assignment, ok, uncertain: unknowns.length };
  }

  _looseAssign(unknowns, assignment, used) {
    // 1) 軍旗：優先分配給「候選包含 flag」的城門棋；
    //    即使其他約束無解，也要維持「軍旗在城門、且未移動」這個鐵則。
    if (!this.knownKeys.has('flag')) {
      const flagCandidates = unknowns.filter(
        (p) => NODE[p.nodeId]?.kind === 'gate' && !(this.uidInfo.get(p.uid)?.moved),
      );
      const target =
        flagCandidates.find((p) => this.getCandidates(p.uid).some((c) => c.key === 'flag')) ||
        flagCandidates[0] ||
        null;
      if (target) {
        used.add('flag');
        assignment.set(target.uid, 'flag');
      }
    }
    // 2) 其餘棋子：先依軍種分池，同軍種池用盡才退化為任意剩餘棋種
    const remaining = new Map();
    for (const key of this.remainingPool()) {
      if (used.has(key)) continue;
      const b = branchOf(key);
      if (!remaining.has(b)) remaining.set(b, []);
      remaining.get(b).push(key);
    }
    for (const p of unknowns) {
      if (assignment.has(p.uid)) continue;
      const info = this.uidInfo.get(p.uid) || {};
      const branch = this._branchOfPiece(p, info, !!p.landed);
      let pool = remaining.get(branch) || [];
      let key = pool.find((k) => !used.has(k));
      if (!key) {
        // 同軍種已無可用棋種（異常局面）→ 找任何未使用棋種
        key = this.remainingPool().find((k) => !used.has(k));
      }
      if (!key) return false;
      used.add(key);
      assignment.set(p.uid, key);
    }
    return true;
  }

  /* ================================================================ */
  /* 便捷查詢                                                          */
  /* ================================================================ */

  /** 取得敵方某枚棋若為某棋種的戰鬥預測；未知時回傳 null */
  forecastAgainst(attackerKey, targetUid, special = 'normal') {
    const dist = this.getDistribution(targetUid);
    if (!dist.size) return null;
    const results = new Map();
    for (const [defKey, prob] of dist) {
      const fc = battleForecast(attackerKey, defKey, special);
      if (fc) results.set(defKey, { prob, forecast: fc });
    }
    return results;
  }

  /** 簡短除錯字串 */
  describe() {
    const lines = [];
    lines.push(`[Belief ${this.side} vs ${this.enemy}] trustDeployment=${this.trustDeployment}`);
    for (const p of this.aliveEnemyPieces()) {
      if (p.key) {
        lines.push(` uid=${p.uid} 已知=${p.key} @${p.nodeId}`);
      } else {
        const dist = [...this.getDistribution(p.uid).entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k, v]) => `${k}:${(v * 100).toFixed(0)}%`)
          .join(' ');
        const info = this.uidInfo.get(p.uid);
        lines.push(` uid=${p.uid} ? @${p.nodeId} [${dist}] moved=${info?.moved} actions=${[...(info?.actions || [])]}`);
      }
    }
    return lines.join('\n');
  }
}

/**
 * 便利函式：建立一個 belief 並用 view 初始化（給測試/外部使用）。
 * @param {object} opts { side, view, rng }
 */
export function createBelief(opts = {}) {
  const b = new Belief(opts);
  if (opts.view) b.update(opts.view);
  return b;
}

export default Belief;
