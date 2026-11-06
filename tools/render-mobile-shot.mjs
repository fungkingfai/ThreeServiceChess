/**
 * 三軍棋 3D — 手機版 Playwright 驗收（iPhone 13 portrait / landscape）
 * ------------------------------------------------------------------
 * 驗證項目：
 *   1. 動態安全區取景（setSafeInsets + reframe）在 portrait / landscape 都不溢出
 *   2. 觸控 tap：選棋 → 顯示可走點 → tap 目標格 → 移動動畫完成
 *   3. zoomBy / resetView / isCoarsePointer
 *   4. 截圖：dev/shots/mobile-render-*.png
 *
 * 用法：node tools/render-mobile-shot.mjs
 * 前置：python3 -m http.server 8123 於專案根目錄
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SHOTS = resolve(ROOT, 'dev/shots');
if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });

const BASE = 'http://127.0.0.1:8123/dev/render-test.html?state=overview&ui=0&persp=south&lowfx=1';
const IPHONE = (() => {
  const d = devices['iPhone 13'] || devices['iPhone 12'];
  // Lead 指定實際遊玩視窗 390×844（Playwright 內建 descriptor 是 390×664）
  return {
    ...d,
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 1.25,
  };
})();

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
});

const allErrors = [];

/** 暫停 RAF → 手動畫兩格 → 截圖 → 恢復 */
async function capture(page, name) {
  await page.evaluate(() => {
    const v = window.__view;
    if (!v) return;
    v.setAutoRender(false);
    v.renderOnce(0.016);
    v.renderOnce(0.016);
  });
  await page.waitForTimeout(120);
  const path = resolve(SHOTS, `mobile-render-${name}.png`);
  await page.screenshot({ path, timeout: 120000 });
  await page.evaluate(() => window.__view?.setAutoRender(true));
  console.log(`  📸 mobile-render-${name}.png`);
}

