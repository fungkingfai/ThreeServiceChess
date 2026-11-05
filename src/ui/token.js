/**
 * 棋子視覺元件（純 HTML/CSS，不用外部圖片）
 * ------------------------------------------------------------------
 * 提供托盤籌碼、資訊卡徽章、戰鬥大圓章等樣板字串；
 * 造型以 CSS 繪製：軍種底色 + 階級星點 / 圖示 + 短棋名。
 */

import { branchIcon, icon } from './icons.js';
import {
  BRANCH_META,
  CATEGORY_META,
  SIDE_META,
  pieceTierLabel,
  TAG_META,
  MOVE_META,
  DEPLOY_META,
  toPiece,
} from './data.js';
import { escapeHtml } from './dom.js';

function tokenClasses(piece, opts = {}) {
  const { size = 'md', selected = false, dim = false, hidden = false, side = null } = opts;
  const classes = ['token', `token--${size}`, `token--b-${piece.branch}`, `token--c-${piece.category}`];
  if (selected) classes.push('is-selected');
  if (dim) classes.push('is-dim');
  if (hidden) classes.push('is-hidden');
  if (side) classes.push(`token--side-${side}`);
  if (opts.className) classes.push(opts.className);
  return classes.join(' ');
}

function nameLengthClass(text) {
  const len = Array.from(String(text || '')).length;
  if (len <= 2) return 'token__name--l2';
  if (len === 3) return 'token__name--l3';
  return 'token__name--l4';
}

/**
 * 棋子圓章（HTML 字串）
 * opts: { size:'xs'|'sm'|'md'|'lg'|'xl', side, selected, dim, hidden, className }
 */
export function pieceToken(value, opts = {}) {
  const piece = toPiece(value);
  if (!piece) return '';
  const { size = 'md', side = null, hidden = false } = opts;
  const branch = piece.branch || 'army';
  const branchMeta = BRANCH_META[branch] || BRANCH_META.army;
  const short = hidden ? '？' : (piece.short || piece.name || '');
  const tier = hidden ? branchMeta.label : pieceTierLabel(piece);
  const title = hidden ? `${branchMeta.label}棋子（未曝光）` : `${piece.name}｜${tier}`;
  return `<span class="${tokenClasses(piece, { ...opts, side, hidden, size })}" data-key="${escapeHtml(piece.key || '')}" title="${escapeHtml(title)}">
    <span class="token__glow"></span>
    <span class="token__branch">${branchIcon(branch)}</span>
    <span class="token__name ${nameLengthClass(short)}">${escapeHtml(short)}</span>
    <span class="token__tier">${escapeHtml(hidden ? '???' : (piece.category === 'officer' ? `${piece.rank}` : ''))}</span>
  </span>`;
}

/** 托盤用的直式籌碼（圓章＋名稱＋狀態） */
export function pieceChip(value, opts = {}) {
  const piece = toPiece(value);
  if (!piece) return '';
  const { placed = false, selected = false, disabled = false, side = null } = opts;
  const classes = ['piece-chip', `piece-chip--${piece.branch}`];
  if (placed) classes.push('is-placed');
  if (selected) classes.push('is-selected');
  if (disabled) classes.push('is-disabled');
  const branchMeta = BRANCH_META[piece.branch] || BRANCH_META.army;
  return `<button type="button" class="${classes.join(' ')}" data-key="${escapeHtml(piece.key)}" data-piece-key="${escapeHtml(piece.key)}" title="${escapeHtml(`${piece.name}｜${piece.desc || ''}`)}" aria-pressed="${selected ? 'true' : 'false'}">
    ${pieceToken(piece, { size: 'sm', side, selected })}
    <span class="piece-chip__name">${escapeHtml(piece.short || piece.name)}</span>
    <span class="piece-chip__state" aria-hidden="true">${placed ? icon('check', 'ico--xs') : ''}</span>
    <span class="piece-chip__branch">${escapeHtml(branchMeta.label.slice(0, 1))}</span>
  </button>`;
}

