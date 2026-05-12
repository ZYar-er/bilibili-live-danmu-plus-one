export const state = {
  currentHit: null,       // { el, text, type }
  frozenRect: null,
  lastSendAt: 0,
  lastClickAt: 0,
  clickLocked: false,
  mouse: { x: 0, y: 0 },
  rafScheduled: false,
  noPlayerCount: 0,
  dmObserverTarget: null,
  leaveTimer: 0,
};
