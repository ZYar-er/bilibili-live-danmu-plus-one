export function isMainFrame() {
  if (window.self === window.top) return true;
  return !/\/activity\/|\/blackboard\//.test(location.href);
}

export function getScope() {
  return document.fullscreenElement || document;
}
