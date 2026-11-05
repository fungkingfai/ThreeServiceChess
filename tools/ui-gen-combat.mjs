#!/usr/bin/env node
/**
 * 由 src/core/combat-table.json 產生 src/ui/combat-data.js
 * ------------------------------------------------------------------
 * 瀏覽器端以 JSON module 匯入會受 MIME / import attributes 相容性影響，
 * 因此在建置期把勝負表轉成純 ES module，確保任何靜態伺服器皆可運作。
 *
 * 補齊規則：
 *   - 原始表沒有「軍旗」作為防守方的列（軍旗被攻擊一律奪旗勝利，由引擎特判）。
 *     此處補成自訂結果 'F'（奪旗），僅供 UI 呈現；engine 仍以 FLAG 特判。
 *   - 軍旗作為攻擊方一律 'X'（不可移動、不會主動攻擊）。
 *
 * 使用：node tools/ui-gen-combat.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'core', 'combat-table.json');
const OUT = path.join(ROOT, 'src', 'ui', 'combat-data.js');

const raw = JSON.parse(await readFile(SRC, 'utf8'));
const { names, matrix, legend } = raw;
const FLAG = '軍旗';

for (const name of names) {
  matrix[name] ??= {};
  for (const attacker of names) {
    if (name === FLAG) {
      // 軍旗被任何棋子攻擊 = 奪旗勝利；軍旗不可能攻擊軍旗
      matrix[name][attacker] = attacker === FLAG ? 'X' : 'F';
      continue;
    }
    if (!matrix[name][attacker]) {
      console.error(`combat-table.json 缺少 ${name} ← ${attacker}，已補為 X`);
      matrix[name][attacker] = 'X';
    }
  }
}

const body = `/**
 * 三軍棋勝負表（給 UI 用；由 tools/ui-gen-combat.mjs 自動產生，請勿手改）
 * ------------------------------------------------------------------
 * matrix[防守方名稱][攻擊方名稱] = 'A' | 'D' | 'B' | 'N' | 'R' | 'X' | 'F'
 *   A 攻擊方勝 / D 防守方勝 / B 同歸於盡 / N 不分勝負 / R 偵察 / X 無法作用
 *   F 奪旗（軍旗被攻擊；由 UI 補齊，引擎以 FLAG 特判）
 *
 * 原始資料：src/core/combat-table.json
 */
export const COMBAT_NAMES = ${JSON.stringify(names)};
export const COMBAT_MATRIX = ${JSON.stringify(matrix)};
export const COMBAT_LEGEND = ${JSON.stringify(legend)};
export const COMBAT_RESULT = {
  A: 'attack',
  D: 'defend',
  B: 'both',
  N: 'none',
  R: 'scout',
  X: 'invalid',
  F: 'flag',
};
export default { names: COMBAT_NAMES, matrix: COMBAT_MATRIX, legend: COMBAT_LEGEND };
`;

await writeFile(OUT, body, 'utf8');
console.log(`✓ 已產生 ${path.relative(ROOT, OUT)}（${names.length} 種棋子、${names.length * names.length} 格）`);
