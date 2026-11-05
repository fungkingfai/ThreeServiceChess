/**
 * 三軍棋 3D — Playwright 截圖驗收工具
 * ------------------------------------------------------------------
 * 用法：
 *   node tools/render-shot.mjs                # 全部鏡頭
 *   node tools/render-shot.mjs --only overview
 *   node tools/render-shot.mjs --quick        # 只拍 3 張快速檢查
 *
 * 需求：python3 -m http.server 8123 於專案根目錄執行中。
 * 截圖輸出到 dev/shots/。
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SHOTS_DIR = resolve(ROOT, 'dev/shots');
const BASE = process.env.RENDER_BASE || 'http://127.0.0.1:8123/dev/render-test.html';

if (!existsSync(SHOTS_DIR)) mkdirSync(SHOTS_DIR, { recursive: true });

const WIDTH = Number(process.env.SHOT_W || 1440);
const HEIGHT = Number(process.env.SHOT_H || 900);
const DSF = Number(process.env.SHOT_DSF || 1);

/** 每個鏡頭的定義 */
const SHOTS = [
  {
    name: 'overview-south',
    url: '?state=overview&ui=0&persp=south',
    wait: 1800,
    desc: '南側全景：棋盤、城牆、鐵橋、棋子陣型',
  },
  {
    name: 'overview-north',
    url: '?state=overview&ui=0&persp=north',
    wait: 2200,
    desc: '北側視角（AI 方）',
  },
  {
    name: 'gallery-pieces',
    url: '?state=gallery&ui=0&persp=south',
    wait: 1600,
    desc: '30 枚南軍棋子圖鑑列隊',
  },
  {
    name: 'closeup-army',
    url: '?state=overview&ui=0&persp=south',
    wait: 1500,
    demo: 'army',
  },
  {
    name: 'closeup-navy',
    url: '?state=overview&ui=0&persp=south',
    wait: 1500,
    demo: 'navy',
  },
  {
    name: 'closeup-air',
    url: '?state=overview&ui=0&persp=south',
    wait: 1500,
    demo: 'air',
  },
  {
    name: 'back-emblems',
    url: '?state=overview&ui=0&persp=south',
    wait: 1500,
    demo: 'backs',
  },
  {
    name: 'battle-effects',
    url: '?state=overview&ui=0&persp=south',
    wait: 1200,
    demo: 'battle',
    waitFn: 'window.__captureReady === true',
    extraWait: 30,
  },
  {
    name: 'battle-blast',
    url: '?state=overview&ui=0&persp=south',
    wait: 1200,
    demo: 'battle',
    waitFn: 'window.__captureReady2 === true',
    extraWait: 30,
  },
  {
    name: 'missile-strike',
    url: '?state=overview&ui=0&persp=south',
    wait: 1200,
    demo: 'missile',
    waitFn: 'window.__captureReady === true',
    extraWait: 20,
  },
  {
    name: 'deploy-zone',
    url: '?state=overview&ui=0&persp=south',
    wait: 1400,
    demo: 'deploy',
  },
  {
    name: 'highlights',
    url: '?state=gallery&ui=0&persp=south',
    wait: 1400,
    demo: 'highlights',
  },
];

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const quick = args.includes('--quick');
let shots = SHOTS;
if (only) shots = SHOTS.filter((s) => s.name === only);
else if (quick) shots = SHOTS.filter((s) => ['overview-south', 'gallery-pieces', 'battle-effects'].includes(s.name));

const browser = await chromium.launch({
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: DSF,
});

const results = [];
let failed = false;

for (const shot of shots) {
  const page = await context.newPage();
  const errors = [];
  const warnings = [];
  page.on('console', (msg) => {
    const t = msg.type();
    const text = msg.text();
    if (t === 'error') errors.push(text);
    else if (t === 'warning' && !/THREE\.WebGLRenderer: Context Lost/.test(text)) warnings.push(text);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText}`));

  const started = Date.now();
  let ok = true;
  try {
    const q = process.env.SHOT_QUALITY || 'low';
    const lowQs = q === 'high' ? '' : q === 'medium' ? '&q=medium' : '&lowfx=1';
    await page.goto(BASE + shot.url + lowQs, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('window.__renderReady === true', null, { timeout: 240000 });
    if (shot.demo) {
      await page.evaluate((name) => window.__setDemo(name), shot.demo);
    }
    if (shot.wait) await page.waitForTimeout(shot.wait);
    if (shot.waitFn) {
      await page.waitForFunction(shot.waitFn, null, { timeout: 20000 });
      if (shot.extraWait) await page.waitForTimeout(shot.extraWait);
    }
    // 效能資訊（第一張）
    if (shot.name === 'overview-south') {
      const info = await page.evaluate(() => {
        const r = window.__view?.renderer;
        return r ? { calls: r.info.render.calls, triangles: r.info.render.triangles, textures: r.info.memory.textures, geometries: r.info.memory.geometries } : null;
      });
      if (info) results.push({ name: 'renderer-info', info });
    }
    // 確認沒有初始化錯誤
    const err = await page.evaluate(() => window.__renderError || null);
    if (err) throw new Error(err);
    // 暫停 RAF、手動畫一格，讓截圖穩定又快
    await page.evaluate(() => {
      const v = window.__view;
      if (!v) return;
      v.setAutoRender(false);
      v.renderOnce(0.016);
      v.renderOnce(0.016);
    });
    await page.waitForTimeout(120);
    const path = resolve(SHOTS_DIR, `${shot.name}.png`);
    await page.screenshot({ path, timeout: 180000 });
    const ms = Date.now() - started;
    results.push({ name: shot.name, path, ms, desc: shot.desc, errors, warnings });
    console.log(`✔ ${shot.name.padEnd(20)} ${String(ms).padStart(6)}ms  ${shot.desc || ''}`);
  } catch (e) {
    ok = false;
    failed = true;
    console.error(`✘ ${shot.name}: ${e.message}`);
    results.push({ name: shot.name, error: e.message, errors, warnings });
  }
  if (errors.length) {
    failed = true;
    for (const e of errors) console.error(`   [console error] ${e}`);
  }
  if (warnings.length > 0) {
    for (const w of warnings.slice(0, 4)) console.warn(`   [warn] ${w.slice(0, 240)}`);
  }
  await page.close();
  void ok;
}

await browser.close();

console.log('\n=== 摘要 ===');
const info = results.find((r) => r.name === 'renderer-info');
if (info) console.log('renderer:', info.info);
for (const r of results) {
  if (r.name === 'renderer-info') continue;
  if (r.error) console.log(`✘ ${r.name}: ${r.error}`);
  else console.log(`✔ ${r.name}: ${r.path}`);
}
console.log(`\n截圖目錄：${SHOTS_DIR}`);
process.exit(failed ? 1 : 0);
