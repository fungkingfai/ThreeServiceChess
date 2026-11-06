/**
 * 佈陣畫面
 * ------------------------------------------------------------------
 * 桌機／平板：左側 30 枚棋子托盤（依軍種分組、已放置灰化）、右側佈陣提示與限制。
 * 手機（≤700px 或矮螢幕 ≤480px）：托盤改為可收合底部面板；
 *   收合時只顯示標題／已放置數／已選棋子與快速按鈕，讓棋盤完整露出；
 *   點選棋子後自動收合，方便玩家立即點棋盤放置。
 * 托盤點擊只負責通知 main.js（onPick），實際放置由棋盤點擊處理。
 */

import { PIECES, groupPieces, toPiece, DEPLOY_META, MOVE_META, pieceTierLabel } from './data.js';
import { pieceChip, pieceToken, branchTag } from './token.js';
import { icon } from './icons.js';
import { delegate, $, $$, escapeHtml } from './dom.js';

/** 手機（含橫向矮螢幕）判定：與 CSS 的 media query 保持一致 */
export const COMPACT_MEDIA = '(max-width: 700px), (max-height: 480px)';
export const DESKTOP_MEDIA = '(min-width: 701px) and (min-height: 481px)';

function mediaMatches(query, fallback = false) {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return fallback;
    return window.matchMedia(query).matches;
  } catch {
    return fallback;
  }
}

/** 目前是否為手機／矮螢幕（可收合托盤）版面 */
export function isCompactLayout() {
  if (mediaMatches(COMPACT_MEDIA)) return true;
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= 700 || window.innerHeight <= 480;
}

/** 把多種可能的 placed 格式正規化成 Set<pieceKey> */
export function normalizePlaced(placed) {
  const set = new Set();
  if (!placed) return set;
  if (placed instanceof Set) {
    for (const item of placed) {
      if (typeof item === 'string') set.add(item);
      else if (item) set.add(item.pieceKey || item.key || item.name);
    }
    return set;
  }
  if (Array.isArray(placed)) {
    for (const item of placed) {
      if (typeof item === 'string') set.add(item);
      else if (item) set.add(item.pieceKey || item.key || item.name);
    }
    return set;
  }
  if (typeof placed === 'object') {
    for (const [key, value] of Object.entries(placed)) {
      // { key: nodeId } 或 { key: true }
      if (value !== false && value != null) set.add(key);
    }
  }
  return set;
}

const LIMIT_ROWS = [
  { icon: 'shield', label: '陸軍・官兵／武器・地雷・陷阱', value: '21 枚', detail: '本方 5 列陸地（含城門，不含機場）' },
  { icon: 'fort', label: '炮壘', value: '1 枚', detail: '己方海岸列（北 5／南 9）' },
  { icon: 'flag', label: '軍旗', value: '1 枚', detail: '必須藏在三座城門之一' },
  { icon: 'grid', label: '城門誘餌', value: '3 門', detail: '每門可放 1 枚陸軍棋子（含軍旗）' },
  { icon: 'navy', label: '海軍五艦', value: '5 枚', detail: '五個錨點一對一' },
  { icon: 'air', label: '空軍兩機', value: '2 枚', detail: '兩座機場' },
];

