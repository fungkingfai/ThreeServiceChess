/**
 * Modal 管理（規則、設定、圖鑑、戰鬥結算、確認對話框共用）
 * ------------------------------------------------------------------
 * 疊層順序即 DOM 順序；Esc 關閉最上層可關閉的 modal；關閉後歸還焦點。
 */

import { escapeHtml, on } from './dom.js';
import { icon } from './icons.js';

export function createModalManager(layer, { onChange = null } = {}) {
  const stack = [];
  let escListener = null;
  // 手機「返回鍵／返回手勢」可關閉最上層 modal，而不是離開網站
  let historyPushed = false;
  let ignoreNextPop = false;

  function pushModalHistory() {
    if (historyPushed) return;
    try {
      window.history.pushState({ sanjunqiModal: true }, '');
      historyPushed = true;
    } catch (e) { /* 某些環境不支援 history，忽略 */ }
  }

  function dropModalHistory() {
    if (!historyPushed) return;
    historyPushed = false;
    ignoreNextPop = true;
    try { window.history.back(); } catch (e) { ignoreNextPop = false; }
  }

  const onPopState = () => {
    if (ignoreNextPop) { ignoreNextPop = false; return; }
    if (!stack.some((m) => m.isOpen)) return;
    historyPushed = false;
    [...stack].reverse().forEach((m) => { try { m.close(); } catch (e) { /* 忽略 */ } });
  };
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('popstate', onPopState);
  }

  const notify = () => {
    if (typeof onChange === 'function') {
      try { onChange(stack.length); } catch (error) { console.error('[UI] modal onChange 發生錯誤', error); }
    }
  };

  function syncEsc() {
    if (stack.length && !escListener) {
      escListener = on(document, 'keydown', (event) => {
        if (event.key !== 'Escape') return;
        const top = [...stack].reverse().find((m) => m.isOpen && m.closable);
        if (top) {
          event.preventDefault();
          top.close();
        }
      });
    } else if (!stack.length && escListener) {
      escListener();
      escListener = null;
    }
  }

  function open(config = {}) {
    const {
      id = '',
      title = '',
      subtitle = '',
      iconName = '',
      size = 'md',
      className = '',
      closable = true,
      ariaLabel = '',
      headerExtra = '',
      onClose = null,
    } = config;

    const root = document.createElement('div');
    root.className = 'modal';
    if (id) root.dataset.modalId = id;
    root.innerHTML = `
      <div class="modal__scrim" data-modal-scrim></div>
      <div class="modal__panel modal__panel--${size}${className ? ` ${className}` : ''}" role="dialog" aria-modal="true" tabindex="-1" aria-label="${escapeHtml(ariaLabel || title || '對話框')}">
        <header class="modal__head">
          <div class="modal__heading">
            ${iconName ? `<span class="modal__icon">${icon(iconName)}</span>` : ''}
            <div class="modal__titles">
              <h2 class="modal__title">${escapeHtml(title)}</h2>
              ${subtitle ? `<p class="modal__subtitle">${escapeHtml(subtitle)}</p>` : ''}
            </div>
          </div>
          <div class="modal__head-extra">${headerExtra}</div>
          ${closable ? `<button type="button" class="icon-btn modal__close" data-modal-close aria-label="關閉">${icon('close')}</button>` : ''}
        </header>
        <div class="modal__body"></div>
        <footer class="modal__foot" hidden></footer>
      </div>`;

    const panel = root.querySelector('.modal__panel');
    const body = root.querySelector('.modal__body');
    const footer = root.querySelector('.modal__foot');
    const previousFocus = document.activeElement;

    const instance = {
      id, root, panel, body, footer, closable, isOpen: true,
      get title() { return panel.querySelector('.modal__title')?.textContent || ''; },
      setTitle(nextTitle, nextSubtitle) {
        const titleEl = panel.querySelector('.modal__title');
        if (titleEl) titleEl.textContent = nextTitle || '';
        const subEl = panel.querySelector('.modal__subtitle');
        if (subEl && nextSubtitle != null) subEl.textContent = nextSubtitle;
      },
      close,
    };

    function close() {
      if (!instance.isOpen) return;
      instance.isOpen = false;
      root.classList.remove('is-open');
      root.classList.add('is-closing');
      const index = stack.indexOf(instance);
      if (index >= 0) stack.splice(index, 1);
      if (!stack.some((m) => m.isOpen)) dropModalHistory();
      syncEsc();
      notify();
      window.setTimeout(() => {
        root.remove();
        if (previousFocus && typeof previousFocus.focus === 'function') {
          try { previousFocus.focus({ preventScroll: true }); } catch { /* 忽略 */ }
        }
        onCloseSafe();
      }, 260);
    }

    function onCloseSafe() {
      if (typeof onClose === 'function') {
        try { onClose(); } catch (error) { console.error('[UI] modal onClose 發生錯誤', error); }
      }
    }

    if (closable) {
      root.querySelectorAll('[data-modal-close]').forEach((btn) => {
        on(btn, 'click', (event) => { event.stopPropagation(); close(); });
      });
      on(root.querySelector('[data-modal-scrim]'), 'click', close);
    }

    layer.append(root);
    stack.push(instance);
    pushModalHistory();
    syncEsc();
    notify();
    requestAnimationFrame(() => {
      root.classList.add('is-open');
      panel.focus({ preventScroll: true });
    });

    return instance;
  }

  return {
    open,
    onPopState,
    closeTop() {
      const top = [...stack].reverse().find((m) => m.isOpen && m.closable);
      top?.close();
    },
    closeAll() {
      [...stack].reverse().forEach((m) => m.close());
    },
    get size() { return stack.length; },
    hasOpen() { return stack.some((m) => m.isOpen); },
  };
}

/** 確認對話框（回傳 modal 實例） */
export function confirmDialog(manager, options = {}) {
  const {
    title = '確認', message = '', detail = '',
    confirmText = '確定', cancelText = '取消', danger = false,
    onConfirm = null, onCancel = null, iconName = 'warning',
  } = options;

  // settled：一旦按下確認或取消，關閉時就不再觸發另一端 callback
  let settled = false;

  const modal = manager.open({
    title, size: 'sm', className: 'modal--confirm', iconName, closable: true,
    onClose: () => {
      if (!settled) {
        settled = true;
        if (typeof onCancel === 'function') onCancel();
      }
    },
  });

  modal.body.innerHTML = `<div class="confirm">
    <p class="confirm__message">${escapeHtml(message)}</p>
    ${detail ? `<p class="confirm__detail">${escapeHtml(detail)}</p>` : ''}
  </div>`;
  modal.footer.hidden = false;
  modal.footer.innerHTML = `<div class="modal__foot-actions">
    <button type="button" class="btn btn--ghost" data-confirm-cancel>${escapeHtml(cancelText)}</button>
    <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-confirm-ok>${escapeHtml(confirmText)}</button>
  </div>`;

  modal.footer.querySelector('[data-confirm-ok]').addEventListener('click', () => {
    if (settled) return;
    settled = true;
    modal.close();
    if (typeof onConfirm === 'function') onConfirm();
  });
  modal.footer.querySelector('[data-confirm-cancel]').addEventListener('click', () => {
    if (settled) return;
    settled = true;
    modal.close();
    if (typeof onCancel === 'function') onCancel();
  });
  return modal;
}

export default createModalManager;
