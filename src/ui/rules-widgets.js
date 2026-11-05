/**
 * 規則頁的資料驅動元件
 * ------------------------------------------------------------------
 * 由 content/rules.js 留下 data-widget 掛載點，rules.js 呼叫此處的
 * mount 函式注入 HTML 並綁定互動。所有表格資料皆由 core 棋子／勝負表生成。
 */

import {
  PIECES, PIECE_BY_KEY, PIECE_BY_NAME,
  ATTACK_SUMMARY, DEFEND_SUMMARY,
  BRANCH_META, CATEGORY_META, MOVE_META, DEPLOY_META, RESULT_META,
  SPECIAL_PROFILES, HOUSE_RULES, COMBAT_NAMES, COMBAT_MATRIX,
  resolveCombat, resultMeta, rawCombat, groupPieces,
} from './data.js';
import {
  buildBoardCells, colLabel, MAP_LEGEND, GATES, ANCHORS,
} from './board-schema.js';
import { pieceToken, pieceMedallion } from './token.js';
import { icon, branchIcon } from './icons.js';
import { escapeHtml, delegate, $, $$ } from './dom.js';

const BRANCH_CLASS = { army: 'gold', navy: 'blue', air: 'cyan' };

function chip(name, extraClass = '') {
  const piece = PIECE_BY_NAME[name];
  const branch = piece?.branch || 'army';
  return `<span class="sum-chip sum-chip--${BRANCH_CLASS[branch] || 'gold'} ${extraClass}" title="${escapeHtml(name)}">${escapeHtml(piece?.short || name)}</span>`;
}

function chipList(names, extraClass = '') {
  if (!names || !names.length) return '<span class="sum-empty">—</span>';
  return `<span class="sum-chips">${names.map((n) => chip(n, extraClass)).join('')}</span>`;
}

function pieceIconName(piece) {
  return piece ? piece.name : '';
}

/* ------------------------------------------------------------------ */
/* 棋盤示意圖                                                          */
/* ------------------------------------------------------------------ */

const CELL_MARK = {
  gate: { text: '門', title: '城門' },
  airport: { text: '機', title: '機場' },
  camp: { text: '營', title: '行營' },
  anchor: { text: '錨', title: '錨點' },
  bridge: { text: '橋', title: '跨海鐵橋' },
};

