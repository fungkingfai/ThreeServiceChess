/**
 * 三軍棋 UI 入口（DOM overlay）
 * ==================================================================
 * createUI(deps) 會建立整個 UI 並回傳對外 API（見下方回傳物件）。
 *
 * deps（全部可選；缺少的 callback 會安全略過）：
 *   root               自訂掛載節點，預設 #ui-root
 *   playerSide         'south'（預設）| 'north'
 *   settings           初始設定 { sound, revealOnBattle, difficulty, viewHints }
 *   persistSettings    是否用 localStorage 記住設定（預設 true）
 *   autoHideLoading    是否自動移除 #loading-screen（預設 true）
 *   loadingDelay       自動移除 loading 的延遲毫秒（預設 260）
 *
 *   onStartGame()                 主選單「開始遊戲」
 *   onMenu()                      回主選單
 *   onRestart()                   HUD／結算「重新開始」
 *   onSurrender()                 HUD「投降」確認後
 *   onAutoDeploy()                佈陣「自動佈陣」
 *   onResetDeploy()               佈陣「重新佈陣」
 *   onStartBattle()               佈陣「開始戰鬥」
 *   onDeployPick(pieceKey)        佈陣托盤點擊（若 setDeployPanel 未提供 onPick）
 *   onBattleClose()               戰鬥卡關閉（若 setBattle 未提供 onClose）
 *   onSettingsChange(settings, changedKey)  設定／音效變更
 *   onCancel()                    Esc（沒有 modal 開啟時）
 *   onModalChange(isOpen)         任何 modal 開啟／關閉
 *   onRulesOpen() / onRulesClose() / onCodexOpen()   （可選）
 *
 * 主要 API：showScreen, updateHud, showToast, log, setBattle, openRules,
 *           openSettings, setAiThinking, setSelectedPiece, setDeployPanel,
 *           setDeployHint, setTurnInfo, showGameOver, setSound, destroy …
 */

import { createModalManager, confirmDialog } from './modal.js';
import { createToasts } from './toast.js';
import { createMenu } from './menu.js';
import { createSetup } from './setup.js';
import { createHud } from './hud.js';
import { createGameOver } from './gameover.js';
import { openRulesModal } from './rules.js';
import { openSettingsModal } from './settings.js';
import { openCodexModal } from './codex.js';
import { showBattleModal } from './battle.js';
import { DEFAULT_SETTINGS, DIFFICULTY_META } from './data.js';
import { $, on } from './dom.js';

const SETTINGS_KEY = 'sanjunqi.settings.v1';
const SCREEN_NAMES = ['menu', 'setup', 'game', 'gameover'];

function loadSettings(deps) {
  let stored = {};
  if (deps.persistSettings !== false) {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (raw) stored = JSON.parse(raw) || {};
    } catch { /* 無痕模式／被封鎖時忽略 */ }
  }
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(stored && typeof stored === 'object' ? stored : {}),
    ...(deps.settings && typeof deps.settings === 'object' ? deps.settings : {}),
  };
  merged.sound = !!merged.sound;
  merged.revealOnBattle = !!merged.revealOnBattle;
  merged.viewHints = !!merged.viewHints;
  if (!DIFFICULTY_META[merged.difficulty]) merged.difficulty = DEFAULT_SETTINGS.difficulty;
  return merged;
}

