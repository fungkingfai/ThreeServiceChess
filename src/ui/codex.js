/**
 * 棋子圖鑑 modal
 * ------------------------------------------------------------------
 * 30 枚棋子的能力、佈陣、移動與勝負摘要；可依軍種／類別篩選，
 * 點選棋子後右側顯示完整資訊與攻／守視角的勝負清單。
 */

import {
  PIECES, PIECE_BY_NAME, PIECE_BY_KEY, ATTACK_SUMMARY, DEFEND_SUMMARY,
  BRANCH_META, CATEGORY_META, MOVE_META, DEPLOY_META, TAG_META,
  pieceTierLabel,
} from './data.js';
import { pieceToken, pieceMedallion, branchTag, tagList } from './token.js';
import { escapeHtml, $, $$, delegate } from './dom.js';
import { icon, branchIcon } from './icons.js';

const ORDER = (() => {
  const groups = [
    PIECES.filter((p) => p.category === 'officer').sort((a, b) => b.rank - a.rank),
    PIECES.filter((p) => p.branch === 'army' && p.category === 'weapon'),
    PIECES.filter((p) => p.branch === 'navy'),
    PIECES.filter((p) => p.branch === 'air'),
    PIECES.filter((p) => p.category === 'flag'),
  ];
  return groups.flat();
})();

const FILTERS = [
  { id: 'all', label: '全部', test: () => true },
  { id: 'officer', label: '陸軍官兵', test: (p) => p.category === 'officer' },
  { id: 'weapon', label: '陸軍武器', test: (p) => p.branch === 'army' && p.category === 'weapon' },
  { id: 'navy', label: '海軍', test: (p) => p.branch === 'navy' },
  { id: 'air', label: '空軍', test: (p) => p.branch === 'air' },
  { id: 'flag', label: '軍旗', test: (p) => p.category === 'flag' },
];

const BRANCH_CLASS = { army: 'gold', navy: 'blue', air: 'cyan' };

const SPECIAL_HINTS = {
  amphibious: { title: '兩棲登陸', text: '可從海域移動到相鄰海岸陸地；對官兵比照師長（主力艦）／團長（巡洋艦），對武器比照坦克車／大炮。登陸後成為陸上棋子，不能再下海。' },
  bombard: { title: '海對陸砲擊', text: '可砲擊相鄰海岸的敵方陸上棋子；對官兵比照營長、對武器比照炮壘，且不受行營保護限制。' },
  fort: { title: '岸際砲擊', text: '可砲擊相鄰海域的敵艦，自身不移動；戰力以炮壘代入，對炮艦先攻勝。' },
  aa: { title: '防空火力', text: '可攻擊直線距離 2 格內的敵機；敵機飛越上空時也會被擊落。' },
  missile: { title: '直線轟擊', text: '沿同一行／列直線攻擊任意距離，可越過障礙；不可攻擊城門與機場，發射後必定理場。' },
  scout: { title: '空中偵察', text: '可偵察同一行／列直線上的敵棋，使其永久曝光；偵察機沒有戰鬥力。' },
  fighter: { title: '制空權', text: '沿航線直線飛行；可攻擊直線上的敵機，也能擊落飛彈，但敗於高射炮與炮艦、且飛越防空單位會被擊落。' },
  engineer: { title: '工兵特攻', text: '主動攻擊地雷、陷阱、毒氣、炸彈、炮壘可獲勝（炮壘為數位版覆寫）；被動被炸彈或炮壘攻擊則落敗。' },
  mine: { title: '佈雷', text: '不可移動；碰觸者同歸於盡，唯工兵與戰鬥機可清除，偵察機則無勝負。' },
  trap: { title: '伏擊', text: '不可移動；幾乎通殺所有官兵與武器，唯獨工兵可破，戰鬥機與偵察機不受影響。' },
  flag: { title: '勝負核心', text: '軍旗被任何敵棋攻擊即失守；城門位置起初隱藏，總司令陣亡或遭偵察時曝光。' },
  gas: { title: '毒氣', text: '可移動；勝所有官兵（工兵除外），敗於工兵與其他武器。' },
  bomb: { title: '玉石俱焚', text: '可移動；與所有棋子同歸於盡（軍旗除外），唯獨敗於工兵、陷阱與戰鬥機。' },
};

function chipsFor(names) {
  if (!names || !names.length) return '<span class="sum-empty">—</span>';
  return `<span class="sum-chips">${names.map((name) => {
    const p = PIECE_BY_NAME[name];
    const color = BRANCH_CLASS[p?.branch] || 'gold';
    return `<button type="button" class="sum-chip sum-chip--${color}" data-jump-piece="${escapeHtml(name)}" title="查看 ${escapeHtml(name)}">${escapeHtml(p?.short || name)}</button>`;
  }).join('')}</span>`;
}

