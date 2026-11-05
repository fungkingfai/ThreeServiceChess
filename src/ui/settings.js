/**
 * 設定 modal
 * ------------------------------------------------------------------
 * 音效、戰鬥揭露棋子、AI 難度、視角提示。
 * 任何變更立即透過 onChange(settings, changedKey) 通知 main.js；
 * 由 UI 負責保存於 localStorage（可用 deps.persistSettings=false 關閉）。
 */

import { DEFAULT_SETTINGS, DIFFICULTY_META } from './data.js';
import { escapeHtml, $, $$, delegate } from './dom.js';

function switchRow(key, title, desc, checked) {
  return `<div class="setting-row">
    <div class="setting-row__text">
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(desc)}</p>
    </div>
    <button type="button" class="switch${checked ? ' is-on' : ''}" role="switch" aria-checked="${checked ? 'true' : 'false'}" aria-label="${escapeHtml(title)}" data-toggle="${escapeHtml(key)}">
      <span class="switch__knob"></span>
    </button>
  </div>`;
}

const SETTING_ROWS = [
  ['sound', '音效', '落子、戰鬥、爆破與勝利的合成音效；關閉後完全靜音。'],
  ['revealOnBattle', '戰鬥揭露棋子', '戰鬥時公開雙方棋種。關閉後只顯示戰鬥結果（不公開棋種），挑戰性更高。'],
  ['viewHints', '視角提示', '顯示可移動／可攻擊提示與鏡頭輔助。關閉後畫面更乾淨，但需要自行判斷落點。'],
];

/**
 * 開啟設定
 * @param {object} manager modal 管理器
 * @param {object} options { settings, onChange(settings, changedKey), onClose }
 */
export function openSettingsModal(manager, { settings = {}, onChange = null, onClose = null } = {}) {
  const state = { ...DEFAULT_SETTINGS, ...settings };

  const modal = manager.open({
    id: 'settings',
    title: '設定',
    subtitle: '對局、顯示與 AI 偏好',
    iconName: 'settings',
    size: 'md',
    className: 'modal--settings',
    onClose,
  });

  modal.body.innerHTML = `
    <div class="settings">
      <section class="settings__group">
        <h3 class="settings__group-title">顯示與聲音</h3>
        ${SETTING_ROWS.map(([key, title, desc]) => switchRow(key, title, desc, !!state[key])).join('')}
      </section>
      <section class="settings__group">
        <h3 class="settings__group-title">AI 難度</h3>
        <div class="difficulty" role="radiogroup" aria-label="AI 難度">
          ${Object.values(DIFFICULTY_META).map((diff) => `
            <button type="button" class="difficulty__btn${state.difficulty === diff.key ? ' is-active' : ''}" role="radio" aria-checked="${state.difficulty === diff.key ? 'true' : 'false'}" data-difficulty="${diff.key}">
              <span class="difficulty__label">${escapeHtml(diff.label)}</span>
              <span class="difficulty__desc">${escapeHtml(diff.desc)}</span>
            </button>`).join('')}
        </div>
        <p class="settings__hint">難度會在下一局生效；目前這一局不受影響。</p>
      </section>
      <section class="settings__group settings__group--note">
        <div class="settings__note">
          <span class="settings__note-icon">i</span>
          <p>設定會自動保存在此瀏覽器。AI 永遠看不到你未曝光的棋子——提高難度只會讓它更會推理，不會偷看。</p>
        </div>
      </section>
    </div>`;

  modal.footer.hidden = false;
  modal.footer.innerHTML = `<div class="modal__foot-actions">
    <button type="button" class="btn btn--ghost" data-settings-reset>重設為預設</button>
    <button type="button" class="btn btn--primary" data-settings-done>完成</button>
  </div>`;

  const emit = (changedKey) => {
    if (typeof onChange === 'function') onChange({ ...state }, changedKey);
  };

  delegate(modal.body, '[data-toggle]', 'click', (_event, btn) => {
    const key = btn.dataset.toggle;
    state[key] = !state[key];
    btn.classList.toggle('is-on', !!state[key]);
    btn.setAttribute('aria-checked', state[key] ? 'true' : 'false');
    emit(key);
  });

  delegate(modal.body, '[data-difficulty]', 'click', (_event, btn) => {
    const next = btn.dataset.difficulty;
    if (state.difficulty === next) return;
    state.difficulty = next;
    for (const other of $$('[data-difficulty]', modal.body)) {
      const isActive = other.dataset.difficulty === next;
      other.classList.toggle('is-active', isActive);
      other.setAttribute('aria-checked', isActive ? 'true' : 'false');
    }
    emit('difficulty');
  });

  delegate(modal.footer, '[data-settings-done]', 'click', () => modal.close());
  delegate(modal.footer, '[data-settings-reset]', 'click', () => {
    Object.assign(state, DEFAULT_SETTINGS);
    for (const btn of $$('[data-toggle]', modal.body)) {
      const on = !!state[btn.dataset.toggle];
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    for (const btn of $$('[data-difficulty]', modal.body)) {
      const isActive = btn.dataset.difficulty === state.difficulty;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
    }
    emit('reset');
  });

  return { modal, state };
}

export default openSettingsModal;
