/**
 * 戰鬥結算卡
 * ------------------------------------------------------------------
 * 可直接接收引擎 battle 事件：
 * { type:'battle', attackerUid, defenderUid, outcome:'A'|'D'|'B'|'N'|'R'|'FLAG',
 *   reveal:[{uid,key}], eliminated:[uid], occupied, special }
 * 也接受友善格式：{ attacker:{key,side}, defender:{key,side}, outcome, special }。
 */

import {
  SIDE_META, SPECIAL_META, resolveCombat, resultMeta, toPiece,
} from './data.js';
import { pieceMedallion } from './token.js';
import { icon } from './icons.js';
import { escapeHtml, on } from './dom.js';

const SPECIAL_TO_MODE = {
  landing: 'landing', bombard: 'bombard', fort: 'fort',
  antiair: 'antiair', missile: 'missile', air: 'normal', rail: 'normal',
  campProtect: 'normal', recon: 'normal',
};

function normalizeOutcome(value) {
  if (!value) return 'A';
  const raw = String(value).trim().toUpperCase();
  const map = {
    A: 'A', D: 'D', B: 'B', N: 'N', R: 'R', X: 'X', F: 'F', FLAG: 'F',
    ATTACK: 'A', DEFEND: 'D', BOTH: 'B', DRAW: 'N', SCOUT: 'R',
    '攻勝': 'A', '守勝': 'D', '同盡': 'B', '同歸於盡': 'B', '不分': 'N', '不分勝負': 'N',
    '偵察': 'R', '奪旗': 'F', '無效': 'X', '無法作用': 'X',
  };
  return map[raw] || map[String(value).trim()] || 'A';
}

function normalizeSide(value) {
  if (value === 'north' || value === 'south') return value;
  if (value === 'n') return 'north';
  if (value === 's') return 'south';
  return null;
}

/**
 * 把引擎事件轉成 UI 需要的完整資料
 * @param {object} data 戰鬥事件
 * @param {object} ctx { playerSide, piecesByUid, sideToMove }
 */
export function normalizeBattle(data, ctx = {}) {
  const battle = data && typeof data === 'object' ? data : {};
  const revealMap = new Map();
  if (Array.isArray(battle.reveal)) {
    for (const item of battle.reveal) {
      if (item && item.uid != null) revealMap.set(item.uid, item);
    }
  }
  const piecesByUid = ctx.piecesByUid || new Map();
  const findPiece = (refOrUid) => {
    if (refOrUid == null) return null;
    if (typeof refOrUid === 'object') {
      const piece = toPiece(refOrUid.key || refOrUid.name || refOrUid);
      if (piece) return { ...piece, side: normalizeSide(refOrUid.side) || piece.side || null, uid: refOrUid.uid ?? null };
      return null;
    }
    const uid = typeof refOrUid === 'number' ? refOrUid : Number(refOrUid);
    const revealed = revealMap.get(uid);
    const viewPiece = piecesByUid.get(uid);
    const key = revealed?.key || viewPiece?.key || null;
    const piece = key ? toPiece(key) : null;
    if (!piece) {
      // 未知棋種時仍可顯示軍種棋背
      if (viewPiece?.branch) {
        return {
          key: null, name: '未知棋子', short: '？', branch: viewPiece.branch,
          category: 'weapon', move: 'static', deploy: 'anyLand', tags: [], desc: '',
          side: normalizeSide(viewPiece.side) || null, uid,
        };
      }
      return null;
    }
    return { ...piece, side: normalizeSide(viewPiece?.side) || null, uid };
  };

  let attacker = null;
  let defender = null;
  if (battle.attacker) attacker = findPiece(battle.attacker);
  else if (battle.attackerUid != null || battle.attackerId != null) attacker = findPiece(battle.attackerUid ?? battle.attackerId);
  if (battle.defender) defender = findPiece(battle.defender);
  else if (battle.defenderUid != null || battle.defenderId != null) defender = findPiece(battle.defenderUid ?? battle.defenderId);

  // 由 reveal 補齊缺漏的一方
  if (!attacker || !defender) {
    for (const item of battle.reveal || []) {
      if (!item?.key) continue;
      if (!attacker && item.uid === battle.attackerUid) attacker = findPiece(item.uid);
      if (!defender && item.uid === battle.defenderUid) defender = findPiece(item.uid);
    }
  }

  // 推測陣營：攻擊方通常為當前輪次方
  const attackerSide = normalizeSide(battle.attackerSide) || attacker?.side || normalizeSide(ctx.sideToMove) || null;
  const defenderSide = normalizeSide(battle.defenderSide) || defender?.side
    || (attackerSide ? (attackerSide === 'south' ? 'north' : 'south') : null);
  if (attacker) attacker.side = attackerSide || attacker.side;
  if (defender) defender.side = defenderSide || defender.side;

  const outcome = normalizeOutcome(battle.outcome ?? battle.result ?? battle.code);
  const special = battle.special || battle.action || null;
  const eliminated = Array.isArray(battle.eliminated) ? battle.eliminated : [];

  return {
    attacker,
    defender,
    attackerSide,
    defenderSide,
    outcome,
    special,
    occupied: !!battle.occupied,
    eliminated,
    turn: battle.turn ?? ctx.turn ?? null,
    round: battle.round ?? ctx.round ?? null,
    note: battle.note || '',
    autoCloseMs: Number(battle.autoCloseMs || 0) || 0,
  };
}

