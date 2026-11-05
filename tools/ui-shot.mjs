#!/usr/bin/env node
/**
 * 三軍棋 UI 截圖工具（Playwright）
 * ------------------------------------------------------------------
 * 以 dev/ui-test.html 的 mock 資料拍攝各畫面，輸出到 dev/shots/ui-*.png。
 *
 * 用法：
 *   node tools/ui-shot.mjs                # 拍全部
 *   node tools/ui-shot.mjs --list         # 列出場景
 *   node tools/ui-shot.mjs --only=menu,game,rules
 *   node tools/ui-shot.mjs --out=dev/shots
 *
 * 會啟動一個臨時靜態伺服器（僅本機、隨機埠），結束後自動關閉。
 */
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const hasFlag = (name) => args.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const readOpt = (name, fallback = '') => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { width: 1920, height: 1080, deviceScaleFactor: 1 };

const SCENES = [
  { name: 'ui-menu', hash: 'menu', wait: 1000 },
  { name: 'ui-menu-mobile', hash: 'menu', viewport: MOBILE, wait: 1000 },
  { name: 'ui-setup', hash: 'setup', wait: 1000 },
  { name: 'ui-setup-mobile', hash: 'setup', viewport: MOBILE, wait: 1000 },
  { name: 'ui-game', hash: 'game', wait: 1200 },
  { name: 'ui-game-ai', hash: 'game-ai', wait: 1200 },
  { name: 'ui-game-mobile', hash: 'game', viewport: MOBILE, wait: 1200 },
  { name: 'ui-game-drawer', hash: 'game-drawer', viewport: MOBILE, wait: 1400 },
  { name: 'ui-battle', hash: 'battle', wait: 1500 },
  { name: 'ui-battle-flag', hash: 'battle-flag', wait: 1500 },
  { name: 'ui-battle-mobile', hash: 'battle', viewport: MOBILE, wait: 1500 },
  { name: 'ui-rules', hash: 'rules', wait: 2200 },
  { name: 'ui-rules-board', hash: 'rules-board', wait: 2400 },
  { name: 'ui-rules-pieces', hash: 'rules-pieces', wait: 2400 },
  { name: 'ui-rules-combat', hash: 'rules-combat', wait: 2400 },
  { name: 'ui-rules-summary', hash: 'rules-combat', wait: 2400, scrollTo: '[data-widget="combat-summary"]' },
  { name: 'ui-rules-matrix', hash: 'rules-matrix', wait: 3000 },
  { name: 'ui-rules-mobile', hash: 'rules', viewport: MOBILE, wait: 2600 },
  { name: 'ui-codex', hash: 'codex', wait: 1400 },
  { name: 'ui-settings', hash: 'settings', wait: 1100 },
  { name: 'ui-gameover', hash: 'gameover', wait: 1400 },
  { name: 'ui-toast', hash: 'toast', wait: 1000 },
];

if (hasFlag('list')) {
  for (const scene of SCENES) console.log(scene.name);
  process.exit(0);
}

const onlyRaw = readOpt('only', '');
const only = onlyRaw ? onlyRaw.split(',').map((s) => s.trim()).filter(Boolean) : null;
const selected = only ? SCENES.filter((s) => only.some((o) => s.name.includes(o))) : SCENES;
const outDir = path.resolve(ROOT, readOpt('out', 'dev/shots'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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
      if (pathname === '/') {
        res.writeHead(302, { Location: '/dev/ui-test.html' });
        res.end();
        return;
      }
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

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

async function main() {
  if (!selected.length) {
    console.error(`找不到符合的場景：${onlyRaw}`);
    process.exit(1);
  }
  await mkdir(outDir, { recursive: true });
  const { server, port } = await startServer();
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
  });
  const results = [];
  let failed = 0;

  try {
    for (const scene of selected) {
      const viewport = scene.viewport || DESKTOP;
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor || 1,
        isMobile: !!viewport.isMobile,
        hasTouch: !!viewport.hasTouch,
        locale: 'zh-TW',
        timezoneId: 'Asia/Taipei',
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
      });
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
      page.on('requestfailed', (req) => {
        errors.push(`requestfailed: ${req.url()} (${req.failure()?.errorText || 'unknown'})`);
      });

      const url = `http://127.0.0.1:${port}/dev/ui-test.html#${scene.hash}`;
      const started = Date.now();
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 20000 });
        await page.waitForFunction(() => window.__uiTest && window.__uiTest.ready === true, null, { timeout: 15000 });
        await page.evaluate(() => document.fonts?.ready).catch(() => {});
        await page.waitForTimeout(scene.wait ?? 900);
        if (scene.scrollTo) {
          await page.evaluate((selector) => {
            const target = document.querySelector(selector);
            if (!target) return;
            const container = target.closest('.rules-content') || target.closest('.modal__body');
            if (container) container.scrollTop = Math.max(0, target.offsetTop - 16);
            else target.scrollIntoView({ block: 'start' });
          }, scene.scrollTo);
          await page.waitForTimeout(600);
        }
        const file = path.join(outDir, `${scene.name}.png`);
        await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' });
        const size = await stat(file);
        results.push({ name: scene.name, file: path.relative(ROOT, file), size: size.size, errors, ms: Date.now() - started });
        if (errors.length) failed += 1;
        console.log(
          `${errors.length ? RED + '✗' : GREEN + '✓'}${RESET} ${scene.name.padEnd(18)} ` +
          `${DIM}${viewport.width}×${viewport.height} ${(size.size / 1024).toFixed(0)}KB ${Date.now() - started}ms${RESET}`
        );
        for (const err of errors) console.log(`   ${RED}${err}${RESET}`);
      } catch (error) {
        failed += 1;
        results.push({ name: scene.name, file: null, errors: [String(error)], ms: Date.now() - started });
        console.log(`${RED}✗ ${scene.name} 失敗：${error.message}${RESET}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('');
  console.log(`${DIM}輸出路徑：${path.relative(ROOT, outDir)}/ui-*.png${RESET}`);
  if (failed) {
    console.log(`${RED}有 ${failed} 個場景發生錯誤。${RESET}`);
    process.exitCode = 1;
  } else {
    console.log(`${GREEN}全部 ${results.length} 個場景截圖完成。${RESET}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
