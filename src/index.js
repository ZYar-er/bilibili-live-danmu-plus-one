import { TIMING, CONFIG, UI, storageSet, PLAYER_SELECTORS } from './config.js';
import { state } from './state.js';
import { root, isElementAlive } from './utils.js';
import { isMainFrame, getScope } from './core/env-detector.js';
import { scanAndBind, findDmContainer, bindObserverTarget } from './core/observer.js';
import { createPlusBtn, showBtn, hideBtn, placeBtnTick, mountOverlay, setupButtonEvents, clearCurrentHit } from './ui/button.js';
import { initDebugPanel, ensureDebugPanelParent, setDbg, renderDebug } from './ui/debug-panel.js';
import { ensureSafeContainer } from './ui/safe-container.js';
import { sendDanmaku } from './sender/input-sender.js';

(function init() {
  // ========= 活动 iframe 防护 =========
  if (!isMainFrame()) {
    console.log('[DM+1] activity iframe detected, skipping init');
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
    setDbg('mouse', state.mouse.x + ',' + state.mouse.y);
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
        scanAndBind(container);
        clearInterval(containerWaitTimer);
        containerWaitTimer = 0;
      }
    }, TIMING.DM_WAIT_POLL_MS);
  }

  function tick() {
    state.rafScheduled = false;
    lastTickTime = performance.now();
    var dmContainer = findDmContainer();

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

    // 按钮跟随
    if (state.currentHit && state.currentHit.el) {
      setDbg('currentConnected', isElementAlive(state.currentHit.el));
      placeBtnTick(state.currentHit.el);
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
  var container = findDmContainer() || getScope().querySelector(PLAYER_SELECTORS) || getScope();
  scanAndBind(container);
  startContainerWaiter();

  // 定期兜底扫描（高频，减少漏绑）
  setInterval(function () {
    var scope = findDmContainer() || getScope().querySelector(PLAYER_SELECTORS) || getScope();
    scanAndBind(scope);
  }, TIMING.DM_SCAN_POLL_MS);

  scheduleFrame();
  console.log('[DM+1] v0.0.1 loaded');
})();
