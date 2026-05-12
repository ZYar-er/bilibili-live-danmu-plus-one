import { TIMING, CONFIG, UI, storageSet, PLAYER_SELECTORS, DM_NODE_SELECTOR, DM_CONTAINER_SELECTORS } from './config.js';
import { state } from './state.js';
import { isElementAlive } from './utils.js';
import { getScope, isActivityShell } from './core/env-detector.js';
import { scanAndCache, findDmContainer, bindObserverTarget } from './core/observer.js';
import { hitTest, cacheParsed, getCachedParsed } from './core/hit-test.js';
import { getDmText } from './core/danmu-parser.js';
import { createPlusBtn, showBtn, hideBtn, placeBtnTick, mountOverlay, setupButtonEvents, clearCurrentHit, freeze } from './ui/button.js';
import { initDebugPanel, ensureDebugPanelParent, setDbg, renderDebug } from './ui/debug-panel.js';
import { ensureSafeContainer } from './ui/safe-container.js';
import { sendDanmaku } from './sender/input-sender.js';

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

  // ========= 按钮 mouseenter/mouseleave =========
  plusBtn.addEventListener('mouseenter', function () {
    if (state.leaveTimer) { clearTimeout(state.leaveTimer); state.leaveTimer = 0; }
  });
  plusBtn.addEventListener('mouseleave', function () {
    state.leaveTimer = setTimeout(function () {
      state.leaveTimer = 0;
      hideBtn();
      clearCurrentHit();
    }, TIMING.LEAVE_DELAY_MS);
  });

  // ========= mousemove（仅 debug 用）=========
  document.addEventListener('mousemove', function (e) {
    state.mouse.x = e.clientX;
    state.mouse.y = e.clientY;
    scheduleFrame();
  }, { capture: true, passive: true });

  // ========= 全屏 =========
  document.addEventListener('fullscreenchange', function () {
    mountOverlay();
    ensureSafeContainer();
    ensureDebugPanelParent();
    state.dmObserverTarget = null;
    setDbg('fullscreen', !!document.fullscreenElement);
    scheduleFrame();
  });

  // ========= 主循环 =========
  var lastTickTime = 0;
  var containerWaitTimer = 0;

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
        scanAndCache(container);
        clearInterval(containerWaitTimer);
        containerWaitTimer = 0;
      }
    }, TIMING.DM_WAIT_POLL_MS);
  }

  function resolvePayload(el) {
    var cached = getCachedParsed(el);
    var parsed = getDmText(el);
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
    bindObserverTarget();
    setDbg('frame', 1); // debug 计数简化

    if (state.currentHit && state.currentHit.el && !isElementAlive(state.currentHit.el)) {
      hideBtn();
      clearCurrentHit();
    }

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

    // 按钮跟随
    if (state.currentHit && state.currentHit.el) {
      setDbg('currentConnected', isElementAlive(state.currentHit.el));
      placeBtnTick(state.currentHit.el, state.frozenRect);
    }

    scheduleFrame();
  }

  // ========= Tampermonkey 菜单 =========
  function registerMenus() {
    try {
      GM_registerMenuCommand('切换发送冷却', function () {
        CONFIG.enableSendCooldown = !CONFIG.enableSendCooldown;
        storageSet('enableSendCooldown', CONFIG.enableSendCooldown);
        setDbg('enableSendCooldown', CONFIG.enableSendCooldown);
      });

      CONFIG.cooldownMsOptions.forEach(function (ms) {
        var label = ms === 0 ? '无间隔' : (ms / 1000).toFixed(1) + 's';
        GM_registerMenuCommand('发送间隔 → ' + label, function () {
          CONFIG.cooldownMs = ms;
          storageSet('cooldownMs', ms);
          setDbg('cooldownMs', ms);
          console.log('[DM+1] 发送间隔:', label);
        });
      });

      GM_registerMenuCommand('切换按钮透明度', function () {
        var opts = UI.OPACITY_OPTIONS;
        var idx = opts.indexOf(CONFIG.btnOpacity);
        CONFIG.btnOpacity = opts[(idx + 1) % opts.length];
        storageSet('btnOpacity', CONFIG.btnOpacity);
        plusBtn.style.opacity = CONFIG.btnOpacity;
      });

      GM_registerMenuCommand('切换调试面板', function () {
        CONFIG.debug = !CONFIG.debug;
        storageSet('debug', CONFIG.debug);
        var dp = document.querySelector('[data-dm1-debug]');
        if (dp) dp.style.display = CONFIG.debug ? 'block' : 'none';
        if (CONFIG.debug) { renderDebug(); }
      });

      GM_registerMenuCommand('重置所有设置', function () {
        ['enableSendCooldown', 'cooldownMs', 'debug', 'btnOpacity'].forEach(function (k) {
          try { GM_deleteValue && GM_deleteValue(k); } catch (e) {}
          try { localStorage.removeItem('dm1_' + k); } catch (e) {}
        });
        location.reload();
      });
    } catch (e) {}
  }

  // ========= 初始化 =========
  setDbg('fullscreen', !!document.fullscreenElement);
  setDbg('cooldownMs', CONFIG.cooldownMs);
  setDbg('enableSendCooldown', CONFIG.enableSendCooldown);
  renderDebug();
  registerMenus();

  // 初始扫描
  var container = findDmContainer();
  if (container) scanAndCache(container);
  else setDbg('dmCount', 0);
  startContainerWaiter();

  // 定期兜底扫描（高频，减少漏绑）
  setInterval(function () {
    var scope = findDmContainer();
    if (scope) scanAndCache(scope);
    else setDbg('dmCount', 0);
  }, TIMING.DM_SCAN_POLL_MS);

  scheduleFrame();
  console.log('[DM+1] v0.0.1 loaded');
})();