/** 等待頁面就緒 + 設定手機畫質與安全區 */
async function preparePage(context, label) {
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !/AudioContext|autoplay/i.test(m.text())) {
      allErrors.push(`[${label}] ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => allErrors.push(`[${label}] pageerror: ${e.message}`));
  page.on('requestfailed', (req) => {
    if (!/favicon/.test(req.url())) allErrors.push(`[${label}] requestfailed: ${req.url()}`);
  });
  await page.goto(BASE, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction('window.__renderReady === true', null, { timeout: 300000 });
  // 手機建議畫質 + 加速動畫
  await page.evaluate(() => {
    const v = window.__view;
    if (!v) return;
    v.setQuality('medium');
    v.fx.timeScale = 2.2;
    v.setAutoRender(false);
    v.renderOnce(0.016);
  });
  return page;
}

/** 讀取畫面/安全區/相機資訊 */
async function readLayout(page) {
  return page.evaluate(() => {
    const v = window.__view;
    const w = v.renderer.domElement.clientWidth;
    const h = v.renderer.domElement.clientHeight;
    const THREE = v.three;
    const rect = v.renderer.domElement.getBoundingClientRect();
    const corners = [[-7.65, 0, -7.65], [7.65, 0, -7.65], [-7.65, 2.2, 7.2], [7.65, 2.2, 7.2], [-7.65, 0, 7.65], [7.65, 0, 7.65]]
      .map(([x, y, z]) => {
        const p = new THREE.Vector3(x, y, z).project(v.camera);
        return { x: (p.x + 1) / 2 * rect.width, y: (1 - p.y) / 2 * rect.height };
      });
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    return {
      w, h,
      insets: v.safeInsets,
      isCoarsePointer: v.isCoarsePointer,
      distance: +v.camera.position.distanceTo(v.controls.target).toFixed(2),
      boardBox: {
        left: +Math.min(...xs).toFixed(1),
        right: +Math.max(...xs).toFixed(1),
        top: +Math.min(...ys).toFixed(1),
        bottom: +Math.max(...ys).toFixed(1),
      },
      overflow: {
        left: Math.min(...xs) < -1,
        right: Math.max(...xs) > rect.width + 1,
        top: Math.min(...ys) < -1,
        bottom: Math.max(...ys) > rect.height + 1,
      },
    };
  });
}

/** 安裝 tap 測試：選棋 + 顯示可走點 + 移動 */
async function installTapTest(page) {
  return page.evaluate(() => {
    const v = window.__view;
    const C = window.__BOARD;
    const st = window.__state;
    const occupied = new Set(st.pieces.map((p) => p.nodeId));
    // 找一枚南軍棋子，且有不被佔用的相鄰陸地節點
    let target = null;
    const south = [...v.pieces.values()].filter((p) => p.side === 'south' && p.key);
    for (const obj of south) {
      const nodeId = obj.nodeId;
      if (nodeId == null) continue;
      const adj = (C.WALK_ADJ.get(nodeId) || []).filter((id) => !occupied.has(id));
      if (adj.length) {
        target = { obj, nodeId, adj };
        break;
      }
    }
    if (!target) return { ok: false, reason: '找不到可移動棋子' };
    const rect = v.renderer.domElement.getBoundingClientRect();
    const project = (x, y, z) => {
      const p = new v.three.Vector3(x, y, z).project(v.camera);
      return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height };
    };
    const piecePos = target.obj.group.position;
    const pieceScreen = project(piecePos.x, piecePos.y + 0.95, piecePos.z);
    const destNode = target.adj[0];
    const destWorld = v.board.nodeWorld(destNode);
    const destScreen = project(destWorld.x, destWorld.y, destWorld.z);

    const log = { pieces: [], nodes: [], selectedUid: null, moveDone: false, movedTo: null };
    window.__tapLog = log;
    window.__selectedObj = null;

    v.onPiecePick((uid) => {
      log.pieces.push(uid);
      if (uid == null) {
        v.setSelected(null);
        v.clearHighlights();
        window.__selectedObj = null;
        return;
      }
      const obj = v.pieces.get(uid);
      if (!obj) return;
      log.selectedUid = uid;
      window.__selectedObj = obj;
      v.setSelected(uid);
      const adj = (C.WALK_ADJ.get(obj.nodeId) || []).filter((id) => !occupied.has(id));
      v.highlightNodes(adj, 'move');
    });

    v.onNodePick((nodeId) => {
      log.nodes.push(nodeId);
      const obj = window.__selectedObj;
      if (!obj) return;
      const from = obj.nodeId;
      const legal = (C.WALK_ADJ.get(from) || []);
      if (!legal.includes(nodeId)) return;
      const st2 = window.__state;
      const p = st2.pieces.find((q) => q.uid === obj.uid);
      if (!p) return;
      p.nodeId = nodeId;
      window.__selectedObj = null;
      v.clearHighlights();
      v.setSelected(null);
      const events = [{ type: 'move', uid: p.uid, side: p.side, from, to: nodeId, path: [from, nodeId], mode: 'walk' }];
      v.animateEvents(events).then(() => {
        v.sync(st2);
        log.moveDone = true;
        log.movedTo = nodeId;
      });
    });

    // 給後續「相鄰格（可能落在棋子 hit 筒內）」測試用的投影工具
    window.__projectPoint = (x, y, z) => {
      const p = new v.three.Vector3(x, y, z).project(v.camera);
      return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height };
    };
    window.__projectNode = (nodeId) => {
      const w = v.board.nodeWorld(nodeId);
      return window.__projectPoint(w.x, w.y, w.z);
    };

    return {
      ok: true,
      pieceScreen,
      destScreen,
      destNode,
      fromNode: target.nodeId,
      pieceKey: target.obj.key,
    };
  });
}

/* ================================================================== */
/* 1) Portrait                                                        */
/* ================================================================== */
const portraitCtx = await browser.newContext({ ...IPHONE });
let portraitLayout = null;
let tapResult = null;
try {
  console.log('▶ Portrait 390×844');
  const page = await preparePage(portraitCtx, 'portrait');
  await page.evaluate(() => {
    const v = window.__view;
    v.setSafeInsets({ top: 60, bottom: 78, left: 8, right: 8 });
    v.reframe();
    v.renderOnce(0.016);
    v.renderOnce(0.016);
  });
  await page.waitForTimeout(200);
  portraitLayout = await readLayout(page);
  console.log('  layout:', JSON.stringify(portraitLayout));
  await capture(page, 'portrait-play');

  // 觸控 tap 測試
  const info = await installTapTest(page);
  tapResult = { info };
  if (info.ok) {
    await page.evaluate(() => window.__view?.setAutoRender(true));
    await page.touchscreen.tap(info.pieceScreen.x, info.pieceScreen.y);
    await page.waitForTimeout(450);
    await page.evaluate(() => window.__view?.setAutoRender(false));
    const log1 = await page.evaluate(() => window.__tapLog);
    tapResult.afterPieceTap = log1;
    console.log('  tap piece:', JSON.stringify(log1));
    await capture(page, 'portrait-selected');
    // tap 目標節點
    await page.evaluate(() => window.__view?.setAutoRender(true));
    await page.touchscreen.tap(info.destScreen.x, info.destScreen.y);
    await page.waitForFunction('window.__tapLog && window.__tapLog.moveDone === true', null, { timeout: 120000 }).catch(() => {});
    const log2 = await page.evaluate(() => window.__tapLog);
    tapResult.afterNodeTap = log2;
    console.log('  tap node / move:', JSON.stringify(log2));
    await capture(page, 'portrait-moved');

    // === 回歸測試：放大鏡頭後，相鄰目標格會落在棋子的 hit 筒內 ===
    // 選另一枚棋子 → zoomBy 放大 → tap 其相鄰高亮格 → 應優先觸發 node pick 並完成移動
    const closeTest = await page.evaluate(() => {
      const v = window.__view;
      const C = window.__BOARD;
      const st = window.__state;
      const occupied = new Set(st.pieces.map((p) => p.nodeId));
      let cand = null;
      for (const obj of v.pieces.values()) {
        if (obj.side !== 'south' || !obj.key) continue;
        const adj = (C.WALK_ADJ.get(obj.nodeId) || []).filter((id) => !occupied.has(id));
        if (adj.length) { cand = { obj, nodeId: obj.nodeId, adj }; break; }
      }
      if (!cand) return { ok: false };
      // 先放大（模擬玩家按 + 鈕）
      v.zoomBy(0.55);
      window.__tapLog.moveDone = false;
      window.__tapLog.movedTo = null;
      const rect = v.renderer.domElement.getBoundingClientRect();
      const project = (x, y, z) => {
        const p = new v.three.Vector3(x, y, z).project(v.camera);
        return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height };
      };
      const pp = cand.obj.group.position;
      const pieceScreen = project(pp.x, pp.y + 0.95, pp.z);
      const dest = cand.adj[0];
      const w = v.board.nodeWorld(dest);
      const destScreen = project(w.x, w.y, w.z);
      const dist = Math.hypot(pieceScreen.x - destScreen.x, pieceScreen.y - destScreen.y);
      return { ok: true, pieceScreen, destScreen, dest, fromNode: cand.nodeId, dist: +dist.toFixed(1) };
    });
    tapResult.closeTest = closeTest;
    if (closeTest.ok) {
      console.log('  close-target test:', JSON.stringify(closeTest));
      await page.evaluate(() => window.__view?.setAutoRender(true));
      await page.touchscreen.tap(closeTest.pieceScreen.x, closeTest.pieceScreen.y);
      await page.waitForTimeout(420);
      await page.touchscreen.tap(closeTest.destScreen.x, closeTest.destScreen.y);
      await page.waitForFunction('window.__tapLog && window.__tapLog.moveDone === true', null, { timeout: 120000 }).catch(() => {});
      const log3 = await page.evaluate(() => window.__tapLog);
      tapResult.afterCloseTap = log3;
      console.log('  close-target tap:', JSON.stringify(log3));
      await page.evaluate(() => {
        const v = window.__view;
        v.cancelCameraFly();
        v.resetView();
      });
      await page.waitForTimeout(300);
      await capture(page, 'portrait-adjacent-tap');
    }
  } else {
    console.log('  ✘ tap test setup failed:', info.reason);
  }

  // 佈陣畫面：模擬底部面板佔 62% 高度
  await page.evaluate(() => {
    const v = window.__view;
    v.setAutoRender(false);
    v.setSafeInsets({ top: 8, bottom: Math.round(844 * 0.62), left: 6, right: 6 });
    v.reframe();
    v.renderOnce(0.016);
    v.renderOnce(0.016);
  });
  await page.waitForTimeout(150);
  const setupLayout = await readLayout(page);
  console.log('  setup layout:', JSON.stringify(setupLayout));
  await capture(page, 'portrait-setup');

  // zoomBy / resetView
  const zoom = await page.evaluate(() => {
    const v = window.__view;
    v.setSafeInsets({ top: 60, bottom: 78, left: 8, right: 8 });
    v.reframe();
    const fit = +v.camera.position.distanceTo(v.controls.target).toFixed(2);
    const out = v.zoomBy(1.4);
    const zin = v.zoomBy(0.5);
    return { fit, afterOut: +out.toFixed(2), afterIn: +zin.toFixed(2) };
  });
  const reset = await page.evaluate(async () => {
    const v = window.__view;
    v.cancelCameraFly();
    await v.resetView();
    return { distance: +v.camera.position.distanceTo(v.controls.target).toFixed(2) };
  });
  console.log('  zoom:', JSON.stringify(zoom), 'reset:', JSON.stringify(reset));
  await page.close();
} catch (e) {
  console.error('✘ Portrait 測試失敗：', e.message);
  allErrors.push('portrait: ' + e.message);
}

/* ================================================================== */
/* 2) Landscape                                                       */
/* ================================================================== */
const landscapeCtx = await browser.newContext({
  ...devices['iPhone 13 landscape'] || {},
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 1.25,
  isMobile: true,
  hasTouch: true,
});
let landscapeLayout = null;
try {
  console.log('▶ Landscape 844×390');
  const page = await preparePage(landscapeCtx, 'landscape');
  await page.evaluate(() => {
    const v = window.__view;
    v.setSafeInsets({ top: 54, bottom: 44, left: 10, right: 10 });
    v.reframe();
    v.renderOnce(0.016);
    v.renderOnce(0.016);
  });
  await page.waitForTimeout(200);
  landscapeLayout = await readLayout(page);
  console.log('  layout:', JSON.stringify(landscapeLayout));
  // tap 測試（landscape）
  const info = await installTapTest(page);
  if (info.ok) {
    await page.evaluate(() => window.__view?.setAutoRender(true));
    await page.touchscreen.tap(info.pieceScreen.x, info.pieceScreen.y);
    await page.waitForTimeout(450);
    await page.touchscreen.tap(info.destScreen.x, info.destScreen.y);
    await page.waitForFunction('window.__tapLog && window.__tapLog.moveDone === true', null, { timeout: 120000 }).catch(() => {});
    const log = await page.evaluate(() => window.__tapLog);
    console.log('  landscape tap:', JSON.stringify(log));
    await capture(page, 'landscape-play');
  } else {
    await capture(page, 'landscape-play');
  }
  await page.close();
} catch (e) {
  console.error('✘ Landscape 測試失敗：', e.message);
  allErrors.push('landscape: ' + e.message);
}

await browser.close();

/* ================================================================== */
/* 摘要                                                               */
/* ================================================================== */
const okOverflow = (l) => l && !l.overflow.left && !l.overflow.right && !l.overflow.top && !l.overflow.bottom;
console.log('\n=== 手機版驗收摘要 ===');
if (portraitLayout) {
  console.log(`portrait 取景：棋盤 x[${portraitLayout.boardBox.left},${portraitLayout.boardBox.right}] y[${portraitLayout.boardBox.top},${portraitLayout.boardBox.bottom}] / 390×844，溢出=${JSON.stringify(portraitLayout.overflow)}，coarse=${portraitLayout.isCoarsePointer}，距離=${portraitLayout.distance}`);
}
if (landscapeLayout) {
  console.log(`landscape 取景：棋盤 x[${landscapeLayout.boardBox.left},${landscapeLayout.boardBox.right}] y[${landscapeLayout.boardBox.top},${landscapeLayout.boardBox.bottom}] / 844×390，溢出=${JSON.stringify(landscapeLayout.overflow)}`);
}
if (tapResult?.info?.ok) {
  console.log(`tap 選棋成功：${tapResult.afterPieceTap?.pieces?.length > 0}，移動成功：${tapResult.afterNodeTap?.moveDone === true}（${tapResult.info.fromNode} → ${tapResult.info.destNode}）`);
}
if (tapResult?.closeTest?.ok) {
  const pickedTwice = (tapResult.afterCloseTap?.pieces?.length || 0) > (tapResult.afterPieceTap?.pieces?.length || 0);
  console.log(`相鄰高亮格 tap：螢幕距離 ${tapResult.closeTest.dist}px（落在棋子 hit 筒內）→ node pick 成功=${tapResult.afterCloseTap?.moveDone === true}，未誤選棋子=${!pickedTwice}`);
}
console.log(`console errors: ${allErrors.length}`);
for (const e of allErrors.slice(0, 10)) console.error('  ', e.slice(0, 240));
const closeOk = !tapResult?.closeTest?.ok || tapResult?.afterCloseTap?.moveDone === true;
const pass = okOverflow(portraitLayout) && okOverflow(landscapeLayout)
  && tapResult?.afterNodeTap?.moveDone === true && closeOk && allErrors.length === 0;
console.log(pass ? '✔ 手機版渲染驗收通過' : '✘ 手機版渲染驗收未全通過（詳見上方）');
process.exitCode = pass ? 0 : 1;
