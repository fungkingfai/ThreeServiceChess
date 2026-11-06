/**
 * 三軍棋 3D — 主控制器（Lead）
 * ------------------------------------------------------------------
 * 負責：啟動、主選單流程、佈陣、回合循環、玩家輸入、AI 回合、
 *       3D 視圖與 DOM UI 的整合、設定與勝負結算。
 *
 * 依賴（由團隊成員提供，介面見 DESIGN.md）：
 *   ./core/engine.js   createGame(...)
 *   ./render/index.js  createView(container, { board, pieces })
 *   ./ui/index.js      createUI(deps)
 *   ./ai/ai.js         createAI({ side, difficulty, seed })
 */
import { createGame } from './core/engine.js';
import { createView } from './render/index.js';
import { createUI } from './ui/index.js';
import { createAI } from './ai/ai.js';
import { PIECES, PIECE_BY_KEY } from './core/pieces.js';
import * as BOARD_DATA from './core/board.js';
import { NODE, DEPLOY_ZONES } from './core/board.js';
import { randomSeed } from './core/rng.js';

const PLAYER_SIDE = 'south';
const AI_SIDE = 'north';
const SIDE_LABEL = { north: '北軍（紅）', south: '南軍（綠）' };

/* ============================== 應用狀態 ============================== */