export function mountBoardMap(host) {
  const cells = buildBoardCells();
  const COLS = 13;
  const parts = [];
  parts.push('<div class="board-map" role="img" aria-label="三軍棋棋盤節點示意圖：13 欄乘 13 列，北陸五列、海洋三列、南陸五列，含城門、行營、機場、錨點與環形鐵路">');

  // 左上角空白 + 欄標題（第 3 欄起）
  parts.push('<div class="bm-corner" style="grid-column:1;grid-row:1"></div>');
  for (let c = 0; c < COLS; c++) {
    parts.push(`<div class="bm-col" style="grid-column:${c + 3};grid-row:1">${colLabel(c)}</div>`);
  }

  // 左側分區標籤（直書）
  parts.push('<div class="bm-zone bm-zone--north" style="grid-column:1;grid-row:2 / 7">北陸</div>');
  parts.push('<div class="bm-zone bm-zone--sea" style="grid-column:1;grid-row:7 / 10">海洋</div>');
  parts.push('<div class="bm-zone bm-zone--south" style="grid-column:1;grid-row:10 / 15">南陸</div>');

  // 列標題 + 棋盤格
  for (let row = 0; row < 13; row++) {
    parts.push(`<div class="bm-row" style="grid-column:2;grid-row:${row + 2}">${row + 1}</div>`);
    for (let col = 0; col < COLS; col++) {
      const cell = cells[row * 13 + col];
      const cls = ['bm-cell', `bm-cell--${cell.zone}`];
      if (cell.rear) cls.push('bm-cell--rear');
      if (cell.coastal) cls.push('bm-cell--coast');
      if (cell.rail) cls.push('bm-cell--rail');
      if (cell.railH) cls.push('bm-cell--rail-h');
      if (cell.railV) cls.push('bm-cell--rail-v');
      if (cell.bridge) cls.push('bm-cell--bridge');
      if (cell.gate) cls.push('bm-cell--gate');
      if (cell.camp) cls.push('bm-cell--camp');
      if (cell.airport) cls.push('bm-cell--airport');
      if (cell.anchor) cls.push(`bm-cell--anchor bm-cell--anchor-${cell.anchorOwner}`);

      const feature = cell.gate ? 'gate' : cell.airport ? 'airport' : cell.camp ? 'camp'
        : cell.bridge ? 'bridge' : cell.anchor ? 'anchor' : null;
      const mark = feature ? `<span class="bm-mark bm-mark--${feature}">${CELL_MARK[feature].text}</span>` : '';
      const stationDot = cell.rail && !feature ? '<span class="bm-station"></span>' : '';
      const coord = `${colLabel(col)}${row + 1}`;
      const names = [];
      if (cell.gate) names.push(`城門（${cell.zone === 'north' ? '北軍' : '南軍'}）`);
      if (cell.camp) names.push('行營');
      if (cell.airport) names.push('機場');
      if (cell.anchor) names.push(`錨點（${cell.anchorOwner === 'north' ? '北軍' : '南軍'}）`);
      if (cell.bridge) names.push('跨海鐵橋');
      if (cell.rail) names.push('鐵路車站');
      if (cell.coastal) names.push('海岸列');
      if (cell.rear && !feature) names.push('後方佈陣列');
      const title = `${coord}${names.length ? '｜' + names.join('・') : ''}`;
      parts.push(`<div class="${cls.join(' ')}" style="grid-column:${col + 3};grid-row:${row + 2}" title="${escapeHtml(title)}" data-col="${col}" data-row="${row}">${mark}${stationDot}</div>`);
    }
  }
  parts.push('</div>');

  // 下方補充：佈陣區圖例提示
  const zoneNotes = [];
  for (const [side, label] of [['north', '北軍'], ['south', '南軍']]) {
    const gates = GATES[side].map(([c, r]) => `${colLabel(c)}${r + 1}`).join('、');
    const anchors = ANCHORS[side].map(([c, r]) => `${colLabel(c)}${r + 1}`).join('、');
    zoneNotes.push(`<div class="bm-note"><span class="bm-note__side bm-note__side--${side}">${label}</span><span>城門 ${gates}</span><span>錨點 ${anchors}</span><span>鐵路第 ${side === 'north' ? 3 : 11} 列</span></div>`);
  }
  host.innerHTML = `<div class="board-map-wrap">${parts.join('')}</div><div class="bm-notes">${zoneNotes.join('')}</div>`;
  return [];
}

export function mountBoardLegend(host) {
  const swatches = {
    north: '北陸',
    sea: '',
    south: '南陸',
    gate: '門',
    camp: '營',
    airport: '機',
    anchor: '錨',
    rail: '鐵',
    coast: '岸',
  };
  host.innerHTML = `
    <div class="board-legend__grid">
      ${MAP_LEGEND.map((item) => `
        <div class="legend-item">
          <span class="legend-swatch legend-swatch--${item.id}">${swatches[item.id] || ''}</span>
          <span class="legend-item__body">
            <span class="legend-item__label">${escapeHtml(item.label)}</span>
            <span class="legend-item__desc">${escapeHtml(item.desc)}</span>
          </span>
        </div>`).join('')}
    </div>
    <p class="board-legend__foot">圓點＝鐵路車站；金色實線＝鐵路；「橋」＝跨海鐵橋站。此圖為規則示意，3D 棋盤以相同節點配置呈現。</p>
  `;
  return [];
}

/* ------------------------------------------------------------------ */
/* 30 枚棋子一覽                                                       */
/* ------------------------------------------------------------------ */