/** 大圓章（戰鬥結算、選中棋子資訊卡） */
export function pieceMedallion(value, opts = {}) {
  const piece = toPiece(value);
  if (!piece) return '';
  const { side = null, size = 'lg', hidden = false } = opts;
  return `<span class="medallion medallion--${piece.branch}${side ? ` medallion--side-${side}` : ''}${hidden ? ' is-hidden' : ''} medallion--${size}">
    <span class="medallion__rings" aria-hidden="true"></span>
    <span class="medallion__branch">${branchIcon(piece.branch)}</span>
    <span class="medallion__name ${nameLengthClass(piece.short || piece.name)}">${escapeHtml(hidden ? '？' : (piece.short || piece.name))}</span>
    <span class="medallion__tier">${escapeHtml(hidden ? '未曝光' : pieceTierLabel(piece))}</span>
  </span>`;
}

/** 軍種標籤 */
export function branchTag(branch, extraClass = '') {
  const meta = BRANCH_META[branch] || BRANCH_META.army;
  return `<span class="branch-tag branch-tag--${branch} ${extraClass}">${branchIcon(branch)}<span>${meta.label}</span></span>`;
}

/** 陣營徽章（南軍・綠 / 北軍・紅） */
export function sideBadge(side, { you = false, compact = false } = {}) {
  const meta = SIDE_META[side] || SIDE_META.south;
  return `<span class="side-badge side-badge--${meta.color}${compact ? ' side-badge--compact' : ''}">
    <span class="side-badge__dot"></span>
    <span>${meta.label}${you ? '・你' : compact ? '' : `・${meta.tagline}`}</span>
  </span>`;
}

/** 標籤列（能力標記） */
export function tagList(piece, { max = 4 } = {}) {
  const tags = (piece?.tags || []).map((t) => TAG_META[t]).filter(Boolean);
  const unique = [...new Set(tags)].slice(0, max);
  if (!unique.length) return '';
  return `<span class="tag-list">${unique.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</span>`;
}

/**
 * 棋子完整資訊（名稱、軍種、階級、能力、移動、佈陣）
 * opts.compact：只留名稱與一行能力
 */
export function pieceDetail(value, opts = {}) {
  const piece = toPiece(value);
  if (!piece) return '';
  const { compact = false, showTags = true } = opts;
  const move = MOVE_META[piece.move] || MOVE_META.static;
  const deploy = DEPLOY_META[piece.deploy] || DEPLOY_META.anyLand;
  const cat = CATEGORY_META[piece.category] || CATEGORY_META.weapon;
  if (compact) {
    return `<div class="p-detail p-detail--compact">
      <div class="p-detail__head">
        <span class="p-detail__name">${escapeHtml(piece.name)}</span>
        ${branchTag(piece.branch)}
        <span class="p-detail__tier">${escapeHtml(pieceTierLabel(piece))}</span>
      </div>
      <p class="p-detail__desc">${escapeHtml(piece.desc || '')}</p>
    </div>`;
  }
  return `<div class="p-detail">
    <div class="p-detail__head">
      <div class="p-detail__title">
        <span class="p-detail__name">${escapeHtml(piece.name)}</span>
        <span class="p-detail__sub">${escapeHtml(pieceTierLabel(piece))}・${cat.label}</span>
      </div>
      ${branchTag(piece.branch)}
    </div>
    <p class="p-detail__desc">${escapeHtml(piece.desc || '')}</p>
    <dl class="p-detail__facts">
      <div><dt>移動</dt><dd>${escapeHtml(move.label)}</dd></div>
      <div><dt>佈陣</dt><dd>${escapeHtml(deploy.label)}</dd></div>
      <div><dt>軍種</dt><dd>${escapeHtml((BRANCH_META[piece.branch] || {}).label || '—')}</dd></div>
      <div><dt>類別</dt><dd>${escapeHtml(cat.label)}</dd></div>
    </dl>
    ${showTags ? tagList(piece) : ''}
  </div>`;
}

export default {
  pieceToken, pieceChip, pieceMedallion, branchTag, sideBadge, tagList, pieceDetail,
};
