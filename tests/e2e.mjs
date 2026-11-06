/**
 * 三軍棋 3D — Playwright 端對端測試 / 截圖
 * 用法： node tests/e2e.mjs [--url http://127.0.0.1:8123]
 * 需要： 靜態伺服器已啟動（npm start 或 python3 -m http.server 8123）
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dev', 'shots');
const URL = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://127.0.0.1:8123/index.html?lowfx=1';

fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const failures = [];
let shotIndex = 0;

async function shot(page, name) {
  shotIndex++;
  const file = path.join(OUT, `e2e-${String(shotIndex).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, timeout: 180000 });
  console.log('📸', path.relative(ROOT, file));
  return file;
}

function assert(cond, msg) {
  if (!cond) {
    failures.push(msg);
    console.error('❌', msg);
  } else {
    console.log('✅', msg);
  }
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
page.on('requestfailed', (req) => {
  const u = req.url();
  if (u.includes('favicon')) return;
  errors.push(`requestfailed: ${u} (${req.failure()?.errorText || ''})`);
});

try {
  console.log('▶ 開啟', URL);
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => !!window.__SANJUNQI__?.view, null, { timeout: 150000 });
  await page.waitForTimeout(2600);
  await shot(page, 'menu');
  const menuText = await page.evaluate(() => document.body.innerText);
  assert(menuText.includes('三軍棋'), '主選單顯示「三軍棋」');
  assert(/開始遊戲|開始|新的戰役/.test(menuText), '主選單有開始遊戲按鈕');

  // 開始新局 → 佈陣畫面
  await page.evaluate(() => window.__SANJUNQI__.startNewGame());
  await page.waitForTimeout(1600);
  await shot(page, 'setup');
  const setupText = await page.evaluate(() => document.body.innerText);
  assert(/佈陣|部署|集結/.test(setupText), '佈陣畫面出現佈陣相關文字');

  // 自動佈陣 → 開始戰鬥
  await page.evaluate(async () => {
    const api = window.__SANJUNQI__;
    api.autoDeployPlayer();
    await new Promise((r) => setTimeout(r, 300));
  });
  await page.waitForTimeout(900);
  await shot(page, 'setup-deployed');
  await page.evaluate(async () => {
    await window.__SANJUNQI__.confirmDeploy();
  });
  await page.waitForTimeout(2600);
  await shot(page, 'battle-start');

  const battleText = await page.evaluate(() => document.body.innerText);
  assert(/回合|輪到|南軍|北軍/.test(battleText), '對戰 HUD 顯示回合/輪次資訊');

  // 讓 AI 先動，然後玩家連續行動數步
  async function waitSouthTurn(timeoutMs = 90000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const st = await page.evaluate(() => {
        const api = window.__SANJUNQI__;
        if (!api.game) return null;
        const v = api.game.getView('south');
        return {
          side: v.sideToMove,
          winner: v.winner,
          phase: api.phase,
          idle: typeof api.isPlayerTurn === 'function' ? api.isPlayerTurn() : null,
          busy: typeof api.isBusy === 'function' ? api.isBusy() : null,
        };
      });
      if (!st) return null;
      if (st.winner || st.phase === 'gameover') return 'over';
      if (st.phase === 'play' && st.side === 'south' && st.idle !== false && !st.busy) return 'south';
      await page.waitForTimeout(1000);
    }
    return 'timeout';
  }

  let acted = 0;
  for (let i = 0; i < 10; i++) {
    const who = await waitSouthTurn();
    if (who === 'over') break;
    if (who !== 'south') break;
    const result = await page.evaluate(async () => {
      const api = window.__SANJUNQI__;
      try {
        // 優先選一個「攻擊」行動，讓戰鬥有機會出現
        const actions = api.getLegalActions('south');
        const view = api.game.getView('south');
        const occupied = new Set(view.pieces.filter((p) => p.alive && p.side !== 'south').map((p) => p.nodeId));
        let pick = actions.find((a) => occupied.has(a.to ?? a.target));
        if (!pick) pick = actions[0];
        if (!pick) return { ok: false, reason: 'no legal actions' };
        await api.performPlayerAction(pick);
        return { ok: true, type: pick.type, to: pick.to ?? pick.target };
      } catch (e) {
        return { ok: false, reason: String(e) };
      }
    });
    if (!result.ok) {
      console.log('玩家行動略過：', result.reason);
    } else {
      acted++;
      console.log(`  ↳ 玩家行動 #${acted}: ${result.type} -> node ${result.to}`);
    }
    await page.waitForTimeout(2500);
    if (i === 1) await shot(page, 'battle-mid');
  }
  assert(acted > 0, '玩家成功執行至少一個合法行動');

  // 規則頁 / 棋子圖鑑（若 UI 有）
  const opened = await page.evaluate(() => {
    const api = window.__SANJUNQI__;
    if (api.ui?.openRules) { api.ui.openRules(); return true; }
    return false;
  });
  if (opened) {
    await page.waitForTimeout(900);
    await shot(page, 'rules');
    const rulesText = await page.evaluate(() => document.body.innerText);
    assert(/規則|棋盤|戰鬥|勝利/.test(rulesText), '規則頁有內容');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  await page.evaluate(() => window.__SANJUNQI__.showMenu());
  await page.waitForTimeout(1200);
  await shot(page, 'menu-return');
} catch (err) {
  errors.push('E2E 例外：' + (err && err.stack ? err.stack : err));
  console.error(err);
} finally {
  const realErrors = errors.filter((e) => !/favicon|DevTools|Autofill/i.test(e));
  if (realErrors.length) {
    console.error('\n❌ Console/網路錯誤：');
    for (const e of realErrors.slice(0, 30)) console.error('  -', e);
  } else {
    console.log('\n✅ 無 console / 網路錯誤');
  }
  assert(errors.length === 0, '頁面無 console error / 載入失敗');
  await browser.close();
}

if (failures.length) {
  console.error(`\n=== E2E 失敗 ${failures.length} 項 ===`);
  for (const f of failures) console.error(' -', f);
  process.exit(1);
} else {
  console.log('\n=== E2E 全部通過 ===');
}