const app = {
  phase: 'boot',          // boot | menu | setup | play | gameover
  game: null,
  view: null,
  ui: null,
  ai: null,
  difficulty: 'normal',
  settings: { sound: true, reveal: true, hints: true },
  selectedUid: null,
  selectedDeployKey: null,
  playerPlacements: [],
  busy: false,
  loopToken: 0,
  playerResolve: null,
  lastBattle: null,
  isCoarse: false,
  insets: null,
  _insetKey: '',
  mobileHintShown: false,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (sel) => document.querySelector(sel);

/* ============================== 啟動 ============================== */

boot().catch((err) => {
  console.error('[三軍棋] 啟動失敗', err);
  showFatalError(err);
});

async function boot() {
  const container = $('#canvas-container');
  if (!container) throw new Error('找不到 #canvas-container');

  const view = await createView(container, { board: BOARD_DATA, pieces: PIECES });
  if (!view) throw new Error('createView 未回傳 View');
  app.view = view;

  // ---- 先套用畫質設定，再等首幀（低階 GPU/軟體渲染才不會首幀卡很久） ----
  // 手機 / 觸控裝置
  try {
    app.isCoarse = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
      || window.innerWidth < 700;
  } catch (e) { app.isCoarse = window.innerWidth < 700; }
  if (app.isCoarse) {
    try {
      if (typeof view.setQuality === 'function') view.setQuality('medium');
      if (view.controls) {
        view.controls.enableDamping = true;
        view.controls.dampingFactor = 0.12;
        view.controls.rotateSpeed = 0.75;
      }
    } catch (e) { console.warn('[三軍棋] 手機畫質設定失敗', e); }
  }
  // 低畫質模式（無頭測試／低階 GPU）：?lowfx=1 或 ?quality=low
  try {
    const params = new URLSearchParams(location.search);
    app.lowfx = params.get('lowfx') === '1' || params.get('quality') === 'low';
    if (app.lowfx && typeof view.setQuality === 'function') view.setQuality('low');
    if (view.stage?.bloomPass) view.stage.bloomPass.enabled = false;
    if (app.lowfx || app.isCoarse) {
      try {
        if (view.stage?.composer?.setPixelRatio) view.stage.composer.setPixelRatio(app.lowfx ? 0.7 : 1.25);
        if (view.renderer?.setPixelRatio) view.renderer.setPixelRatio(app.lowfx ? 0.7 : Math.min(1.5, window.devicePixelRatio || 1));
        if (view.renderer) view.renderer.shadowMap.enabled = false;
      } catch (e) { console.warn('[三軍棋] 畫質設定失敗', e); }
    }
    if (app.lowfx) {
      app.settings.lowfx = true;
      if (view.fx) view.fx.timeScale = 2.4;
    }
  } catch (e) { /* ignore */ }

  if (typeof view.ready === 'function') await view.ready();
  app.view.setPerspective(PLAYER_SIDE);

  const ui = createUI(buildUIDeps());
  if (!ui) throw new Error('createUI 未回傳 UI');
  app.ui = ui;
  try {
    const uiSettings = (typeof ui.getSettings === 'function' && ui.getSettings()) || {};
    if (typeof uiSettings.sound === 'boolean') app.settings.sound = uiSettings.sound;
    if (typeof uiSettings.revealOnBattle === 'boolean') app.settings.reveal = uiSettings.revealOnBattle;
    if (typeof uiSettings.difficulty === 'string') app.difficulty = uiSettings.difficulty;
    if (typeof uiSettings.viewHints === 'boolean') app.settings.hints = uiSettings.viewHints;
  } catch (e) { console.warn('[三軍棋] 讀取 UI 設定失敗', e); }

  if (typeof view.setSideColors === 'function') {
    view.setSideColors({
      south: { main: '#3fbf7f', dark: '#1c6b46', light: '#9cf0c4', label: '南軍' },
      north: { main: '#e0524a', dark: '#7e1f1a', light: '#ffb0a8', label: '北軍' },
    });
  }
  if (typeof view.setSound === 'function') view.setSound(app.settings.sound);

  setupMobileTools();
  startInsetWatcher();

  bindGlobalKeys();
  const loading = $('#loading-screen');
  if (loading) {
    loading.classList.add('hide');
    setTimeout(() => loading.remove(), 650);
  }
  showMenu();
  exposeDebugApi();
}

function showFatalError(err) {
  const root = $('#ui-root') || document.body;
  const el = document.createElement('div');
  el.className = 'fatal-error';
  el.innerHTML = `
    <div class="fatal-inner">
      <h1>三軍棋 啟動失敗</h1>
      <p>${escapeHtml(String(err && err.message ? err.message : err))}</p>
      <pre>${escapeHtml(String(err && err.stack ? err.stack : ''))}</pre>
      <p>請重新整理頁面，或回報錯誤訊息。</p>
    </div>`;
  root.appendChild(el);
}

/* ============================== UI 依賴 ============================== */

function buildUIDeps() {
  return {
    playerSide: PLAYER_SIDE,
    autoHideLoading: true,
    loadingDelay: 320,
    onStartGame: () => startNewGame(),
    onMenu: () => showMenu(),
    onRestart: () => startNewGame(),
    onSurrender: () => surrender(),
    onAutoDeploy: () => autoDeployPlayer(),
    onResetDeploy: () => resetPlayerDeploy(),
    onStartBattle: () => confirmDeploy(),
    onDeployPick: (pieceKey) => selectDeployPiece(pieceKey),
    onSettingsChange: (next) => applySettings(next),
    onCancel: () => clearSelection(),
    onBattleClose: () => {},
    onModalChange: (isOpen) => {
      app.modalOpen = !!isOpen;
      updateMobileTools(isOpen ? false : undefined);
    },
    onGameOver: () => updateMobileTools(false),
  };
}

/* ============================== 主選單 / 新局 ============================== */

function showMenu() {
  app.phase = 'menu';
  app.loopToken++;
  updateMobileTools(false);
  scheduleInsets(200);
  if (app.game && !app.game.getView(PLAYER_SIDE).winner) {
    // 不銷毀舊局，只是回到選單
  }
  app.selectedUid = null;
  app.selectedDeployKey = null;
  app.busy = false;
  if (app.view) {
    app.view.setInteractive(false);
    app.view.clearHighlights();
    app.view.setSelected(null);
    if (typeof app.view.setDeployMode === 'function') app.view.setDeployMode(false);
    if (typeof app.view.clearPieces === 'function') app.view.clearPieces();
  }
  if (app.ui) {
    if (typeof app.ui.closeBattle === 'function') app.ui.closeBattle();
    if (typeof app.ui.closeModals === 'function') app.ui.closeModals();
    if (typeof app.ui.setAiThinking === 'function') app.ui.setAiThinking(false);
    app.ui.showScreen('menu');
  }
}

async function startNewGame() {
  try {
    app.phase = 'setup';
    app.busy = false;
    app.selectedUid = null;
    app.selectedDeployKey = null;
    app.playerPlacements = [];
    app.game = createGame({ seed: randomSeed(), revealOnBattle: app.settings.reveal });
    app.ai = createAI({ side: AI_SIDE, difficulty: app.difficulty, seed: randomSeed() });
    app.lastBattle = null;

    // AI 佈陣（若 AI 未提供合法佈陣則退回引擎自動佈陣）
    let aiPlacements = null;
    try {
      aiPlacements = app.ai.deploy(app.game);
    } catch (err) {
      console.warn('[三軍棋] AI 佈陣失敗，改用引擎自動佈陣', err);
    }
    let deployed = false;
    if (Array.isArray(aiPlacements) && aiPlacements.length) {
      const res = app.game.deploy(AI_SIDE, aiPlacements);
      deployed = !!res && res.ok !== false;
    }
    if (!deployed) {
      const fallback = app.game.autoDeploy(AI_SIDE);
      if (Array.isArray(fallback) && fallback.length) app.game.deploy(AI_SIDE, fallback);
    }

    if (app.ui && typeof app.ui.showScreen === 'function') app.ui.showScreen('setup');
    if (app.ui && typeof app.ui.closeBattle === 'function') app.ui.closeBattle();
    if (app.ui && typeof app.ui.clearLog === 'function') app.ui.clearLog();
    if (app.view && typeof app.view.setInteractive === 'function') app.view.setInteractive(true);
    if (app.isCoarse) {
      // 手機：佈陣托盤預設收合，讓棋盤完整可見；玩家可再展開選棋
      try {
        if (app.ui && typeof app.ui.setSetupCollapsed === 'function') app.ui.setSetupCollapsed(true);
      } catch (e) { /* UI 尚未支援 */ }
      showMobileHint('點棋子再點棋盤即可佈陣；底部托盤可收起／展開。');
    }
    app.view.setPerspective(PLAYER_SIDE);
    if (typeof app.view.setDeployMode === 'function') app.view.setDeployMode(true, { side: PLAYER_SIDE, placed: [] });
    if (typeof app.ui.setDeployPanel === 'function') refreshDeployPanel();
    syncDeployView();
    refreshDeployPanel();
    updateMobileTools();
    if (app.ui && typeof app.ui.setDeployHint === 'function') {
      app.ui.setDeployHint('點選左側棋子，再點棋盤上的藍色光點佈陣。軍旗必須佈於三座城門之一。');
    }
  } catch (err) {
    console.error('[三軍棋] 開始新局失敗', err);
    toast('建立新局失敗：' + (err && err.message ? err.message : err), 'error');
  }
}

/* ============================== 佈陣 ============================== */

function placedNodeMap() {
  const map = new Map();
  for (const p of app.playerPlacements) map.set(p.nodeId, p.pieceKey);
  return map;
}
function placedKeyMap() {
  const map = new Map();
  for (const p of app.playerPlacements) map.set(p.pieceKey, p.nodeId);
  return map;
}

function validDeployNodesFor(pieceKey) {
  const piece = PIECE_BY_KEY[pieceKey];
  if (!piece) return [];
  const zone = DEPLOY_ZONES[PLAYER_SIDE];
  let spots;
  switch (piece.deploy) {
    case 'gate': spots = zone.gates; break;
    case 'anchor': spots = zone.anchors; break;
    case 'airport': spots = zone.airports; break;
    case 'coastal': spots = zone.coastal; break;
    default: spots = zone.allLand; break;
  }
  const used = placedNodeMap();
  return spots.filter((id) => !used.has(id));
}

function selectDeployPiece(pieceKey) {
  if (app.phase !== 'setup') return;
  const piece = PIECE_BY_KEY[pieceKey];
  if (!piece) return;
  app.selectedDeployKey = pieceKey;
  app.view.setSelected(`${PLAYER_SIDE}:${pieceKey}`);
  if (typeof app.view.setDeployMode === 'function') {
    app.view.setDeployMode(true, {
      side: PLAYER_SIDE,
      placed: app.playerPlacements.map((p) => p.nodeId),
    });
  }
  const spots = validDeployNodesFor(pieceKey);
  app.view.highlightNodes(spots, 'deploy');
  if (app.ui && typeof app.ui.setDeploySelected === 'function') app.ui.setDeploySelected(pieceKey);
  if (app.ui && typeof app.ui.setDeployHint === 'function') {
    const where = deployWhereText(piece);
    app.ui.setDeployHint(`佈置【${piece.name}】：${where}。${piece.desc}`);
  }
}

function deployWhereText(piece) {
  switch (piece.deploy) {
    case 'gate': return '點選三座城門之一';
    case 'anchor': return '點選沿岸五個錨點之一';
    case 'airport': return '點選棋盤角落的兩座機場之一';
    case 'coastal': return '點選海岸線上的砲位';
    default: return '點選我方陸地任一兵站（藍色光點）';
  }
}

/** 從 3D 點擊棋子（佈陣時可用來拿回已放置的棋子） */
function onPiecePickDuringSetup(uid) {
  if (app.phase !== 'setup' || !uid) return;
  const idx = app.playerPlacements.findIndex((p) => uid === `${PLAYER_SIDE}:${p.pieceKey}`);
  if (idx < 0) return;
  const [removed] = app.playerPlacements.splice(idx, 1);
  app.selectedDeployKey = removed.pieceKey;
  syncDeployView();
  refreshDeployPanel();
  selectDeployPiece(removed.pieceKey);
}

function onNodePickDuringSetup(nodeId) {
  if (app.phase !== 'setup' || !app.selectedDeployKey) return;
  const pieceKey = app.selectedDeployKey;
  const piece = PIECE_BY_KEY[pieceKey];
  const n = NODE[nodeId];
  if (!n) return;

  const used = placedNodeMap();
  const placed = placedKeyMap();

  // 點到自己已放置的棋子 → 拿起來
  if (used.has(nodeId)) {
    const occupiedKey = used.get(nodeId);
    if (occupiedKey === pieceKey) return;
    const idx = app.playerPlacements.findIndex((p) => p.nodeId === nodeId);
    if (idx >= 0) {
      const removed = app.playerPlacements.splice(idx, 1)[0];
      toast(`已拿起【${PIECE_BY_KEY[removed.pieceKey].name}】`, 'info');
      if (app.selectedDeployKey === removed.pieceKey) app.selectedDeployKey = null;
      syncDeployView();
      refreshDeployPanel();
      if (app.selectedDeployKey) selectDeployPiece(app.selectedDeployKey);
      else app.view.clearHighlights();
    }
    return;
  }

  if (placed.has(pieceKey)) {
    // 已放置的棋子要換位置：先移除舊位置
    const oldNode = placed.get(pieceKey);
    app.playerPlacements = app.playerPlacements.filter((p) => p.pieceKey !== pieceKey);
    void oldNode;
  }

  const spots = validDeployNodesFor(pieceKey);
  if (!spots.includes(nodeId)) {
    toast(`【${piece.name}】不能佈在此處。${deployWhereText(piece)}`, 'warn');
    return;
  }

  app.playerPlacements.push({ pieceKey, nodeId });
  app.selectedDeployKey = null;
  app.view.setSelected(null);
  syncDeployView();
  refreshDeployPanel();

  // 自動選下一枚未佈置的棋子
  const next = PIECES.find((p) => !placedKeyMap().has(p.key));
  if (next) selectDeployPiece(next.key);
  else app.view.clearHighlights();
}

function autoDeployPlayer() {
  if (app.phase !== 'setup') return;
  const placements = app.game.autoDeploy(PLAYER_SIDE);
  if (!Array.isArray(placements) || placements.length !== PIECES.length) {
    toast('自動佈陣失敗，請手動佈陣。', 'error');
    return;
  }
  app.playerPlacements = placements.map((p) => ({ ...p }));
  app.selectedDeployKey = null;
  app.view.setSelected(null);
  syncDeployView();
  refreshDeployPanel();
  toast('已自動佈陣，可直接開始戰鬥，或點棋子調整。', 'ok');
}

function resetPlayerDeploy() {
  if (app.phase !== 'setup') return;
  app.playerPlacements = [];
  app.selectedDeployKey = null;
  app.view.setSelected(null);
  app.view.clearHighlights();
  syncDeployView();
  refreshDeployPanel();
}

function confirmDeploy() {
  if (app.phase !== 'setup') return;
  if (app.playerPlacements.length !== PIECES.length) {
    toast(`尚有 ${PIECES.length - app.playerPlacements.length} 枚棋子未佈陣。`, 'warn');
    return;
  }
  const res = app.game.deploy(PLAYER_SIDE, app.playerPlacements.map((p) => ({ ...p })));
  if (!res || res.ok === false) {
    console.error('[三軍棋] 佈陣驗證失敗', res);
    toast('佈陣不合法：' + ((res && res.errors && res.errors.join('；')) || '請檢查棋子位置'), 'error');
    return;
  }
  const start = app.game.startPlay ? app.game.startPlay() : { ok: true };
  if (start && start.ok === false) {
    toast('無法開始戰鬥：' + (start.error || '請檢查佈陣'), 'error');
    return;
  }
  app.phase = 'play';
  if (typeof app.view.setDeployMode === 'function') app.view.setDeployMode(false);
  app.view.clearHighlights();
  toast('戰鬥開始！奪下敵方軍旗！', 'ok');
  beginPlayLoop();
}

/** 佈陣階段的假 state（給 3D 顯示；尚未呼叫 engine） */
function buildDeployViewState() {
  const pieces = app.playerPlacements.map((p) => {
    const def = PIECE_BY_KEY[p.pieceKey];
    return {
      uid: `${PLAYER_SIDE}:${p.pieceKey}`,
      side: PLAYER_SIDE,
      key: p.pieceKey,
      name: def.name,
      branch: def.branch,
      nodeId: p.nodeId,
      alive: true,
      revealed: true,
      landed: false,
    };
  });
  return {
    phase: 'deploy',
    turn: 0,
    sideToMove: PLAYER_SIDE,
    winner: null,
    winnerReason: null,
    flagRevealed: { north: false, south: false },
    pieces,
    log: [],
  };
}

function syncDeployView() {
  if (!app.view) return;
  const st = buildDeployViewState();
  st.playerSide = PLAYER_SIDE;
  if (typeof app.view.sync === 'function') app.view.sync(st);
  if (typeof app.view.setDeployMode === 'function') {
    app.view.setDeployMode(true, {
      side: PLAYER_SIDE,
      placed: app.playerPlacements.map((p) => p.nodeId),
    });
  }
}

function refreshDeployPanel() {
  scheduleInsets(180);
  if (!app.ui || typeof app.ui.setDeployPanel !== 'function') return;
  const placed = placedKeyMap();
  app.ui.setDeployPanel({
    side: PLAYER_SIDE,
    total: PIECES.length,
    placedCount: app.playerPlacements.length,
    placed: app.playerPlacements.map((p) => ({ pieceKey: p.pieceKey, nodeId: p.nodeId })),
    canStart: app.playerPlacements.length === PIECES.length,
    pieces: PIECES.map((p) => ({
      key: p.key, name: p.name, short: p.short, branch: p.branch,
      category: p.category, rank: p.rank, deploy: p.deploy, desc: p.desc, art: p.art,
      placed: placed.has(p.key),
    })),
    selectedKey: app.selectedDeployKey,
    onPick: (key) => selectDeployPiece(key),
    onAuto: () => autoDeployPlayer(),
    onReset: () => resetPlayerDeploy(),
    onStart: () => confirmDeploy(),
  });
  if (app.ui && typeof app.ui.setDeploySelected === 'function') {
    app.ui.setDeploySelected(app.selectedDeployKey);
  }
}

/* ============================== 戰鬥主循環 ============================== */

async function beginPlayLoop() {
  const token = ++app.loopToken;
  app.busy = false;
  app.selectedUid = null;
  if (app.ui && typeof app.ui.showScreen === 'function') app.ui.showScreen('game');
  if (app.isCoarse) {
    setTimeout(() => applyInsets(true), 100);
    setTimeout(() => applyInsets(true), 420);
  }
  refreshGameView();
  updateMobileTools();
  scheduleInsets(220);
  while (app.phase === 'play' && app.game && token === app.loopToken) {
    const view = app.game.getView(PLAYER_SIDE);
    if (view.winner) { handleGameOver(view); return; }
    if (view.sideToMove === AI_SIDE) {
      await runAITurn(token);
    } else {
      await waitForPlayerAction(token);
    }
    if (token !== app.loopToken) return;
  }
}

/** 更新 HUD / 3D，進行非同步安全檢查 */
function refreshGameView() {
  if (!app.game) return null;
  const view = app.game.getView(PLAYER_SIDE);
  view.playerSide = PLAYER_SIDE;
  const view3d = app.view;
  if (view3d && typeof view3d.sync === 'function') view3d.sync(view);
  if (view3d && typeof view3d.syncIntel === 'function') {
    try { view3d.syncIntel(view); } catch (e) { console.warn('[三軍棋] syncIntel 失敗', e); }
  }
  const pub = (app.game.getPublicInfo && app.game.getPublicInfo()) || computePublicInfo(view);
  if (app.ui) {
    if (typeof app.ui.updateHud === 'function') app.ui.updateHud(view, pub);
    if (typeof app.ui.setTurnInfo === 'function') app.ui.setTurnInfo(view);
  }
  return view;
}

function computePublicInfo(view) {
  const bySide = { north: {}, south: {} };
  let mine = 0, theirs = 0;
  for (const p of view.pieces || []) {
    const slot = bySide[p.side] || (bySide[p.side] = {});
    const branch = p.branch || 'army';
    slot[branch] = slot[branch] || { alive: 0, dead: 0 };
    if (p.alive) slot[branch].alive++; else slot[branch].dead++;
    if (p.side === PLAYER_SIDE) { if (p.alive) mine++; } else if (p.alive) theirs++;
  }
  return { bySide, alive: { [PLAYER_SIDE]: mine, [AI_SIDE]: theirs } };
}

function waitForPlayerAction(token) {
  refreshGameView();
  app.selectedUid = null;
  app.view.setInteractive(true);
  app.view.clearHighlights();
  app.view.setSelected(null);
  if (app.ui) {
    if (typeof app.ui.setAiThinking === 'function') app.ui.setAiThinking(false);
    if (typeof app.ui.setSelectedPiece === 'function') app.ui.setSelectedPiece(null);
  }
  return new Promise((resolve) => {
    app.playerResolve = resolve;
  }).then(() => {
    if (token !== app.loopToken) return;
  });
}

/* ---- 玩家輸入 ---- */

function onPiecePick(uid) {
  if (app.phase === 'setup') { onPiecePickDuringSetup(uid); return; }
  if (app.phase !== 'play' || app.busy) return;
  const view = app.game.getView(PLAYER_SIDE);
  if (view.sideToMove !== PLAYER_SIDE) return;
  if (!uid) { clearSelection(); return; }
  const piece = (view.pieces || []).find((p) => p.uid === uid);
  if (!piece) { clearSelection(); return; }
  if (piece.side !== PLAYER_SIDE) {
    // 點擊敵方棋子時，改以「點擊該格」處理（攻擊）
    if (piece.nodeId != null) onNodePick(piece.nodeId);
    return;
  }
  if (!piece.alive) { clearSelection(); return; }
  app.selectedUid = uid;
  app.view.setSelected(uid);
  const actions = (app.game.getActionsForPiece && app.game.getActionsForPiece(PLAYER_SIDE, uid)) || [];
  // 若引擎沒提供 getActionsForPiece，退回 getLegalActions 過濾
  const list = actions.length ? actions : (app.game.getLegalActions(PLAYER_SIDE) || []).filter((a) => a.pieceUid === uid);
  const moveNodes = [];
  const attackNodes = [];
  for (const a of list) {
    const target = a.to ?? a.target ?? null;
    if (target == null) continue;
    const occupied = findOccupiedByEnemy(view, target);
    if (a.type === 'move' && !occupied) moveNodes.push(target);
    else attackNodes.push(target);
  }
  app.view.highlightNodes(moveNodes, 'move');
  app.view.highlightNodes(attackNodes, 'attack');
  if (app.ui && typeof app.ui.setSelectedPiece === 'function') {
    const def = PIECE_BY_KEY[piece.key] || null;
    app.ui.setSelectedPiece({
      ...piece,
      def,
      actions: list,
      roleText: def ? def.desc : '',
    });
  }
  if (app.ui && typeof app.ui.setDeployHint === 'function') {
    const def = PIECE_BY_KEY[piece.key];
    app.ui.setDeployHint(def ? `${def.name}：${def.desc}` : '');
  }
}

function findOccupiedByEnemy(view, nodeId) {
  return (view.pieces || []).find((p) => p.alive && p.nodeId === nodeId && p.side !== PLAYER_SIDE) || null;
}

function clearSelection() {
  app.selectedUid = null;
  app.view.setSelected(null);
  app.view.clearHighlights();
  if (app.ui && typeof app.ui.setSelectedPiece === 'function') app.ui.setSelectedPiece(null);
}

async function onNodePick(nodeId) {
  if (app.phase === 'setup') { onNodePickDuringSetup(nodeId); return; }
  if (app.phase !== 'play' || app.busy) return;
  const view = app.game.getView(PLAYER_SIDE);
  if (view.sideToMove !== PLAYER_SIDE) return;

  // 點空白或自己棋子：若為自己棋子則切換選取
  const pieceHere = (view.pieces || []).find((p) => p.alive && p.nodeId === nodeId);
  if (pieceHere && pieceHere.side === PLAYER_SIDE) {
    onPiecePick(pieceHere.uid);
    return;
  }

  if (!app.selectedUid) return;
  const actions = (app.game.getActionsForPiece && app.game.getActionsForPiece(PLAYER_SIDE, app.selectedUid)) || [];
  const list = actions.length ? actions : (app.game.getLegalActions(PLAYER_SIDE) || []).filter((a) => a.pieceUid === app.selectedUid);
  const action = list.find((a) => (a.to ?? a.target) === nodeId);
  if (!action) {
    if (app.settings.hints) toast('這個位置無法行動。', 'warn');
    return;
  }
  await performPlayerAction(action);
}

async function performPlayerAction(action) {
  if (app.busy) return;
  app.busy = true;
  app.view.setInteractive(false);
  app.view.clearHighlights();
  app.view.setSelected(null);
  const resolve = app.playerResolve;
  app.playerResolve = null;
  try {
    const res = app.game.applyAction(PLAYER_SIDE, action);
    if (!res || res.ok === false) {
      toast('行動不合法：' + ((res && res.error) || '請再試一次'), 'error');
      app.busy = false;
      app.view.setInteractive(true);
      return;
    }
    await playEvents(res.events || []);
    refreshGameView();
    const view = app.game.getView(PLAYER_SIDE);
    if (view.winner) { handleGameOver(view); return; }
  } catch (err) {
    console.error('[三軍棋] 玩家行動失敗', err, action);
    toast('行動執行錯誤，請重試。', 'error');
  } finally {
    app.busy = false;
    if (resolve) resolve();
  }
}

/* ---- AI 回合 ---- */

async function runAITurn(token) {
  refreshGameView();
  if (app.ui && typeof app.ui.setAiThinking === 'function') app.ui.setAiThinking(true);
  app.view.setInteractive(false);
  await sleep(520);
  if (token !== app.loopToken) return;
  try {
    const legal = app.game.getLegalActions(AI_SIDE) || [];
    if (!legal.length) {
      app.game.pass(AI_SIDE);
      if (app.ui) app.ui.log({ type: 'pass', side: AI_SIDE, text: '北軍無棋可動，跳過回合。' });
    } else {
      let action = null;
      try {
        action = await Promise.resolve(app.ai.chooseAction(app.game));
      } catch (err) {
        console.warn('[三軍棋] AI 決策錯誤，改用隨機合法行動', err);
      }
      if (!action || !actionAllowed(action, legal)) {
        action = legal[Math.floor(Math.random() * legal.length)];
        console.warn('[三軍棋] AI 行動不在合法清單，改用隨機合法行動', action);
      }
      const res = app.game.applyAction(AI_SIDE, action);
      if (!res || res.ok === false) {
        console.error('[三軍棋] AI 行動被引擎拒絕', res, action);
        const fallback = legal.find((a) => a.type === 'pass');
        if (fallback) app.game.applyAction(AI_SIDE, fallback);
      } else {
        await playEvents(res.events || [], { ai: true });
      }
    }
    refreshGameView();
    const view = app.game.getView(PLAYER_SIDE);
    if (view.winner) { handleGameOver(view); return; }
    if (app.ui && typeof app.ui.setAiThinking === 'function') app.ui.setAiThinking(false);
    app.view.setInteractive(true);
  } catch (err) {
    console.error('[三軍棋] AI 回合錯誤', err);
    if (app.ui) app.ui.setAiThinking(false);
  }
}

function actionAllowed(action, legal) {
  return legal.some((a) => {
    if (a.type !== action.type) return false;
    if (a.pieceUid !== action.pieceUid) return false;
    const t1 = a.to ?? a.target ?? null;
    const t2 = action.to ?? action.target ?? null;
    return t1 === t2;
  });
}

/* ---- 事件播放（3D + UI） ---- */

async function playEvents(events, opts = {}) {
  if (!events || !events.length) return;
  const battles = events.filter((e) => e.type === 'battle');
  const winEvent = events.find((e) => e.type === 'win');


  let anim = Promise.resolve();
  try {
    if (app.view && typeof app.view.animateEvents === 'function') {
      if (app.lowfx) {
        // 低畫質 / 無頭測試：不播放 3D 動畫（軟體渲染下動畫會極慢），
        // 直接由後續 refreshGameView() 同步棋盤狀態。
      } else {
        anim = Promise.resolve(app.view.animateEvents(events));
      }
    }
  } catch (err) {
    console.warn('[三軍棋] 3D 事件播放失敗', err);
  }

  // UI 戰鬥結算卡（與動畫並行；卡面自動關閉）
  let battleUI = Promise.resolve();
  if (battles.length && app.ui && typeof app.ui.setBattle === 'function') {
    battleUI = (async () => {
      await sleep(opts.ai ? 700 : 460);
      for (const b of battles) {
        const info = buildBattleInfo(b);
        await new Promise((resolve) => {
          let done = false;
          const finish = () => { if (!done) { done = true; resolve(); } };
          try {
            app.ui.setBattle(info, finish);
          } catch (e) {
            console.warn('[三軍棋] 戰鬥結算卡錯誤', e);
            finish();
            return;
          }
          // 保險：最多等 9 秒
          setTimeout(finish, 9000);
        });
      }
    })();
  }

  try { await Promise.all([anim, battleUI]); } catch (err) { console.warn('[三軍棋] 事件播放錯誤', err); }
  uiLogEvents(events.filter((e) => e.type !== 'reveal' && e.type !== 'flagExposed'));
  if (winEvent && app.view && typeof app.view.showBanner === 'function') {
    app.view.showBanner(winEvent.winner === PLAYER_SIDE ? '奪旗勝利！' : '軍旗失守……');
  }
  if (app.game) refreshGameView();
}

function buildBattleInfo(ev) {
  const view = app.game.getView(PLAYER_SIDE);
  const byUid = new Map((view.pieces || []).map((p) => [p.uid, p]));
  const revealMap = new Map((ev.reveal || []).map((r) => [r.uid, r]));
  const atk = byUid.get(ev.attackerUid) || {};
  const def = byUid.get(ev.defenderUid) || {};
  const pick = (p) => {
    const hiddenName = p.side === PLAYER_SIDE ? null : (p.branch === 'navy' ? '敵艦' : p.branch === 'air' ? '敵機' : '敵棋');
    const revealed = revealMap.get(p.uid);
    const key = p.key || (revealed && revealed.key) || null;
    const name = p.name
      || (key && PIECE_BY_KEY[key] && PIECE_BY_KEY[key].name)
      || (revealed && revealed.key && PIECE_BY_KEY[revealed.key]?.name)
      || hiddenName || '？';
    return {
      uid: p.uid ?? null, key, name, branch: p.branch, side: p.side,
    };
  };
  return {
    outcome: ev.outcome,
    special: ev.special || null,
    attacker: pick(atk),
    defender: pick(def),
    eliminated: (ev.eliminated || []).slice(),
    occupied: !!ev.occupied,
    playerIsAttacker: atk.side === PLAYER_SIDE,
    reveal: ev.reveal || [],
    autoCloseMs: ev.outcome === 'FLAG' ? 6500 : 4800,
  };
}

const OUTCOME_TEXT = { A: '進攻得手', D: '進攻失敗', B: '同歸於盡', N: '不分勝負', R: '偵察成功', FLAG: '奪得軍旗！' };

function uiLogEvents(events) {
  if (!app.ui) return;
  for (const ev of events) {
    let text = '';
    if (ev.type === 'battle') {
      text = battleLogText(ev);
    } else if (ev.type === 'reveal') {
      const p = lookupPieceName(ev.uid);
      const side = ev.toSide === PLAYER_SIDE ? '我方' : '敵方';
      text = `${side}獲得情報：${ev.source === 'scout' ? '偵察機發現' : '確認'} ${p} 的位置。`;
    } else if (ev.type === 'flagExposed') {
      text = `敵軍總司令陣亡！敵方軍旗位置曝光！`;
    } else if (ev.type === 'win') {
      text = ev.winner === PLAYER_SIDE ? '我方奪得敵軍軍旗，獲得勝利！' : '我方軍旗被奪，戰鬥結束。';
    } else if (ev.type === 'missile') {
      text = `飛彈轟擊！`;
    }
    if (text && typeof app.ui.log === 'function') app.ui.log({ type: ev.type, text, side: ev.side || null });
  }
}

function battleLogText(ev) {
  const atk = lookupPieceName(ev.attackerUid);
  const def = lookupPieceName(ev.defenderUid);
  const res = OUTCOME_TEXT[ev.outcome] || '';
  return `${atk} 對 ${def}：${res}${ev.eliminated && ev.eliminated.length ? `（${ev.eliminated.map(lookupPieceName).join('、')} 被消滅）` : ''}${ev.occupied ? '，並佔領該處。' : ''}`;
}

function lookupPieceName(uid) {
  if (!app.game) return '？';
  const v = app.game.getView(PLAYER_SIDE);
  const p = (v.pieces || []).find((x) => x.uid === uid);
  if (!p) return '？';
  return p.name || (PIECE_BY_KEY[p.key] && PIECE_BY_KEY[p.key].name) || (p.branch === 'navy' ? '敵艦' : p.branch === 'air' ? '敵機' : '敵棋');
}

function logPlayerVisibleEvents(events) {
  // AI 事件只在 UI 顯示「對方行動」的結果；不洩漏 AI 行動細節太多也無妨
  if (!app.ui) return;
  for (const ev of events) {
    if (ev.type === 'battle') {
      if (app.ui.log) app.ui.log({ type: 'battle', text: '敵軍發起攻擊：' + battleLogText(ev) });
    } else if (ev.type === 'pass') {
      if (app.ui.log) app.ui.log({ type: 'pass', text: '敵軍無棋可動，跳過回合。' });
    } else if (ev.type === 'flagExposed') {
      if (app.ui.log) app.ui.log({ type: 'flag', text: '敵軍總司令陣亡！敵方軍旗位置曝光。' });
    }
  }
}

/* ============================== 結束 / 投降 / 設定 ============================== */

function handleGameOver(view) {
  try {
    if (app.view && typeof app.view.sync === 'function') app.view.sync(view);
  } catch (e) { /* ignore */ }
  app.phase = 'gameover';
  app.loopToken++;
  app.busy = false;
  if (app.ui && typeof app.ui.setAiThinking === 'function') app.ui.setAiThinking(false);
  if (app.ui && typeof app.ui.closeBattle === 'function') app.ui.closeBattle();
  if (app.ui && typeof app.ui.closeModals === 'function') app.ui.closeModals();
  if (app.view) app.view.setInteractive(false);
  const result = {
    winner: view.winner,
    reason: view.winnerReason || '',
    playerWin: view.winner === PLAYER_SIDE,
    draw: view.winner === 'draw',
    turns: view.turn || 0,
    publicInfo: computePublicInfo(view),
  };
  updateMobileTools(false);
  if (app.ui && typeof app.ui.showGameOver === 'function') app.ui.showGameOver(result);
  scheduleInsets(200);
}

function surrender() {
  if (app.phase !== 'play') return;
  // UI 已內建投降確認對話框
  try {
    if (typeof app.game.surrender === 'function') app.game.surrender(PLAYER_SIDE);
  } catch (e) { console.warn('[三軍棋] 投降處理失敗', e); }
  app.phase = 'gameover';
  app.loopToken++;
  const view = app.game.getView(PLAYER_SIDE);
  handleGameOver({ ...view, winner: AI_SIDE, winnerReason: '我方投降' });
}

function applySettings(next) {
  if (!next || typeof next !== 'object') return;
  // UI 的設定欄位：sound / revealOnBattle / difficulty / viewHints
  if (typeof next.sound === 'boolean') app.settings.sound = next.sound;
  if (typeof next.revealOnBattle === 'boolean') app.settings.reveal = next.revealOnBattle;
  if (typeof next.viewHints === 'boolean') app.settings.hints = next.viewHints;
  if (typeof next.difficulty === 'string') app.difficulty = next.difficulty;
  if (app.view && typeof app.view.setSound === 'function') app.view.setSound(!!app.settings.sound);
  if (app.game && typeof app.game.setRevealOnBattle === 'function') app.game.setRevealOnBattle(!!app.settings.reveal);
  if (app.ai && typeof app.ai.setDifficulty === 'function' && next.difficulty) {
    try { app.ai.setDifficulty(next.difficulty); } catch (e) { /* 下一局生效 */ }
  }
  persistSettings();
}

function persistSettings() {
  try { localStorage.setItem('sanjunqi.settings', JSON.stringify({ ...app.settings, difficulty: app.difficulty })); } catch (e) { /* ignore */ }
}
function loadSettings() {
  try {
    const raw = localStorage.getItem('sanjunqi.settings');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && typeof s === 'object') {
      if (typeof s.sound === 'boolean') app.settings.sound = s.sound;
      if (typeof s.reveal === 'boolean') app.settings.reveal = s.reveal;
      if (typeof s.difficulty === 'string') app.difficulty = s.difficulty;
    }
  } catch (e) { /* ignore */ }
}

