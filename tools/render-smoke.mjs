/**
 * 三軍棋 3D — 實際頁面（index.html）冒煙測試 + 截圖
 * ------------------------------------------------------------------
 * 用法：node tools/render-smoke.mjs [--low] [--w 1280] [--h 800]
 * 輸出：dev/shots/smoke-render-*.png
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SHOTS = resolve(ROOT, 'dev/shots');
if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });

const args = process.argv.slice(2);
const W = Number(args.includes('--w') ? args[args.indexOf('--w') + 1] : 1280);
const H = Number(args.includes('--h') ? args[args.indexOf('--h') + 1] : 800);
const LOW = args.includes('--low');
const BASE = process.env.RENDER_BASE_PAGE || 'http://127.0.0.1:8123/index.html';

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
const warnings = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error') errors.push(m.text());
  else if (t === 'warning' && !/GL Driver|Context Lost/.test(m.text())) warnings.push(m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (req) => {
  if (/favicon/.test(req.url())) return;
  errors.push('requestfailed: ' + req.url());
});

const t0 = Date.now();
const shot = async (name, ms = 0) => {
  if (ms) await page.waitForTimeout(ms);
  await page.screenshot({ path: resolve(SHOTS, `smoke-render-${name}.png`), timeout: 90000 });
  console.log(`  📸 smoke-render-${name}.png  (+${Date.now() - t0}ms)`);
};

try {
  await page.goto(BASE + (LOW ? '?lowfx=1' : ''), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__SANJUNQI__ && window.__SANJUNQI__.phase === "menu"', null, { timeout: 180000 });
  console.log(`✔ 主選單就緒 (+${Date.now() - t0}ms)`);
  await page.waitForTimeout(1500);
  await shot('menu');

  await page.evaluate(() => window.__SANJUNQI__.quickStart());
  await page.waitForFunction('window.__SANJUNQI__.phase === "play"', null, { timeout: 180000 });
  // 等玩家回合（AI 佈陣與動畫完成）
  await page.waitForFunction('window.__SANJUNQI__.isPlayerTurn()', null, { timeout: 180000 });
  const tPlay = Date.now() - t0;
  console.log(`✔ 進入對戰、玩家回合 (+${tPlay}ms)`);
  await page.waitForTimeout(1200);
  await shot('play');

  // 選一枚南方棋子（顯示選取光環與可走點）
  const info = await page.evaluate(() => {
    const api = window.__SANJUNQI__;
    const view = api.view;
    const ps = [...view.pieces.values()].filter((p) => p.side === 'south' && p.key);
    const pick = ps.find((p) => p.key === 'cavalry') || ps[0];
    api.view.setSelected(pick.uid);
    const acts = api.game.getLegalActions('south').filter((a) => a.pieceUid === pick.uid);
    const nodes = acts.map((a) => a.to ?? a.target).filter((v) => v != null);
    api.view.highlightNodes(nodes, 'move');
    return { uid: pick.uid, nodeId: pick.nodeId, acts: acts.length };
  });
  console.log('  選取棋子：', JSON.stringify(info));
  await page.waitForTimeout(900);
  await shot('selected');

  // 黑色系 HUD 下畫面中央棋盤應完整可見
  const frame = await page.evaluate(() => {
    const v = window.__SANJUNQI__.view;
    const THREE = v.three;
    const rect = v.renderer.domElement.getBoundingClientRect();
    const corners = [[-7.5, 0, -7.5], [7.5, 0, -7.5], [-7.5, 0, 7.5], [7.5, 0, 7.5]].map(([x, y, z]) => {
      const p = new THREE.Vector3(x, y, z).project(v.camera);
      return { x: (p.x + 1) / 2 * rect.width, y: (1 - p.y) / 2 * rect.height };
    });
    return { rect: { w: rect.width, h: rect.height }, corners, dist: v.camera.position.length() };
  });
  console.log('  棋盤角點投影：', JSON.stringify(frame));

  console.log(`\nlowfx=${LOW} errors=${errors.length} warnings=${warnings.length}`);
  for (const e of errors.slice(0, 10)) console.error('  [error]', e);
  for (const w of warnings.slice(0, 6)) console.warn('  [warn]', w.slice(0, 220));
  if (errors.length) process.exitCode = 1;
} catch (e) {
  console.error('✘ 冒煙測試失敗：', e.message);
  for (const er of errors.slice(0, 8)) console.error('  [error]', er);
  try {
    await page.screenshot({ path: resolve(SHOTS, 'smoke-render-fail.png'), timeout: 60000 });
  } catch (e2) { /* noop */ }
  process.exitCode = 1;
}
await browser.close();