export function mountPiecesTable(host) {
  const groups = groupPieces();
  const rows = [];
  for (const group of groups) {
    rows.push(`<tr class="rule-table__group"><th colspan="7">
      <span class="rule-table__group-title">${escapeHtml(group.title)}</span>
      <span class="rule-table__group-meta">${group.items.length} 枚・${escapeHtml(group.caption)}</span>
    </th></tr>`);
    for (const piece of group.items) {
      const branch = BRANCH_META[piece.branch] || BRANCH_META.army;
      const cat = CATEGORY_META[piece.category] || CATEGORY_META.weapon;
      const move = MOVE_META[piece.move] || MOVE_META.static;
      const deploy = DEPLOY_META[piece.deploy] || DEPLOY_META.anyLand;
      const tier = piece.category === 'officer' ? `官兵第 ${12 - piece.rank} 階` : piece.category === 'flag' ? '勝負核心' : cat.label;
      rows.push(`<tr data-key="${piece.key}">
        <td class="rule-table__piece">
          ${pieceToken(piece, { size: 'xs' })}
          <span class="rule-table__piece-name">${escapeHtml(piece.name)}</span>
        </td>
        <td><span class="branch-cell branch-cell--${branch.color}">${branchIcon(piece.branch, 'ico--xs')}${branch.label}</span></td>
        <td>${escapeHtml(tier)}</td>
        <td class="rule-table__num">1</td>
        <td>${escapeHtml(move.label)}</td>
        <td class="rule-table__deploy">${escapeHtml(deploy.label)}</td>
        <td class="rule-table__desc">${escapeHtml(piece.desc || '')}</td>
      </tr>`);
    }
  }
  host.innerHTML = `
    <div class="rule-table-wrap rule-table-wrap--pieces">
      <table class="rule-table rule-table--pieces">
        <thead><tr>
          <th>棋子</th><th>軍種</th><th>階級／類別</th><th>數量</th><th>可移動</th><th>佈陣位置</th><th>能力說明</th>
        </tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>
    <div class="pieces-table__summary">
      <span><strong>官兵</strong> 11 枚</span><span><strong>陸軍武器</strong> 11 枚</span><span><strong>海軍</strong> 5 枚</span><span><strong>空軍</strong> 2 枚</span><span><strong>軍旗</strong> 1 枚</span><span class="pieces-table__total">合計 30 枚／方</span>
    </div>
    <p class="pieces-table__note">城門可放置任何陸地陸軍棋子當誘餌（一門一格）；軍旗仍只能藏在三門之一。炮壘限海岸列、海軍限錨點、空軍限機場。</p>
  `;
  return [];
}

export function mountOfficerLadder(host) {
  const officers = PIECES.filter((p) => p.category === 'officer').sort((a, b) => b.rank - a.rank);
  const maxRank = officers[0]?.rank || 11;
  host.innerHTML = `
    <div class="officer-ladder">
      ${officers.map((p, index) => `
        <div class="officer-ladder__row" data-key="${p.key}">
          <span class="officer-ladder__ord">${index + 1}</span>
          <span class="officer-ladder__name">${escapeHtml(p.name)}</span>
          <span class="officer-ladder__bar"><span class="officer-ladder__fill" style="width:${Math.round((p.rank / maxRank) * 100)}%"></span></span>
          ${pieceToken(p, { size: 'xs' })}
          <span class="officer-ladder__note">${escapeHtml(p.desc || '')}</span>
        </div>`).join('')}
    </div>
    <p class="officer-ladder__foot">官兵相遇時上級勝下級；工兵是唯一能主動擊敗炮壘的官兵（數位版覆寫）。</p>
  `;
  return [];
}

