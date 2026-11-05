/**
 * 三軍棋 3D — 最終驗收截圖（快速版：截圖前暫停 RAF）
 * 用法：node tools/render-final.mjs [--medium]
 * 輸出：dev/shots/render-final-*.png
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SHOTS = resolve(ROOT, 'dev/shots');
if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });

const MEDIUM = process.argv.includes('--medium');
const BASE = 'http://127.0.0.1:8123/dev/render-test.html';
const qs = MEDIUM ? '&q=medium' : '&lowfx=1';

const SHOTS_LIST = [
  { name: 'overview', url: '?state=overview&ui=0&persp=south', wait: 900 },
  { name: 'gallery', url: '?state=gallery&ui=0&persp=south', wait: 900 },
  { name: 'army', url: '?state=overview&ui=0&persp=south', demo: 'army', wait: 800 },
  { name: 'navy', url: '?state=overview&ui=0&persp=south', demo: 'navy', wait: 800 },
  { name: 'battle', url: '?state=overview&ui=0&persp=south', demo: 'battle', waitFn: 'window.__captureReady === true', wait: 700 },
];

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

for (const shot of SHOTS_LIST) {
  const url = BASE + shot.url + qs;
  const t0 = Date.now();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('window.__renderReady === true', null, { timeout: 240000 });
    if (shot.demo) await page.evaluate((n) => window.__setDemo(n), shot.demo);
    await page.waitForTimeout(shot.wait || 600);
    if (shot.waitFn) await page.waitForFunction(shot.waitFn, null, { timeout: 60000 });
    // 凍結 RAF 並手動畫一格
    await page.evaluate(() => {
      const v = window.__view;
      if (!v) return;
      v.setAutoRender(false);
      v.renderOnce(0.016);
      v.renderOnce(0.016);
    });
    await page.waitForTimeout(150);
    const path = resolve(SHOTS, `render-final-${shot.name}.png`);
    await page.screenshot({ path, timeout: 120000 });
    console.log(`✔ render-final-${shot.name}.png  ${Date.now() - t0}ms`);
  } catch (e) {
    console.error(`✘ ${shot.name}: ${e.message}`);
    try {
      await page.evaluate(() => window.__view?.setAutoRender(false));
      await page.screenshot({ path: resolve(SHOTS, `render-final-${shot.name}.png`), timeout: 120000 });
      console.log(`△ 仍擷取 render-final-${shot.name}.png（可能非最佳時機）`);
    } catch (e2) { /* noop */ }
  }
}
console.log(`\nconsole errors: ${errors.length}`);
for (const e of errors.slice(0, 8)) console.error('  ', e.slice(0, 220));
await browser.close();
process.exitCode = errors.length ? 1 : 0;