const STATUS_BY_OUTCOME = {
  A: { attacker: '存活', defender: '消滅', attackerTone: 'alive', defenderTone: 'dead' },
  D: { attacker: '消滅', defender: '存活', attackerTone: 'dead', defenderTone: 'alive' },
  B: { attacker: '消滅', defender: '消滅', attackerTone: 'dead', defenderTone: 'dead' },
  N: { attacker: '存活・退回', defender: '存活', attackerTone: 'alive', defenderTone: 'alive' },
  R: { attacker: '偵察', defender: '曝光', attackerTone: 'scout', defenderTone: 'revealed' },
  F: { attacker: '奪旗', defender: '失守', attackerTone: 'flag', defenderTone: 'dead' },
  X: { attacker: '—', defender: '—', attackerTone: 'none', defenderTone: 'none' },
};

function sideCardHTML({ role, piece, side, tone, status, isPlayer }) {
  const sideMeta = side ? SIDE_META[side] : null;
  if (!piece) {
    return `<div class="battle-card battle-card--${role} battle-card--empty">
      <span class="battle-card__role">${role === 'attacker' ? '攻擊方' : '防守方'}</span>
      <div class="battle-card__empty">?</div>
      <span class="battle-card__name">未知棋子</span>
    </div>`;
  }
  return `<div class="battle-card battle-card--${role} battle-card--${tone}" data-side="${side || ''}">
    <div class="battle-card__top">
      <span class="battle-card__role">${role === 'attacker' ? '攻擊方' : '防守方'}</span>
      ${sideMeta ? `<span class="battle-card__side battle-card__side--${sideMeta.color}">${sideMeta.label}${isPlayer ? '・你' : ''}</span>` : ''}
    </div>
    <div class="battle-card__medallion">${pieceMedallion(piece, { size: 'xl', side })}</div>
    <div class="battle-card__name">${escapeHtml(piece.key ? piece.name : '未知棋子')}</div>
    <div class="battle-card__meta">
      <span>${escapeHtml(piece.key ? pieceBranchLabel(piece) : '未曝光')}</span>
      <span class="battle-card__status battle-card__status--${tone}">${escapeHtml(status)}</span>
    </div>
  </div>`;
}

function pieceBranchLabel(piece) {
  const labels = { army: '陸軍', navy: '海軍', air: '空軍' };
  return labels[piece.branch] || '未知';
}

function eliminatedLabel(battle) {
  const items = [];
  const status = STATUS_BY_OUTCOME[battle.outcome] || STATUS_BY_OUTCOME.A;
  if (status.attackerTone === 'dead' && battle.attacker) items.push(`攻擊方・${battle.attacker.name}`);
  if (['dead', 'flag'].includes(status.defenderTone) && battle.defender) items.push(`防守方・${battle.defender.name}`);
  return items;
}

/**
 * 顯示戰鬥結算卡
 * @param {object} manager modal 管理器
 * @param {object} battleData 戰鬥事件
 * @param {object} options { playerSide, piecesByUid, sideToMove, turn, onClose, autoCloseMs }
 */