export function createUI(deps = {}) {
  if (typeof document === 'undefined') {
    throw new Error('createUI 需要在瀏覽器環境執行');
  }

  // ---- 掛載節點 ----
  let root = deps.root || document.getElementById('ui-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'ui-root';
    document.body.append(root);
  }
  root.textContent = '';

  const ui = document.createElement('div');
  ui.className = 'ui';
  ui.dataset.screen = 'menu';
  ui.dataset.playerSide = deps.playerSide === 'north' ? 'north' : 'south';
  root.append(ui);

  const screensEl = document.createElement('div');
  screensEl.className = 'ui__screens';
  const modalLayer = document.createElement('div');
  modalLayer.className = 'ui__modal-layer';
  const toastLayer = document.createElement('div');
  toastLayer.className = 'ui__toasts';
  toastLayer.setAttribute('aria-live', 'polite');
  ui.append(screensEl, modalLayer, toastLayer);

  const toasts = createToasts(toastLayer, { max: 4 });
  let modalCount = 0;
  const manager = createModalManager(modalLayer, {
    onChange: (count) => {
      modalCount = count;
      ui.classList.toggle('has-modal', count > 0);
      invoke('onModalChange', count > 0);
    },
  });

  // ---- 狀態 ----
  const state = {
    screen: 'menu',
    playerSide: deps.playerSide === 'north' ? 'north' : 'south',
    settings: loadSettings(deps),
    view: null,
    publicInfo: null,
    battleModal: null,
    rulesModal: null,
    settingsModal: null,
    codexModal: null,
    loadingHidden: false,
    destroyed: false,
  };
  state.enemySide = state.playerSide === 'south' ? 'north' : 'south';

  // ---- 可替換的 callback 集合 ----
  const handlers = {};
  const HANDLER_KEYS = [
    'onStartGame', 'onMenu', 'onRestart', 'onSurrender', 'onAutoDeploy', 'onResetDeploy',
    'onStartBattle', 'onDeployPick', 'onBattleClose', 'onSettingsChange', 'onSoundChange',
    'onCancel', 'onModalChange', 'onRulesOpen', 'onRulesClose', 'onCodexOpen', 'onGameOver',
  ];
  for (const key of HANDLER_KEYS) if (typeof deps[key] === 'function') handlers[key] = deps[key];

  function invoke(name, ...args) {
    const fn = handlers[name];
    if (typeof fn !== 'function') return undefined;
    try {
      return fn(...args);
    } catch (error) {
      console.error(`[UI] callback ${name} 發生錯誤`, error);
      return undefined;
    }
  }

  function persistSettings() {
    if (deps.persistSettings === false) return;
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch { /* 忽略儲存失敗 */ }
  }

  // ---- 建立各畫面 ----
  const menu = createMenu({
    onAction: (action) => {
      if (action === 'start') invoke('onStartGame');
      else if (action === 'rules') openRules();
      else if (action === 'codex') openCodex();
      else if (action === 'settings') openSettings();
    },
  });

  const setup = createSetup({
    onAction: (action) => {
      if (action === 'rules') openRules();
      else if (action === 'menu') invoke('onMenu');
      else if (action === 'codex') openCodex();
    },
  });

  const hud = createHud({
    playerSide: state.playerSide,
    onAction: (action, payload) => {
      if (action === 'rules') openRules();
      else if (action === 'settings') openSettings();
      else if (action === 'restart') confirmRestart();
      else if (action === 'surrender') confirmSurrender();
      else if (action === 'sound') toggleSound();
      else if (action === 'codex-pick') openCodex(payload || '');
    },
  });

  const gameover = createGameOver({
    playerSide: state.playerSide,
    onAction: (action) => {
      if (action === 'restart') invoke('onRestart');
      else if (action === 'menu') invoke('onMenu');
      else if (action === 'rules') openRules();
    },
  });

  screensEl.append(menu.el, setup.el, hud.el, gameover.el);

  const screenEls = {
    menu: menu.el,
    setup: setup.el,
    game: hud.el,
    gameover: gameover.el,
  };

  // ---- 主選單／畫面切換 ----
  function showScreen(name) {
    if (state.destroyed) return state.screen;
    const target = SCREEN_NAMES.includes(name) ? name : 'menu';
    state.screen = target;
    ui.dataset.screen = target;
    for (const [key, el] of Object.entries(screenEls)) {
      el.classList.toggle('is-active', key === target);
    }
    if (target !== 'game') {
      hud.closeDrawers();
      hud.setSelected(null);
      hud.hidePieceTooltip();
    }
    if (target === 'gameover' && !gameover.el.querySelector('.gameover')) {
      gameover.show({ outcome: 'draw', reason: 'draw' });
    }
    hideLoading();
    return target;
  }

  // ---- Loading ----
  function hideLoading(delay = 0) {
    if (state.loadingHidden) return;
    const finish = () => {
      if (state.loadingHidden) return;
      state.loadingHidden = true;
      const loadingEl = document.getElementById('loading-screen');
      if (!loadingEl) return;
      loadingEl.classList.add('is-hiding');
      window.setTimeout(() => loadingEl.remove(), 700);
    };
    if (delay > 0) window.setTimeout(finish, delay);
    else finish();
  }

  // ---- Modal 開啟 ----
  function closeModalIfOpen(modalRef, onClosed) {
    if (modalRef && modalRef.isOpen) {
      modalRef.close();
    }
    if (typeof onClosed === 'function') onClosed();
  }

  function openRules(chapter = '') {
    if (state.destroyed) return null;
    if (state.rulesModal?.isOpen) {
      if (!chapter) return state.rulesModal;
      state.rulesModal.close();
      state.rulesModal = null;
    }
    state.rulesModal = openRulesModal(manager, {
      chapter: typeof chapter === 'string' ? chapter : '',
      onClose: () => {
        state.rulesModal = null;
        invoke('onRulesClose');
      },
    });
    invoke('onRulesOpen');
    return state.rulesModal;
  }

  function openSettings() {
    if (state.destroyed) return null;
    if (state.settingsModal?.isOpen) return state.settingsModal;
    const result = openSettingsModal(manager, {
      settings: { ...state.settings },
      onChange: (next, changedKey) => {
        state.settings = { ...state.settings, ...next };
        persistSettings();
        hud.setSound(state.settings.sound);
        invoke('onSettingsChange', { ...state.settings }, changedKey);
      },
      onClose: () => { state.settingsModal = null; },
    });
    state.settingsModal = result.modal;
    return result.modal;
  }

  function openCodex(selectedKey = '') {
    if (state.destroyed) return null;
    if (state.codexModal?.isOpen) {
      state.codexModal.close();
      state.codexModal = null;
    }
    state.codexModal = openCodexModal(manager, {
      selectedKey: typeof selectedKey === 'string' ? selectedKey : '',
      onClose: () => { state.codexModal = null; },
    });
    invoke('onCodexOpen');
    return state.codexModal;
  }

  function confirmRestart() {
    return confirmDialog(manager, {
      title: '重新開始',
      message: '確定要重新開始嗎？',
      detail: '目前棋局的進度與佈陣都會清空，回到佈陣階段。',
      confirmText: '重新開始',
      cancelText: '繼續這一局',
      iconName: 'refresh',
      onConfirm: () => invoke('onRestart'),
    });
  }

  function confirmSurrender() {
    return confirmDialog(manager, {
      title: '投降',
      message: '確定要投降嗎？',
      detail: '投降後棋局立即結束，由北軍（AI）獲勝。此動作無法復原。',
      confirmText: '確認投降',
      cancelText: '再想想',
      danger: true,
      iconName: 'flag',
      onConfirm: () => invoke('onSurrender'),
    });
  }

  // ---- 音效 ----
  function setSound(enabled) {
    state.settings.sound = !!enabled;
    hud.setSound(state.settings.sound);
    persistSettings();
  }

  function toggleSound() {
    setSound(!state.settings.sound);
    invoke('onSoundChange', state.settings.sound);
    invoke('onSettingsChange', { ...state.settings }, 'sound');
  }

  // ---- 對外 API ----
  const api = {
    /** UI 根節點（.ui） */
    get el() { return ui; },
    /** 目前畫面 */
    get screen() { return state.screen; },
    /** 目前玩家陣營 */
    get playerSide() { return state.playerSide; },

    // 畫面
    showScreen,
    /** 對戰 HUD 更新（view = game.getView(side)，publicInfo = game.getPublicInfo()） */
    updateHud(view, publicInfo) {
      if (state.destroyed) return;
      if (view && typeof view === 'object') state.view = view;
      if (publicInfo) state.publicInfo = publicInfo;
      hud.updateHud(view || state.view, publicInfo || state.publicInfo);
    },
    /** 只更新回合／輪次 */
    setTurnInfo(view) {
      if (state.destroyed) return;
      if (view && typeof view === 'object') state.view = view;
      hud.setTurnInfo(view || state.view);
    },
    setPlayerSide(side) {
      state.playerSide = side === 'north' ? 'north' : 'south';
      state.enemySide = state.playerSide === 'south' ? 'north' : 'south';
      ui.dataset.playerSide = state.playerSide;
      hud.setPlayerSide(state.playerSide);
    },

    // 佈陣
    setDeployPanel(options = {}) {
      if (state.destroyed) return;
      const opts = options && typeof options === 'object' ? options : {};
      const onPick = typeof opts.onPick === 'function'
        ? (key) => { setup.setSelectedKey(key); opts.onPick(key); }
        : (key) => { setup.setSelectedKey(key); invoke('onDeployPick', key); };
      setup.update({
        pieces: opts.pieces,
        placed: opts.placed,
        side: opts.side || state.playerSide,
        selectedKey: opts.selectedKey,
        canStart: opts.canStart,
        onPick,
        onAuto: typeof opts.onAuto === 'function' ? opts.onAuto : () => invoke('onAutoDeploy'),
        onReset: typeof opts.onReset === 'function' ? opts.onReset : () => invoke('onResetDeploy'),
        onStart: typeof opts.onStart === 'function' ? opts.onStart : () => invoke('onStartBattle'),
      });
      return setup.getState();
    },
    setDeployHint(text) {
      if (state.destroyed) return;
      // 佈陣階段更新左側面板提示；對戰中則轉為棋盤底部提示
      if (state.screen === 'game') {
        hud.setBoardHint(text || '', 'info', { duration: 5200 });
      } else {
        setup.setHint(text);
      }
    },
    /** main.js 用來同步佈陣托盤的選取棋子（別名） */
    setDeploySelected(pieceKey) {
      if (state.destroyed) return;
      setup.setSelectedKey(pieceKey || '');
    },

    // 對戰
    setAiThinking(thinking) {
      if (state.destroyed) return;
      hud.setAiThinking(thinking);
    },
    setSelectedPiece(piece) {
      if (state.destroyed) return;
      hud.setSelected(piece);
    },
    setBoardHint(text, kind = 'info', options = {}) {
      if (state.destroyed) return;
      hud.setBoardHint(text, kind, options);
    },
    showPieceTooltip(piece, x, y) {
      if (state.destroyed) return;
      hud.showPieceTooltip(piece, x, y);
    },
    hidePieceTooltip() {
      if (state.destroyed) return;
      hud.hidePieceTooltip();
    },

    // 日誌
    log(entry) {
      if (state.destroyed) return;
      hud.log(entry);
    },
    setLogs(entries) {
      if (state.destroyed) return;
      hud.setLogs(entries);
    },
    clearLog() {
      if (state.destroyed) return;
      hud.clearLog();
    },

    // 戰鬥結算卡
    setBattle(battleData, onCloseCallback) {
      if (state.destroyed) return null;
      // 若舊的戰鬥卡還沒關，先關閉（會觸發舊的 onClose，避免流程卡住）
      if (state.battleModal?.isOpen) {
        try { state.battleModal.close(); } catch { /* 忽略 */ }
      }
      const piecesByUid = new Map();
      const view = state.view;
      if (view && Array.isArray(view.pieces)) {
        for (const piece of view.pieces) {
          if (piece && piece.uid != null) piecesByUid.set(piece.uid, piece);
        }
      }
      state.battleModal = showBattleModal(manager, battleData, {
        playerSide: state.playerSide,
        piecesByUid,
        sideToMove: view?.sideToMove || null,
        turn: view?.turn || null,
        onClose: () => {
          state.battleModal = null;
          if (typeof onCloseCallback === 'function') onCloseCallback();
          else invoke('onBattleClose');
        },
      });
      return state.battleModal;
    },
    closeBattle() {
      if (state.battleModal?.isOpen) state.battleModal.close();
    },

    // Modal
    openRules,
    openSettings,
    openCodex,
    closeModals() { manager.closeAll(); },
    confirm: (options) => confirmDialog(manager, options),
    /** 顯示 toast；type: info / success / warn / danger / battle / flag */
    showToast(message, type = 'info', options = {}) {
      return toasts.show(message, type, options);
    },

    // 設定
    getSettings() { return { ...state.settings }; },
    setSettings(partial = {}) {
      if (!partial || typeof partial !== 'object') return { ...state.settings };
      const next = { ...state.settings, ...partial };
      next.sound = !!next.sound;
      next.revealOnBattle = !!next.revealOnBattle;
      next.viewHints = !!next.viewHints;
      if (!DIFFICULTY_META[next.difficulty]) next.difficulty = state.settings.difficulty;
      state.settings = next;
      hud.setSound(next.sound);
      persistSettings();
      return { ...state.settings };
    },
    setSound,
    toggleSound,

    // 結束畫面
    showGameOver(result) {
      if (state.destroyed) return;
      const stats = hud.getStats();
      gameover.show(result, stats);
      showScreen('gameover');
      hud.setAiThinking(false);
      invoke('onGameOver', result);
    },

    // 載入畫面
    hideLoading,

    // 事件綁定（main.js 建立後再補 callback 用）
    setHandlers(partial = {}) {
      for (const key of HANDLER_KEYS) {
        if (partial && typeof partial[key] === 'function') handlers[key] = partial[key];
      }
      return handlers;
    },
    getHandlers() { return { ...handlers }; },

    // 除錯／狀態
    getState() {
      return {
        screen: state.screen,
        playerSide: state.playerSide,
        settings: { ...state.settings },
        hasModal: modalCount > 0,
        view: state.view,
        stats: hud.getStats(),
      };
    },

    destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      try { manager.closeAll(); } catch { /* 忽略 */ }
      try { manager.destroy?.(); } catch { /* 忽略 */ }
      toasts.clear();
      menu.destroy();
      setup.destroy();
      hud.destroy();
      gameover.destroy();
      ui.remove();
      escOff();
      if (root && !root.childElementCount) { /* 保留 #ui-root 供重新建立 */ }
    },
  };

  // Esc：沒有 modal 時通知 main.js 取消選取
  const escOff = on(document, 'keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (manager.hasOpen()) return;
    hud.hidePieceTooltip();
    invoke('onCancel');
  });

  // 初始畫面
  showScreen(deps.initialScreen && SCREEN_NAMES.includes(deps.initialScreen) ? deps.initialScreen : 'menu');
  if (deps.autoHideLoading !== false) {
    requestAnimationFrame(() => hideLoading(deps.loadingDelay ?? 260));
  }

  return api;
}

export default createUI;
