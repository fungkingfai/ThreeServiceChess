/**
 * 規則頁 modal
 * ------------------------------------------------------------------
 * 內容來自 content/rules.js（敘述），資料表格由 rules-widgets.js 於注入後生成。
 * 左側章節導覽、右側可滾動文章、滾動時自動高亮目前章節。
 */

import { RULES_META, RULES_HTML } from '../../content/rules.js';
import { WIDGET_MOUNTS } from './rules-widgets.js';
import { escapeHtml, $, $$, on, delegate } from './dom.js';
import { icon } from './icons.js';

/** 將規則內容注入容器並掛載所有資料元件 */
export function mountRulesArticle(container) {
  container.innerHTML = RULES_HTML;
  const cleanups = [];
  for (const host of $$('[data-widget]', container)) {
    const mount = WIDGET_MOUNTS[host.dataset.widget];
    if (!mount) continue;
    try {
      const result = mount(host, {});
      if (Array.isArray(result)) cleanups.push(...result);
    } catch (error) {
      console.error(`[UI] 規則元件 ${host.dataset.widget} 載入失敗`, error);
      host.innerHTML = '<p class="rule-widget-error">此區塊載入失敗，請重新開啟規則頁。</p>';
    }
  }
  return cleanups;
}

const HERO_CHIPS = [
  { target: 'rules-overview', label: '快速入門', icon: 'compass' },
  { target: 'rules-board', label: '棋盤圖解', icon: 'grid' },
  { target: 'rules-pieces', label: '30 枚棋子', icon: 'shield' },
  { target: 'rules-table', label: '勝負表查詢', icon: 'sword' },
  { target: 'rules-controls', label: '操作說明', icon: 'info' },
];

/**
 * 開啟規則頁
 * @param {object} manager createModalManager 回傳的管理器
 * @param {object} options { chapter?: string, onClose?: Function }
 */