/* ============================== 手機 / 觸控支援 ============================== */

/** 建立手機浮動鏡頭工具（＋／－／重置） */
function setupMobileTools() {
  if (!app.isCoarse) return;
  if (document.getElementById('mobile-tools')) return;
  const wrap = document.createElement('div');
  wrap.id = 'mobile-tools';
  wrap.setAttribute('aria-label', '視角工具');
  const mk = (label, title, handler) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); handler(); });
    wrap.appendChild(b);
    return b;
  };
  mk('＋', '放大', () => mobileZoom(0.82));
  mk('－', '縮小', () => mobileZoom(1.22));
  mk('⟳', '重設視角', () => mobileResetView());
  (document.getElementById('app') || document.body).appendChild(wrap);
  app.mobileTools = wrap;
}

function updateMobileTools(show) {
  const el = app.mobileTools || document.getElementById('mobile-tools');
  if (!el) return;
  let visible;
  if (show === undefined) {
    visible = app.isCoarse && !app.modalOpen && (app.phase === 'setup' || app.phase === 'play');
  } else {
    visible = !!show && app.isCoarse;
  }
  el.classList.toggle('is-visible', visible);
}

function mobileZoom(factor) {
  if (!app.view) return;
  try {
    if (typeof app.view.zoomBy === 'function') {
      app.view.zoomBy(factor);
      return;
    }
    // 後備：直接對 OrbitControls 做 dolly
    const THREE = app.view.three;
    const cam = app.view.camera;
    const ctl = app.view.controls;
    if (!THREE || !cam || !ctl) return;
    const target = ctl.target;
    const offset = cam.position.clone().sub(target);
    const dist = Math.min(46, Math.max(9, offset.length() * factor));
    offset.setLength(dist);
    cam.position.copy(target).add(offset);
    ctl.update();
  } catch (e) { console.warn('[三軍棋] 縮放失敗', e); }
}

