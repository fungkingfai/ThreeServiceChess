/**
 * DOM 小工具（三軍棋 UI 共用）
 * ------------------------------------------------------------------
 * 只處理 DOM，不含遊戲規則；所有 UI 模組共用這裡的輔助函式，
 * 以樣板字串建立 HTML、以事件委派綁定互動，維持程式精簡。
 */

/** 建立元素（少用；大量 DOM 以樣板字串搭配 innerHTML 建立） */
export function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  const { class: className, text, html, attrs, dataset, on, style } = options;
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (html != null) node.innerHTML = html;
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    node.setAttribute(k, v === true ? '' : String(v));
  }
  if (dataset) for (const [k, v] of Object.entries(dataset)) {
    if (v != null) node.dataset[k] = String(v);
  }
  if (style) node.style.cssText = style;
  if (on) for (const [type, handler] of Object.entries(on)) node.addEventListener(type, handler);
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** HTML 字串 → 單一元素 */
export function fromHTML(markup) {
  const template = document.createElement('template');
  template.innerHTML = String(markup).trim();
  return template.content.firstElementChild;
}

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function setHTML(target, markup) {
  if (target) target.innerHTML = markup;
  return target;
}

export function clear(target) {
  if (target) target.textContent = '';
  return target;
}

/** 綁定事件，回傳解除函式 */
export function on(target, type, handler, options) {
  if (!target) return () => {};
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/** 事件委派：root 內符合 selector 的元素才觸發 */
export function delegate(root, selector, type, handler, options) {
  if (!root) return () => {};
  const listener = (event) => {
    const matched = event.target instanceof Element ? event.target.closest(selector) : null;
    if (matched && root.contains(matched)) handler(event, matched);
  };
  root.addEventListener(type, listener, options);
  return () => root.removeEventListener(type, listener, options);
}

/** HTML 跳脫（任何來自遊戲／使用者的文字都應經過此函式） */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

/** 類別切換 */
export function toggleClass(node, className, force) {
  if (!node) return false;
  if (force == null) node.classList.toggle(className);
  else node.classList.toggle(className, !!force);
  return node.classList.contains(className);
}

/** 數字補零 */
export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 下一幀（等版面完成） */
export function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 目前視窗寬度是否為精簡版（手機／平板直向） */
export function isCompactViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 1024;
}

/** 由事件取得鍵盤／滑鼠座標（供 hover 提示用） */
export function pointerXY(event) {
  if (!event) return { x: 0, y: 0 };
  if (event.touches && event.touches[0]) {
    return { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }
  return { x: event.clientX ?? 0, y: event.clientY ?? 0 };
}

/** 節點是否仍在 document 中 */
export function isAttached(node) {
  return !!node && node.isConnected;
}

/** 陣列轉英文逗號清單（空陣列回傳 fallback） */
export function joinList(list, separator = '、', fallback = '—') {
  const items = (list || []).filter(Boolean);
  return items.length ? items.join(separator) : fallback;
}

export default {
  el, fromHTML, $, $$, setHTML, clear, on, delegate, escapeHtml, toggleClass,
  pad2, clamp, sleep, nextFrame, prefersReducedMotion, isCompactViewport,
  pointerXY, isAttached, joinList,
};
