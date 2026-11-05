/**
 * 內嵌 SVG 圖示集（不使用外部圖片／CDN，離線可用）
 * ------------------------------------------------------------------
 * 圖示一律 currentColor，線條圖示用 stroke、軍種徽記用實心，
 * 尺寸由 CSS 的 .ico 控制（預設 1em）。
 */

const STROKE_PATHS = {
  settings:
    '<path d="M4 7h7"/><circle cx="14.5" cy="7" r="2.2"/><path d="M16.7 7H20"/>' +
    '<path d="M4 12h2.3"/><circle cx="9" cy="12" r="2.2"/><path d="M11.2 12H20"/>' +
    '<path d="M4 17h9.8"/><circle cx="16.6" cy="17" r="2.2"/><path d="M18.8 17H20"/>',
  book:
    '<path d="M12 6.4C10.8 5 8.8 4.2 6.5 4.2H4v13.6h2.5c2.3 0 4.3.8 5.5 2.2 1.2-1.4 3.2-2.2 5.5-2.2H20V4.2h-2.5c-2.3 0-4.3.8-5.5 2.2Z"/>' +
    '<path d="M12 6.4V20"/>',
  grid:
    '<rect x="3.6" y="3.6" width="7" height="7" rx="1.6"/><rect x="13.4" y="3.6" width="7" height="7" rx="1.6"/>' +
    '<rect x="3.6" y="13.4" width="7" height="7" rx="1.6"/><rect x="13.4" y="13.4" width="7" height="7" rx="1.6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M4.6 12.6l4.8 4.8L19.6 6.6"/>',
  soundOn:
    '<path d="M4 9.4h3.2L12 5.3v13.4L7.2 14.6H4Z"/>' +
    '<path d="M15.2 8.6a4.8 4.8 0 0 1 0 6.8"/><path d="M17.9 6a8.4 8.4 0 0 1 0 12"/>',
  soundOff:
    '<path d="M4 9.4h3.2L12 5.3v13.4L7.2 14.6H4Z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  sword:
    '<path d="M19.8 4.2 12 12M19.8 4.2h-3.6M19.8 4.2v3.6M4.2 19.8l4.4-4.4"/>' +
    '<path d="M4.2 19.8l-.9-2.6 2.6.9M7.9 16.1l-2.1-2.1M18 18l-2-2M6 6l2 2"/>',
  skull:
    '<path d="M12 3.2a7.4 7.4 0 0 0-4.4 13.4v2.9h8.8v-2.9A7.4 7.4 0 0 0 12 3.2Z"/>' +
    '<circle cx="9.2" cy="11.4" r="1.35" fill="currentColor" stroke="none"/>' +
    '<circle cx="14.8" cy="11.4" r="1.35" fill="currentColor" stroke="none"/>' +
    '<path d="M11 16.6v2.9M13 16.6v2.9"/>',
  trophy:
    '<path d="M8 4h8v4.4a4 4 0 0 1-8 0Z"/><path d="M8 5.2H5.2v1.9A3.4 3.4 0 0 0 8.6 10.5"/>' +
    '<path d="M16 5.2h2.8v1.9a3.4 3.4 0 0 1-3.4 3.4"/><path d="M12 12.6V17"/><path d="M8 20.4h8"/><path d="M9.4 17h5.2l.8 3.4H8.6Z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 3.6V9h-5.4"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 3.6V9h5.4"/>',
  play: '<path d="M8.6 4.8 20 12 8.6 19.2Z"/>',
  eye: '<path d="M2.6 12S6.2 5.6 12 5.6 21.4 12 21.4 12 17.8 18.4 12 18.4 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.9"/>',
  eyeOff:
    '<path d="M4.4 8.1C3.2 9.5 2.6 12 2.6 12S6.2 18.4 12 18.4c1.9 0 3.6-.7 5-1.7"/>' +
    '<path d="M9.2 6c.9-.3 1.9-.4 2.8-.4 5.8 0 9.4 6.4 9.4 6.4s-1 1.9-2.8 3.6"/><path d="M4 4l16 16"/>',
  target: '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="3.2"/><path d="M12 1.8v3.4M12 18.8v3.4M1.8 12h3.4M18.8 12h3.4"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 10.8v5.4"/><circle cx="12" cy="7.9" r="1" fill="currentColor" stroke="none"/>',
  arrowRight: '<path d="M4 12h15"/><path d="M13.2 6l6 6-6 6"/>',
  hourglass: '<path d="M7 3h10M7 21h10"/><path d="M8.2 3v3.6c0 2.2 3.8 3.6 3.8 5.4s-3.8 3.2-3.8 5.4V21"/>' +
    '<path d="M15.8 3v3.6c0 2.2-3.8 3.6-3.8 5.4s3.8 3.2 3.8 5.4V21"/>',
  user: '<circle cx="12" cy="8.4" r="3.5"/><path d="M4.8 20.4a7.2 7.2 0 0 1 14.4 0"/>',
  cpu:
    '<rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2"/><rect x="10" y="10" width="4" height="4" rx=".8"/>' +
    '<path d="M9 3v3.4M12 3v3.4M15 3v3.4M9 17.6V21M12 17.6V21M15 17.6V21M3 9h3.4M3 12h3.4M3 15h3.4M17.6 9H21M17.6 12H21M17.6 15H21"/>',
  log: '<path d="M5 4.6h14v14.8H5z"/><path d="M8.2 8.4h7.6M8.2 12h7.6M8.2 15.6h4.8"/>',
  warning: '<path d="M12 3.6 21 20H3Z"/><path d="M12 9.4v4.6"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>',
  chevronDown: '<path d="M6 9.4l6 6 6-6"/>',
  chevronRight: '<path d="M9.4 6l6 6-6 6"/>',
  chevronLeft: '<path d="M14.6 6l-6 6 6 6"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  flag: '<path d="M6 21V4.2h10.6l-2 4 2 4H6"/><path d="M6 4.2H3.4"/>',
  sparkles:
    '<path d="M12 3.6l1.7 4.3 4.3 1.7-4.3 1.7L12 15.6l-1.7-4.3L6 9.6l4.3-1.7Z"/>' +
    '<path d="M18.6 14.4l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9Z"/>' +
    '<path d="M5 15.4l.7 1.6 1.6.7-1.6.7L5 20l-.7-1.6-1.6-.7 1.6-.7Z"/>',
  dice:
    '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3"/>' +
    '<circle cx="8.4" cy="8.4" r="1.15" fill="currentColor" stroke="none"/>' +
    '<circle cx="15.6" cy="8.4" r="1.15" fill="currentColor" stroke="none"/>' +
    '<circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/>' +
    '<circle cx="8.4" cy="15.6" r="1.15" fill="currentColor" stroke="none"/>' +
    '<circle cx="15.6" cy="15.6" r="1.15" fill="currentColor" stroke="none"/>',
  medal:
    '<circle cx="12" cy="14.6" r="5.2"/><path d="M8.4 9.6 6.6 3h4.2L12 6.4 13.2 3h4.2l-1.8 6.6"/>' +
    '<path d="M12 12.2l.9 1.9 2.1.3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.4 2.1-.3Z"/>',
  compass:
    '<circle cx="12" cy="12" r="8.6"/><path d="M15.4 8.6l-2 4.8-4.8 2 2-4.8Z"/>',
  crosshair:
    '<path d="M12 3v4.2M12 16.8V21M3 12h4.2M16.8 12H21"/><circle cx="12" cy="12" r="3.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  anchorTiny:
    '<path d="M12 4.4a2 2 0 0 1 .8 3.8v2.3h2.9v1.8h-2.9v4.6c2.6-.4 4.2-2 4.7-4.2h1.9c-.6 3.8-3.3 6.2-6.6 6.2s-6-2.4-6.6-6.2h1.9c.5 2.2 2.1 3.8 4.7 4.2v-4.6H9.5V10.5h2.9V8.2A2 2 0 0 1 12 4.4Z"/>',
};