function mobileResetView() {
  if (!app.view) return;
  try {
    if (typeof app.view.resetView === 'function') { app.view.resetView(); return; }
    if (typeof app.view.setPerspective === 'function') app.view.setPerspective(PLAYER_SIDE);
  } catch (e) { /* ignore */ }
}

/** 依目前 UI 佔用空間計算 3D 安全區（僅手機） */
function computeInsets() {
  if (!app.isCoarse) return null;
  const H = window.innerHeight || 600;
  let top = 6;
  let bottom = 6;
  const left = 6;
  const right = 6;
  if (app.phase === 'setup') {
    const tray = document.querySelector('.setup__tray');
    if (tray) {
      const r = tray.getBoundingClientRect();
      if (r.height > 8 && r.top < H) bottom = Math.max(bottom, Math.ceil(H - r.top) + 6);
    }
    // 佈陣畫面：把上方浮動按鈕列（規則／返回／圖鑑）也算進安全區
    const btnEls = Array.from(document.querySelectorAll('.screen--setup .icon-btn, .screen--setup .btn'));
    let maxBottom = 0;
    for (const el of btnEls) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.width > 0 && r.top < H * 0.45) maxBottom = Math.max(maxBottom, r.bottom);
    }
    if (maxBottom > 0) top = Math.max(top, Math.ceil(maxBottom) + 6);
    top = Math.max(top, 58);
  } else if (app.phase === 'play' || app.phase === 'gameover') {
    const topEl = document.querySelector('.hud__top');
    if (topEl) {
      const r = topEl.getBoundingClientRect();
      if (r.height > 0) top = Math.max(top, Math.ceil(r.bottom) + 6);
    }
    // 底部固定預留：不要每次選棋都因卡片高度改變而重新取景
    bottom = Math.max(bottom, Math.min(140, Math.round(H * 0.17)));
  } else {
    return null;
  }
  return { top, bottom, left, right };
}

