#!/usr/bin/env node
/**
 * 三軍棋 3D — 手機版 UI 實測工具（Playwright）
 * ------------------------------------------------------------------
 * 以真實頁面 index.html?lowfx=1 跑「iPhone 13」手機模擬（含觸控）：
 *   直向 390×844、Playwright iPhone 13 裝置（390×664）、橫向 844×390
 * 依序驗證：佈陣托盤收合 → 展開 → 點棋子自動收合 → tap 棋盤放置 →
 *           自動佈陣 → 開始戰鬥 → tap 棋子（緊湊資訊卡）→ 抽屜／modal／
 *           戰鬥結算／結算畫面，並輸出 dev/shots/mobile-ui-*.png。
 *
 * 用法：
 *   node tools/ui-mobile.mjs                 # 全部情境
 *   node tools/ui-mobile.mjs --list
 *   node tools/ui-mobile.mjs --only=portrait,landscape
 *   node tools/ui-mobile.mjs --skip-iphone13
 *
 * 註：無頭 3D 使用 SwiftShader，速度很慢；本工具已拉長等待與截圖 timeout。
 */
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dev', 'shots');
const HINT_KEY = 'sanjunqi.ui.landscapeHint.v1';
const IPHONE_UA = devices['iPhone 13'].userAgent;

const args = process.argv.slice(2);
const hasFlag = (name) => args.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const readOpt = (name, fallback = '') => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const GROUPS = ['portrait', 'landscape', 'iphone13', 'hint'];
if (hasFlag('list')) {
  console.log(GROUPS.join('\n'));
  process.exit(0);
}
const onlyRaw = readOpt('only', '');
const only = onlyRaw ? onlyRaw.split(',').map((s) => s.trim()).filter(Boolean) : null;
const selected = new Set(
  only
    ? GROUPS.filter((g) => only.some((o) => g.includes(o) || o.includes(g)))
    : GROUPS.filter((g) => !(g === 'iphone13' && hasFlag('skip-iphone13')))
);

/* ------------------------------------------------------------------ */
/* 簡易靜態伺服器（同 ui-shot.mjs）                                    */
/* ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/index.html';
      const filePath = path.resolve(ROOT, `.${pathname}`);
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      const info = await stat(filePath);
      if (!info.isFile()) {
        res.writeHead(404); res.end('Not found'); return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404); res.end('Not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/* ------------------------------------------------------------------ */
/* 共用工具                                                            */
/* ------------------------------------------------------------------ */
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const report = {
  groups: {},
  screenshots: [],
  errors: [],
  layout: {},
};

function log(msg) {
  console.log(`${DIM}[mobile-ui]${RESET} ${msg}`);
}

/** 測試用暫時 shim：補上 render/index.js 目前缺少的 isCoarsePointer 全域（詳見回報） */
const installTapShim = () => {
  try {
    if (typeof window.isCoarsePointer === 'undefined') window.isCoarsePointer = true;
  } catch { /* 忽略 */ }
};

