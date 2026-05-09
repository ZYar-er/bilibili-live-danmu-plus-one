// 常量
export const TIMING = {
  CLICK_DEBOUNCE_MS: 320,
  FEEDBACK_MS: 280,
  GHOST_CLEANUP_MS: 30000,
  NO_PLAYER_THRESHOLD: 30,
  LOW_FREQ_POLL_MS: 2000,
  LEAVE_DELAY_MS: 50,
};

export const UI = {
  HIT_PADDING_PX: 2,
  MARGIN_PX: 8,
  HORIZONTAL_RATIO: 0.4,
  BTN_APPROX_W: 42,
  BTN_APPROX_H: 26,
  Z_INDEX: 2147483647,
  OPACITY_OPTIONS: [0.3, 0.5, 0.7, 0.8, 0.95],
};

export const EMOJI_FALLBACK = '[表情]';

export const DM_CONTAINER_SEL = '.bili-danmaku-x-dm';
export const DM_SCAN_SEL = '.bili-danmaku-x-dm, .bili-danmaku-x-roll';
export const PLAYER_SELECTORS = '.bilibili-live-player-video, #live-player, .live-player-container';

// 持久化
export function storageGet(key, def) {
  try { const v = GM_getValue(key); if (v !== void 0) return v; } catch (e) { /* ignore */ }
  try { const v = localStorage.getItem('dm1_' + key); if (v !== null) return JSON.parse(v); } catch (e) { /* ignore */ }
  return def;
}

export function storageSet(key, val) {
  try { GM_setValue(key, val); } catch (e) { /* ignore */ }
  try { localStorage.setItem('dm1_' + key, JSON.stringify(val)); } catch (e) { /* ignore */ }
}

export const CONFIG = {
  enableSendCooldown: storageGet('enableSendCooldown', true),
  cooldownMs: storageGet('cooldownMs', 2000),
  cooldownMsOptions: [0, 300, 600, 1200, 2000, 3000],
  appendPlusOne: false,
  debug: storageGet('debug', false),
  btnOpacity: storageGet('btnOpacity', 0.8),
};
