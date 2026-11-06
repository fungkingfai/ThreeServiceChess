/**
 * 對戰 HUD
 * ------------------------------------------------------------------
 * 上方：回合數、輪次、雙方兵力、AI 思考指示、音效／規則／設定／重新開始。
 * 左側：我方兵力（陸／海／空）、軍旗狀態、被消滅棋子。
 * 右側：敵方情資、已確認擊破、戰鬥日誌、投降。
 * 下方浮動：目前選中棋子資訊卡、棋盤操作提示、hover 棋子提示。
 *
 * updateHud(view, publicInfo) 對 game.getView()／game.getPublicInfo() 的
 * 多種可能資料形狀皆寬容處理；缺少的欄位會自動退回由 pieces 推算。
 */

import {
  PIECES, PIECE_BY_KEY, PIECE_BY_NAME,
  BRANCH_META, SIDE_META, pieceTierLabel, toPiece,
} from './data.js';
import { pieceToken, branchTag, tagList, pieceDetail } from './token.js';
import { icon, branchIcon } from './icons.js';
import { delegate, $, escapeHtml, toggleClass } from './dom.js';

const BRANCH_ORDER = ['army', 'navy', 'air'];
const BRANCH_TOTALS = { army: 23, navy: 5, air: 2 };
const TOTAL_PER_SIDE = 30;
const MAX_LOGS = 120;

const LOG_KIND = {
  move: 'move', battle: 'battle', kill: 'kill', eliminate: 'kill', dead: 'kill',
  reveal: 'reveal', recon: 'reveal', win: 'win', flag: 'win', deploy: 'system',
  pass: 'system', system: 'system', info: 'info', warn: 'warn', danger: 'danger',
  error: 'danger', success: 'info',
};

const LOG_KIND_ICON = {
  move: 'arrowRight', battle: 'sword', kill: 'skull', reveal: 'eye',
  win: 'flag', system: 'info', info: 'info', warn: 'warning', danger: 'warning',
};

/* ------------------------------------------------------------------ */
/* 資料正規化                                                          */
/* ------------------------------------------------------------------ */