function watchPage(page, label) {
  page.on('pageerror', (error) => report.errors.push(`[${label}] pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // 忽略瀏覽器對 WebAudio / WebGL 的效能警告（非錯誤）
    if (/(AudioContext|GL Driver Message)/.test(text)) return;
    report.errors.push(`[${label}] console: ${text}`);
  });
}

async function shot(page, name) {
  const file = path.join(OUT, `mobile-ui-${name}.png`);
  await page.evaluate(async () => { try { await document.fonts.ready; } catch { /* 忽略 */ } });
  await page.waitForTimeout(260);
  await page.screenshot({ path: file, timeout: 180000, animations: 'disabled', caret: 'hide' });
  report.screenshots.push(path.relative(ROOT, file));
  log(`📸 ${GREEN}mobile-ui-${name}.png${RESET}`);
  return file;
}

async function waitForApp(page) {
  await page.waitForFunction(() => !!(window.__SANJUNQI__ && window.__SANJUNQI__.ui), null, { timeout: 180000 });
  // 等 3D 場景與相機穩定（SwiftShader 很慢）
  await page.waitForTimeout(4000);
}

/** 從主選單進入佈陣（優先實際 tap，失敗才用 debug API） */
async function ensureSetup(page) {
  const state = await page.evaluate(() => ({
    menu: !!document.querySelector('.screen--menu.is-active'),
    setup: !!document.querySelector('.screen--setup.is-active'),
  }));
  if (state.setup) {
    await page.waitForTimeout(1200);
    return 'already';
  }
  let method = 'tap';
  try {
    if (state.menu) await page.locator('[data-menu="start"]').tap({ timeout: 30000 });
    else throw new Error('not on menu');
  } catch (error) {
    method = 'debug-api';
    await page.evaluate(async () => { await window.__SANJUNQI__.startNewGame(); });
  }
  await page.waitForFunction(() => !!document.querySelector('.screen--setup.is-active'), null, { timeout: 150000 });
  await page.waitForTimeout(2200);
  return method;
}

async function ensureGame(page) {
  // 從佈陣按開始戰鬥；若已在遊戲則略過
  const inGame = await page.evaluate(() => !!document.querySelector('.screen--game.is-active'));
  if (inGame) return 'already';
  let method = 'tap';
  try {
    await page.locator('.setup__tray [data-setup="start"]:visible').first().tap({ timeout: 20000 });
  } catch {
    method = 'debug-api';
    await page.evaluate(() => window.__SANJUNQI__.confirmDeploy());
  }
  await page.waitForFunction(() => !!document.querySelector('.screen--game.is-active'), null, { timeout: 150000 });
  return method;
}

async function waitPlayerTurn(page, timeout = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ok = await page.evaluate(() => {
      try { return window.__SANJUNQI__?.isPlayerTurn?.() === true; } catch { return false; }
    });
    if (ok) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

async function setupMetrics(page) {
  return page.evaluate(() => {
    const tray = document.querySelector('.setup__tray');
    const H = window.innerHeight;
    const rect = tray?.getBoundingClientRect();
    const chips = [...document.querySelectorAll('.setup-group__grid .piece-chip')];
    const visibleChips = chips.filter((c) => c.getBoundingClientRect().height > 0);
    const startBtn = document.querySelector('.setup__tray [data-setup="start"]');
    return {
      compact: tray?.classList.contains('is-collapsed') !== undefined,
      collapsed: !!tray?.classList.contains('is-collapsed'),
      trayHeight: rect ? Math.round(rect.height) : null,
      trayTop: rect ? Math.round(rect.top) : null,
      viewportH: H,
      heightRatio: rect ? +(rect.height / H).toFixed(3) : null,
      toggleText: document.querySelector('[data-setup-toggle-text]')?.textContent?.trim() || '',
      count: document.querySelector('[data-setup-count]')?.textContent || '',
      selected: document.querySelector('[data-setup-collapsed-piece]')?.textContent?.trim() || '',
      hint: document.querySelector('[data-setup-collapsed-hint]')?.textContent?.trim() || '',
      startDisabled: !!startBtn?.disabled,
      chipCount: chips.length,
      chipMinWidth: visibleChips.length ? Math.round(Math.min(...visibleChips.map((c) => c.getBoundingClientRect().width))) : 0,
      chipMinHeight: visibleChips.length ? Math.round(Math.min(...visibleChips.map((c) => c.getBoundingClientRect().height))) : 0,
      collisionWithBoard: rect ? Math.max(0, H - rect.top) : 0,
    };
  });
}

async function modalMetrics(page) {
  return page.evaluate(() => {
    const modal = document.querySelector('.modal.is-open');
    if (!modal) return { open: false };
    const panel = modal.querySelector('.modal__panel');
    const body = modal.querySelector('.modal__body');
    const r = panel?.getBoundingClientRect();
    const scrollEl = modal.querySelector('.rules-content') || body;
    const sample = modal.querySelector('.rules-article p, .cdetail__desc, .setting-row__text p, .gameover__reason, .battle__result-sub, .cl-result__desc');
    const buttons = [...modal.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().height > 0);
    return {
      open: true,
      panelHeight: r ? Math.round(r.height) : null,
      panelTop: r ? Math.round(r.top) : null,
      panelBottom: r ? Math.round(r.bottom) : null,
      viewportH: window.innerHeight,
      bodyOverflow: body ? getComputedStyle(body).overflowY : null,
      scrollable: scrollEl ? scrollEl.scrollHeight > scrollEl.clientHeight + 2 : null,
      sampleFontPx: sample ? parseFloat(getComputedStyle(sample).fontSize) : null,
      minButtonHeight: buttons.length ? Math.round(Math.min(...buttons.map((b) => b.getBoundingClientRect().height))) : null,
      buttonsInsideViewport: buttons.every((b) => {
        const br = b.getBoundingClientRect();
        return br.top >= 0 && br.bottom <= window.innerHeight + 1;
      }),
    };
  });
}

async function closeModal(page) {
  const closeBtn = page.locator('.modal.is-open .modal__close').first();
  if (await closeBtn.count()) {
    await closeBtn.tap({ timeout: 20000 }).catch(async () => {
      await page.evaluate(() => { document.querySelector('.modal.is-open .modal__close')?.click(); });
    });
    await page.waitForTimeout(700);
  }
}

async function selectOwnPiece(page) {
  const target = await page.evaluate(() => {
    const U = window.__SANJUNQI__;
    const view = U.game?.getView('south');
    if (!view) return null;
    const H = window.innerHeight;
    for (const piece of view.pieces) {
      if (piece.side !== 'south' || !piece.alive) continue;
      const pos = U.projectPiece(piece.uid);
      if (!pos || !pos.visible) continue;
      if (pos.x < 20 || pos.x > window.innerWidth - 20) continue;
      if (pos.y < 90 || pos.y > H - 160) continue;
      return { uid: piece.uid, name: piece.name, pos };
    }
    return null;
  });
  if (target) {
    await page.touchscreen.tap(Math.round(target.pos.x), Math.round(target.pos.y));
    await page.waitForTimeout(1500);
    return { method: 'tap', ...target };
  }
  const uid = await page.evaluate(() => {
    const view = window.__SANJUNQI__.game.getView('south');
    const piece = view.pieces.find((p) => p.side === 'south' && p.alive);
    return piece?.uid ?? null;
  });
  if (uid != null) {
    await page.evaluate((id) => window.__SANJUNQI__.onPiecePick(id), uid);
    await page.waitForTimeout(1200);
    return { method: 'debug-onPiecePick', uid };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 情境 1：直向手機 390×844                                            */
/* ------------------------------------------------------------------ */
async function runPortrait(browser, base) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_UA,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    colorScheme: 'dark',
  });
  await context.addInitScript(({ key }) => {
    try { window.localStorage.setItem(key, '1'); } catch { /* 忽略 */ }
  }, { key: HINT_KEY });
  await context.addInitScript(installTapShim);
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  watchPage(page, 'portrait');
  const out = {};
  try {
    await page.goto(`${base}/index.html?lowfx=1`, { waitUntil: 'load', timeout: 150000 });
    await waitForApp(page);
    out.menu = await page.evaluate(() => ({
      screen: document.querySelector('.ui')?.dataset.screen,
      mobileTools: !!document.querySelector('#mobile-tools.is-visible'),
    }));
    await shot(page, '01-menu-portrait');

    out.setupEnterMethod = await ensureSetup(page);
    out.setupCollapsed = await setupMetrics(page);
    if (!out.setupCollapsed.collapsed) throw new Error('手機佈陣托盤預設應為收合狀態');
    await shot(page, '02-setup-collapsed');

    // 展開托盤
    await page.locator('[data-setup="toggle"]').tap();
    await page.waitForTimeout(900);
    out.setupExpanded = await setupMetrics(page);
    if (out.setupExpanded.trayHeight / out.setupExpanded.viewportH > 0.55) {
      throw new Error(`佈陣托盤展開高度超過 55vh：${out.setupExpanded.heightRatio}`);
    }
    await shot(page, '03-setup-expanded');

    // 點棋子 → 應自動收合
    const chip = page.locator('.piece-chip[data-piece-key="commander"]');
    await chip.scrollIntoViewIfNeeded();
    await chip.tap();
    await page.waitForTimeout(1100);
    out.setupPicked = await setupMetrics(page);
    if (!out.setupPicked.collapsed) throw new Error('點選棋子後托盤應自動收合');
    if (!/總司令/.test(out.setupPicked.selected)) throw new Error(`收合列未顯示已選棋子：${out.setupPicked.selected}`);
    await shot(page, '04-setup-picked');

    // tap 棋盤放置（節點 110 = row8/col6 南軍陸地）
    const projection = await page.evaluate(() => window.__SANJUNQI__.projectNode(110));
    out.node110 = projection;
    const canTap = projection && projection.visible
      && projection.x > 12 && projection.x < 378
      && projection.y > 96 && projection.y < 844 - 130;
    if (canTap) {
      await page.touchscreen.tap(Math.round(projection.x), Math.round(projection.y));
      out.placeMethod = 'tap';
    } else {
      await page.evaluate(() => window.__SANJUNQI__.onNodePick(110));
      out.placeMethod = 'debug-onNodePick';
    }
    await page.waitForTimeout(2000);
    const readPlace = () => page.evaluate(() => ({
      placements: window.__SANJUNQI__.app.playerPlacements?.length ?? null,
      collapsed: !!document.querySelector('.setup__tray')?.classList.contains('is-collapsed'),
      count: document.querySelector('[data-setup-count]')?.textContent,
      selected: document.querySelector('[data-setup-collapsed-piece]')?.textContent?.trim(),
      hint: document.querySelector('[data-setup-collapsed-hint]')?.textContent?.trim(),
    }));
    out.afterPlace = await readPlace();
    if (out.afterPlace.placements < 1) {
      // tap 未生效（可能是 3D pointer 層問題）→ 改用 main 的 debug API 完成同一個放置
      await page.evaluate(() => window.__SANJUNQI__.onNodePick(110));
      await page.waitForTimeout(1500);
      out.placeMethod = 'debug-onNodePick(fallback)';
      out.afterPlace = await readPlace();
    }
    if (out.afterPlace.placements < 1) throw new Error('棋盤放置失敗（tap 與 debug API 都失敗）');
    await shot(page, '05-setup-after-place');

    // 自動佈陣 → 開始戰鬥
    await page.locator('.setup__tray [data-setup="auto"]:visible').first().tap();
    await page.waitForTimeout(2200);
    out.setupReady = await page.evaluate(() => ({
      count: document.querySelector('[data-setup-count]')?.textContent,
      startDisabled: !!document.querySelector('.setup__tray [data-setup="start"]')?.disabled,
    }));
    await shot(page, '06-setup-ready');
    out.startMethod = await ensureGame(page);
    out.playerTurn = await waitPlayerTurn(page);
    await page.waitForTimeout(1400);
    await shot(page, '07-play');

    // tap 棋子 → 緊湊資訊卡
    out.tapPiece = await selectOwnPiece(page);
    let selectedDespiteTap = await page.evaluate(() => {
      const el = document.querySelector('.hud__selected');
      return !!el && !el.hidden;
    });
    if (!selectedDespiteTap) {
      const uid = await page.evaluate(() => {
        const view = window.__SANJUNQI__.game.getView('south');
        return view.pieces.find((p) => p.side === 'south' && p.alive)?.uid ?? null;
      });
      if (uid != null) {
        await page.evaluate((id) => window.__SANJUNQI__.onPiecePick(id), uid);
        await page.waitForTimeout(1200);
        out.tapPiece = { ...(out.tapPiece || {}), method: 'debug-onPiecePick(fallback)', uid };
      }
    }
    out.selectedCard = await page.evaluate(() => {
      const el = document.querySelector('.hud__selected');
      if (!el || el.hidden) return { hidden: true };
      const rect = el.getBoundingClientRect();
      const more = document.querySelector('[data-selected-more]');
      const close = document.querySelector('.selected-card__close');
      return {
        hidden: false,
        height: Math.round(rect.height),
        width: Math.round(rect.width),
        ratio: +(rect.height / window.innerHeight).toFixed(3),
        moreVisible: !!more && getComputedStyle(more).display !== 'none',
        closeSize: close ? Math.round(close.getBoundingClientRect().height) : null,
      };
    });
    await shot(page, '08-play-selected');

    if (out.selectedCard.moreVisible) {
      await page.locator('[data-selected-more]').tap();
      await page.waitForTimeout(700);
      await shot(page, '09-play-selected-detail');
      await page.locator('[data-selected-more]').tap();
      await page.waitForTimeout(400);
    }

    // 右側抽屜（投降／設定／重新開始）
    await page.locator('[data-hud="drawer-right"]').tap();
    await page.waitForTimeout(900);
    out.drawer = await page.evaluate(() => {
      const hud = document.querySelector('.hud');
      const panel = document.querySelector('.hud__panel--right');
      const rect = panel?.getBoundingClientRect();
      const actions = [...(panel?.querySelectorAll('[data-hud]') || [])]
        .filter((b) => ['surrender', 'settings', 'restart'].includes(b.dataset.hud))
        .map((b) => {
          const br = b.getBoundingClientRect();
          return { hud: b.dataset.hud, h: Math.round(br.height), w: Math.round(br.width), visible: br.height > 0 && br.width > 0 };
        });
      return {
        open: hud?.dataset.drawer,
        panelWidth: rect ? Math.round(rect.width) : null,
        actions,
      };
    });
    await shot(page, '10-drawer-right');

    // 設定 modal（由抽屜開啟）
    await page.locator('.hud__panel--right [data-hud="settings"]').tap();
    await page.waitForTimeout(1200);
    out.settingsModal = await modalMetrics(page);
    await shot(page, '11-settings');
    await closeModal(page);

    // 規則頁
    await page.locator('[data-hud="rules"]').tap();
    await page.waitForTimeout(2800);
    out.rulesModal = await modalMetrics(page);
    await shot(page, '12-rules');
    await page.evaluate(() => {
      const content = document.querySelector('.rules-content');
      if (content) content.scrollTop = Math.round(content.scrollHeight * 0.32);
    });
    await page.waitForTimeout(700);
    await shot(page, '13-rules-scrolled');
    await closeModal(page);

    // 棋子圖鑑
    await page.evaluate(() => window.__SANJUNQI__.ui.openCodex('commander'));
    await page.waitForTimeout(1500);
    out.codexModal = await modalMetrics(page);
    await shot(page, '14-codex');
    await closeModal(page);

    // 戰鬥結算卡
    out.battlePayload = await page.evaluate(() => {
      const U = window.__SANJUNQI__;
      const view = U.game.getView('south');
      const attacker = view.pieces.find((p) => p.side === 'south' && p.alive);
      const defender = view.pieces.find((p) => p.side === 'north' && p.alive);
      if (!attacker || !defender) return null;
      U.ui.setBattle({
        attackerUid: attacker.uid,
        defenderUid: defender.uid,
        outcome: 'A',
        reveal: [
          { uid: attacker.uid, key: attacker.key },
          { uid: defender.uid, key: defender.key },
        ],
        eliminated: [defender.uid],
        occupied: true,
        special: null,
        turn: view.turn,
      }, () => { });
      return { attacker: attacker.name, defender: defender.name };
    });
    await page.waitForTimeout(1600);
    out.battleModal = await page.evaluate(() => {
      const modal = document.querySelector('.modal.is-open');
      const panel = modal?.querySelector('.modal__panel');
      const button = modal?.querySelector('.battle__continue');
      const pr = panel?.getBoundingClientRect();
      const br = button?.getBoundingClientRect();
      return {
        open: !!modal,
        panelBottom: pr ? Math.round(pr.bottom) : null,
        viewportH: window.innerHeight,
        continue: br ? { top: Math.round(br.top), bottom: Math.round(br.bottom), h: Math.round(br.height) } : null,
        insideViewport: !!br && br.top >= 0 && br.bottom <= window.innerHeight + 1,
      };
    });
    await shot(page, '15-battle');
    if (out.battleModal.insideViewport) {
      await page.locator('.modal.is-open .battle__continue').tap();
      await page.waitForTimeout(700);
    }

    // 結算畫面
    await page.evaluate(() => window.__SANJUNQI__.ui.showGameOver({ winner: 'south', reason: 'flag', turns: 24 }));
    await page.waitForTimeout(1500);
    out.gameover = await page.evaluate(() => {
      const panel = document.querySelector('.gameover__panel');
      const rect = panel?.getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.gameover__actions .btn')].map((b) => {
        const br = b.getBoundingClientRect();
        return { text: b.textContent.trim(), h: Math.round(br.height), inside: br.top >= 0 && br.bottom <= window.innerHeight + 1 };
      });
      return {
        panel: rect ? { top: Math.round(rect.top), bottom: Math.round(rect.bottom), h: Math.round(rect.height) } : null,
        scrollable: panel ? panel.scrollHeight > panel.clientHeight + 2 : null,
        buttons,
      };
    });
    await shot(page, '16-gameover');
  } finally {
    await context.close();
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 情境 2：橫向 844×390                                                */
/* ------------------------------------------------------------------ */
async function runLandscape(browser, base) {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    screen: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_UA,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    colorScheme: 'dark',
  });
  await context.addInitScript(({ key }) => {
    try { window.localStorage.setItem(key, '1'); } catch { /* 忽略 */ }
  }, { key: HINT_KEY });
  await context.addInitScript(installTapShim);
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  watchPage(page, 'landscape');
  const out = {};
  try {
    await page.goto(`${base}/index.html?lowfx=1`, { waitUntil: 'load', timeout: 150000 });
    await waitForApp(page);
    await shot(page, '20-landscape-menu');

    out.setupEnterMethod = await ensureSetup(page);
    out.setupCollapsed = await setupMetrics(page);
    await shot(page, '21-landscape-setup-collapsed');

    await page.locator('[data-setup="toggle"]').tap();
    await page.waitForTimeout(900);
    out.setupExpanded = await setupMetrics(page);
    await shot(page, '22-landscape-setup-expanded');

    // 收合後自動佈陣＋開始
    await page.locator('[data-setup="toggle"]').tap();
    await page.waitForTimeout(600);
    await page.locator('.setup__tray [data-setup="auto"]:visible').first().tap();
    await page.waitForTimeout(2200);
    await ensureGame(page);
    out.playerTurn = await waitPlayerTurn(page);
    await page.waitForTimeout(1400);
    await shot(page, '23-landscape-play');

    await page.locator('[data-hud="drawer-right"]').tap();
    await page.waitForTimeout(900);
    out.drawer = await page.evaluate(() => {
      const hud = document.querySelector('.hud');
      const panel = document.querySelector('.hud__panel--right');
      return {
        open: hud?.dataset.drawer,
        h: panel ? Math.round(panel.getBoundingClientRect().height) : null,
        buttons: [...(panel?.querySelectorAll('[data-hud]') || [])]
          .filter((b) => ['surrender', 'settings', 'restart'].includes(b.dataset.hud))
          .map((b) => b.dataset.hud),
      };
    });
    await shot(page, '24-landscape-drawer');
    await page.locator('[data-hud="drawer-right"]').tap();
    await page.waitForTimeout(500);

    // 橫向規則頁
    await page.locator('[data-hud="rules"]').tap();
    await page.waitForTimeout(2800);
    out.rulesModal = await modalMetrics(page);
    await shot(page, '25-landscape-rules');
    await closeModal(page);
  } finally {
    await context.close();
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 情境 3：Playwright iPhone 13 裝置（390×664）                        */
/* ------------------------------------------------------------------ */
async function runIphone13(browser, base) {
  const { defaultBrowserType: _dbt, browserName: _bn, ...descriptor } = devices['iPhone 13'];
  const context = await browser.newContext({
    ...descriptor,
    deviceScaleFactor: 2,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    colorScheme: 'dark',
  });
  await context.addInitScript(({ key }) => {
    try { window.localStorage.setItem(key, '1'); } catch { /* 忽略 */ }
  }, { key: HINT_KEY });
  await context.addInitScript(installTapShim);
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  watchPage(page, 'iphone13');
  const out = {};
  try {
    await page.goto(`${base}/index.html?lowfx=1`, { waitUntil: 'load', timeout: 150000 });
    await waitForApp(page);
    out.setupEnterMethod = await ensureSetup(page);
    out.setupCollapsed = await setupMetrics(page);
    await shot(page, '30-iphone13-setup-collapsed');

    await page.locator('[data-setup="toggle"]').tap();
    await page.waitForTimeout(900);
    out.setupExpanded = await setupMetrics(page);
    await shot(page, '31-iphone13-setup-expanded');

    await page.locator('[data-setup="toggle"]').tap();
    await page.waitForTimeout(600);
    await page.locator('.setup__tray [data-setup="auto"]:visible').first().tap();
    await page.waitForTimeout(2200);
    await ensureGame(page);
    out.playerTurn = await waitPlayerTurn(page);
    await page.waitForTimeout(1400);
    await shot(page, '32-iphone13-play');
  } finally {
    await context.close();
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 情境 4：直向「橫向視野更佳」一次性提示                               */
/* ------------------------------------------------------------------ */
async function runHint(browser, base) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_UA,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    colorScheme: 'dark',
  });
  await context.addInitScript(installTapShim);
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  watchPage(page, 'hint');
  const out = {};
  try {
    await page.goto(`${base}/index.html?lowfx=1`, { waitUntil: 'load', timeout: 150000 });
    await page.waitForFunction(() => !!(window.__SANJUNQI__ && window.__SANJUNQI__.ui), null, { timeout: 180000 });
    await page.waitForTimeout(2800);
    out.firstLoad = await page.evaluate(() => {
      const toast = [...document.querySelectorAll('.toast')].find((t) => /橫向/.test(t.textContent));
      const stored = (() => { try { return window.localStorage.getItem('sanjunqi.ui.landscapeHint.v1'); } catch { return null; } })();
      return { shown: !!toast, text: toast?.textContent?.trim().slice(0, 60) || '', stored };
    });
    await shot(page, '17-orientation-hint');
    await page.reload({ waitUntil: 'load', timeout: 150000 });
    await page.waitForFunction(() => !!(window.__SANJUNQI__ && window.__SANJUNQI__.ui), null, { timeout: 180000 });
    await page.waitForTimeout(3400);
    out.secondLoad = await page.evaluate(() => {
      const toast = [...document.querySelectorAll('.toast')].find((t) => /橫向/.test(t.textContent));
      return { shown: !!toast };
    });
  } finally {
    await context.close();
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */
async function main() {
  await mkdir(OUT, { recursive: true });
  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--force-color-profile=srgb'],
  });
  const started = Date.now();
  try {
    if (selected.has('portrait')) {
      log('▶ 直向 390×844（iPhone 13 UA、觸控）');
      try {
        report.groups.portrait = await runPortrait(browser, base);
        log(`${GREEN}✓ 直向完成${RESET}`);
      } catch (error) {
        report.errors.push(`[portrait] ${error.stack || error.message}`);
        log(`${RED}✗ 直向失敗：${error.message}${RESET}`);
      }
    }
    if (selected.has('landscape')) {
      log('▶ 橫向 844×390');
      try {
        report.groups.landscape = await runLandscape(browser, base);
        log(`${GREEN}✓ 橫向完成${RESET}`);
      } catch (error) {
        report.errors.push(`[landscape] ${error.stack || error.message}`);
        log(`${RED}✗ 橫向失敗：${error.message}${RESET}`);
      }
    }
    if (selected.has('iphone13')) {
      log('▶ Playwright iPhone 13 裝置（390×664）');
      try {
        report.groups.iphone13 = await runIphone13(browser, base);
        log(`${GREEN}✓ iPhone 13 完成${RESET}`);
      } catch (error) {
        report.errors.push(`[iphone13] ${error.stack || error.message}`);
        log(`${RED}✗ iPhone 13 失敗：${error.message}${RESET}`);
      }
    }
    if (selected.has('hint')) {
      log('▶ 直向橫向提示（只顯示一次）');
      try {
        report.groups.hint = await runHint(browser, base);
        log(`${GREEN}✓ 提示情境完成${RESET}`);
      } catch (error) {
        report.errors.push(`[hint] ${error.stack || error.message}`);
        log(`${RED}✗ 提示情境失敗：${error.message}${RESET}`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('');
  console.log(`${DIM}=== 手機版 UI 實測摘要 ===${RESET}`);
  console.log(JSON.stringify(report.groups, null, 2));
  console.log('');
  console.log(`${DIM}截圖（${report.screenshots.length} 張）：${RESET}`);
  for (const file of report.screenshots) console.log(`  ${file}`);
  console.log('');
  console.log(`${DIM}耗時 ${((Date.now() - started) / 1000).toFixed(1)}s${RESET}`);
  if (report.errors.length) {
    console.log(`${RED}發現 ${report.errors.length} 個錯誤：${RESET}`);
    for (const err of report.errors) console.log(`  ${RED}${err}${RESET}`);
    process.exitCode = 1;
  } else {
    console.log(`${GREEN}全部手機情境完成，無 console error。${RESET}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