function detailHTML(piece, perspective) {
  const attack = ATTACK_SUMMARY[piece.name] || {};
  const defend = DEFEND_SUMMARY[piece.name] || {};
  const move = MOVE_META[piece.move] || MOVE_META.static;
  const deploy = DEPLOY_META[piece.deploy] || DEPLOY_META.anyLand;
  const cat = CATEGORY_META[piece.category] || CATEGORY_META.weapon;
  const hints = (piece.tags || []).map((tag) => SPECIAL_HINTS[tag]).filter(Boolean);
  const rows = perspective === 'attack'
    ? [
        ['能擊敗（攻勝）', 'attack', attack.wins],
        ['敗於（守勝）', 'defend', attack.loses],
        ['同歸於盡', 'both', attack.both],
        ['不分勝負', 'draw', attack.draws],
        ['奪旗', 'flag', attack.flags],
      ]
    : [
        ['能擋下（守勝）', 'attack', defend.beats],
        ['被擊敗（攻勝）', 'defend', defend.losesTo],
        ['同歸於盡', 'both', defend.both],
        ['不分勝負', 'draw', defend.draws],
        ['被奪旗', 'flag', defend.flags],
      ];
  return `
    <div class="cdetail" data-key="${piece.key}">
      <div class="cdetail__hero">
        ${pieceMedallion(piece, { size: 'lg' })}
        <div class="cdetail__title">
          <h3>${escapeHtml(piece.name)}</h3>
          <p class="cdetail__tier">${escapeHtml(pieceTierLabel(piece))}・${escapeHtml(cat.label)}</p>
          ${branchTag(piece.branch)}
        </div>
      </div>
      <p class="cdetail__desc">${escapeHtml(piece.desc || '')}</p>
      ${tagList(piece, { max: 6 })}
      <dl class="cdetail__facts">
        <div><dt>${icon('compass')}移動</dt><dd>${escapeHtml(move.label)}</dd></div>
        <div><dt>${icon('grid')}佈陣</dt><dd>${escapeHtml(deploy.label)}</dd></div>
        <div><dt>${icon('shield')}軍種</dt><dd>${escapeHtml(BRANCH_META[piece.branch]?.label || '—')}</dd></div>
        <div><dt>${icon('star')}數量</dt><dd>每方 1 枚</dd></div>
      </dl>
      ${hints.length ? `<div class="cdetail__hints">${hints.map((hint) => `<div class="cdetail__hint"><h5>${escapeHtml(hint.title)}</h5><p>${escapeHtml(hint.text)}</p></div>`).join('')}</div>` : ''}
      <div class="cdetail__combat">
        <div class="cdetail__combat-head">
          <h4>勝負摘要</h4>
          <div class="segmented segmented--sm" role="group" aria-label="勝負視角">
            <button type="button" class="segmented__btn${perspective === 'attack' ? ' is-active' : ''}" data-codex-perspective="attack">攻方</button>
            <button type="button" class="segmented__btn${perspective === 'defend' ? ' is-active' : ''}" data-codex-perspective="defend">守方</button>
          </div>
        </div>
        <div class="cdetail__combat-list">
          ${rows.map(([label, tone, names]) => `<div class="cdetail__combat-row cdetail__combat-row--${tone}">
            <span class="cdetail__combat-label">${escapeHtml(label)}</span>
            <span class="cdetail__combat-chips">${chipsFor(names)}</span>
          </div>`).join('')}
        </div>
        <p class="cdetail__combat-note">摘要已套用數位版覆寫；完整判定請開啟規則頁的勝負表查詢。</p>
      </div>
    </div>`;
}

/**
 * 開啟棋子圖鑑
 * @param {object} manager modal 管理器
 * @param {object} options { selectedKey?, onClose? }
 */
