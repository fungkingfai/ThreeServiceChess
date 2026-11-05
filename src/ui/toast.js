/**
 * Toast 通知（右下／上方浮出，自動消失）
 */

import { escapeHtml, on } from './dom.js';
import { icon } from './icons.js';

const TYPE_META = {
  info: { icon: 'info', label: '提示' },
  success: { icon: 'check', label: '完成' },
  warn: { icon: 'warning', label: '注意' },
  danger: { icon: 'warning', label: '警告' },
  battle: { icon: 'sword', label: '戰報' },
  flag: { icon: 'flag', label: '奪旗' },
};

export function createToasts(container, { max = 4 } = {}) {
  const items = [];

  function remove(item) {
    if (!item.el.isConnected) return;
    item.el.classList.remove('is-in');
    item.el.classList.add('is-out');
    window.setTimeout(() => item.el.remove(), 240);
    const idx = items.indexOf(item);
    if (idx >= 0) items.splice(idx, 1);
  }

  function show(message, type = 'info', options = {}) {
    if (!container) return null;
    const text = String(message ?? '');
    if (!text) return null;
    const meta = TYPE_META[type] || TYPE_META.info;
    const duration = options.duration ?? (type === 'battle' ? 3600 : 2800);
    const item = { el: document.createElement('div') };
    item.el.className = `toast toast--${type}`;
    item.el.setAttribute('role', 'status');
    item.el.innerHTML = `
      <span class="toast__icon">${icon(options.icon || meta.icon)}</span>
      <span class="toast__body">
        ${options.title ? `<span class="toast__title">${escapeHtml(options.title)}</span>` : ''}
        <span class="toast__text">${escapeHtml(text)}</span>
      </span>
      <button type="button" class="toast__close" aria-label="關閉通知">${icon('close')}</button>
      <span class="toast__bar" style="animation-duration:${duration}ms"></span>`;
    item.timer = window.setTimeout(() => remove(item), duration);
    on(item.el.querySelector('.toast__close'), 'click', () => remove(item));
    item.el.addEventListener('mouseenter', () => window.clearTimeout(item.timer));
    item.el.addEventListener('mouseleave', () => {
      item.timer = window.setTimeout(() => remove(item), 1200);
    });
    container.append(item.el);
    items.push(item);
    requestAnimationFrame(() => item.el.classList.add('is-in'));
    while (items.length > max) remove(items[0]);
    return item;
  }

  return {
    show,
    info: (msg, opts) => show(msg, 'info', opts),
    success: (msg, opts) => show(msg, 'success', opts),
    warn: (msg, opts) => show(msg, 'warn', opts),
    danger: (msg, opts) => show(msg, 'danger', opts),
    clear() { [...items].forEach(remove); },
  };
}

export default createToasts;