export function createSetup({ onAction = null, onCollapsedChange = null } = {}) {
  const el = document.createElement('section');
  el.className = 'screen screen--setup';
  el.dataset.screenPanel = 'setup';

  const groups = groupPieces();
  el.innerHTML = `
    <div class="setup">
      <aside class="setup__tray panel" data-setup-tray aria-label="棋子托盤">
        <header class="panel__head">
          <div class="panel__heading">
            <span class="panel__icon">${icon('grid')}</span>
            <div>
              <h2 class="panel__title">佈陣</h2>
              <p class="panel__sub">南軍・綠方｜把 30 枚棋子放上棋盤</p>
            </div>
          </div>
          <div class="setup__head-actions">
            <div class="setup__counter" aria-live="polite">
              <span class="setup__counter-value" data-setup-count>0</span>
              <span class="setup__counter-total">/ 30</span>
            </div>
            <button type="button" class="setup__toggle" data-setup="toggle" aria-expanded="true" aria-label="展開或收合棋子托盤">
              <span class="setup__toggle-icon" aria-hidden="true">${icon('chevronDown')}</span>
              <span class="setup__toggle-text" data-setup-toggle-text>收合托盤</span>
            </button>
          </div>
        </header>
        <div class="setup__progress" role="progressbar" aria-label="佈陣進度" aria-valuemin="0" aria-valuemax="30" aria-valuenow="0">
          <span class="setup__progress-fill" data-setup-bar></span>
        </div>

        <div class="setup__groups" data-setup-groups>
          ${groups.map((group) => `
            <section class="setup-group" data-group="${group.id}">
              <header class="setup-group__head">
                <h3 class="setup-group__title">${escapeHtml(group.title)}</h3>
                <span class="setup-group__count" data-group-count="${group.id}">${group.items.length}</span>
              </header>
              <div class="setup-group__grid">
                ${group.items.map((piece) => pieceChip(piece, { side: 'south' })).join('')}
              </div>
            </section>`).join('')}
        </div>

        <div class="setup__collapsed" data-setup-collapsed>
          <button type="button" class="setup__collapsed-info" data-setup="expand" aria-label="展開棋子托盤選棋">
            <span class="setup__collapsed-name" data-setup-collapsed-piece>尚未選棋</span>
            <span class="setup__collapsed-hint" data-setup-collapsed-hint>點「展開托盤」選棋</span>
          </button>
          <div class="setup__collapsed-actions">
            <button type="button" class="btn btn--ghost btn--sm btn--icon" data-setup="auto">${icon('sparkles')}<span>自動佈陣</span></button>
            <button type="button" class="btn btn--primary btn--sm btn--icon setup__start" data-setup="start" disabled>${icon('play')}<span>開始戰鬥</span></button>
          </div>
        </div>

        <footer class="setup__foot">
          <div class="setup__selected" data-setup-selected>
            <span class="setup__selected-empty">點選一枚棋子開始佈陣</span>
          </div>
          <div class="setup__buttons">
            <button type="button" class="btn btn--ghost btn--icon" data-setup="auto">${icon('sparkles')}<span>自動佈陣</span></button>
            <button type="button" class="btn btn--ghost btn--icon" data-setup="reset">${icon('reset')}<span>重新佈陣</span></button>
            <button type="button" class="btn btn--primary btn--icon setup__start" data-setup="start" disabled>${icon('play')}<span>開始戰鬥</span></button>
          </div>
          <p class="setup__foot-hint" data-setup-foot-hint>尚未開始：請先放完 30 枚棋子，或按「自動佈陣」。</p>
        </footer>
      </aside>

      <aside class="setup__side">
        <div class="setup__hint glass" data-setup-hint-card>
          <span class="setup__hint-icon">${icon('compass')}</span>
          <div>
            <h3>佈陣提示</h3>
            <p data-setup-hint>點選左側棋子，再點擊棋盤上的合法位置放置。城門可放誘餌，軍旗記得藏好。</p>
          </div>
        </div>

        <div class="setup__steps glass">
          <h3><span>佈陣流程</span></h3>
          <ol class="setup__steps-list">
            <li><span class="setup__step-no">1</span><span>點選托盤中的棋子</span></li>
            <li><span class="setup__step-no">2</span><span>點擊棋盤亮起的合法位置</span></li>
            <li><span class="setup__step-no">3</span><span>30 枚全部放完後按「開始戰鬥」</span></li>
          </ol>
        </div>

        <div class="setup__limits glass">
          <h3><span>佈陣限制</span></h3>
          <ul class="setup__limit-list">
            ${LIMIT_ROWS.map((row) => `
              <li>
                <span class="setup__limit-icon">${icon(row.icon)}</span>
                <span class="setup__limit-label">${escapeHtml(row.label)}</span>
                <span class="setup__limit-value">${escapeHtml(row.value)}</span>
                <span class="setup__limit-detail">${escapeHtml(row.detail)}</span>
              </li>`).join('')}
          </ul>
          <p class="setup__gate-tip">城門可放任何陸軍棋子（軍旗、官兵、武器、地雷、陷阱）；軍旗限城門。建議三門都放棋（軍旗＋誘餌），讓對手無法從空位判斷軍旗位置。</p>
        </div>

        <div class="setup__side-actions">
          <button type="button" class="btn btn--ghost btn--icon" data-setup-side="rules">${icon('book')}<span>規則</span></button>
          <button type="button" class="btn btn--ghost btn--icon" data-setup-side="menu">${icon('chevronLeft')}<span>主選單</span></button>
          <button type="button" class="btn btn--ghost btn--icon" data-setup-side="codex">${icon('grid')}<span>圖鑑</span></button>
        </div>
      </aside>
    </div>`;

  const state = {
    placed: new Set(),
    selectedKey: '',
    canStart: false,
    side: 'south',
    collapsed: false,
    compact: false,
    onPick: null,
    onAuto: null,
    onReset: null,
    onStart: null,
  };

  const trayEl = $('[data-setup-tray]', el);
  const groupsEl = $('[data-setup-groups]', el);
  const countEl = $('[data-setup-count]', el);
  const barEl = $('[data-setup-bar]', el);
  const progressEl = $('.setup__progress', el);
  const startBtns = $$('[data-setup="start"]', el);
  const footHint = $('[data-setup-foot-hint]', el);
  const selectedEl = $('[data-setup-selected]', el);
  const hintEl = $('[data-setup-hint]', el);
  const toggleEl = $('[data-setup="toggle"]', el);
  const toggleTextEl = $('[data-setup-toggle-text]', el);
  const collapsedPieceEl = $('[data-setup-collapsed-piece]', el);
  const collapsedHintEl = $('[data-setup-collapsed-hint]', el);

  // 初始化：手機／矮螢幕預設收合，讓棋盤完整露出
  state.compact = isCompactLayout();
  state.collapsed = state.compact;
  if (state.compact) el.classList.add('setup--compact');

  let lastReportedCollapsed = null;

  function renderCollapsed() {
    const effective = state.compact && state.collapsed;
    trayEl.classList.toggle('is-collapsed', effective);
    el.classList.toggle('setup--collapsed', effective);
    if (effective !== lastReportedCollapsed) {
      lastReportedCollapsed = effective;
      if (typeof onCollapsedChange === 'function') {
        try { onCollapsedChange(effective, state.compact); } catch (error) { console.warn('[UI] onCollapsedChange 錯誤', error); }
      }
    }

    if (toggleEl) toggleEl.setAttribute('aria-expanded', String(!effective));
    if (toggleTextEl) toggleTextEl.textContent = effective ? '展開托盤' : '收合托盤';

    const piece = state.selectedKey ? toPiece(state.selectedKey) : null;
    if (collapsedPieceEl) {
      if (piece) {
        const placed = state.placed.has(piece.key);
        collapsedPieceEl.textContent = `已選：${piece.short || piece.name}`;
        collapsedHintEl.textContent = placed ? '已放置・點托盤選下一枚' : '點棋盤藍點放置';
      } else {
        collapsedPieceEl.textContent = `已放置 ${state.placed.size}/30`;
        collapsedHintEl.textContent = state.placed.size >= 30 ? '按「開始戰鬥」' : '點「展開托盤」選棋';
      }
    }
  }

  function renderChips() {
    for (const chipEl of $$('.piece-chip', groupsEl)) {
      const key = chipEl.dataset.pieceKey;
      const placed = state.placed.has(key);
      chipEl.classList.toggle('is-placed', placed);
      chipEl.classList.toggle('is-selected', key === state.selectedKey);
      chipEl.setAttribute('aria-pressed', key === state.selectedKey ? 'true' : 'false');
      const stateEl = chipEl.querySelector('.piece-chip__state');
      if (stateEl) stateEl.innerHTML = placed ? icon('check', 'ico--xs') : '';
    }
    for (const group of groups) {
      const countElGroup = $(`[data-group-count="${group.id}"]`, groupsEl);
      if (countElGroup) {
        const remaining = group.items.filter((p) => !state.placed.has(p.key)).length;
        countElGroup.textContent = remaining === 0 ? '完成' : `剩 ${remaining}`;
        countElGroup.classList.toggle('is-done', remaining === 0);
      }
    }
  }

  function renderProgress() {
    const count = state.placed.size;
    countEl.textContent = String(count);
    const pct = Math.round((count / 30) * 100);
    barEl.style.width = `${pct}%`;
    progressEl.setAttribute('aria-valuenow', String(count));
    const complete = count >= 30;
    for (const btn of startBtns) btn.disabled = !(complete || state.canStart);
    footHint.textContent = complete
      ? '佈陣完成！按「開始戰鬥」進入對局。'
      : state.canStart
        ? '按「開始戰鬥」進入對局（未放置的棋子將由系統自動補上）。'
        : `尚有 ${30 - count} 枚棋子未放置。`;
    footHint.classList.toggle('is-ready', complete || state.canStart);
  }

  function renderSelected() {
    const piece = state.selectedKey ? toPiece(state.selectedKey) : null;
    if (!piece) {
      selectedEl.innerHTML = '<span class="setup__selected-empty">點選一枚棋子開始佈陣</span>';
      return;
    }
    const deploy = DEPLOY_META[piece.deploy] || DEPLOY_META.anyLand;
    const move = MOVE_META[piece.move] || MOVE_META.static;
    selectedEl.innerHTML = `
      <div class="setup__selected-card">
        ${pieceToken(piece, { size: 'sm', side: 'south' })}
        <div class="setup__selected-body">
          <div class="setup__selected-title">
            <strong>${escapeHtml(piece.name)}</strong>
            ${branchTag(piece.branch)}
            <span class="setup__selected-tier">${escapeHtml(pieceTierLabel(piece))}</span>
          </div>
          <p class="setup__selected-desc">${escapeHtml(piece.desc || '')}</p>
          <div class="setup__selected-meta">
            <span>${icon('compass')}${escapeHtml(move.label)}</span>
            <span>${icon('grid')}${escapeHtml(deploy.short)}</span>
            <span class="${state.placed.has(piece.key) ? 'is-placed' : ''}">${state.placed.has(piece.key) ? '已放置' : '待放置'}</span>
          </div>
        </div>
      </div>`;
  }

  function renderAll() {
    renderChips();
    renderProgress();
    renderSelected();
    renderCollapsed();
  }

  // ---------------- 收合／展開 ----------------
  function setCollapsed(value) {
    state.collapsed = !!value;
    renderCollapsed();
    // 立即強制版面同步（即使沒有 transition，也確保後續 getBoundingClientRect 拿到新高度）
    if (trayEl && typeof trayEl.getBoundingClientRect === 'function') void trayEl.getBoundingClientRect().height;
    return getCollapsed();
  }

  function getCollapsed() {
    // 以實際 class 為準，避免 state 與畫面不同步
    if (!trayEl) return false;
    return !!(state.compact && trayEl.classList.contains('is-collapsed'));
  }

  function toggleCollapsed() {
    return setCollapsed(!state.collapsed);
  }

  function isCompact() {
    return !!state.compact;
  }

  /** 視窗尺寸／方向改變：≥701×481 自動展開；矮螢幕（橫向）預設收合 */
  function handleViewportChange() {
    const nextCompact = isCompactLayout();
    if (!nextCompact) {
      state.compact = false;
      state.collapsed = false;
      el.classList.remove('setup--compact');
      renderCollapsed();
      return;
    }
    const wasCompact = state.compact;
    state.compact = true;
    el.classList.add('setup--compact');
    if (typeof window !== 'undefined' && window.innerHeight <= 480) {
      state.collapsed = true; // 橫向手機：保持收合，讓棋盤最大化
    } else if (!wasCompact) {
      state.collapsed = true; // 從桌機縮到手機時預設收合
    }
    renderCollapsed();
  }

  // 托盤點擊：手機上點選棋子後自動收合，方便立即點棋盤放置
  delegate(groupsEl, '.piece-chip', 'click', (event, chipEl) => {
    // 防止點棋子的事件穿透到底下棋盤（3D picking）
    event.stopPropagation();
    const key = chipEl.dataset.pieceKey;
    state.selectedKey = key;
    renderChips();
    renderSelected();
    if (typeof state.onPick === 'function') state.onPick(key);
    if (state.compact) setCollapsed(true);
    renderCollapsed();
  });

  // 按鈕
  delegate(el, '[data-setup]', 'click', (_event, btn) => {
    const action = btn.dataset.setup;
    if (action === 'auto') {
      state.onAuto?.();
      if (state.compact) setCollapsed(true);
    } else if (action === 'reset') state.onReset?.();
    else if (action === 'start') state.onStart?.();
    else if (action === 'toggle') setCollapsed(!state.collapsed);
    else if (action === 'expand') setCollapsed(false);
  });
  delegate(el, '[data-setup-side]', 'click', (_event, btn) => {
    switch (btn.dataset.setupSide) {
      case 'rules': onAction?.('rules'); break;
      case 'menu': onAction?.('menu'); break;
      case 'codex': onAction?.('codex'); break;
      default: break;
    }
  });

  // Esc：收合托盤（手機）
  const onKeyDown = (event) => {
    if (event.key === 'Escape' && state.compact && !state.collapsed) setCollapsed(true);
  };
  if (typeof document !== 'undefined') document.addEventListener('keydown', onKeyDown);

  // 監聽 resize / orientationchange
  let resizeTimer = 0;
  const onViewportResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(handleViewportChange, 80);
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onViewportResize, { passive: true });
    window.addEventListener('orientationchange', onViewportResize, { passive: true });
  }

  /**
   * 更新佈陣面板
   * @param {object} options { pieces, placed, side, selectedKey, canStart, onPick, onAuto, onReset, onStart }
   */
  function update(options = {}) {
    if (options.placed !== undefined) state.placed = normalizePlaced(options.placed);
    if (options.side) {
      state.side = options.side;
      const badge = $('.panel__sub', el);
      if (badge) badge.textContent = `${options.side === 'north' ? '北軍・紅方' : '南軍・綠方'}｜把 30 枚棋子放上棋盤`;
    }
    if (options.selectedKey !== undefined) state.selectedKey = options.selectedKey || '';
    if (options.canStart !== undefined) state.canStart = !!options.canStart;
    if (typeof options.onPick === 'function') state.onPick = options.onPick;
    if (typeof options.onAuto === 'function') state.onAuto = options.onAuto;
    if (typeof options.onReset === 'function') state.onReset = options.onReset;
    if (typeof options.onStart === 'function') state.onStart = options.onStart;
    renderAll();
  }

  function setHint(text) {
    if (!hintEl) return;
    hintEl.textContent = text || '點選左側棋子，再點擊棋盤上的合法位置放置。城門可放誘餌，軍旗記得藏好。';
  }

  function setSelectedKey(key) {
    state.selectedKey = key || '';
    renderChips();
    renderSelected();
    renderCollapsed();
  }

  function destroy() {
    if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeyDown);
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', onViewportResize);
      window.removeEventListener('orientationchange', onViewportResize);
      window.clearTimeout(resizeTimer);
    }
    el.remove();
  }

  renderAll();

  return {
    el,
    update,
    setHint,
    setSelectedKey,
    setCollapsed,
    getCollapsed,
    toggleCollapsed,
    isCompact,
    handleViewportChange,
    getState: () => ({ ...state, placed: new Set(state.placed) }),
    destroy,
  };
}

export default createSetup;
