/**
 * 棋局結束畫面
 * ------------------------------------------------------------------
 * 接收多種可能的結算資料形狀：
 *   { winner:'south'|'north'|null, winnerReason, turn }
 *   { result:'win'|'lose'|'draw', reason, stats }
 *   { outcome:'win', reason, stats:{turn, playerAlive, enemyAlive, kills} }
 */

import { icon } from './icons.js';
import { SIDE_META } from './data.js';
import { escapeHtml, delegate } from './dom.js';

const OUTCOME_META = {
  win: {
    title: '勝利', eyebrow: 'VICTORY', icon: 'trophy',
    tone: 'win',
    fallbackReason: '你贏得了這場戰役。',
  },
  lose: {
    title: '敗北', eyebrow: 'DEFEAT', icon: 'skull',
    tone: 'lose',
    fallbackReason: '這場戰役由對手拿下。',
  },
  draw: {
    title: '和局', eyebrow: 'DRAW', icon: 'minus',
    tone: 'draw',
    fallbackReason: '雙方僵持不下，握手言和。',
  },
};

const REASON_LABELS = {
  flag: '奪旗勝利', flagcapture: '奪旗勝利', capture: '奪旗勝利', captureflag: '奪旗勝利',
  nomoves: '無子可動', nolegal: '無子可動', nomove: '無子可動', stalemate: '無子可動',
  resign: '投降', surrender: '投降', resigned: '投降',
  draw: '和局', mutualnomoves: '雙方無子可動', stalemated: '和局',
};

const REASON_TEXTS = {
  win: {
    flag: '你攻破了北軍的城門，奪下軍旗——三軍棋最乾脆的勝利。',
    nomoves: '北軍已無任何合法行動，無子可動，只能認輸。',
    resign: '對手選擇投降，你接收了整個戰場。',
    surrender: '對手選擇投降，你接收了整個戰場。',
    default: '你贏得了這場戰役。',
  },
  lose: {
    flag: '北軍攻破你的城門，軍旗失守。下一局記得把總司令藏好。',
    nomoves: '你已無任何合法行動，無子可動，棋局於此結束。',
    resign: '你選擇投降，由北軍取得勝利。',
    surrender: '你選擇投降，由北軍取得勝利。',
    default: '這場戰役由對手拿下。',
  },
  draw: {
    draw: '雙方連續無法行動，僵持不下，以和局收場。',
    nomoves: '雙方都無法再行動，握手言和。',
    default: '雙方僵持不下，握手言和。',
  },
};

function normalizeSide(value) {
  if (value === 'south' || value === 'north') return value;
  if (value === '南軍' || value === 'south' || value === 's') return 'south';
  if (value === '北軍' || value === 'north' || value === 'n') return 'north';
  return null;
}

function normalizeReasonKey(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/[\u4e00-\u9fff]/.test(raw)) return raw; // 已是中文 → 直接顯示
  return REASON_LABELS[raw.toLowerCase().replace(/[\s_-]/g, '')] || raw;
}

function reasonKeyForText(value) {
  const raw = String(value ?? '').trim().toLowerCase().replace(/[\s_-]/g, '');
  return raw;
}

function readStat(stats, keys) {
  if (!stats || typeof stats !== 'object') return null;
  for (const key of keys) {
    const value = key.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), stats);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

/**
 * 正規化結算資料
 * @returns {{outcome:'win'|'lose'|'draw', reasonLabel:string, reasonText:string, stats:Array, raw:object}}
 */