export function mountDeployZones(host) {
  const cards = [
    {
      id: 'land', icon: 'shield', title: '陸地兵站・21 枚', cls: 'gold',
      list: '11 名官兵＋10 種可佈陸地的武器',
      text: '本方 5 列陸地中，除機場外的任何節點（含 3 座城門）。地雷與陷阱同樣佈於此。',
      pieces: PIECES.filter((p) => p.deploy === 'anyLand').map((p) => p.name),
    },
    {
      id: 'coast', icon: 'fort', title: '海岸列・1 枚（炮壘）', cls: 'teal',
      list: '炮壘',
      text: '只能放在己方最靠海的那一列：北軍第 5 列、南軍第 9 列。炮壘不可移動。',
      pieces: ['炮壘'],
    },
    {
      id: 'gate', icon: 'flag', title: '城門・誘餌區（3 門）', cls: 'gold',
      list: '軍旗（三選一）＋任何陸地陸軍棋子',
      text: '北軍 C1／G1／K1，南軍 C13／G13／K13。每座城門可放 1 枚陸軍棋子；建議三門都放棋（軍旗＋誘餌），讓敵方無法從空位判斷軍旗位置。軍旗仍只能藏在其中一座。',
      pieces: ['軍旗', '總司令', '地雷', '陷阱'],
    },
    {
      id: 'anchor', icon: 'navy', title: '錨點・5 枚（海軍）', cls: 'blue',
      list: '主力艦、巡洋艦、炮艦、驅逐艦、潛水艇',
      text: '北軍第 6 列 5 個錨點、南軍第 8 列 5 個錨點，一艦一點、一一對應。',
      pieces: ['主力艦', '巡洋艦', '炮艦', '驅逐艦', '潛水艇'],
    },
    {
      id: 'airport', icon: 'air', title: '機場・2 枚（空軍）', cls: 'cyan',
      list: '戰鬥機、偵察機',
      text: '棋盤四角的機場：北軍 A1／M1，南軍 A13／M13。空軍棋子永遠公開。',
      pieces: ['戰鬥機', '偵察機'],
    },
  ];
  host.innerHTML = cards.map((card) => `
    <article class="deploy-card">
      <div class="deploy-card__head">
        <span class="deploy-card__icon deploy-card__icon--${card.cls}">${icon(card.icon)}</span>
        <div><h4>${escapeHtml(card.title)}</h4><p class="deploy-card__list">${escapeHtml(card.list)}</p></div>
      </div>
      <p>${escapeHtml(card.text)}</p>
      <div class="deploy-card__pieces">${card.pieces.map((name) => chip(name)).join('')}</div>
    </article>`).join('');
  return [];
}

/* ------------------------------------------------------------------ */
/* 戰鬥結果代碼                                                        */
/* ------------------------------------------------------------------ */

export function mountResultCodes(host) {
  const order = ['A', 'D', 'B', 'N', 'F', 'R', 'X'];
  host.innerHTML = `<div class="result-code-grid">${order.map((code) => {
    const meta = RESULT_META[code];
    return `<article class="result-code result-code--${meta.tone}">
      <span class="result-code__badge">${code}</span>
      <div class="result-code__body">
        <h4>${escapeHtml(meta.label)}</h4>
        <p>${escapeHtml(meta.desc)}</p>
      </div>
    </article>`;
  }).join('')}</div>`;
  return [];
}

/* ------------------------------------------------------------------ */
/* 特殊戰力／覆寫規則                                                  */
/* ------------------------------------------------------------------ */