export function openCodexModal(manager, { selectedKey = '', onClose = null } = {}) {
  let filter = 'all';
  let perspective = 'attack';
  let selected = selectedKey && PIECE_BY_KEY[selectedKey] ? selectedKey : ORDER[0].key;

  const modal = manager.open({
    id: 'codex',
    title: '棋子圖鑑',
    subtitle: '30 枚棋子・能力、佈陣與勝負摘要',
    iconName: 'grid',
    size: 'full',
    className: 'modal--codex',
    ariaLabel: '三軍棋棋子圖鑑',
    onClose,
  });

  modal.body.innerHTML = `
    <div class="codex">
      <div class="codex__main">
        <div class="codex__toolbar">
          <div class="codex__filters" role="tablist" aria-label="棋子篩選">
            ${FILTERS.map((f) => `<button type="button" class="codex__filter${f.id === filter ? ' is-active' : ''}" role="tab" aria-selected="${f.id === filter}" data-codex-filter="${f.id}">${escapeHtml(f.label)}</button>`).join('')}
          </div>
          <span class="codex__count" data-codex-count></span>
        </div>
        <div class="codex__grid" data-codex-grid></div>
      </div>
      <aside class="codex__detail" data-codex-detail aria-live="polite"></aside>
    </div>`;

  // 手機友善：底部固定「關閉圖鑑」按鈕（不用摸右上角 X 也能離開）
  modal.footer.hidden = false;
  modal.footer.innerHTML = '<div class="modal__foot-actions"><button type="button" class="btn btn--primary codex__close-btn" data-codex-close>關閉圖鑑</button></div>';
  const footerClose = $('[data-codex-close]', modal.footer);
  if (footerClose) footerClose.addEventListener('click', () => modal.close());

  const gridEl = $('[data-codex-grid]', modal.body);
  const detailEl = $('[data-codex-detail]', modal.body);
  const countEl = $('[data-codex-count]', modal.body);

  const visiblePieces = () => {
    const test = FILTERS.find((f) => f.id === filter)?.test || (() => true);
    return ORDER.filter(test);
  };

  const renderDetail = () => {
    const piece = PIECE_BY_KEY[selected];
    if (!piece) {
      detailEl.innerHTML = '<p class="codex__empty">選擇一枚棋子查看詳細資料</p>';
      return;
    }
    detailEl.innerHTML = detailHTML(piece, perspective);
    detailEl.scrollTop = 0;
  };

  const renderGrid = () => {
    const pieces = visiblePieces();
    if (!pieces.some((p) => p.key === selected)) selected = pieces[0]?.key || '';
    countEl.textContent = `顯示 ${pieces.length} / ${ORDER.length} 枚`;
    gridEl.innerHTML = pieces.map((piece) => `
      <button type="button" class="codex-card${piece.key === selected ? ' is-selected' : ''}" data-codex-key="${piece.key}" aria-pressed="${piece.key === selected ? 'true' : 'false'}">
        ${pieceToken(piece, { size: 'sm' })}
        <span class="codex-card__body">
          <span class="codex-card__name">${escapeHtml(piece.name)}</span>
          <span class="codex-card__meta">${escapeHtml(pieceTierLabel(piece))}</span>
          <span class="codex-card__tags">${(piece.tags || []).slice(0, 2).map((t) => TAG_META[t]).filter(Boolean).map((t) => `<span class="tag tag--xs">${escapeHtml(t)}</span>`).join('')}</span>
        </span>
        <span class="codex-card__branch codex-card__branch--${BRANCH_META[piece.branch]?.color || 'gold'}">${branchIcon(piece.branch, 'ico--xs')}</span>
      </button>`).join('');
    renderDetail();
  };

  // 事件：篩選、選棋、視角、跳轉棋子
  delegate(modal.body, '[data-codex-filter]', 'click', (_event, btn) => {
    filter = btn.dataset.codexFilter;
    for (const other of $$('[data-codex-filter]', modal.body)) {
      const active = other.dataset.codexFilter === filter;
      other.classList.toggle('is-active', active);
      other.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    renderGrid();
  });

  delegate(gridEl, '[data-codex-key]', 'click', (_event, btn) => {
    selected = btn.dataset.codexKey;
    for (const card of $$('.codex-card', gridEl)) {
      const active = card.dataset.codexKey === selected;
      card.classList.toggle('is-selected', active);
      card.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    renderDetail();
    detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  delegate(detailEl, '[data-codex-perspective]', 'click', (_event, btn) => {
    perspective = btn.dataset.codexPerspective;
    for (const other of $$('[data-codex-perspective]', detailEl)) {
      other.classList.toggle('is-active', other.dataset.codexPerspective === perspective);
    }
    renderDetail();
  });

  // 勝負摘要中的棋名可跳轉
  delegate(detailEl, '[data-jump-piece]', 'click', (_event, btn) => {
    const name = btn.dataset.jumpPiece;
    const piece = PIECE_BY_NAME[name];
    if (!piece) return;
    filter = 'all';
    for (const other of $$('[data-codex-filter]', modal.body)) {
      other.classList.toggle('is-active', other.dataset.codexFilter === 'all');
      other.setAttribute('aria-selected', other.dataset.codexFilter === 'all' ? 'true' : 'false');
    }
    selected = piece.key;
    renderGrid();
    gridEl.querySelector(`[data-codex-key="${piece.key}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  renderGrid();
  return modal;
}

export default openCodexModal;
