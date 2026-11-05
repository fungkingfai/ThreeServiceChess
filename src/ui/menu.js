/**
 * 主選單畫面
 * ------------------------------------------------------------------
 * 標題「三軍棋」、副標「陸・海・空 三軍立體戰場」、主要按鈕與陣營資訊。
 * 背景留給 three.js 棋盤，只在左側鋪一層深色漸層確保文字可讀。
 */

import { icon } from './icons.js';
import { delegate } from './dom.js';

const MENU_ACTIONS = [
  { id: 'rules', icon: 'book', label: '規則說明', sub: '15 章完整規則與勝負表' },
  { id: 'codex', icon: 'grid', label: '棋子圖鑑', sub: '30 枚棋子能力一覽' },
  { id: 'settings', icon: 'settings', label: '設定', sub: '音效・難度・揭露' },
];

export function createMenu({ onAction = null } = {}) {
  const el = document.createElement('section');
  el.className = 'screen screen--menu';
  el.dataset.screenPanel = 'menu';

  el.innerHTML = `
    <div class="menu">
      <div class="menu__scrim" aria-hidden="true"></div>
      <div class="menu__grid" aria-hidden="true"></div>
      <div class="menu__corners" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>

      <div class="menu__inner">
        <header class="menu__head">
          <div class="menu__eyebrow">
            <span class="menu__eyebrow-line"></span>
            <span>THREE-SERVICE CHESS</span>
            <span class="menu__eyebrow-dot">・</span>
            <span>臺灣傳統軍棋</span>
            <span class="menu__eyebrow-line"></span>
          </div>
        </header>

        <div class="menu__content">
          <div class="menu__title-block">
            <div class="menu__seal" aria-hidden="true">
              <span class="menu__seal-character">軍</span>
              <span class="menu__seal-ring"></span>
            </div>
            <h1 class="menu__title">
              <span class="menu__title-cn">三軍棋</span>
              <span class="menu__title-en" aria-hidden="true">SAN JUN QI</span>
            </h1>
            <p class="menu__subtitle">陸・海・空　三軍立體戰場</p>
            <p class="menu__tagline">13×13 立體棋盤・30 枚隱藏棋子・與 AI 北軍爭奪軍旗</p>
          </div>

          <nav class="menu__actions" aria-label="主選單">
            <button type="button" class="btn btn--hero" data-menu="start">
              <span class="btn--hero__icon">${icon('play')}</span>
              <span class="btn--hero__text">
                <span class="btn--hero__label">開始遊戲</span>
                <span class="btn--hero__sub">你執南軍（綠）・對戰北軍 AI（紅）</span>
              </span>
              <span class="btn--hero__arrow">${icon('arrowRight')}</span>
            </button>

            <div class="menu__secondary">
              ${MENU_ACTIONS.map((action) => `
                <button type="button" class="btn btn--menu" data-menu="${action.id}">
                  <span class="btn--menu__icon">${icon(action.icon)}</span>
                  <span class="btn--menu__text">
                    <span class="btn--menu__label">${action.label}</span>
                    <span class="btn--menu__sub">${action.sub}</span>
                  </span>
                </button>`).join('')}
            </div>
          </nav>

          <div class="menu__factions" aria-label="對戰陣營">
            <div class="faction faction--player">
              <span class="faction__mark">南</span>
              <div class="faction__body">
                <span class="faction__role">你</span>
                <span class="faction__name">南軍・綠方</span>
                <span class="faction__desc">先手為北軍；以奪旗為目標</span>
              </div>
            </div>
            <span class="faction__vs">VS</span>
            <div class="faction faction--ai">
              <span class="faction__mark">北</span>
              <div class="faction__body">
                <span class="faction__role">AI</span>
                <span class="faction__name">北軍・紅方</span>
                <span class="faction__desc">隱藏資訊推理・可調難度</span>
              </div>
            </div>
          </div>
        </div>

        <footer class="menu__foot">
          <div class="menu__foot-left">
            <span class="menu__version">v1.0.0</span>
            <span class="menu__sep">・</span>
            <span>三軍棋 3D</span>
            <span class="menu__sep">・</span>
            <span>three.js 立體棋盤</span>
          </div>
          <div class="menu__foot-right">
            <span>規則參考：維基百科・臺史博典藏・痞客邦</span>
          </div>
        </footer>
      </div>

      <div class="menu__vignette" aria-hidden="true"></div>
    </div>`;

  const handler = delegate(el, '[data-menu]', 'click', (event, btn) => {
    const action = btn.dataset.menu;
    btn.classList.add('is-pressed');
    window.setTimeout(() => btn.classList.remove('is-pressed'), 180);
    if (typeof onAction === 'function') onAction(action, event);
  });

  return {
    el,
    destroy() { handler(); el.remove(); },
  };
}

export default createMenu;