let _insetTimer = 0;
function scheduleInsets(delay = 140) {
  if (!app.isCoarse) return;
  window.clearTimeout(_insetTimer);
  _insetTimer = window.setTimeout(() => applyInsets(true), delay);
}

function applyInsets(force = false) {
  if (!app.isCoarse || !app.view) return;
  const insets = computeInsets();
  if (!insets) return;
  const key = JSON.stringify(insets);
  if (!force && key === app._insetKey) return;
  app._insetKey = key;
  app.insets = insets;
  try {
    if (typeof app.view.setSafeInsets === 'function') {
      app.view.setSafeInsets(insets);
      if (typeof app.view.reframe === 'function') app.view.reframe({ animate: false });
    } else if (typeof app.view.reframe === 'function') {
      app.view.reframe({ animate: false });
    }
  } catch (e) { console.warn('[三軍棋] 手機取景失敗', e); }
}

function startInsetWatcher() {
  window.addEventListener('resize', () => { scheduleInsets(160); updateMobileTools(); }, { passive: true });
  window.addEventListener('orientationchange', () => {
    scheduleInsets(320);
    setTimeout(() => scheduleInsets(150), 900);
    setTimeout(() => applyInsets(true), 1400);
  }, { passive: true });
  // 手機上 UI 面板會展開/收合（佈陣托盤），低頻檢查尺寸變化
  setInterval(() => {
    if (!app.isCoarse) return;
    if (app.phase === 'setup' || app.phase === 'play') applyInsets(false);
  }, 500);
}