function sideLabel(side) {
  return SIDE_META[side]?.label || (side === 'north' ? '北軍' : '南軍');
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 從 publicInfo 取出某一方的區塊（相容多種命名） */
export function pickSideInfo(publicInfo, side) {
  if (!publicInfo || typeof publicInfo !== 'object') return null;
  const candidates = [
    publicInfo[side],
    publicInfo.sides?.[side],
    publicInfo.bySide?.[side],
    publicInfo.info?.[side],
    publicInfo.stats?.[side],
    publicInfo.alive?.[side],
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') return candidate;
  }
  return null;
}

function readBranches(info) {
  if (!info) return null;
  const source = info.branches || info.byBranch || info.troops || info.counts || info.aliveCounts;
  const out = { army: null, navy: null, air: null };
  let has = false;
  if (source && typeof source === 'object') {
    for (const branch of BRANCH_ORDER) {
      const value = source[branch];
      let count = null;
      if (typeof value === 'number') count = value;
      else if (value && typeof value === 'object') count = num(value.alive) ?? num(value.count) ?? num(value.total) ?? num(value.remaining);
      out[branch] = count;
      if (count != null) has = true;
    }
    return has ? out : null;
  }
  const direct = {
    army: num(info.army) ?? num(info.land) ?? num(info.armyAlive) ?? num(info.armyCount),
    navy: num(info.navy) ?? num(info.sea) ?? num(info.navyAlive) ?? num(info.navyCount),
    air: num(info.air) ?? num(info.airAlive) ?? num(info.airCount),
  };
  for (const branch of BRANCH_ORDER) if (direct[branch] != null) has = true;
  return has ? direct : null;
}

function readEliminated(info) {
  if (!info) return null;
  const list = info.eliminated || info.dead || info.lost || info.destroyed || info.eliminatedPieces || info.graveyard;
  if (!Array.isArray(list)) return null;
  return list.map((item) => {
    if (!item) return null;
    if (typeof item === 'string') return { name: item };
    return {
      key: item.key || item.pieceKey || null,
      name: item.name || null,
      branch: item.branch || null,
    };
  }).filter(Boolean);
}

function readFlagAlive(info) {
  if (!info) return null;
  if (typeof info.flagAlive === 'boolean') return info.flagAlive;
  if (typeof info.flag === 'boolean') return info.flag;
  if (info.flag && typeof info.flag === 'object') return typeof info.flag.alive === 'boolean' ? info.flag.alive : null;
  if (info.flagState === 'lost' || info.flagState === 'dead') return false;
  if (info.flagState === 'alive') return true;
  return null;
}

/**
 * 由 view + publicInfo 推算一方情資
 * @returns {{alive:number, branches:object, flagAlive:boolean|null, flagKnown:boolean, dead:Array, deadCount:number, hidden:boolean}}
 */
function deriveSide(publicInfo, view, side, playerSide) {
  const info = pickSideInfo(publicInfo, side);
  const pieces = Array.isArray(view?.pieces) ? view.pieces.filter((p) => p && p.side === side) : [];
  const hasViewPieces = pieces.length > 0;

  const branches = { army: null, navy: null, air: null };
  let alive = null;
  let flagAlive = readFlagAlive(info);
  const dead = [];
  let deadCount = null;

  if (hasViewPieces) {
    for (const branch of BRANCH_ORDER) branches[branch] = 0;
    let flagSeen = false;
    for (const piece of pieces) {
      const isAlive = piece.alive !== false;
      if (isAlive) {
        if (piece.branch && branches[piece.branch] != null) branches[piece.branch] += 1;
        if (piece.key === 'flag' || piece.name === '軍旗') {
          flagAlive = true;
          flagSeen = true;
        }
      } else {
        if (piece.key === 'flag' || piece.name === '軍旗') {
          flagAlive = false;
          flagSeen = true;
        }
        dead.push({
          key: piece.key || null,
          name: piece.name || null,
          branch: piece.branch || null,
          revealed: piece.revealed !== false,
        });
      }
    }
    if (!flagSeen && flagAlive == null) flagAlive = null;
    alive = Object.values(branches).reduce((sum, count) => sum + (count || 0), 0);
    deadCount = dead.length;
  }

  // publicInfo 可補上／覆蓋數字（例如敵方未曝光棋種時仍知道各軍種數量）
  const publicBranches = readBranches(info);
  if (publicBranches) {
    for (const branch of BRANCH_ORDER) {
      if (publicBranches[branch] != null) branches[branch] = publicBranches[branch];
    }
  }
  const publicAlive = num(info?.alive) ?? num(info?.total) ?? num(info?.count) ?? num(info?.aliveCount) ?? num(info?.remaining);
  if (publicAlive != null) alive = publicAlive;
  else if (alive == null) {
    const sum = BRANCH_ORDER.reduce((acc, branch) => acc + (branches[branch] || 0), 0);
    alive = sum || null;
  }

  const publicDead = readEliminated(info);
  if (publicDead) {
    if (!dead.length) dead.push(...publicDead);
    deadCount = Math.max(deadCount ?? 0, publicDead.length);
  }
  if (deadCount == null && alive != null) deadCount = Math.max(0, TOTAL_PER_SIDE - alive);
  if (deadCount == null) deadCount = dead.length;

  return {
    alive: alive ?? null,
    branches,
    flagAlive,
    dead,
    deadCount,
    hidden: side !== playerSide,
  };
}

/**
 * 正規化 updateHud 的輸入
 */
function normalizeState(state, view, publicInfo) {
  const playerSide = state.playerSide;
  const enemySide = playerSide === 'south' ? 'north' : 'south';
  const safeView = view && typeof view === 'object' ? view : {};
  const sides = {
    [playerSide]: deriveSide(publicInfo, safeView, playerSide, playerSide),
    [enemySide]: deriveSide(publicInfo, safeView, enemySide, playerSide),
  };
  const flagRevealed = {
    [playerSide]: !!(safeView.flagRevealed?.[playerSide] ?? false),
    [enemySide]: !!(safeView.flagRevealed?.[enemySide] ?? false),
  };
  return {
    turn: num(safeView.turn) ?? state.turn ?? 1,
    sideToMove: safeView.sideToMove || state.sideToMove || null,
    phase: safeView.phase || state.phase || 'play',
    winner: safeView.winner || null,
    winnerReason: safeView.winnerReason || null,
    playerSide,
    enemySide,
    sides,
    flagRevealed,
    lastEvent: safeView.lastEvent || null,
  };
}

/* ------------------------------------------------------------------ */
/* 內部渲染小工具                                                      */
/* ------------------------------------------------------------------ */

function branchRowsHTML(branches, { hidden = false } = {}) {
  return BRANCH_ORDER.map((branch) => {
    const meta = BRANCH_META[branch];
    const total = BRANCH_TOTALS[branch];
    const alive = branches[branch];
    const pct = alive == null ? 0 : Math.max(0, Math.min(100, Math.round((alive / total) * 100)));
    return `<div class="branch-row branch-row--${branch}">
      <span class="branch-row__icon">${branchIcon(branch)}</span>
      <span class="branch-row__label">${meta.label}</span>
      <span class="branch-row__bar"><i style="width:${pct}%"></i></span>
      <span class="branch-row__count"><b>${alive == null ? (hidden ? '?' : '0') : alive}</b><span>/${total}</span></span>
    </div>`;
  }).join('');
}

function flagRowHTML(side, flagAlive, revealed) {
  let tone = 'unknown';
  let label = '位置未知';
  let hint = '軍旗藏在三座城門之一';
  if (side === 'player') {
    if (flagAlive === false) { tone = 'lost'; label = '軍旗失守'; hint = '棋局已結束'; }
    else if (flagAlive === true && revealed) { tone = 'exposed'; label = '位置已曝光'; hint = '總司令陣亡或遭偵察，敵方已知城門'; }
    else if (flagAlive === true) { tone = 'safe'; label = '城門保密'; hint = '軍旗位置尚未曝光'; }
    else { tone = 'unknown'; label = '狀態未知'; hint = '等待情報'; }
  } else {
    if (flagAlive === false) { tone = 'lost'; label = '敵旗已失守'; hint = '你已奪旗'; }
    else if (revealed) { tone = 'exposed'; label = '位置已曝光'; hint = '敵方軍旗城門位置已公開'; }
    else if (flagAlive === true) { tone = 'unknown'; label = '位置未知'; hint = '擊殺敵方總司令或偵察以揭曉'; }
    else { tone = 'unknown'; label = '位置未知'; hint = '擊殺敵方總司令或偵察以揭曉'; }
  }
  return `<div class="flag-row flag-row--${tone}">
    <span class="flag-row__icon">${icon('flag')}</span>
    <span class="flag-row__body">
      <span class="flag-row__label">${label}</span>
      <span class="flag-row__hint">${hint}</span>
    </span>
  </div>`;
}

function deadGridHTML(list, { hidden = false, fallbackCount = 0 } = {}) {
  if (!list || !list.length) {
    if (fallbackCount > 0) {
      return `<span class="hud-dead__count-only">已損失 ${fallbackCount} 枚（棋種未曝光）</span>`;
    }
    return '<span class="hud-empty">目前無損失</span>';
  }
  const items = list.slice(-24).reverse().map((item) => {
    const piece = toPiece(item.key || item.name || '') || (item.branch ? { key: '', name: '', short: '？', branch: item.branch, category: 'weapon', move: 'static', deploy: 'anyLand', tags: [] } : null);
    if (!piece) return '';
    if (!piece.key) {
      return `<span class="dead-chip dead-chip--unknown" title="${escapeHtml(BRANCH_META[item.branch]?.label || '未知')}棋子（未曝光）">
        ${branchIcon(item.branch || 'army')}<span class="dead-chip__unknown">?</span>
      </span>`;
    }
    return `<span class="dead-chip" title="${escapeHtml(piece.name)}">${pieceToken(piece, { size: 'xs', dim: true })}</span>`;
  }).join('');
  return items || '<span class="hud-empty">目前無損失</span>';
}

function normalizeLogEntry(entry) {
  if (entry == null) return null;
  if (typeof entry === 'string') return { text: entry, kind: 'system' };
  const text = entry.text ?? entry.message ?? entry.msg ?? entry.description ?? entry.label ?? '';
  if (!text) return null;
  const rawKind = entry.kind || entry.type || 'system';
  const kind = LOG_KIND[rawKind] || (entry.outcome === 'FLAG' ? 'win' : entry.outcome ? 'battle' : 'system');
  return {
    text: String(text),
    kind,
    side: entry.side || null,
    turn: num(entry.turn),
    icon: entry.icon || LOG_KIND_ICON[kind] || 'info',
    outcome: entry.outcome || null,
  };
}

function logItemHTML(entry, isNew = false) {
  const side = entry.side ? `<span class="log-item__side log-item__side--${entry.side}">${sideLabel(entry.side)}</span>` : '';
  const turn = entry.turn ? `<span class="log-item__turn">第 ${entry.turn} 回合</span>` : '';
  return `<li class="log-item log-item--${entry.kind}${isNew ? ' is-new' : ''}">
    <span class="log-item__icon">${icon(entry.icon || 'info')}</span>
    <span class="log-item__body">
      ${(turn || side) ? `<span class="log-item__meta">${turn}${side}</span>` : ''}
      <span class="log-item__text">${escapeHtml(entry.text)}</span>
    </span>
  </li>`;
}

/* ------------------------------------------------------------------ */
/* HUD 建立                                                            */
/* ------------------------------------------------------------------ */

export function createHud({ onAction = null, playerSide = 'south', side = 'south' } = {}) {
  const el = document.createElement('section');
  el.className = 'screen screen--game';
  el.dataset.screenPanel = 'game';

  el.innerHTML = `
    <div class="hud" data-hud-root>
      <header class="hud__top glass">
        <div class="hud__side hud__side--player">
          <span class="hud__mark hud__mark--green">南</span>
          <div class="hud__side-text">
            <span class="hud__side-name">南軍・你</span>
            <span class="hud__side-sub" data-player-alive-sub>30 枚棋子</span>
          </div>
        </div>

        <div class="hud__center">
          <div class="turn" data-turn-pill role="status" aria-live="polite">
            <span class="turn__round">第 <b data-turn>1</b> 回合</span>
            <span class="turn__divider" aria-hidden="true"></span>
            <span class="turn__state" data-turn-state>佈陣階段</span>
            <span class="turn__dots" aria-hidden="true"><i></i><i></i><i></i></span>
          </div>
          <div class="ai-thinking" data-ai-thinking hidden>
            <span class="ai-thinking__spinner" aria-hidden="true"><i></i><i></i><i></i></span>
            <span>北軍 AI 推演中</span>
          </div>
        </div>

        <div class="hud__side hud__side--enemy">
          <div class="hud__side-text hud__side-text--right">
            <span class="hud__side-name">北軍・AI</span>
            <span class="hud__side-sub" data-enemy-alive-sub>30 枚棋子</span>
          </div>
          <span class="hud__mark hud__mark--red">北</span>
        </div>

        <div class="hud__actions">
          <button type="button" class="icon-btn hud__drawer-btn" data-hud="drawer-left" aria-label="我方戰況" title="我方戰況">${icon('user')}</button>
          <button type="button" class="icon-btn" data-hud="sound" aria-label="音效開關" title="音效開關" aria-pressed="true">${icon('soundOn')}</button>
          <button type="button" class="icon-btn" data-hud="rules" aria-label="規則說明" title="規則說明">${icon('book')}</button>
          <button type="button" class="icon-btn" data-hud="settings" aria-label="設定" title="設定">${icon('settings')}</button>
          <button type="button" class="icon-btn" data-hud="restart" aria-label="重新開始" title="重新開始">${icon('refresh')}</button>
          <button type="button" class="icon-btn hud__drawer-btn" data-hud="drawer-right" aria-label="戰鬥日誌" title="戰鬥日誌">${icon('log')}</button>
        </div>
      </header>

      <aside class="hud__panel hud__panel--left glass" data-panel-left aria-label="我方戰況">
        <header class="hud-panel__head">
          <div class="hud-panel__title"><span class="hud-panel__dot hud-panel__dot--green"></span>我方戰力</div>
          <span class="hud-panel__badge hud-panel__badge--green">南軍・綠</span>
          <button type="button" class="icon-btn hud-panel__close" data-hud="drawer-close" aria-label="關閉我方戰況面板" title="關閉">${icon('close')}</button>
        </header>

        <div class="hud-totals">
          <div class="hud-totals__main">
            <span class="hud-totals__value" data-player-alive>30</span>
            <span class="hud-totals__label">剩餘棋子</span>
          </div>
          <div class="hud-totals__side">
            <span class="hud-totals__lost" data-player-lost>0</span>
            <span class="hud-totals__lost-label">已損失</span>
          </div>
        </div>

        <div class="hud-branches" data-player-branches></div>
        <div class="hud-flag" data-player-flag></div>

        <section class="hud-block hud-block--compare">
          <div class="hud-section-head">
            <h4>軍力對比</h4>
            <span class="hud-compare-legend"><i class="is-mine"></i>我方<i class="is-enemy"></i>敵方</span>
          </div>
          <div class="compare-list" data-compare></div>
        </section>

        <section class="hud-mini-stats">
          <div class="mini-stat"><span class="mini-stat__value" data-stat-turn>1</span><span class="mini-stat__label">回合</span></div>
          <div class="mini-stat mini-stat--gold"><span class="mini-stat__value" data-stat-kills>0</span><span class="mini-stat__label">擊破</span></div>
          <div class="mini-stat mini-stat--red"><span class="mini-stat__value" data-stat-losses>0</span><span class="mini-stat__label">損失</span></div>
        </section>

        <section class="hud-block hud-block--dead">
          <div class="hud-section-head"><h4>被消滅棋子</h4><span class="hud-section-count" data-player-dead-count>0</span></div>
          <div class="hud-dead" data-player-dead><span class="hud-empty">目前無損失</span></div>
        </section>

        <div class="hud-panel__foot-note">${icon('info')}<span>綠色光點＝可移動・紅色＝可攻擊・藍色＝可佈陣</span></div>
      </aside>

      <aside class="hud__panel hud__panel--right glass" data-panel-right aria-label="敵方情資與戰鬥日誌">
        <header class="hud-panel__head">
          <div class="hud-panel__title"><span class="hud-panel__dot hud-panel__dot--red"></span>敵方情資</div>
          <span class="hud-panel__badge hud-panel__badge--red">北軍・紅</span>
          <button type="button" class="icon-btn hud-panel__close" data-hud="drawer-close" aria-label="關閉敵方情資面板" title="關閉">${icon('close')}</button>
        </header>

        <div class="hud-totals hud-totals--enemy">
          <div class="hud-totals__main">
            <span class="hud-totals__value hud-totals__value--red" data-enemy-alive>30</span>
            <span class="hud-totals__label">敵方剩餘</span>
          </div>
          <div class="hud-totals__side">
            <span class="hud-totals__lost" data-enemy-lost>0</span>
            <span class="hud-totals__lost-label">已擊破</span>
          </div>
        </div>

        <div class="hud-branches hud-branches--enemy" data-enemy-branches></div>
        <div class="hud-flag" data-enemy-flag></div>

        <section class="hud-block hud-block--dead">
          <div class="hud-section-head"><h4>已確認擊破</h4><span class="hud-section-count" data-enemy-dead-count>0</span></div>
          <div class="hud-dead" data-enemy-dead><span class="hud-empty">尚未擊破敵棋</span></div>
        </section>

        <section class="hud-log-block">
          <div class="hud-section-head">
            <h4>戰鬥日誌</h4>
            <span class="hud-log__live"><i></i>LIVE</span>
          </div>
          <ol class="hud-log" data-log aria-live="polite"><li class="hud-log__empty">戰鬥與移動紀錄會顯示在這裡</li></ol>
        </section>

        <footer class="hud-panel__foot">
          <button type="button" class="btn btn--danger btn--sm btn--icon hud-panel__surrender" data-hud="surrender">${icon('flag')}<span>投降</span></button>
          <div class="hud-panel__foot-extra">
            <button type="button" class="btn btn--ghost btn--sm btn--icon" data-hud="settings">${icon('settings')}<span>設定</span></button>
            <button type="button" class="btn btn--ghost btn--sm btn--icon" data-hud="restart">${icon('refresh')}<span>重新開始</span></button>
          </div>
          <span class="hud-panel__foot-hint">每一步都會立即檢查勝負</span>
        </footer>
      </aside>

      <div class="hud__selected glass" data-selected hidden></div>

      <div class="hud__hint" data-hint hidden>
        <span class="hud__hint-icon">${icon('info')}</span>
        <span class="hud__hint-text" data-hint-text></span>
      </div>

      <div class="hud__drawer-scrim" data-drawer-scrim hidden></div>

      <div class="hud__tooltip" data-tooltip hidden></div>
    </div>`;

  const state = {
    playerSide: playerSide === 'north' ? 'north' : 'south',
    turn: 1,
    sideToMove: null,
    phase: 'deploy',
    winner: null,
    aiThinking: null,
    sound: true,
    logs: [],
    manualLog: false,
    lastViewLogLength: -1,
    selectedKey: null,
    stats: null,
    hintTimer: 0,
  };
  state.enemySide = state.playerSide === 'south' ? 'north' : 'south';

  const root = $('[data-hud-root]', el);
  const turnEl = $('[data-turn]', el);
  const turnStateEl = $('[data-turn-state]', el);
  const aiThinkingEl = $('[data-ai-thinking]', el);
  const playerBranchesEl = $('[data-player-branches]', el);
  const enemyBranchesEl = $('[data-enemy-branches]', el);
  const playerFlagEl = $('[data-player-flag]', el);
  const enemyFlagEl = $('[data-enemy-flag]', el);
  const playerDeadEl = $('[data-player-dead]', el);
  const enemyDeadEl = $('[data-enemy-dead]', el);
  const compareEl = $('[data-compare]', el);
  const logEl = $('[data-log]', el);
  const selectedEl = $('[data-selected]', el);
  const hintEl = $('[data-hint]', el);
  const hintTextEl = $('[data-hint-text]', el);
  const tooltipEl = $('[data-tooltip]', el);
  const soundBtn = $('[data-hud="sound"]', el);
  const drawerScrim = $('[data-drawer-scrim]', el);

  function renderTurn() {
    const { phase, sideToMove, winner, turn, aiThinking } = state;
    turnEl.textContent = String(turn ?? 1);
    let label = '';
    let tone = 'neutral';
    if (winner) {
      label = '棋局結束';
      tone = 'end';
    } else if (phase === 'deploy' || phase === 'setup') {
      label = '佈陣階段';
      tone = 'deploy';
    } else if (phase === 'play' || !phase) {
      if (sideToMove === state.playerSide) {
        label = '你的回合';
        tone = 'mine';
      } else if (sideToMove) {
        label = `${sideLabel(sideToMove)}思考中`;
        tone = 'enemy';
      } else {
        label = '等待中';
      }
    } else {
      label = '待命';
    }
    turnStateEl.textContent = label;
    const pill = $('.turn', el);
    pill.dataset.tone = tone;
    const derivedThinking = !winner && (phase === 'play' || phase === undefined)
      && !!sideToMove && sideToMove !== state.playerSide;
    const thinking = aiThinking == null ? derivedThinking : aiThinking;
    aiThinkingEl.hidden = !thinking;
    root.classList.toggle('is-ai-thinking', thinking);
  }

  function renderBranchLists(normalized) {
    const player = normalized.sides[state.playerSide];
    const enemy = normalized.sides[state.enemySide];
    playerBranchesEl.innerHTML = branchRowsHTML(player.branches);
    enemyBranchesEl.innerHTML = branchRowsHTML(enemy.branches, { hidden: true });
    playerFlagEl.innerHTML = flagRowHTML('player', player.flagAlive, normalized.flagRevealed[state.playerSide]);
    enemyFlagEl.innerHTML = flagRowHTML('enemy', enemy.flagAlive, normalized.flagRevealed[state.enemySide]);

    $('[data-player-alive]', el).textContent = player.alive == null ? '—' : String(player.alive);
    $('[data-enemy-alive]', el).textContent = enemy.alive == null ? '—' : String(enemy.alive);
    $('[data-player-lost]', el).textContent = String(Math.max(0, player.deadCount ?? 0));
    $('[data-enemy-lost]', el).textContent = String(Math.max(0, enemy.deadCount ?? 0));
    $('[data-player-alive-sub]', el).textContent = `${player.alive == null ? '—' : player.alive} 枚棋子`;
    $('[data-enemy-alive-sub]', el).textContent = `${enemy.alive == null ? '—' : enemy.alive} 枚棋子`;
    $('[data-player-dead-count]', el).textContent = String(player.dead.length || player.deadCount || 0);
    $('[data-enemy-dead-count]', el).textContent = String(enemy.dead.length || enemy.deadCount || 0);
    playerDeadEl.innerHTML = deadGridHTML(player.dead, { fallbackCount: player.deadCount ?? 0 });
    enemyDeadEl.innerHTML = deadGridHTML(enemy.dead, { hidden: true, fallbackCount: enemy.deadCount ?? 0 });
    renderCompare(player, enemy);

    // 修正我方頭像文字（若 main.js 指定玩家為北軍）
    const mark = $('.hud__mark--green', el);
    if (mark && state.playerSide === 'north') {
      mark.textContent = '北';
      mark.classList.remove('hud__mark--green');
      mark.classList.add('hud__mark--red');
    }
  }

  function compareRowHTML(branch, mine, enemy) {
    const meta = BRANCH_META[branch];
    const total = BRANCH_TOTALS[branch];
    const minePct = mine == null ? 0 : Math.max(0, Math.min(100, Math.round((mine / total) * 100)));
    const enemyPct = enemy == null ? 0 : Math.max(0, Math.min(100, Math.round((enemy / total) * 100)));
    return `<div class="compare-row">
      <span class="compare-row__label">${branchIcon(branch)}<span>${meta.label}</span></span>
      <span class="compare-row__value compare-row__value--mine">${mine == null ? '?' : mine}</span>
      <span class="compare-row__bars">
        <span class="compare-row__bar compare-row__bar--mine"><i style="width:${minePct}%"></i></span>
        <span class="compare-row__bar compare-row__bar--enemy"><i style="width:${enemyPct}%"></i></span>
      </span>
      <span class="compare-row__value compare-row__value--enemy">${enemy == null ? '?' : enemy}</span>
    </div>`;
  }

  function renderCompare(player, enemy) {
    if (!compareEl) return;
    compareEl.innerHTML = BRANCH_ORDER.map((branch) => compareRowHTML(branch, player.branches[branch], enemy.branches[branch])).join('');
    $('[data-stat-turn]', el).textContent = String(state.turn ?? 1);
    $('[data-stat-kills]', el).textContent = String(Math.max(0, enemy.deadCount ?? 0));
    $('[data-stat-losses]', el).textContent = String(Math.max(0, player.deadCount ?? 0));
  }

  function renderLogs() {
    if (!state.logs.length) {
      logEl.innerHTML = '<li class="hud-log__empty">戰鬥與移動紀錄會顯示在這裡</li>';
      return;
    }
    logEl.innerHTML = state.logs.map((entry, index) => logItemHTML(entry, index === 0)).join('');
  }

  function updateAIThinking() {
    renderTurn();
  }

  function setTurn(view) {
    if (!view) return;
    state.turn = num(view.turn) ?? state.turn;
    state.sideToMove = view.sideToMove || state.sideToMove;
    state.phase = view.phase || state.phase;
    state.winner = view.winner || null;
    renderTurn();
  }

  function updateHud(view, publicInfo) {
    const normalized = normalizeState(state, view, publicInfo);
    state.turn = normalized.turn;
    state.sideToMove = normalized.sideToMove;
    state.phase = normalized.phase;
    state.winner = normalized.winner;
    state.stats = normalized;
    renderTurn();
    renderBranchLists(normalized);

    // main.js 若只用 updateHud 提供 log，則同步 view.log（一旦手動 log() 就不再覆蓋）
    if (!state.manualLog && Array.isArray(view?.log) && view.log.length !== state.lastViewLogLength) {
      state.lastViewLogLength = view.log.length;
      const entries = view.log.map(normalizeLogEntry).filter(Boolean);
      if (entries.length !== state.logs.length || entries[0]?.text !== state.logs[0]?.text) {
        state.logs = entries.slice(-MAX_LOGS).reverse();
        renderLogs();
      }
    }
  }

  function log(entry) {
    state.manualLog = true;
    const normalized = normalizeLogEntry(entry);
    if (!normalized) return;
    state.logs.unshift(normalized);
    if (state.logs.length > MAX_LOGS) state.logs.length = MAX_LOGS;
    renderLogs();
  }

  function setLogs(entries) {
    state.manualLog = true;
    state.logs = (Array.isArray(entries) ? entries : []).map(normalizeLogEntry).filter(Boolean).slice(-MAX_LOGS).reverse();
    renderLogs();
  }

  function clearLog() {
    state.logs = [];
    renderLogs();
  }

  function setAiThinking(value) {
    state.aiThinking = value == null ? null : !!value;
    renderTurn();
  }

  function setSound(enabled) {
    state.sound = !!enabled;
    if (!soundBtn) return;
    soundBtn.innerHTML = icon(state.sound ? 'soundOn' : 'soundOff');
    soundBtn.classList.toggle('is-off', !state.sound);
    soundBtn.setAttribute('aria-pressed', state.sound ? 'true' : 'false');
    soundBtn.setAttribute('aria-label', state.sound ? '關閉音效' : '開啟音效');
  }

  function setSelected(pieceValue) {
    const piece = pieceValue ? toPiece(pieceValue) : null;
    state.selectedKey = piece?.key || null;
    if (!piece) {
      selectedEl.hidden = true;
      selectedEl.innerHTML = '';
      selectedEl.classList.remove('is-expanded');
      root.classList.remove('has-selection');
      return;
    }
    selectedEl.hidden = false;
    selectedEl.classList.remove('is-expanded');
    root.classList.add('has-selection');
    const hidden = !piece.key;
    const tier = hidden ? '未曝光的敵棋' : pieceTierLabel(piece);
    selectedEl.innerHTML = `
      <div class="selected-card__head">
        ${hidden
          ? `<span class="selected-card__back">${branchIcon(piece.branch || 'army')}<span>?</span></span>`
          : pieceToken(piece, { size: 'md', side: piece.side })}
        <div class="selected-card__title">
          <span class="selected-card__name">${escapeHtml(hidden ? '未知棋子' : piece.name)}</span>
          <span class="selected-card__meta">${escapeHtml(tier)}${piece.side ? `・${sideLabel(piece.side)}` : ''}</span>
        </div>
        ${hidden ? '' : branchTag(piece.branch)}
        <button type="button" class="selected-card__more" data-selected-more aria-expanded="false" aria-label="顯示棋子詳細資訊">詳細</button>
        <button type="button" class="icon-btn selected-card__close" data-close-selected aria-label="關閉棋子資訊" title="關閉">${icon('close')}</button>
      </div>
      <p class="selected-card__desc">${escapeHtml(hidden ? '敵方棋子尚未曝光，只能得知其軍種。' : (piece.desc || ''))}</p>
      <div class="selected-card__extra" data-selected-extra>
        ${hidden ? '' : tagList(piece, { max: 4 })}
        <div class="selected-card__actions">
          ${hidden ? '' : `<button type="button" class="link-btn" data-hud="codex-pick">在圖鑑中查看 ${icon('arrowRight')}</button>`}
          <span class="selected-card__hint">點擊光點執行行動・按 Esc 取消</span>
        </div>
      </div>`;
  }

  function setBoardHint(text, kind = 'info', options = {}) {
    window.clearTimeout(state.hintTimer);
    if (!text) {
      hintEl.hidden = true;
      hintTextEl.textContent = '';
      return;
    }
    hintEl.hidden = false;
    hintEl.dataset.kind = kind;
    hintTextEl.textContent = text;
    const duration = options.duration ?? 0;
    if (duration > 0) {
      state.hintTimer = window.setTimeout(() => { hintEl.hidden = true; }, duration);
    }
  }

  function showPieceTooltip(pieceValue, x, y) {
    const piece = toPiece(pieceValue);
    if (!piece) { hidePieceTooltip(); return; }
    tooltipEl.hidden = false;
    tooltipEl.innerHTML = `
      <div class="hud-tooltip__head">${pieceToken(piece, { size: 'xs' })}<strong>${escapeHtml(piece.name || '未知棋子')}</strong></div>
      <p>${escapeHtml(piece.desc || '')}</p>`;
    const pad = 16;
    const maxX = window.innerWidth - 280;
    const maxY = window.innerHeight - 160;
    tooltipEl.style.left = `${Math.min(Math.max(pad, x + 16), maxX)}px`;
    tooltipEl.style.top = `${Math.min(Math.max(pad, y + 16), maxY)}px`;
  }

  function hidePieceTooltip() {
    tooltipEl.hidden = true;
  }

  function setDrawer(name) {
    root.dataset.drawer = root.dataset.drawer === name ? 'none' : name;
    drawerScrim.hidden = root.dataset.drawer === 'none' || !root.dataset.drawer;
  }

  function closeDrawers() {
    root.dataset.drawer = 'none';
    drawerScrim.hidden = true;
  }

  // 事件委派
  delegate(el, '[data-hud]', 'click', (_event, btn) => {
    const action = btn.dataset.hud;
    if (action === 'drawer-left') setDrawer('left');
    else if (action === 'drawer-right') setDrawer('right');
    else if (action === 'drawer-close') closeDrawers();
    else if (action === 'codex-pick') onAction?.('codex-pick', state.selectedKey);
    else onAction?.(action);
  });
  delegate(el, '[data-close-selected]', 'click', (event) => {
    event.stopPropagation();
    setSelected(null);
  });
  delegate(el, '[data-drawer-scrim]', 'click', closeDrawers);
  delegate(el, '[data-selected-more]', 'click', (event, btn) => {
    event.stopPropagation();
    const expanded = selectedEl.classList.toggle('is-expanded');
    btn.setAttribute('aria-expanded', String(expanded));
    btn.textContent = expanded ? '收起' : '詳細';
  });

  // 初始外觀
  renderTurn();
  setSound(true);
  renderLogs();
  // 覆寫南/北軍顯示（若玩家選擇北軍）
  if (state.playerSide === 'north') {
    const playerSideEl = $('.hud__side--player', el);
    const enemySideEl = $('.hud__side--enemy', el);
    if (playerSideEl) playerSideEl.classList.add('is-player-north');
    if (enemySideEl) enemySideEl.classList.add('is-enemy-south');
  }

  function getStats() {
    return {
      turn: state.turn,
      phase: state.phase,
      winner: state.winner,
      playerSide: state.playerSide,
      enemySide: state.enemySide,
      sides: state.stats?.sides || null,
      flagRevealed: state.stats?.flagRevealed || null,
      logs: state.logs.slice(),
    };
  }

  return {
    el,
    updateHud,
    setTurnInfo: setTurn,
    setAiThinking,
    setSelected,
    setSound,
    log,
    setLogs,
    clearLog,
    setBoardHint,
    showPieceTooltip,
    hidePieceTooltip,
    setDrawer,
    closeDrawers,
    getStats,
    get isSoundOn() { return state.sound; },
    setPlayerSide(sideValue) {
      state.playerSide = sideValue === 'north' ? 'north' : 'south';
      state.enemySide = state.playerSide === 'south' ? 'north' : 'south';
      renderTurn();
    },
    destroy() {
      window.clearTimeout(state.hintTimer);
      el.remove();
    },
  };
}

export default createHud;