export function mountSpecialProfiles(host) {
  host.innerHTML = `<div class="special-grid">${SPECIAL_PROFILES.map((profile) => `
    <article class="special-card">
      <div class="special-card__head">
        <span class="special-card__icon">${icon(profile.icon)}</span>
        <h4>${escapeHtml(profile.title)}</h4>
        <span class="special-card__pieces">${profile.pieces.map((n) => chip(n)).join('')}</span>
      </div>
      <ul class="rule-list rule-list--tight">${profile.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
    </article>`).join('')}</div>`;
  return [];
}

export function mountHouseRules(host) {
  host.innerHTML = `<div class="house-rules">${HOUSE_RULES.map((rule, index) => `
    <article class="house-rule">
      <span class="house-rule__no">${String(index + 1).padStart(2, '0')}</span>
      <div class="house-rule__body">
        <h4>${escapeHtml(rule.title)}<span class="house-rule__tag">覆寫</span></h4>
        <p>${escapeHtml(rule.text)}</p>
      </div>
    </article>`).join('')}</div>`;
  return [];
}

/* ------------------------------------------------------------------ */
/* 勝負查詢（互動）                                                    */
/* ------------------------------------------------------------------ */

const MODE_OPTIONS = [
  { value: 'normal', label: '一般戰鬥／攻擊' },
  { value: 'landing', label: '兩棲登陸（主力艦・巡洋艦）' },
  { value: 'bombard', label: '炮艦砲擊（海對陸）' },
  { value: 'fort', label: '炮壘砲擊（岸對海）' },
  { value: 'antiair', label: '防空攔截（對空）' },
  { value: 'missile', label: '飛彈轟擊（直線）' },
];

const LOOKUP_EXAMPLES = [
  { attacker: '總司令', defender: '兵團司令', mode: 'normal', label: '官兵比階級' },
  { attacker: '工兵', defender: '炮壘', mode: 'normal', label: '工兵拆炮壘（覆寫）' },
  { attacker: '炮艦', defender: '炮壘', mode: 'normal', label: '炮艦 vs 炮壘' },
  { attacker: '主力艦', defender: '師長', mode: 'landing', label: '主力艦登陸' },
  { attacker: '高射炮', defender: '戰鬥機', mode: 'antiair', label: '防空攔截' },
  { attacker: '飛彈', defender: '潛水艇', mode: 'missile', label: '飛彈 vs 潛艦（覆寫）' },
  { attacker: '飛彈', defender: '軍旗', mode: 'missile', label: '飛彈不能打城門' },
];

function compareOptions(names) {
  const order = new Map(COMBAT_NAMES.map((n, i) => [n, i]));
  return [...names].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}

function renderLookupResult(attackerName, defenderName, mode) {
  const attacker = PIECE_BY_NAME[attackerName];
  const defender = PIECE_BY_NAME[defenderName];
  const resolved = resolveCombat(attackerName, defenderName, mode);
  const meta = resultMeta(resolved.code);
  const modeMeta = {
    normal: '一般戰鬥', landing: '兩棲登陸', bombard: '炮艦砲擊',
    fort: '炮壘砲擊', antiair: '防空攔截', missile: '飛彈轟擊',
  }[mode] || '一般戰鬥';
  const rawMeta = RESULT_META[resolved.rawCode] || RESULT_META.X;
  return `
    <div class="cl-result">
      <div class="cl-result__pieces">
        <div class="cl-piece">
          <span class="cl-piece__role">攻擊方</span>
          ${pieceMedallion(attacker, { size: 'md' })}
          <span class="cl-piece__name">${escapeHtml(attacker?.name || '')}</span>
        </div>
        <div class="cl-result__center">
          <span class="cl-result__mode">${escapeHtml(modeMeta)}</span>
          <span class="cl-result__arrow">${icon('arrowRight')}</span>
          <span class="cl-result__badge cl-result__badge--${meta.tone}">${resolved.code}</span>
          <span class="cl-result__label cl-result__label--${meta.tone}">${escapeHtml(meta.label)}</span>
        </div>
        <div class="cl-piece">
          <span class="cl-piece__role cl-piece__role--defend">防守方</span>
          ${pieceMedallion(defender, { size: 'md' })}
          <span class="cl-piece__name">${escapeHtml(defender?.name || '')}</span>
        </div>
      </div>
      <p class="cl-result__desc">${escapeHtml(meta.desc)}</p>
      ${resolved.note ? `<p class="cl-result__note${resolved.overridden ? ' cl-result__note--override' : ''}">${resolved.overridden ? '<span class="cl-result__flag">數位版調整</span>' : ''}${escapeHtml(resolved.note)}</p>` : ''}
      <p class="cl-result__raw">原始勝負表 <code>matrix[${escapeHtml(defenderName)}][${escapeHtml(attackerName)}]</code>：<span class="res-chip res-chip--${rawMeta.tone}">${escapeHtml(rawMeta.short)}</span>${resolved.overridden ? '　→　已套用數位版覆寫' : ''}</p>
    </div>`;
}

export function mountCombatLookup(host) {
  const options = COMBAT_NAMES.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  host.innerHTML = `
    <div class="cl">
      <div class="cl__form">
        <label class="cl-field"><span>攻擊方</span><select data-cl="attacker" aria-label="選擇攻擊方棋子">${options}</select></label>
        <button type="button" class="cl__swap" data-cl="swap" title="交換攻擊方與防守方">${icon('refresh')}<span>交換</span></button>
        <label class="cl-field"><span>防守方</span><select data-cl="defender" aria-label="選擇防守方棋子">${options}</select></label>
        <label class="cl-field cl-field--mode"><span>行動類型</span><select data-cl="mode" aria-label="選擇行動類型">${MODE_OPTIONS.map((m) => `<option value="${m.value}">${escapeHtml(m.label)}</option>`).join('')}</select></label>
      </div>
      <div class="cl__result-host" data-cl="result" aria-live="polite"></div>
      <div class="cl__examples">
        <span class="cl__examples-label">快速範例</span>
        ${LOOKUP_EXAMPLES.map((ex) => `<button type="button" class="cl-example" data-attacker="${escapeHtml(ex.attacker)}" data-defender="${escapeHtml(ex.defender)}" data-mode="${escapeHtml(ex.mode)}">${escapeHtml(ex.label)}</button>`).join('')}
      </div>
    </div>`;

  const attackerSel = $('[data-cl="attacker"]', host);
  const defenderSel = $('[data-cl="defender"]', host);
  const modeSel = $('[data-cl="mode"]', host);
  const resultHost = $('[data-cl="result"]', host);

  const update = () => {
    resultHost.innerHTML = renderLookupResult(attackerSel.value, defenderSel.value, modeSel.value);
  };
  const listeners = [
    delegate(host, '[data-cl="attacker"]', 'change', update),
    delegate(host, '[data-cl="defender"]', 'change', update),
    delegate(host, '[data-cl="mode"]', 'change', update),
    delegate(host, '[data-cl="swap"]', 'click', () => {
      const a = attackerSel.value;
      attackerSel.value = defenderSel.value;
      defenderSel.value = a;
      update();
    }),
    delegate(host, '.cl-example', 'click', (_event, btn) => {
      attackerSel.value = btn.dataset.attacker;
      defenderSel.value = btn.dataset.defender;
      modeSel.value = btn.dataset.mode || 'normal';
      update();
    }),
  ];

  // 預設值：官兵階級
  attackerSel.value = '總司令';
  defenderSel.value = '兵團司令';
  update();

  return [
    ...listeners,
    // 對外介面：讓完整矩陣點擊時帶入查詢
    () => {},
  ];
}

/* ------------------------------------------------------------------ */
/* 每枚棋的勝負摘要                                                    */
/* ------------------------------------------------------------------ */

const SUMMARY_GROUPS = (() => {
  const groups = [];
  const officers = PIECES.filter((p) => p.category === 'officer').sort((a, b) => b.rank - a.rank);
  const weapons = PIECES.filter((p) => p.branch === 'army' && p.category === 'weapon');
  const navy = PIECES.filter((p) => p.branch === 'navy');
  const air = PIECES.filter((p) => p.branch === 'air');
  const flag = PIECES.filter((p) => p.category === 'flag');
  groups.push({ title: '陸軍・官兵', items: officers });
  groups.push({ title: '陸軍・武器', items: weapons });
  groups.push({ title: '海軍', items: navy });
  groups.push({ title: '空軍', items: air });
  groups.push({ title: '軍旗', items: flag });
  return groups;
})();

function chipsCapped(names, max = 10) {
  if (!names || !names.length) return '<span class="sum-empty">—</span>';
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return `<span class="sum-chips">${shown.map((n) => chip(n)).join('')}${rest > 0 ? `<span class="sum-more" title="${escapeHtml(names.slice(max).join('、'))}">+${rest}</span>` : ''}</span>`;
}

function otherCell(bucket, labels) {
  const parts = [];
  if (bucket.flags?.length) parts.push(`<span class="sum-other__group"><span class="sum-other__label">${labels.flag}</span>${chipList(bucket.flags)}</span>`);
  if (bucket.scouts?.length) parts.push(`<span class="sum-other__group"><span class="sum-other__label">${labels.scout}</span>${chipsCapped(bucket.scouts, 8)}</span>`);
  if (bucket.invalid?.length) parts.push(`<span class="sum-other__group"><span class="sum-other__label">${labels.invalid}</span>${chipsCapped(compareOptions(bucket.invalid), 8)}</span>`);
  return parts.length ? `<span class="sum-other">${parts.join('')}</span>` : '<span class="sum-empty">—</span>';
}

function summaryRow(piece, perspective, index) {
  const attack = ATTACK_SUMMARY[piece.name] || {};
  const defend = DEFEND_SUMMARY[piece.name] || {};
  const isAttack = perspective === 'attack';
  const bucket = isAttack
    ? {
        wins: attack.wins || [], loses: attack.loses || [],
        both: attack.both || [], draws: attack.draws || [],
        flags: attack.flags || [], scouts: attack.scouts || [], invalid: attack.invalid || [],
      }
    : {
        wins: defend.beats || [], loses: defend.losesTo || [],
        both: defend.both || [], draws: defend.draws || [],
        flags: defend.flags || [], scouts: defend.scouts || [], invalid: defend.invalid || [],
      };
  const labels = isAttack
    ? { flag: '奪旗', scout: '偵察', invalid: '無法' }
    : { flag: '被奪旗', scout: '被偵察', invalid: '無法' };
  return `<tr data-key="${piece.key}">
    <td class="sum-piece">
      <span class="sum-piece__index">${String(index + 1).padStart(2, '0')}</span>
      ${pieceToken(piece, { size: 'xs' })}
      <span class="sum-piece__name">${escapeHtml(piece.name)}</span>
    </td>
    <td class="sum-cell sum-cell--attack">${chipList(compareOptions(bucket.wins))}</td>
    <td class="sum-cell sum-cell--defend">${chipList(compareOptions(bucket.loses))}</td>
    <td class="sum-cell sum-cell--both">${chipList(compareOptions(bucket.both))}</td>
    <td class="sum-cell sum-cell--draw">${chipList(bucket.draws)}</td>
    <td class="sum-cell sum-cell--other">${otherCell(bucket, labels)}</td>
  </tr>`;
}

export function mountCombatSummary(host) {
  const render = (perspective) => {
    const isAttack = perspective === 'attack';
    const head = isAttack
      ? ['<th>棋子</th><th>能擊敗</th><th>敗於</th><th>同歸於盡</th><th>不分勝負</th><th>其他（奪旗・偵察・無法）</th>']
      : ['<th>棋子</th><th>能擋下</th><th>被擊敗</th><th>同歸於盡</th><th>不分勝負</th><th>其他（被奪旗・被偵察・無法）</th>'];
    let index = 0;
    const rows = SUMMARY_GROUPS.map((group) => {
      const groupRow = `<tr class="rule-table__group"><th colspan="6"><span class="rule-table__group-title">${escapeHtml(group.title)}</span><span class="rule-table__group-meta">${group.items.length} 枚</span></th></tr>`;
      return groupRow + group.items.map((p) => summaryRow(p, perspective, index++)).join('');
    }).join('');
    host.innerHTML = `
      <div class="sum-toolbar">
        <div class="segmented" role="group" aria-label="切換視角">
          <button type="button" class="segmented__btn${isAttack ? ' is-active' : ''}" data-perspective="attack">攻擊方視角</button>
          <button type="button" class="segmented__btn${!isAttack ? ' is-active' : ''}" data-perspective="defend">防守方視角</button>
        </div>
        <span class="sum-toolbar__hint">「無法作用」代表正常移動下不會交手的組合；開關視角不影響資料。</span>
      </div>
      <div class="rule-table-wrap rule-table-wrap--summary">
        <table class="rule-table rule-table--summary">
          <thead><tr>${head.join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="sum-foot">摘要已套用數位版覆寫。官兵對武器的「無法作用」代表該官兵不能以近戰攻擊該目標；實際可行的攻擊請見特殊行動。過長的清單顯示前 8～10 項，其餘以「+N」收納，滑鼠移入可看完整名單。</p>
      <p class="sum-foot">注意：摘要只看勝負表，未考慮移動範圍。例如陸軍無法直接攻擊海上艦艇、空軍不能攻擊城門；這類目標必須以砲擊、登陸、防空等特殊行動處理。</p>
    `;
    for (const btn of $$('[data-perspective]', host)) {
      btn.addEventListener('click', () => render(btn.dataset.perspective));
    }
  };
  render('attack');
  return [];
}

/* ------------------------------------------------------------------ */
/* 完整 30×30 矩陣                                                     */
/* ------------------------------------------------------------------ */

export function mountCombatMatrix(host, hooks = {}) {
  const cellTitle = (defender, attacker) => {
    const resolved = resolveCombat(attacker, defender, 'normal');
    const meta = resultMeta(resolved.code);
    return `${attacker} → ${defender}：${meta.label}${resolved.overridden ? '（數位版覆寫）' : ''}`;
  };
  const headerCols = COMBAT_NAMES.map((name) => `<th class="mx-col" scope="col"><span>${escapeHtml(name)}</span></th>`).join('');
  const rows = COMBAT_NAMES.map((defender) => {
    const cells = COMBAT_NAMES.map((attacker) => {
      const resolved = resolveCombat(attacker, defender, 'normal');
      const meta = resultMeta(resolved.code);
      return `<td class="mx-cell mx-cell--${meta.tone}${resolved.overridden ? ' is-override' : ''}" data-attacker="${escapeHtml(attacker)}" data-defender="${escapeHtml(defender)}" title="${escapeHtml(cellTitle(defender, attacker))}">${resolved.code}</td>`;
    }).join('');
    return `<tr><th class="mx-row" scope="row">${escapeHtml(defender)}</th>${cells}</tr>`;
  }).join('');

  host.innerHTML = `
    <div class="mx-legend">
      <span class="mx-legend__label">守方列 × 攻方欄</span>
      ${['A', 'D', 'B', 'N', 'R', 'F', 'X'].map((code) => `<span class="mx-key mx-key--${RESULT_META[code].tone}"><b>${code}</b>${escapeHtml(RESULT_META[code].short)}</span>`).join('')}
    </div>
    <div class="mx-scroll">
      <table class="mx-table">
        <thead><tr><th class="mx-corner">守方 ＼ 攻方</th>${headerCols}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="mx-hint">點擊任一格，會把該組合帶入上方的互動查詢並顯示詳細說明。</p>
  `;

  delegate(host, '.mx-cell', 'click', (_event, cell) => {
    const { attacker, defender } = cell.dataset;
    const lookup = host.closest('.rules-article')?.querySelector('[data-widget="combat-lookup"]');
    const selA = lookup?.querySelector('[data-cl="attacker"]');
    const selD = lookup?.querySelector('[data-cl="defender"]');
    const selM = lookup?.querySelector('[data-cl="mode"]');
    if (selA && selD) {
      selA.value = attacker;
      selD.value = defender;
      if (selM) selM.value = 'normal';
      selA.dispatchEvent(new Event('change', { bubbles: true }));
      lookup.scrollIntoView({ behavior: 'smooth', block: 'center' });
      cell.classList.add('is-flash');
      setTimeout(() => cell.classList.remove('is-flash'), 900);
    }
    hooks.onPick?.(attacker, defender);
  });
  return [];
}

/* ------------------------------------------------------------------ */
/* 掛載對照表                                                          */
/* ------------------------------------------------------------------ */

export const WIDGET_MOUNTS = {
  'board-map': mountBoardMap,
  'board-legend': mountBoardLegend,
  'pieces-table': mountPiecesTable,
  'officer-ladder': mountOfficerLadder,
  'deploy-zones': mountDeployZones,
  'result-codes': mountResultCodes,
  'special-profiles': mountSpecialProfiles,
  'house-rules': mountHouseRules,
  'combat-lookup': mountCombatLookup,
  'combat-summary': mountCombatSummary,
  'combat-matrix': mountCombatMatrix,
};

export default WIDGET_MOUNTS;