export function showBattleModal(manager, battleData, options = {}) {
  const battle = normalizeBattle(battleData, {
    playerSide: options.playerSide,
    piecesByUid: options.piecesByUid,
    sideToMove: options.sideToMove,
    turn: options.turn,
  });
  const result = resultMeta(battle.outcome);
  const status = STATUS_BY_OUTCOME[battle.outcome] || STATUS_BY_OUTCOME.A;
  const isFlag = battle.outcome === 'F';
  const specialMeta = battle.special ? SPECIAL_META[battle.special] : null;
  const autoCloseMs = battle.autoCloseMs || options.autoCloseMs || 0;

  // 特殊行動的代打提示
  let specialNote = '';
  if (battle.special && SPECIAL_TO_MODE[battle.special] && battle.attacker?.key && battle.defender?.key) {
    const resolved = resolveCombat(battle.attacker.name, battle.defender.name, SPECIAL_TO_MODE[battle.special]);
    if (resolved.note) specialNote = resolved.note;
  }

  let autoTimer = 0;
  let keyOff = () => {};
  const modal = manager.open({
    id: 'battle',
    title: isFlag ? '奪旗！' : '戰鬥結算',
    subtitle: specialMeta ? `${specialMeta.label}・${specialMeta.desc}` : '雙方棋子接觸，裁判判定',
    iconName: isFlag ? 'flag' : 'sword',
    size: 'lg',
    className: `modal--battle battle-outcome--${result.key}${isFlag ? ' is-flag' : ''}`,
    ariaLabel: '戰鬥結算',
    closable: true,
    onClose: () => {
      keyOff();
      window.clearTimeout(autoTimer);
      if (typeof options.onClose === 'function') options.onClose();
    },
  });

  const eliminated = eliminatedLabel(battle);
  const occupyText = isFlag ? '奪旗成功，棋局結束' : '攻擊方佔領目標格';
  modal.body.innerHTML = `
    <div class="battle" data-outcome="${battle.outcome}">
      <div class="battle__meta">
        ${battle.turn ? `<span class="battle__turn">第 ${battle.turn} 回合</span>` : ''}
        ${specialMeta ? `<span class="battle__special">${icon('crosshair')}${escapeHtml(specialMeta.label)}</span>` : ''}
        ${isFlag ? '<span class="battle__special battle__special--flag">' + icon('flag') + '奪旗勝利</span>' : ''}
      </div>
      <div class="battle__stage">
        <div class="battle__slot battle__slot--attacker">
          ${sideCardHTML({
            role: 'attacker', piece: battle.attacker, side: battle.attackerSide,
            tone: status.attackerTone, status: status.attacker,
            isPlayer: battle.attackerSide === options.playerSide,
          })}
        </div>

        <div class="battle__center">
          <span class="battle__vs">VS</span>
          <div class="battle__result battle__result--${result.tone}">
            <span class="battle__result-icon">${icon(result.icon)}</span>
            <span class="battle__result-label">${escapeHtml(result.label)}</span>
            <span class="battle__result-sub">${escapeHtml(result.desc)}</span>
          </div>
        </div>

        <div class="battle__slot battle__slot--defender">
          ${sideCardHTML({
            role: 'defender', piece: battle.defender, side: battle.defenderSide,
            tone: status.defenderTone, status: status.defender,
            isPlayer: battle.defenderSide === options.playerSide,
          })}
        </div>
      </div>
      ${battle.occupied ? '<p class="battle__occupy">' + icon('flag') + occupyText + '</p>' : ''}
      ${eliminated.length ? `<p class="battle__eliminated">${icon('skull')}<span>消滅：${eliminated.map(escapeHtml).join('、')}</span></p>` : ''}
      ${(specialNote || battle.note) ? `<p class="battle__note">${icon('info')}<span>${escapeHtml(battle.note || specialNote)}</span></p>` : ''}
    </div>`;

  modal.footer.hidden = false;
  modal.footer.innerHTML = `
    <div class="modal__foot-actions battle__foot">
      ${autoCloseMs ? `<span class="battle__auto"><span class="battle__auto-bar" style="animation-duration:${autoCloseMs}ms"></span>自動繼續</span>` : ''}
      <button type="button" class="btn btn--primary btn--icon battle__continue" data-battle-continue>
        ${icon('arrowRight')}<span>繼續</span>
      </button>
    </div>`;

  let closed = false;
  const closeBattle = () => {
    if (closed) return;
    closed = true;
    modal.close();
  };
  modal.footer.querySelector('[data-battle-continue]')?.addEventListener('click', closeBattle);

  // 空白鍵／Enter／Esc 繼續
  keyOff = on(document, 'keydown', (event) => {
    if ([' ', 'Enter', 'Escape', 'Spacebar'].includes(event.key)) {
      event.preventDefault();
      closeBattle();
    }
  });

  if (autoCloseMs > 0) autoTimer = window.setTimeout(closeBattle, autoCloseMs);

  return modal;
}

export default showBattleModal;
