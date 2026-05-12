export function getScope() {
  return document.fullscreenElement || document;
}

export function getPageWindow() {
  if (typeof unsafeWindow !== 'undefined') return unsafeWindow;
  return window;
}

export function isActivityShell() {
  if (window.self !== window.top) return false;
  var pageWin = getPageWindow();
  if (pageWin && pageWin.__BILIACT_ENV__) return true;
  var root = document.documentElement;
  if (root && root.getAttribute && root.getAttribute('data-match-theme') && root.lang === 'zh-Hans') {
    if (document.querySelector('[data-module="eva-page"]')) return true;
  }
  return false;
}
