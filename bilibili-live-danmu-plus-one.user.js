// ==UserScript==
// @name         B站直播弹幕 +1
// @name:zh-CN   B站直播弹幕 +1
// @namespace    https://github.com/ZYar-er/bilibili-live-danmu-plus-one
// @version      0.0.1
// @description  鼠标悬停弹幕即可一键发送同款弹幕+1，支持文字/emoji/表情图片，可配置发送间隔
// @description:zh-CN  鼠标悬停弹幕即可一键发送同款弹幕+1，支持文字/emoji/表情图片，可配置发送间隔
// @author       ZYar-er
// @license      MIT
// @match        *://live.bilibili.com/0*
// @match        *://live.bilibili.com/1*
// @match        *://live.bilibili.com/2*
// @match        *://live.bilibili.com/3*
// @match        *://live.bilibili.com/4*
// @match        *://live.bilibili.com/5*
// @match        *://live.bilibili.com/6*
// @match        *://live.bilibili.com/7*
// @match        *://live.bilibili.com/8*
// @match        *://live.bilibili.com/9*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @homepageURL  https://github.com/ZYar-er/bilibili-live-danmu-plus-one
// @supportURL   https://github.com/ZYar-er/bilibili-live-danmu-plus-one/issues
// @updateURL    https://github.com/ZYar-er/bilibili-live-danmu-plus-one/raw/master/bilibili-live-danmu-plus-one.user.js
// @downloadURL  https://github.com/ZYar-er/bilibili-live-danmu-plus-one/raw/master/bilibili-live-danmu-plus-one.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ==================== 常量 ====================

  const TIMING = {
    CLICK_DEBOUNCE_MS: 320,
    FEEDBACK_MS: 280,
    GHOST_CLEANUP_MS: 30000,
    NO_PLAYER_THRESHOLD: 30,
    LOW_FREQ_POLL_MS: 2000,
  };

  const UI = {
    HIT_PADDING_PX: 2,
    MARGIN_PX: 8,
    HORIZONTAL_RATIO: 0.4,
    BTN_APPROX_W: 42,
    BTN_APPROX_H: 26,
    Z_INDEX: 2147483647,
    OPACITY_OPTIONS: [0.3, 0.5, 0.7, 0.8, 0.95],
  };

  const EMOJI_FALLBACK = '[表情]';

  const DANMU_CONTAINER_SELECTORS = [
    '.bili-danmaku-x-dm',
    '.live-player-dm-wrap',
    '.bilibili-live-player-video-danmaku',
  ];

  const PLAYER_SELECTORS = '.bilibili-live-player-video, #live-player, .live-player-container';

  // ==================== 配置持久化 ====================

  function storageGet(key, def) {
    try { const v = GM_getValue(key); if (v !== void 0) return v; } catch (e) { /* ignore */ }
    try { const v = localStorage.getItem('dm1_' + key); if (v !== null) return JSON.parse(v); } catch (e) { /* ignore */ }
    return def;
  }

  function storageSet(key, val) {
    try { GM_setValue(key, val); } catch (e) { /* ignore */ }
    try { localStorage.setItem('dm1_' + key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }

  const CONFIG = {
    enableSendCooldown: storageGet('enableSendCooldown', true),
    cooldownMs: storageGet('cooldownMs', 2000),
    cooldownMsOptions: [0, 300, 600, 1200, 2000, 3000],

    appendPlusOne: false,

    debug: storageGet('debug', false),
    btnOpacity: storageGet('btnOpacity', 0.8),
  };

  // ==================== 运行时状态 ====================

  const state = {
    currentHit: null,       // {el, text, type}
    lastSendAt: 0,
    lastClickAt: 0,
    clickLocked: false,

    mouse: { x: 0, y: 0 },  // 仅用于 debug 显示

    rafScheduled: false,
    noPlayerCount: 0,
    dmObserverTarget: null,
  };

  // ==================== DOM 元素 ====================

  function root() {
    return document.fullscreenElement || document.body;
  }

  const plusBtn = document.createElement('button');
  plusBtn.textContent = '+1';
  plusBtn.style.cssText = `
    position: fixed;
    display: none;
    z-index: ${UI.Z_INDEX};
    padding: 4px 10px;
    border: 1px solid rgba(255,255,255,.82);
    border-radius: 8px;
    background: rgba(0,0,0,.86);
    color: #fff;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    user-select: none;
    pointer-events: auto;
    box-shadow: 0 2px 10px rgba(0,0,0,.4);
    transform: translate(-50%, -50%);
    will-change: left, top;
    opacity: ${CONFIG.btnOpacity};
  `;

  const debugPanel = document.createElement('div');
  debugPanel.style.cssText = `
    position: fixed;
    left: 10px;
    top: 10px;
    z-index: ${UI.Z_INDEX};
    min-width: 360px;
    max-width: 52vw;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(0,0,0,.72);
    color: #7CFFB2;
    font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    white-space: pre-wrap;
    word-break: break-all;
    pointer-events: none;
    display: ${CONFIG.debug ? 'block' : 'none'};
  `;

  const dmSafeContainer = document.createElement('div');
  dmSafeContainer.style.cssText = `
    position: fixed;
    inset: 0;
    overflow: visible;
    pointer-events: none;
    z-index: ${UI.Z_INDEX - 1};
  `;

  function mountOverlay() {
    const r = root();
    if (plusBtn.parentNode !== r) r.appendChild(plusBtn);
    if (CONFIG.debug && debugPanel.parentNode !== r) r.appendChild(debugPanel);
    if (dmSafeContainer.parentNode !== r) r.appendChild(dmSafeContainer);
  }

  // ==================== 调试面板 ====================

  const DBG = {
    frame: 0,
    dmCount: 0,
    mouse: '0,0',
    hitText: '',
    hitType: '',
    btnVisible: false,
    frozen: false,
    currentConnected: false,
    lastSend: '',
    lastErr: '',
    fullscreen: false,
    cooldownMs: CONFIG.cooldownMs,
    enableSendCooldown: CONFIG.enableSendCooldown
  };

  function setDbg(k, v) {
    DBG[k] = v;
    renderDebug();
  }

  function renderDebug() {
    if (!CONFIG.debug) return;
    debugPanel.textContent =
`[DM+1 DEBUG v0.0.1]
frame            : ${DBG.frame}
dmCount          : ${DBG.dmCount}
mouse            : ${DBG.mouse}
hitType          : ${DBG.hitType || '(none)'}
hitText          : ${DBG.hitText || '(none)'}
btnVisible       : ${DBG.btnVisible}
frozen           : ${DBG.frozen}
currentConnected : ${DBG.currentConnected}
lastSend         : ${DBG.lastSend || '(none)'}
lastErr          : ${DBG.lastErr || '(none)'}
enableCooldown   : ${DBG.enableSendCooldown}
cooldownMs       : ${DBG.cooldownMs}
fullscreen       : ${DBG.fullscreen}`;
  }

  // ==================== 工具函数 ====================

  function isElementAlive(el) {
    return !!(el && el.isConnected);
  }

  function pointInRect(x, y, r, p) {
    p = p || 0;
    return x >= r.left - p && x <= r.right + p && y >= r.top - p && y <= r.bottom + p;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // ==================== 弹幕内容提取 ====================

  function getDmText(el) {
    const parts = [];
    el.childNodes.forEach(function (child) {
      if (child.nodeType === Node.TEXT_NODE) {
        var t = child.textContent.replace(/\s+/g, ' ').trim();
        if (t) parts.push({ type: 'text', value: t });
      } else if (child.tagName === 'IMG') {
        // 大表情：data-name 或 alt 存表情名
        var name = child.dataset.name || child.getAttribute('alt') || '';
        parts.push({ type: 'emoji', value: name ? '[' + name + ']' : EMOJI_FALLBACK });
      } else if (child.tagName === 'SPAN' && child.classList.contains('emoji')) {
        // 小表情
        parts.push({ type: 'emoji-sm', value: child.textContent });
      }
    });

    if (parts.length === 0) return '';

    var text = parts.map(function (p) { return p.value; }).join(' ').replace(/\s+/g, ' ').trim();

    var hasText = false;
    var hasEmoji = false;
    parts.forEach(function (p) {
      if (p.type === 'text') hasText = true;
      if (p.type === 'emoji' || p.type === 'emoji-sm') hasEmoji = true;
    });

    var type = 'unknown';
    if (hasText && hasEmoji) type = 'mixed';
    else if (hasText) type = 'text';
    else if (hasEmoji) type = 'emoji';

    return { type: type, text: text, parts: parts };
  }

  // ==================== 冻结 / 解冻 ====================

  function freeze(el) {
    if (!isElementAlive(el)) return;
    if (el.dataset.dm1Frozen === '1') return;
    el.dataset.dm1Frozen = '1';
    el.dataset.dm1OldAnimPlay = el.style.animationPlayState || '';
    el.style.setProperty('animation-play-state', 'paused', 'important');
    setDbg('frozen', true);
  }

  function scheduleRescuedCleanup(el) {
    el.addEventListener('animationend', function () {
      if (el.parentNode) el.remove();
    });
    setTimeout(function () { if (el.parentNode) el.remove(); }, TIMING.GHOST_CLEANUP_MS);
  }

  function unfreeze(el) {
    if (!el || el.dataset.dm1Frozen !== '1') return;
    var wasRescued = el.parentNode === dmSafeContainer;
    el.style.animationPlayState = el.dataset.dm1OldAnimPlay || '';
    delete el.dataset.dm1OldAnimPlay;
    delete el.dataset.dm1Frozen;
    if (wasRescued) scheduleRescuedCleanup(el);
    setDbg('frozen', false);
  }

  function clearCurrentHit() {
    var el = state.currentHit && state.currentHit.el;
    if (el && isElementAlive(el)) {
      unfreeze(el);
      if (el.parentNode === dmSafeContainer) el.remove();
    }
    state.currentHit = null;
    setDbg('hitText', '');
    setDbg('hitType', '');
    setDbg('currentConnected', false);
  }

  // ==================== 按钮控制 ====================

  function placeBtn(el) {
    if (!el || !isElementAlive(el)) return;
    var r = el.getBoundingClientRect();
    if (r.width <= 4) return;

    var x = r.left + r.width * UI.HORIZONTAL_RATIO;
    var y = r.top + r.height / 2;
    var m = UI.MARGIN_PX;
    x = clamp(x, m + UI.BTN_APPROX_W / 2, innerWidth - m - UI.BTN_APPROX_W / 2);
    y = clamp(y, m + UI.BTN_APPROX_H / 2, innerHeight - m - UI.BTN_APPROX_H / 2);

    plusBtn.style.left = x + 'px';
    plusBtn.style.top = y + 'px';
  }

  function showBtn(el) {
    mountOverlay();
    placeBtn(el);
    plusBtn.style.display = 'block';
    setDbg('btnVisible', true);
  }

  function hideBtn() {
    plusBtn.style.display = 'none';
    setDbg('btnVisible', false);
  }

  // ==================== 弹幕发送 ====================

  function setNativeValue(el, value) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;

    el.dispatchEvent(new InputEvent('input', {
      bubbles: true, cancelable: true, inputType: 'insertText', data: value
    }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findInput() {
    return document.querySelector('textarea[placeholder*="弹幕"]')
      || document.querySelector('textarea')
      || document.querySelector('input[placeholder*="弹幕"]')
      || document.querySelector('input[type="text"]');
  }

  function findSendBtn() {
    return Array.from(document.querySelectorAll('button.bl-button.bl-button--primary.bl-button--small'))
      .find(function (b) { return (b.querySelector('span.txt') || {}).textContent === '发送'; })
      || Array.from(document.querySelectorAll('button'))
      .find(function (b) { return (b.querySelector('span.txt') || {}).textContent === '发送'; })
      || null;
  }

  function canSendByCooldown(now) {
    if (!CONFIG.enableSendCooldown) return true;
    return now - state.lastSendAt >= CONFIG.cooldownMs;
  }

  function sendDanmaku(text) {
    var now = Date.now();
    if (!canSendByCooldown(now)) {
      setDbg('lastErr', 'cooldown');
      return false;
    }

    var input = findInput();
    if (!input) {
      setDbg('lastErr', 'input_not_found');
      return false;
    }

    var finalText = CONFIG.appendPlusOne ? text + ' +1' : text;
    input.focus();
    setNativeValue(input, finalText);
    state.lastSendAt = now;

    var btn = findSendBtn();
    if (btn) {
      btn.click();
      setDbg('lastErr', '');
    } else {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
      setDbg('lastErr', 'send_btn_not_found_use_enter');
    }

    setDbg('lastSend', finalText);
    return true;
  }

  function setBtnFeedbackSending() {
    plusBtn.textContent = '✓';
    plusBtn.disabled = true;
    plusBtn.style.opacity = '0.7';
    plusBtn.style.cursor = 'default';
  }

  function resetBtnFeedback() {
    plusBtn.textContent = '+1';
    plusBtn.disabled = false;
    plusBtn.style.opacity = CONFIG.btnOpacity;
    plusBtn.style.cursor = '';
  }

  // ==================== 弹幕节点事件绑定 ====================

  function findDmContainer() {
    for (var i = 0; i < DANMU_CONTAINER_SELECTORS.length; i++) {
      var el = document.querySelector(DANMU_CONTAINER_SELECTORS[i]);
      if (el) return el;
    }
    return null;
  }

  function isDanmuNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    if (!(node instanceof HTMLElement)) return false;
    var cls = Array.from(node.classList);
    return cls.indexOf('bili-danmaku-x-dm') !== -1 || cls.indexOf('danmaku-info-row') !== -1;
  }

  function attachDanmuEvents(el) {
    if (el.dataset.dm1Bound === '1') return;
    el.dataset.dm1Bound = '1';

    el.addEventListener('mouseenter', function () {
      var payload = getDmText(el);
      if (!payload.text) return;

      state.currentHit = { el: el, text: payload.text, type: payload.type };
      freeze(el);
      setDbg('hitText', payload.text);
      setDbg('hitType', payload.type);
      setDbg('currentConnected', true);
      showBtn(el);
    });

    el.addEventListener('mouseleave', function () {
      hideBtn();
      clearCurrentHit();
    });
  }

  // ==================== 主渲染循环 ====================

  var lastTickTime = 0;

  function scheduleFrame() {
    if (state.rafScheduled) return;
    if (state.noPlayerCount > TIMING.NO_PLAYER_THRESHOLD) {
      var now = performance.now();
      if (now - lastTickTime < TIMING.LOW_FREQ_POLL_MS) return;
    }
    state.rafScheduled = true;
    requestAnimationFrame(tick);
  }

  function handleNoPlayer() {
    if (!findDmContainer()) {
      state.noPlayerCount++;
      if (state.noPlayerCount > TIMING.NO_PLAYER_THRESHOLD) {
        setTimeout(function () { scheduleFrame(); }, TIMING.LOW_FREQ_POLL_MS);
        return true;
      }
    } else {
      state.noPlayerCount = 0;
    }
    return false;
  }

  function tick() {
    state.rafScheduled = false;
    lastTickTime = performance.now();

    if (handleNoPlayer()) return;

    mountOverlay();
    setDbg('frame', DBG.frame + 1);

    // 按钮跟随弹幕位置更新
    if (state.currentHit && state.currentHit.el) {
      setDbg('currentConnected', isElementAlive(state.currentHit.el));
      placeBtn(state.currentHit.el);
    }
  }

  // ==================== 事件监听 ====================

  document.addEventListener('mousemove', function (e) {
    state.mouse.x = e.clientX;
    state.mouse.y = e.clientY;
    setDbg('mouse', state.mouse.x + ',' + state.mouse.y);
  }, { capture: true, passive: true });

  plusBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();

    var now = Date.now();
    if (state.clickLocked || now - state.lastClickAt < TIMING.CLICK_DEBOUNCE_MS) return;
    state.lastClickAt = now;

    if (!state.currentHit || !state.currentHit.text) return;

    state.clickLocked = true;
    setBtnFeedbackSending();
    sendDanmaku(state.currentHit.text);

    setTimeout(function () {
      resetBtnFeedback();
      state.clickLocked = false;
      hideBtn();
      clearCurrentHit();
    }, TIMING.FEEDBACK_MS);
  });

  document.addEventListener('fullscreenchange', function () {
    mountOverlay();
    bindMutationObserverTarget();
    setDbg('fullscreen', !!document.fullscreenElement);
    scheduleFrame();
  });

  function bindMutationObserverTarget() {
    var nextTarget = findDmContainer() || document.documentElement;
    if (state.dmObserverTarget === nextTarget) return;
    mo.disconnect();
    state.dmObserverTarget = nextTarget;
    mo.observe(state.dmObserverTarget, { childList: true, subtree: true });
  }

  var mo = new MutationObserver(function (mutations) {
    for (var mi = 0; mi < mutations.length; mi++) {
      var added = mutations[mi].addedNodes;
      var removed = mutations[mi].removedNodes;

      // 新弹幕节点 → 绑定事件
      for (var ai = 0; ai < added.length; ai++) {
        var node = added[ai];
        if (isDanmuNode(node)) {
          attachDanmuEvents(node);
          setDbg('dmCount', DBG.dmCount + 1);
        }
      }

      // 冻结弹幕被 B站 JS 清理 → 移入安全容器保持存活
      for (var ri = 0; ri < removed.length; ri++) {
        var rm = removed[ri];
        if (rm.nodeType === Node.ELEMENT_NODE && rm.dataset && rm.dataset.dm1Frozen === '1') {
          rm.style.pointerEvents = 'auto';
          dmSafeContainer.appendChild(rm);
          setDbg('currentConnected', true);
        }
      }
    }
  });

  // ==================== Tampermonkey 菜单 ====================

  function registerMenus() {
    try {
      GM_registerMenuCommand('切换发送冷却', function () {
        CONFIG.enableSendCooldown = !CONFIG.enableSendCooldown;
        storageSet('enableSendCooldown', CONFIG.enableSendCooldown);
        setDbg('enableSendCooldown', CONFIG.enableSendCooldown);
        console.log('[DM+1] 发送冷却:', CONFIG.enableSendCooldown ? '开' : '关');
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
        console.log('[DM+1] 按钮透明度:', Math.round(CONFIG.btnOpacity * 100) + '%');
      });

      GM_registerMenuCommand('切换调试面板', function () {
        CONFIG.debug = !CONFIG.debug;
        storageSet('debug', CONFIG.debug);
        debugPanel.style.display = CONFIG.debug ? 'block' : 'none';
        if (CONFIG.debug) { mountOverlay(); renderDebug(); }
        console.log('[DM+1] 调试面板:', CONFIG.debug ? '开' : '关');
      });

      GM_registerMenuCommand('重置所有设置', function () {
        ['enableSendCooldown', 'cooldownMs', 'debug', 'btnOpacity'].forEach(function (k) {
          try { GM_deleteValue && GM_deleteValue(k); } catch (e) { /* ignore */ }
          try { localStorage.removeItem('dm1_' + k); } catch (e) { /* ignore */ }
        });
        location.reload();
      });
    } catch (e) { /* GM_registerMenuCommand not available in this context */ }
  }

  // ==================== 环境检测 ====================

  if (window.self !== window.top && /\/activity\/|\/blackboard\//.test(location.href)) {
    console.log('[DM+1] activity iframe detected, skipping init');
    return;
  }

  // ==================== 初始化 ====================

  registerMenus();
  mountOverlay();
  bindMutationObserverTarget();
  setDbg('fullscreen', !!document.fullscreenElement);
  setDbg('cooldownMs', CONFIG.cooldownMs);
  setDbg('enableSendCooldown', CONFIG.enableSendCooldown);
  renderDebug();

  scheduleFrame();

  console.log('[DM+1] v0.0.1 loaded');
})();