export function openRulesModal(manager, { chapter = '', onClose = null } = {}) {
  const modal = manager.open({
    id: 'rules',
    title: RULES_META.title,
    subtitle: RULES_META.subtitle,
    iconName: 'book',
    size: 'full',
    className: 'modal--rules',
    ariaLabel: '三軍棋規則大全',
    headerExtra: `<span class="modal__pill">${escapeHtml(RULES_META.version)}</span>`,
    onClose,
  });

  // 手機友善：底部固定「關閉規則」按鈕（右上 X 之外的第二個明顯出口）
  modal.footer.hidden = false;
  modal.footer.innerHTML = '<div class="modal__foot-actions"><button type="button" class="btn btn--primary rules__close-btn" data-rules-close>關閉規則</button></div>';
  const rulesFooterClose = $('[data-rules-close]', modal.footer);
  if (rulesFooterClose) rulesFooterClose.addEventListener('click', () => modal.close());

  modal.body.innerHTML = `
    <div class="rules-layout">
      <nav class="rules-nav" aria-label="規則章節導覽">
        <div class="rules-nav__head"><span>章節導覽</span><span class="rules-nav__count" data-nav-count>15</span></div>
        <ol class="rules-nav__list" data-rules-nav></ol>
        <div class="rules-nav__foot">
          <span class="rules-nav__brand">三軍棋 3D</span>
          <span class="rules-nav__version">v1.0</span>
        </div>
      </nav>
      <div class="rules-content" data-rules-scroll tabindex="-1">
        <header class="rules-hero">
          <div class="rules-hero__eyebrow"><span class="rules-hero__rule"></span>THREE-SERVICE CHESS・RULEBOOK<span class="rules-hero__rule"></span></div>
          <div class="rules-hero__title-row">
            <h1 class="rules-hero__title">三軍棋</h1>
            <p class="rules-hero__sub">陸・海・空　三軍立體戰場<br><span>台灣傳統「陸海空三軍棋」完整規則</span></p>
          </div>
          <p class="rules-hero__lede">從棋盤解剖、30 枚棋子、佈陣與移動，到逐條特殊行動與 30×30 勝負表查詢——一頁讀懂三軍棋。規則頁隨時可開，棋局會在背景等你回來。</p>
          <div class="rules-hero__chips">
            ${HERO_CHIPS.map((chipItem) => `<button type="button" class="rules-hero__chip" data-jump="${chipItem.target}">${icon(chipItem.icon)}<span>${escapeHtml(chipItem.label)}</span></button>`).join('')}
          </div>
          <div class="rules-hero__stats">
            <span><b>13×13</b> 棋盤節點</span>
            <span><b>30</b> 枚棋子／方</span>
            <span><b>15</b> 個規則章節</span>
            <span><b>900</b> 種勝負組合</span>
          </div>
        </header>
        <article class="rules-article" data-rules-article></article>
        <footer class="rules-content__foot">
          <span>三軍棋 3D・數位版 v1.0</span>
          <span>規則以 <code>DESIGN.md</code> 為權威；棋種資料來自 <code>src/core/pieces.js</code></span>
        </footer>
      </div>
    </div>`;

  const article = $('[data-rules-article]', modal.body);
  mountRulesArticle(article);

  // ---- 章節導覽 ----
  const navList = $('[data-rules-nav]', modal.body);
  const sections = $$('.rules-section', article);
  $('[data-nav-count]', modal.body).textContent = String(sections.length);
  navList.innerHTML = sections.map((section, index) => {
    const id = section.id;
    const label = section.dataset.chapter || section.querySelector('h2')?.textContent || `章節 ${index + 1}`;
    return `<li><a class="rules-nav__link" href="#${escapeHtml(id)}" data-nav-target="${escapeHtml(id)}">
      <span class="rules-nav__no">${String(index + 1).padStart(2, '0')}</span>
      <span class="rules-nav__label">${escapeHtml(label)}</span>
    </a></li>`;
  }).join('');

  const navLinks = $$('.rules-nav__link', navList);
  const scrollEl = $('[data-rules-scroll]', modal.body);
  console.log('[rules] mount', performance.now(), { chapter, scrollTop: scrollEl.scrollTop });
  let activeId = '';

  const setActive = (id, scrollNav = false) => {
    if (id === activeId) return;
    activeId = id;
    for (const link of navLinks) {
      const isActive = link.dataset.navTarget === id;
      link.classList.toggle('is-active', isActive);
      if (isActive && scrollNav) {
        link.scrollIntoView({ block: 'nearest' });
      }
    }
  };

  const scrollToChapter = (id, behavior = 'smooth') => {
    console.log('[rules] scrollToChapter', id, behavior, performance.now(), scrollEl.scrollTop);
    const target = document.getElementById(id);
    if (!target) return;
    // 以 offsetTop 計算（相對於 .rules-content），避免 modal 開啟中的 transform 造成量測偏差
    const top = Math.max(0, target.offsetTop - 16);
    if (behavior === 'instant') scrollEl.scrollTop = top;
    else scrollEl.scrollTo({ top, behavior: 'smooth' });
    setActive(id, true);
  };

  // 導覽點擊
  const navOff = delegate(navList, '[data-nav-target]', 'click', (event, link) => {
    event.preventDefault();
    scrollToChapter(link.dataset.navTarget);
  });

  // 內文 anchor
  const anchorOff = delegate(article, 'a[href^="#rules-"]', 'click', (event, link) => {
    event.preventDefault();
    const id = link.getAttribute('href').slice(1);
    scrollToChapter(id);
  });

  // Hero 快速跳轉
  const heroOff = delegate(modal.body, '[data-jump]', 'click', (event, btn) => {
    event.preventDefault();
    scrollToChapter(btn.dataset.jump);
  });

  // 滾動高亮
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const offset = scrollEl.scrollTop + 120;
      let current = sections[0]?.id || '';
      for (const section of sections) {
        if (section.offsetTop <= offset) current = section.id;
        else break;
      }
      setActive(current, false);
    });
  };
  const scrollOff = on(scrollEl, 'scroll', onScroll, { passive: true });

  setActive(sections[0]?.id || '');
  if (chapter) {
    const chapterId = String(chapter).startsWith('rules-') ? String(chapter) : `rules-${chapter}`;
    // 內容已同步掛載，直接以 offsetTop 跳轉（不用 rAF，避免進場動畫造成的時序競爭）
    scrollToChapter(chapterId, 'instant');
  }

  // modal 關閉時解除監聽（observer 與 DOM 一起移除即可，但 scroll 監聽需歸還）
  const originalClose = modal.close;
  modal.close = () => {
    navOff(); anchorOff(); heroOff(); scrollOff();
    originalClose();
  };

  return modal;
}

export default openRulesModal;
