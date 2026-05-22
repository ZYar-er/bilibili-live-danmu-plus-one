import { TIMING, CONFIG, DM_NODE_SELECTOR, DM_CONTAINER_SELECTORS, UI } from './config.js';
import { state } from './state.js';
import { isElementAlive, pointInRect } from './utils.js';
import { getScope, isActivityShell } from './core/env-detector.js';
import { scanAndCache, findDmContainer, bindObserverTarget } from './core/observer.js';
import { hitTest } from './core/hit-test.js';
import { cacheParsed, getCachedParsed } from './core/danmu-cache.js';
import { getDmText } from './core/danmu-parser.js';
import { createPlusBtn, showBtn, hideBtn, mountOverlay, setupButtonEvents } from './ui/button.js';
import { freeze, clearCurrentHit } from './core/freeze.js';
import { initDebugPanel, ensureDebugPanelParent, setDbg, renderDebug } from './ui/debug-panel.js';
import { ensureSafeContainer } from './ui/safe-container.js';
import { sendDanmaku } from './sender/input-sender.js';
import { registerMenus } from './menus.js';

(function init() {
  if (isActivityShell()) {
    console.log('[DM+1] activity shell detected, skip init in top document');
    return;
  }

  function hasLocalDanmaku() {
    return !!(findDmContainer()
      || getScope().querySelector(DM_NODE_SELECTOR)
      || getScope().querySelector(DM_CONTAINER_SELECTORS.join(',')));
  }

  function hasDanmakuInIframes() {
    if (window.self !== window.top) return false;
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      try {
        var src = frames[i].src || frames[i].getAttribute('src') || '';
        if (src && src.indexOf('live.bilibili.com') === -1) continue;
        var d = frames[i].contentDocument;
        if (!d) continue;
        if (d.querySelector(DM_NODE_SELECTOR) || d.querySelector(DM_CONTAINER_SELECTORS.join(','))) return true;
      } catch (e) {}
    }
    return false;
  }

  if (!hasLocalDanmaku() && hasDanmakuInIframes()) {
    console.log('[DM+1] danmaku detected inside iframe, skip init in top document');
    return;
  }
  // ========= 创建 UI =========
  var plusBtn = createPlusBtn();
  initDebugPanel();
  ensureSafeContainer();

  // 注入 sendDanmaku 到按钮 click 事件
  setupButtonEvents().injectSender(sendDanmaku);

  // ========= mousemove =========
  var dmContainerCache = null;
  var containerRect = null, containerRectTime = 0;
  document.addEventListener('mousemove', function (e) {
    state.mouse.x = e.clientX;
    state.mouse.y = e.clientY;
    mouseDirty = true;

    // 有命中时保持循环（需要处理 leave/unfreeze），全屏时整个视口都是有效区
    if (state.currentHit || document.fullscreenElement) {
      scheduleFrame();
      return;
    }
    // 没有容器时不做任何调度（页面未加载或非直播页）
    if (!dmContainerCache) return;
    // 缓存容器 rect，1s TTL 避免每帧强制重排
    if (!containerRect || e.timeStamp - containerRectTime > 1000) {
      containerRect = dmContainerCache.getBoundingClientRect();
      containerRectTime = e.timeStamp;
    }
    if (pointInRect(e.clientX, e.clientY, containerRect, UI.HIT_PADDING_PX)) {
      scheduleFrame();
    }
  }, { capture: true, passive: true });

  // ========= 全屏 =========
  document.addEventListener('fullscreenchange', function () {
    mountOverlay();
    ensureSafeContainer();
    ensureDebugPanelParent();
    state.dmObserverTarget = null;
    containerRect = null;
    setDbg('fullscreen', !!document.fullscreenElement);
    scheduleFrame();
  });

  // ========= 主循环 =========
  var lastTickTime = 0;
  var frameCount = 0;
  var containerWaitTimer = 0;
  var mouseDirty = false;
  var lastObserverContainer = null;

  function scheduleFrame() {
    if (state.rafScheduled) return;
    state.rafScheduled = true;
    requestAnimationFrame(tick);
  }

  function startContainerWaiter() {
    if (containerWaitTimer) return;
    containerWaitTimer = setInterval(function () {
      var container = findDmContainer();
      if (container) {
        dmContainerCache = container;
        containerRect = null;
        scanAndCache(container);
        clearInterval(containerWaitTimer);
        containerWaitTimer = 0;
        scheduleFrame();
      }
    }, TIMING.DM_WAIT_POLL_MS);
  }

  function resolvePayload(el) {
    var cached = getCachedParsed(el);
    if (cached && el.textContent === cached._raw) return cached;
    var parsed = getDmText(el);
    if (cached) cached._raw = el.textContent;
    if (!cached || cached.text !== parsed.text || cached.type !== parsed.type) {
      cacheParsed(el, parsed);
      cached = parsed;
    }
    return cached;
  }

  function handleNoHit() {
    if (!state.currentHit) return;
    if (state.leaveTimer) return;
    state.leaveTimer = setTimeout(function () {
      state.leaveTimer = 0;
      hideBtn();
      clearCurrentHit();
      setDbg('hitSource', '');
      setDbg('hitSelector', '');
      setDbg('hitRect', '');
    }, TIMING.LEAVE_DELAY_MS);
  }

  function tick() {
    state.rafScheduled = false;
    lastTickTime = performance.now();
    var dmContainer = findDmContainer();
    if (CONFIG.debug) setDbg('mouse', state.mouse.x + ',' + state.mouse.y);

    if (dmContainer !== dmContainerCache) containerRect = null;
    dmContainerCache = dmContainer;

    if (!dmContainer) {
      state.noPlayerCount++;
      startContainerWaiter();
      if (state.noPlayerCount > TIMING.NO_PLAYER_THRESHOLD) {
        setTimeout(function () { scheduleFrame(); }, TIMING.LOW_FREQ_POLL_MS);
        return;
      }
    } else {
      state.noPlayerCount = 0;
    }

    mountOverlay();
    ensureSafeContainer();
    ensureDebugPanelParent();
    if (dmContainer !== lastObserverContainer || !state.dmObserverTarget) {
      bindObserverTarget(dmContainer);
      lastObserverContainer = dmContainer;
    }
    if (CONFIG.debug) setDbg('frame', ++frameCount);

    if (state.currentHit && state.currentHit.el && !isElementAlive(state.currentHit.el)) {
      hideBtn();
      clearCurrentHit();
    }

    // 鼠标移动时才跑 hitTest，静止时跳过（保留按钮跟随即可）
    if (mouseDirty) {
      mouseDirty = false;
      var hit = hitTest(state.mouse.x, state.mouse.y, dmContainer);
      if (!hit) {
        handleNoHit();
      } else {
        if (state.leaveTimer) { clearTimeout(state.leaveTimer); state.leaveTimer = 0; }
        var payload = resolvePayload(hit.el);
        if (!payload.text) {
          handleNoHit();
        } else {
          if (!state.currentHit || state.currentHit.el !== hit.el) {
            if (state.currentHit) { hideBtn(); clearCurrentHit(); }
            state.currentHit = { el: hit.el, text: payload.text, type: payload.type };
            freeze(hit.el);
            state.frozenRect = hit.rect;
            showBtn(hit.el, state.frozenRect);
          } else {
            state.currentHit.text = payload.text;
            state.currentHit.type = payload.type;
          }
          setDbg('hitText', payload.text);
          setDbg('hitType', payload.type);
          setDbg('hitSource', hit.source || '');
          setDbg('hitSelector', hit.selector || '');
          setDbg('hitRect', hit.rectText || '');
          setDbg('currentConnected', true);
        }
      }
    }

    if (state.currentHit && state.currentHit.el) {
      setDbg('currentConnected', isElementAlive(state.currentHit.el));
    }

    // 仅鼠标移动时继续循环，静止即停
    if (mouseDirty) {
      scheduleFrame();
    }
  }

  // ========= 初始化 =========
  setDbg('fullscreen', !!document.fullscreenElement);
  setDbg('cooldownMs', CONFIG.cooldownMs);
  setDbg('enableSendCooldown', CONFIG.enableSendCooldown);
  renderDebug();
  registerMenus(plusBtn);

  // 初始扫描
  var container = findDmContainer();
  if (container) scanAndCache(container);
  else setDbg('dmCount', 0);
  startContainerWaiter();

  // 定期兜底扫描（高频，减少漏绑）
  setInterval(function () {
    var scope = findDmContainer();
    if (scope) scanAndCache(scope, { invalidate: true });
    else setDbg('dmCount', 0);
  }, TIMING.DM_SCAN_POLL_MS);

  scheduleFrame();
  console.log('[DM+1] ' + (typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev') + ' loaded');
})();