const SOLID_PATHS = {
  /** 陸軍：盾徽 */
  army:
    '<path d="M12 2.6 4.6 5.5v6.2c0 4.6 3.1 8.1 7.4 9.7 4.3-1.6 7.4-5.1 7.4-9.7V5.5L12 2.6Zm0 4.1 1.5 3.1 3.4.5-2.4 2.4.6 3.4-3.1-1.7-3.1 1.7.6-3.4-2.4-2.4 3.4-.5L12 6.7Z"/>',
  /** 海軍：船錨 */
  navy:
    '<path d="M12 2.2a2.6 2.6 0 0 0-.9 5v2.2H8.4v2h2.7v4.2a6.3 6.3 0 0 1-4.4-3.6H4.4c.7 3.9 3.6 6.7 6.7 7.2v1.4h1.8v-1.4c3.1-.5 6-3.3 6.7-7.2h-2.3a6.3 6.3 0 0 1-4.4 3.6v-4.2h2.7v-2h-2.7V7.2a2.6 2.6 0 0 0-.9-5Zm0 1.7a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Z"/>',
  /** 空軍：戰機俯視 */
  air:
    '<path d="M12 2.1c.8 0 1.35.85 1.35 1.9v4.1l7.05 4.15v2.05l-7.05-2.1v3.95l2.2 1.8v1.7L12 18.5l-3.55 1.15v-1.7l2.2-1.8v-3.95l-7.05 2.1V12.2L10.65 8V4c0-1.05.55-1.9 1.35-1.9Z"/>',
  /** 軍旗 */
  flagSolid:
    '<path d="M5.6 2.4h1.9v19.2H5.6Z"/><path d="M8.2 4.1h11.2l-2.4 4.2 2.4 4.2H8.2Z"/>',
  /** 星形（選中／勝場標記） */
  star: '<path d="M12 2.9 14.7 8.4l6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.3l6.1-.9Z"/>',
  /** 菱形（資訊標記） */
  diamond: '<path d="M12 2.8 21.2 12 12 21.2 2.8 12Z"/>',
};

const SIZE_ATTR = 'viewBox="0 0 24 24" aria-hidden="true" focusable="false"';

/** 取得線條圖示 SVG 字串 */
export function strokeIcon(name, className = '') {
  const paths = STROKE_PATHS[name] || STROKE_PATHS.info;
  return `<svg class="ico${className ? ` ${className}` : ''}" ${SIZE_ATTR} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/** 取得實心圖示 SVG 字串 */
export function solidIcon(name, className = '') {
  const paths = SOLID_PATHS[name] || '';
  return `<svg class="ico ico--solid${className ? ` ${className}` : ''}" ${SIZE_ATTR} fill="currentColor" stroke="none">${paths}</svg>`;
}

/** 以名稱取得圖示（先找線條、再找實心） */
export function icon(name, className = '') {
  if (STROKE_PATHS[name]) return strokeIcon(name, className);
  return solidIcon(name, className);
}

/** 軍種徽記（solid：army / navy / air，其他當一般圖示） */
export function branchIcon(branch, className = '') {
  if (branch === 'army') return solidIcon('army', className);
  if (branch === 'navy') return solidIcon('navy', className);
  if (branch === 'air') return solidIcon('air', className);
  return solidIcon('star', className);
}

export const ICON_NAMES = Object.keys(STROKE_PATHS);
export default { icon, strokeIcon, solidIcon, branchIcon, ICON_NAMES };