function showMobileHint(text) {
  if (!app.isCoarse || app.mobileHintShown) return;
  app.mobileHintShown = true;
  setTimeout(() => toast(text, 'info'), 700);
}

/* ============================== 小工具 ============================== */

function toast(msg, type = 'info') {
  const map = { ok: 'success', success: 'success', error: 'danger', danger: 'danger', warn: 'warn', warning: 'warn', info: 'info', battle: 'battle', flag: 'flag' };
  if (app.ui && typeof app.ui.showToast === 'function') app.ui.showToast(msg, map[type] || 'info');
  else console.log('[toast]', msg);
}

function confirmDialog(msg) {
  if (app.ui && typeof app.ui.confirm === 'function') {
    return new Promise((resolve) => {
      app.ui.confirm({
        title: '確認',
        message: msg,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }
  return Promise.resolve(window.confirm(msg));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function bindGlobalKeys() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (app.phase === 'setup') { app.selectedDeployKey = null; app.view.clearHighlights(); }
      else if (app.phase === 'play') clearSelection();
    }
    if (e.key === 'r' && e.ctrlKey) return;
  });
}

/* ============================== 3D 點擊綁定 ============================== */

window.addEventListener('DOMContentLoaded', () => { /* boot 於 module 載入即執行 */ });

// 等 view 建立後再綁定（boot 內非同步）— 用輪詢確保晚綁定也不漏
const bindTimer = setInterval(() => {
  if (app.view && typeof app.view.onNodePick === 'function' && !app._pickBound) {
    app._pickBound = true;
    app.view.onNodePick((nodeId) => onNodePick(nodeId));
    if (typeof app.view.onPiecePick === 'function') app.view.onPiecePick((uid) => onPiecePick(uid));
    clearInterval(bindTimer);
  }
}, 200);
setTimeout(() => clearInterval(bindTimer), 30000);

/* ============================== 除錯 / 測試 API ============================== */

function exposeDebugApi() {
  window.__SANJUNQI__ = {
    get app() { return app; },
    get game() { return app.game; },
    get ui() { return app.ui; },
    get view() { return app.view; },
    get phase() { return app.phase; },
    startNewGame,
    showMenu,
    autoDeployPlayer,
    confirmDeploy,
    onPiecePick,
    onNodePick,
    performPlayerAction,
    getLegalActions: (side = PLAYER_SIDE) => (app.game ? app.game.getLegalActions(side) : []),
    quickStart: async () => {
      await startNewGame();
      autoDeployPlayer();
      await sleep(60);
      confirmDeploy();
    },
    /** 測試用：由外部直接下一個合法玩家行動 */
    playOneAction: async (index = 0) => {
      if (!app.game) return { error: 'no game' };
      const actions = app.game.getLegalActions(PLAYER_SIDE) || [];
      if (!actions.length) return { error: 'no actions' };
      const action = actions[Math.min(index, actions.length - 1)];
      await performPlayerAction(action);
      return { action, ok: true };
    },
    snapshot: () => (app.game ? app.game.snapshot() : null),
    getSettings: () => ({ ...app.settings, difficulty: app.difficulty }),
    /** 目前是否正在等待玩家操作（動畫結束、可點擊） */
    isPlayerTurn: () => app.phase === 'play' && !!app.playerResolve && !app.busy,
    isBusy: () => !!app.busy,
    isMobile: () => !!app.isCoarse,
    getInsets: () => app.insets,
    applyInsets: (force = true) => applyInsets(force),
    /** 測試用：直接顯示結算畫面 */
    debugGameOver: (winner = 'south') => {
      if (!app.game) return;
      const v = app.game.getView(PLAYER_SIDE);
      handleGameOver({ ...v, winner, winnerReason: 'debug' });
      return true;
    },
    /** 測試用：把節點投影成畫面座標（給 Playwright 點擊） */
    projectNode: (nodeId) => {
      try {
        const v = app.view;
        const world = v.board.nodeWorld ? v.board.nodeWorld(nodeId) : null;
        if (!world) return null;
        const THREE = v.three;
        const vec = new THREE.Vector3(world.x, (world.y || 0) + 0.45, world.z).project(v.camera);
        const rect = v.renderer.domElement.getBoundingClientRect();
        return {
          x: rect.left + ((vec.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - vec.y) / 2) * rect.height,
          visible: vec.z < 1,
        };
      } catch (e) { return null; }
    },
    /** 測試用：把某 uid 的棋子位置投影成畫面座標 */
    projectPiece: (uid) => {
      try {
        const v = app.view;
        const obj = v.pieces && v.pieces.get ? v.pieces.get(uid) : null;
        if (!obj) return null;
        const THREE = v.three;
        const pos = obj.group.position;
        const vec = new THREE.Vector3(pos.x, pos.y + 0.4, pos.z).project(v.camera);
        const rect = v.renderer.domElement.getBoundingClientRect();
        return {
          x: rect.left + ((vec.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - vec.y) / 2) * rect.height,
          visible: vec.z < 1,
        };
      } catch (e) { return null; }
    },
  };
}

// 讀取存檔設定
loadSettings();