export function normalizeGameOver(result, playerSide = 'south', stats = null) {
  const raw = result && typeof result === 'object' ? result : { result };
  const enemySide = playerSide === 'south' ? 'north' : 'south';
  const merged = { ...(stats || {}), ...(raw.stats && typeof raw.stats === 'object' ? raw.stats : {}) };

  let outcome = raw.outcome || raw.result || raw.status || '';
  const winner = normalizeSide(raw.winner ?? null);
  if (typeof outcome === 'string') {
    const key = outcome.toLowerCase();
    if (['win', 'victory', 'won', '勝利'].includes(key)) outcome = 'win';
    else if (['lose', 'loss', 'lost', 'defeat', '敗北', '敗'].includes(key)) outcome = 'lose';
    else if (['draw', 'tie', '和局', '平手'].includes(key)) outcome = 'draw';
    else outcome = '';
  }
  if (!outcome && raw.winner !== undefined) outcome = winner ? (winner === playerSide ? 'win' : 'lose') : 'draw';
  if (winner) outcome = winner === playerSide ? 'win' : 'lose';
  if (!['win', 'lose', 'draw'].includes(outcome)) {
    outcome = raw.winner === null || raw.winner === undefined ? 'draw' : 'lose';
  }

  const reasonRaw = raw.reason ?? raw.winnerReason ?? raw.why ?? '';
  const reasonLabelRaw = normalizeReasonKey(reasonRaw);
  const reasonKey = reasonKeyForText(reasonRaw);

  let reasonLabel = reasonLabelRaw;
  if (!reasonLabel) {
    reasonLabel = outcome === 'win' ? '勝利' : outcome === 'lose' ? '敗北' : '和局';
  }
  let reasonText = raw.reasonText || raw.detail || '';
  if (!reasonText) {
    const table = REASON_TEXTS[outcome] || {};
    const byKey = table[reasonKey];
    reasonText = byKey || table[reasonKey.replace(/[^a-z]/g, '')] || table.default || OUTCOME_META[outcome].fallbackReason;
  }

  const turn = readStat(raw, ['turn', 'turns', 'rounds', 'round']) ?? readStat(merged, ['turn', 'turns', 'rounds', 'round']) ?? null;

  // main.js 的 result.publicInfo.bySide = { army:{alive,dead}, navy:{...}, air:{...} }，取最終兵力
  const readPublicSide = (side) => {
    const info = raw.publicInfo?.bySide?.[side];
    if (!info || typeof info !== 'object') return null;
    let alive = null;
    let dead = null;
    for (const branch of ['army', 'navy', 'air']) {
      const value = info[branch];
      if (!value || typeof value !== 'object') continue;
      if (typeof value.alive === 'number') alive = (alive ?? 0) + value.alive;
      if (typeof value.dead === 'number') dead = (dead ?? 0) + value.dead;
    }
    return { alive, dead };
  };
  const pubPlayer = readPublicSide(playerSide);
  const pubEnemy = readPublicSide(enemySide);
  if (pubPlayer?.alive != null) merged.playerAlive = pubPlayer.alive;
  if (pubEnemy?.alive != null) merged.enemyAlive = pubEnemy.alive;
  if (pubEnemy?.dead != null) merged.playerKills = pubEnemy.dead;
  if (pubPlayer?.dead != null) merged.playerDead = pubPlayer.dead;

  const playerAlive = readStat(merged, [
    'playerAlive', 'player.alive', `sides.${playerSide}.alive`, 'alive.player', 'alive',
  ]) ?? null;
  const enemyAlive = readStat(merged, [
    'enemyAlive', 'enemy.alive', `sides.${enemySide}.alive`, 'alive.enemy',
  ]) ?? null;
  const playerKills = readStat(merged, [
    'playerKills', 'enemyDead', 'kills', `sides.${enemySide}.deadCount`, 'enemy.deadCount',
  ]) ?? null;
  const playerDead = readStat(merged, [
    'playerDead', `sides.${playerSide}.deadCount`, 'player.deadCount',
  ]) ?? null;

  const statItems = [];
  if (turn != null) statItems.push({ label: '總回合數', value: String(turn) });
  if (playerAlive != null) statItems.push({ label: '我方剩餘', value: `${playerAlive} 枚` });
  if (enemyAlive != null) statItems.push({ label: '敵方剩餘', value: `${enemyAlive} 枚` });
  if (playerKills != null) statItems.push({ label: '擊破敵棋', value: `${playerKills} 枚` });
  if (playerDead != null) statItems.push({ label: '我方損失', value: `${playerDead} 枚` });
  if (!statItems.length && Array.isArray(raw.stats)) {
    for (const item of raw.stats) {
      if (item && item.label != null && item.value != null) statItems.push({ label: String(item.label), value: String(item.value) });
    }
  }

  return {
    outcome,
    reasonLabel,
    reasonText,
    stats: statItems,
    playerSide,
    enemySide,
    turn,
    raw,
  };
}

export function createGameOver({ onAction = null, playerSide = 'south' } = {}) {
  const el = document.createElement('section');
  el.className = 'screen screen--gameover';
  el.dataset.screenPanel = 'gameover';

  function show(result, extraStats = null) {
    const data = normalizeGameOver(result, playerSide, extraStats);
    const meta = OUTCOME_META[data.outcome] || OUTCOME_META.draw;
    const sideName = SIDE_META[playerSide]?.label || '南軍';
    const enemyName = SIDE_META[data.enemySide]?.label || '北軍';
    const isFlagWin = data.outcome === 'win' && /奪旗/.test(data.reasonLabel);

    el.innerHTML = `
      <div class="gameover" data-outcome="${data.outcome}${isFlagWin ? ' is-flagwin' : ''}">
        <div class="gameover__backdrop" aria-hidden="true"></div>
        <div class="gameover__rays" aria-hidden="true"></div>
        <div class="gameover__panel">
          <p class="gameover__eyebrow"><span class="gameover__rule"></span>${escapeHtml(meta.eyebrow)}・BATTLE RESULT<span class="gameover__rule"></span></p>
          <div class="gameover__emblem">
            <span class="gameover__emblem-ring gameover__emblem-ring--outer"></span>
            <span class="gameover__emblem-ring gameover__emblem-ring--inner"></span>
            ${icon(meta.icon, 'ico--xl')}
          </div>
          <h1 class="gameover__title">${escapeHtml(meta.title)}</h1>
          <p class="gameover__reason-label">${escapeHtml(data.reasonLabel)}</p>
          <p class="gameover__reason">${escapeHtml(data.reasonText)}</p>
          ${data.stats.length ? `<div class="gameover__stats">${data.stats.map((item) => `
            <div class="gameover__stat"><span class="gameover__stat-value">${escapeHtml(item.value)}</span><span class="gameover__stat-label">${escapeHtml(item.label)}</span></div>`).join('')}</div>` : ''}
          <div class="gameover__actions">
            <button type="button" class="btn btn--primary btn--icon" data-gameover="restart">${icon('refresh')}<span>再來一局</span></button>
            <button type="button" class="btn btn--ghost btn--icon" data-gameover="menu">${icon('chevronLeft')}<span>回主選單</span></button>
            <button type="button" class="btn btn--ghost btn--icon" data-gameover="rules">${icon('book')}<span>查看規則</span></button>
          </div>
          <p class="gameover__foot">${escapeHtml(sideName)}（你）ｖｓ ${escapeHtml(enemyName)}（AI）・三軍棋 3D</p>
        </div>
      </div>`;
  }

  delegate(el, '[data-gameover]', 'click', (_event, btn) => {
    if (typeof onAction === 'function') onAction(btn.dataset.gameover);
  });

  return {
    el,
    show,
    hide() { el.classList.remove('is-active'); },
    destroy() { el.remove(); },
  };
}

export default createGameOver;
