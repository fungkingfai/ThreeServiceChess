/**
 * 手機版端對端測試 / 截圖（iPhone 13 portrait + landscape）
 * 用法：node tests/mobile-e2e.mjs [--url http://127.0.0.1:8123]
 * 需要：靜態伺服器已啟動
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dev', 'shots');
const BASE = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://127.0.0.1:8123';
const URL = `${BASE}/index.html?lowfx=1`;
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const errors = [];
let idx = 0;
const shot = async (page, name) => {
  idx += 1;
  const file = path.join(OUT, `mobile-e2e-${String(idx).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, timeout: 240000 });
  console.log('📸', path.relative(ROOT, file));
};
const assert = (cond, msg) => {
  if (cond) console.log('✅', msg);
  else { failures.push(msg); console.error('❌', msg); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });

async function newMobilePage(device, viewportOverride) {
  const ctx = await browser.newContext({
    ...device,
    ...(viewportOverride ? { viewport: viewportOverride } : {}),
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', (r) => { if (!r.url().includes('favicon')) errors.push('reqfail: ' + r.url()); });
  return { ctx, page };
}

async function waitReady(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !!window.__SANJUNQI__?.view, null, { timeout: 90000 });
  await page.waitForTimeout(2200);
}

const portrait = devices['iPhone 13'];
const { ctx: ctxP, page: pageP } = await newMobilePage(portrait);
try {
  console.log('▶ 直向 iPhone 13（390x664，觸控）');
  await waitReady(pageP);
  const info = await pageP.evaluate(() => ({
    vw: innerWidth, vh: innerHeight,
    scrollW: document.documentElement.scrollWidth,
    manifest: !!document.querySelector('link[rel="manifest"]'),
    viewportMeta: document.querySelector('meta[name=viewport]')?.content,
    isMobile: window.__SANJUNQI__.isMobile?.(),
  }));
  console.log('  viewport', JSON.stringify(info));
  assert(info.scrollW <= info.vw + 1, '無水平 overflow');
  assert(info.manifest, '有 PWA manifest');
  assert(info.isMobile === true, '偵測為手機 / 觸控裝置');
  await shot(pageP, 'menu');

  // 圖鑑：必須有明顯「關閉」出口（底部按鈕＋右上 X），且能返主選單
  await pageP.locator('button', { hasText: '棋子圖鑑' }).first().tap();
  await pageP.waitForTimeout(1000);
  const codexOpen = await pageP.evaluate(() => {
    const close = document.querySelector('[data-codex-close]');
    const r = close ? close.getBoundingClientRect() : null;
    return {
      open: !!document.querySelector('.modal.is-open'),
      hasFooterClose: !!close && r.width >= 44 && r.height >= 44 && r.bottom <= innerHeight + 1,
      hasX: !!document.querySelector('.modal__close'),
    };
  });
  console.log('  codex open', JSON.stringify(codexOpen));
  assert(codexOpen.open, '手機可開啟棋子圖鑑');
  assert(codexOpen.hasFooterClose, '圖鑑底部有大型「關閉圖鑑」按鈕且在視口內');
  assert(codexOpen.hasX, '圖鑑右上角有關閉 X');
  await shot(pageP, 'codex');
  await pageP.locator('[data-codex-close]').first().tap();
  await pageP.waitForTimeout(900);
  const codexClosed = await pageP.evaluate(() => ({
    open: !!document.querySelector('.modal.is-open'),
    screen: window.__SANJUNQI__.ui.getState().screen,
  }));
  console.log('  codex closed', JSON.stringify(codexClosed));
  assert(!codexClosed.open && codexClosed.screen === 'menu', '圖鑑可按底部按鈕關閉並返回主選單');

  // 開始遊戲
  const startBtn = pageP.locator('button', { hasText: '開始遊戲' }).first();
  assert(await startBtn.count() > 0, '主選單有開始遊戲按鈕');
  await startBtn.tap();
  await pageP.waitForTimeout(3200);
  const setup = await pageP.evaluate(() => ({
    phase: window.__SANJUNQI__.phase,
    collapsed: window.__SANJUNQI__.ui?.getSetupCollapsed?.(),
    tray: (() => { const t = document.querySelector('.setup__tray'); if (!t) return null; const r = t.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height) }; })(),
    insets: window.__SANJUNQI__.getInsets?.(),
    mobileTools: !!document.querySelector('#mobile-tools.is-visible'),
  }));
  console.log('  setup', JSON.stringify(setup));
  assert(setup.phase === 'setup', '進入佈陣階段');
  assert(setup.tray && setup.tray.h < 240, '手機佈陣托盤預設收合（高度 < 240px）');
  await shot(pageP, 'setup-collapsed');

  // 展開托盤（等待 CSS/版面完成）
  await pageP.evaluate(() => window.__SANJUNQI__.ui?.setSetupCollapsed?.(false));
  await pageP.waitForFunction(() => {
    const t = document.querySelector('.setup__tray');
    return !!t && t.getBoundingClientRect().height > 220;
  }, null, { timeout: 20000 }).catch(() => {});
  const expanded = await pageP.evaluate(() => {
    const t = document.querySelector('.setup__tray');
    return {
      collapsed: window.__SANJUNQI__.ui?.getSetupCollapsed?.(),
      trayH: t ? Math.round(t.getBoundingClientRect().height) : 0,
      isCompact: window.__SANJUNQI__.ui?.isSetupCompact?.(),
    };
  });
  console.log('  expanded', JSON.stringify(expanded));
  assert(expanded.collapsed === false && expanded.trayH > 220, '托盤可展開（高度 > 220px）');
  assert(expanded.trayH <= 664 * 0.6 + 20, '展開高度不超過 60vh');
  await shot(pageP, 'setup-expanded');

  // 點選「總司令」棋子 → 應自動收合
  const chip = pageP.locator('.piece-chip', { hasText: '總司令' }).first();
  if (await chip.count()) {
    await chip.tap();
  } else {
    await pageP.locator('text=總司令').first().tap();
  }
  await pageP.waitForFunction(() => {
    const t = document.querySelector('.setup__tray');
    const collapsed = window.__SANJUNQI__.ui?.getSetupCollapsed?.();
    return collapsed === true || (t && t.getBoundingClientRect().height < 140);
  }, null, { timeout: 20000 }).catch(() => {});
  const afterChip = await pageP.evaluate(() => ({
    collapsed: window.__SANJUNQI__.ui?.getSetupCollapsed?.(),
    selected: window.__SANJUNQI__.app.selectedDeployKey,
    trayH: (() => { const t = document.querySelector('.setup__tray'); return t ? Math.round(t.getBoundingClientRect().height) : 0; })(),
    insets: window.__SANJUNQI__.getInsets?.(),
  }));
  console.log('  after chip', JSON.stringify(afterChip));
  assert(afterChip.selected === 'commander', '點棋子後 main 已選取總司令');
  assert(afterChip.collapsed === true || afterChip.trayH < 240, '選棋後托盤自動收合');
  await shot(pageP, 'chip-selected');

  // 在棋盤放置（用 board 模組計算合法點，投影後觸控點擊）
  // 等托盤收合造成重新取景完成
  await pageP.waitForFunction(() => {
    const ins = window.__SANJUNQI__.getInsets?.();
    return !!ins && ins.bottom < 140;
  }, null, { timeout: 20000 }).catch(() => {});
  await pageP.waitForTimeout(600);
  const candidates = await pageP.evaluate(async () => {
    const board = await import('/src/core/board.js');
    const api = window.__SANJUNQI__;
    const used = new Set(api.app.playerPlacements.map((p) => p.nodeId));
    const spots = board.DEPLOY_ZONES.south.allLand.filter((id) => !used.has(id)).slice(0, 30);
    api.applyInsets?.(true);
    return spots.map((spot) => {
      const n = board.NODE[spot];
      return { spot, row: n.row, scr: api.projectNode(spot) };
    });
  });
  let placedCount = 0;
  for (const c of candidates) {
    if (!c.scr || c.scr.x < 8 || c.scr.x > 382 || c.scr.y < 80 || c.scr.y > 520) continue;
    await pageP.touchscreen.tap(c.scr.x, c.scr.y);
    await pageP.waitForTimeout(1600);
    placedCount = await pageP.evaluate(() => window.__SANJUNQI__.app.playerPlacements.length);
    if (placedCount > 0) { console.log('  placed via node', c.spot, JSON.stringify(c.scr)); break; }
  }
  console.log('  placements after tap:', placedCount);
  assert(placedCount === 1, '手機觸控可在棋盤放置棋子');
  await shot(pageP, 'after-place');

  // 自動佈陣 + 開始戰鬥
  const deployed = await pageP.evaluate(async () => {
    const api = window.__SANJUNQI__;
    api.app.selectedDeployKey = null;
    api.autoDeployPlayer();
    await new Promise((r) => setTimeout(r, 300));
    const count = api.app.playerPlacements.length;
    await api.confirmDeploy();
    return { count };
  });
  console.log('  deployed', JSON.stringify(deployed));
  assert(deployed.count === 30, '自動佈陣完成 30 枚');
  const reached = await pageP
    .waitForFunction(() => window.__SANJUNQI__.isPlayerTurn?.(), null, { timeout: 180000 })
    .then(() => true).catch(() => false);
  console.log('  player turn reached:', reached);
  assert(reached, '進入玩家回合');
  await pageP.waitForTimeout(1200);
  const playInfo = await pageP.evaluate(() => ({
    phase: window.__SANJUNQI__.phase,
    tools: !!document.querySelector('#mobile-tools.is-visible'),
    insets: window.__SANJUNQI__.getInsets?.(),
    boardVisible: (() => { const c = document.querySelector('canvas'); return c ? c.getBoundingClientRect().height > 300 : false; })(),
  }));
  console.log('  play', JSON.stringify(playInfo));
  assert(playInfo.tools, '手機浮動鏡頭工具出現');
  await shot(pageP, 'play');

  // 觸控選棋 + 移動
  const pick = await pageP.evaluate(() => {
    const api = window.__SANJUNQI__;
    const actions = api.game.getLegalActions('south');
    if (!actions.length) return null;
    const withTarget = actions.find((a) => (a.to ?? a.target) != null);
    if (!withTarget) return null;
    const uid = withTarget.pieceUid;
    const p = api.game.getView('south').pieces.find((x) => x.uid === uid);
    const pieceScr = api.projectPiece(uid);
    const targetScr = api.projectNode(withTarget.to ?? withTarget.target);
    return { uid, action: withTarget, pieceScr, targetScr };
  });
  console.log('  pick', JSON.stringify(pick ? { uid: pick.uid, type: pick.action.type, pieceScr: pick.pieceScr, targetScr: pick.targetScr } : null));
  if (pick?.pieceScr) {
    await pageP.touchscreen.tap(pick.pieceScr.x, pick.pieceScr.y);
    await pageP.waitForFunction(() => {
      const el = document.querySelector('[data-selected]');
      return !!el && !el.hidden;
    }, null, { timeout: 20000 }).catch(() => {});
    await pageP.waitForTimeout(400);
    const sel = await pageP.evaluate(() => {
      const selEl = document.querySelector('[data-selected]');
      const r = selEl ? selEl.getBoundingClientRect() : null;
      return { shown: selEl ? !selEl.hidden : false, h: r ? Math.round(r.height) : 0 };
    });
    console.log('  selected card', JSON.stringify(sel));
    assert(sel.shown, '觸控可選取棋子並顯示資訊卡');
    assert(!sel.shown || sel.h <= 180, '手機棋子資訊卡高度 ≤ 180px');
    await shot(pageP, 'selected');

    // 遊戲中開啟圖鑑 → 底部按鈕關閉 → 回到棋局
    const moreBtn = pageP.locator('[data-selected-more]').first();
    if (await moreBtn.count()) await moreBtn.tap();
    await pageP.waitForTimeout(600);
    const codexLink = pageP.locator('[data-hud="codex-pick"]').first();
    if (await codexLink.count()) {
      await codexLink.tap();
      await pageP.waitForTimeout(1000);
      const inGameCodex = await pageP.evaluate(() => {
        const close = document.querySelector('[data-codex-close]');
        const r = close ? close.getBoundingClientRect() : null;
        return {
          open: !!document.querySelector('.modal.is-open'),
          closeUsable: !!close && r.height >= 44 && r.bottom <= innerHeight + 1,
        };
      });
      assert(inGameCodex.open, '遊戲中可開啟棋子圖鑑');
      assert(inGameCodex.closeUsable, '遊戲中圖鑑的關閉按鈕可點（在視口內）');
      await pageP.locator('[data-codex-close]').first().tap();
      await pageP.waitForTimeout(900);
      const backToGame = await pageP.evaluate(() => ({
        open: !!document.querySelector('.modal.is-open'),
        phase: window.__SANJUNQI__.phase,
      }));
      assert(!backToGame.open && backToGame.phase === 'play', '關閉圖鑑後回到棋局（非卡死）');
    }
    if (pick.targetScr) {
      // 圖鑑 round-trip 後重新選一次棋子（避免焦點/選取狀態被 modal 流程影響）
      const state = await pageP.evaluate(() => ({
        selectedUid: window.__SANJUNQI__.app.selectedUid,
        cardShown: (() => { const e = document.querySelector('[data-selected]'); return !!(e && !e.hidden); })(),
      }));
      if (!state.selectedUid || !state.cardShown) {
        await pageP.touchscreen.tap(pick.pieceScr.x, pick.pieceScr.y);
        await pageP.waitForTimeout(1200);
      }
      const beforeTurn = await pageP.evaluate(() => window.__SANJUNQI__.game.getView('south').turn);
      await pageP.touchscreen.tap(pick.targetScr.x, pick.targetScr.y);
      await pageP.waitForTimeout(5000);
      const after = await pageP.evaluate(() => ({ turn: window.__SANJUNQI__.game.getView('south').turn, phase: window.__SANJUNQI__.phase }));
      console.log('  after move', JSON.stringify(after), 'beforeTurn', beforeTurn);
      assert(after.turn !== beforeTurn || after.phase === 'gameover', '觸控可在棋盤執行移動／攻擊');
      await shot(pageP, 'after-move');
    }
  }
} catch (err) {
  errors.push('直向流程例外：' + (err && err.stack ? err.stack : err));
  console.error(err);
} finally {
  await ctxP.close();
}

/* ---------------- 橫向 ---------------- */
try {
  console.log('\n▶ 橫向 iPhone 13（844x390，觸控）');
  const { ctx: ctxL, page: pageL } = await newMobilePage(devices['iPhone 13'], { width: 844, height: 390 });
  await waitReady(pageL);
  const landscape = await pageL.evaluate(async () => {
    const api = window.__SANJUNQI__;
    await api.quickStart();
    return { w: innerWidth, h: innerHeight, scrollW: document.documentElement.scrollWidth };
  });
  console.log('  landscape', JSON.stringify(landscape));
  assert(landscape.scrollW <= landscape.w + 1, '橫向無水平 overflow');
  const reachedL = await pageL
    .waitForFunction(() => window.__SANJUNQI__.isPlayerTurn?.(), null, { timeout: 180000 })
    .then(() => true).catch(() => false);
  assert(reachedL, '橫向可進入玩家回合');
  await pageL.waitForTimeout(1200);
  await shot(pageL, 'landscape-play');
  await ctxL.close();
} catch (err) {
  errors.push('橫向流程例外：' + (err && err.stack ? err.stack : err));
  console.error(err);
}

await browser.close();

const realErrors = errors.filter((e) => !/favicon|AudioContext|autoplay/i.test(e));
if (realErrors.length) {
  console.error('\n❌ 錯誤：');
  for (const e of realErrors.slice(0, 20)) console.error('  -', e);
} else {
  console.log('\n✅ 無 console / 網路錯誤');
}
console.log(`\n=== 手機版 E2E：${failures.length ? `失敗 ${failures.length} 項` : '全部通過'} ===`);
for (const f of failures) console.error(' -', f);
process.exit(failures.length || realErrors.length ? 1 : 0);
