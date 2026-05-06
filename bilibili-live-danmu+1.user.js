// ==UserScript==
// @name         B站直播弹幕 +1
// @name:zh-CN   B站直播弹幕 +1
// @namespace    https://github.com/user/bilibili-live-danmu-plus-one
// @version      0.7.0
// @description  鼠标悬停弹幕即可一键发送同款弹幕+1，支持文字/emoji/表情图片，可配置发送间隔
// @description:zh-CN  鼠标悬停弹幕即可一键发送同款弹幕+1，支持文字/emoji/表情图片，可配置发送间隔
// @author       user (https://github.com/user)
// @license      MIT
// @match        https://live.bilibili.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @homepageURL  https://github.com/user/bilibili-live-danmu-plus-one
// @supportURL   https://github.com/user/bilibili-live-danmu-plus-one/issues
// @updateURL    https://github.com/user/bilibili-live-danmu-plus-one/raw/main/bilibili-live-danmu-plus-one.user.js
// @downloadURL  https://github.com/user/bilibili-live-danmu-plus-one/raw/main/bilibili-live-danmu-plus-one.user.js
// ==/UserScript==

(function () {
  'use strict';

  // --- 配置持久化 (GM_getValue → localStorage fallback) ---
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
    // === 发送间隔控制 ===
    enableSendCooldown: storageGet('enableSendCooldown', true),
    cooldownMs: storageGet('cooldownMs', 2000),
    // 预设选项（便于你后续接入菜单）
    cooldownMsOptions: [0, 300, 600, 1200, 2000, 3000],

    clickDebounceMs: 320,
    feedbackMs: 280,
    appendPlusOne: false,

    imageFallbackText: '[表情]',
    preferImageMetaText: true,
    // 从图片URL推断emoji标识（如 [emoji:xxx]）
    inferEmojiFromImageUrl: true,

    hitPaddingPx: 2,
    marginPx: 8,
    horizontalRatio: 0.4, // 弹幕宽度40%位置
    yInRowMode: true,     // 按钮在弹幕行内

    btnApproxW: 42,
    btnApproxH: 26,

    zIndexBtn: 2147483647,
    zIndexDebug: 2147483647,
    debug: storageGet('debug', false),

    btnOpacity: storageGet('btnOpacity', 0.8)
  };

  let currentHit = null; // {el,text,type,rect}
  let lastSendAt = 0;
  let lastClickAt = 0;
  let clickLocked = false;

  let mouse = { x: 0, y: 0 };
  let mouseDirty = false;

  let rafScheduled = false;
  let moPending = false;
  let dmNodeList = [];
  let dmListDirty = true;
  let dmObserverTarget = null;
  // rAF 内复用的 rect 快照，key = dm element，每帧重建
  let rectSnapshot = new WeakMap();

  function root() {
    return document.fullscreenElement || document.body;
  }

  const plusBtn = document.createElement('button');
  plusBtn.textContent = '+1';
  plusBtn.style.cssText = `
    position: fixed;
    display: none;
    z-index: ${CONFIG.zIndexBtn};
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
    z-index: ${CONFIG.zIndexDebug};
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
`[DM+1 DEBUG v0.7.0]
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

  function mountOverlay() {
    const r = root();
    if (plusBtn.parentNode !== r) r.appendChild(plusBtn);
    if (CONFIG.debug && debugPanel.parentNode !== r) r.appendChild(debugPanel);
  }

  function isElementAlive(el) {
    return !!(el && el.isConnected);
  }

  function pointInRect(x, y, r, p = 0) {
    return x >= r.left - p && x <= r.right + p && y >= r.top - p && y <= r.bottom + p;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function isVisibleDM(el) {
    if (!isElementAlive(el)) return false;
    // 快速路径：inline style 直接隐藏，跳过 getComputedStyle
    const ds = el.style.display;
    const vs = el.style.visibility;
    if (ds === 'none' || vs === 'hidden') return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity || '1') < 0.05) return false;

    const r = el.getBoundingClientRect();
    if (r.width <= 4 || r.height <= 4) return false;
    if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) return false;
    return true;
  }

  // 提取图片URL中可读的emoji名
  function inferEmojiNameFromSrc(src) {
    if (!src) return '';
    try {
      const u = new URL(src, location.href);
      const path = u.pathname || '';
      const file = path.split('/').pop() || '';
      const name = file.split('.')[0] || '';
      if (name) return `[emoji:${name}]`;
      return '';
    } catch {
      return '';
    }
  }

  // emoji适配增强：文本(含emoji) / 图片emoji / 混合
  function extractDmPayload(el) {
    // 不对 DOM 元素做缓存：B站会复用弹幕节点，textContent 变化但引用不变
    const rawText = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (rawText) return { type: 'text', text: rawText };

    const img = el.querySelector('img');
    if (img) {
      if (CONFIG.preferImageMetaText) {
        const meta = (
          img.getAttribute('alt') ||
          img.getAttribute('title') ||
          img.getAttribute('aria-label') ||
          ''
        ).trim();
        if (meta) return { type: 'emoji-image', text: meta };
      }

      if (CONFIG.inferEmojiFromImageUrl) {
        const inferred = inferEmojiNameFromSrc(img.getAttribute('src') || '');
        if (inferred) return { type: 'emoji-image', text: inferred };
      }

      return { type: 'emoji-image', text: CONFIG.imageFallbackText };
    }

    return { type: 'unknown', text: '' };
  }

  // 弹幕选择器（按优先级降序尝试）
  const DM_SELECTORS = [
    'div[role="comment"].bili-danmaku-x-dm',
    'div[role="comment"][class*="danmaku"]',
    '.bili-danmaku-x-dm'
  ];
  const DM_SELECTOR_JOINED = DM_SELECTORS.join(',');

  // 寻找弹幕所在容器，限定搜索范围
  function findDmContainer() {
    return document.querySelector('.bilibili-live-player-video, #live-player, .live-player-container');
  }

  function refreshDmNodeListIfNeeded() {
    if (!dmListDirty) return;
    bindMutationObserverTarget();

    const scope = findDmContainer() || document;

    for (let i = 0; i < DM_SELECTORS.length; i++) {
      const nodes = Array.from(scope.querySelectorAll(DM_SELECTORS[i]));
      if (nodes.length > 0) {
        dmNodeList = nodes;
        dmListDirty = false;
        setDbg('dmCount', dmNodeList.length);
        return;
      }
    }

    dmNodeList = [];
    dmListDirty = false;
    setDbg('dmCount', 0);
  }

  function isLikelyDmElement(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (!el.matches(DM_SELECTOR_JOINED)) return false;
    return true;
  }

  // 优先使用命中点链路，避免每次都全量扫描弹幕节点
  function findHitFromPoint(x, y) {
    const stack = document.elementsFromPoint(x, y);
    for (let i = 0; i < stack.length; i++) {
      const n = stack[i];
      if (!(n instanceof HTMLElement)) continue;
      const el = isLikelyDmElement(n) ? n : n.closest(DM_SELECTOR_JOINED);
      if (!isLikelyDmElement(el)) continue;
      if (!isVisibleDM(el)) continue;
      const rect = el.getBoundingClientRect();
      rectSnapshot.set(el, rect);
      if (!pointInRect(x, y, rect, CONFIG.hitPaddingPx)) continue;
      const payload = extractDmPayload(el);
      if (!payload.text) continue;
      return { el, text: payload.text, type: payload.type };
    }
    return null;
  }

  function findHitLive(x, y) {
    const pointHit = findHitFromPoint(x, y);
    if (pointHit) return pointHit;

    refreshDmNodeListIfNeeded();

    for (let i = dmNodeList.length - 1; i >= 0; i--) {
      const el = dmNodeList[i];
      if (!(el instanceof HTMLElement)) continue;
      if (!isVisibleDM(el)) continue;

      const rect = el.getBoundingClientRect();
      rectSnapshot.set(el, rect);
      if (!pointInRect(x, y, rect, CONFIG.hitPaddingPx)) continue;

      const payload = extractDmPayload(el);
      if (!payload.text) continue;

      return { el, text: payload.text, type: payload.type };
    }
    return null;
  }

  function freeze(el) {
    if (!isElementAlive(el)) return;
    if (el.dataset.dm1Frozen === '1') return;
    el.dataset.dm1Frozen = '1';
    el.dataset.dm1OldAnimPlay = el.style.animationPlayState || '';
    el.style.setProperty('animation-play-state', 'paused', 'important');
    setDbg('frozen', true);
  }

  function unfreeze(el) {
    if (!el) return;
    if (el.dataset.dm1Frozen !== '1') return;
    el.style.animationPlayState = el.dataset.dm1OldAnimPlay || '';
    delete el.dataset.dm1OldAnimPlay;
    delete el.dataset.dm1Frozen;
    setDbg('frozen', false);
  }

  function clearCurrentHit() {
    if (currentHit?.el) unfreeze(currentHit.el);
    currentHit = null;
    setDbg('hitText', '');
    setDbg('hitType', '');
    setDbg('currentConnected', false);
  }

  function placeBtnInDanmakuRowAt20(hit) {
    if (!hit?.el || !isElementAlive(hit.el)) return;

    const r = rectSnapshot.get(hit.el) || hit.el.getBoundingClientRect();

    let x = r.left + r.width * CONFIG.horizontalRatio;
    let y = CONFIG.yInRowMode ? (r.top + r.height / 2) : (r.bottom + CONFIG.btnApproxH / 2);

    const m = CONFIG.marginPx;
    x = clamp(x, m + CONFIG.btnApproxW / 2, innerWidth - m - CONFIG.btnApproxW / 2);
    y = clamp(y, m + CONFIG.btnApproxH / 2, innerHeight - m - CONFIG.btnApproxH / 2);

    plusBtn.style.left = `${x}px`;
    plusBtn.style.top = `${y}px`;
  }

  function showBtn(hit) {
    mountOverlay();
    placeBtnInDanmakuRowAt20(hit);
    plusBtn.style.display = 'block';
    setDbg('btnVisible', true);
  }

  function hideBtn() {
    plusBtn.style.display = 'none';
    setDbg('btnVisible', false);
  }

  function refreshHoverStateImmediate() {
    if (currentHit?.el && !isElementAlive(currentHit.el)) {
      hideBtn();
      clearCurrentHit();
      return;
    }
    if (!currentHit?.el) return;

    const r = rectSnapshot.get(currentHit.el) || currentHit.el.getBoundingClientRect();
    const inDanmaku = pointInRect(mouse.x, mouse.y, r, CONFIG.hitPaddingPx);

    const br = plusBtn.getBoundingClientRect();
    const inBtn = plusBtn.style.display === 'block' && pointInRect(mouse.x, mouse.y, br, 0);

    if (inDanmaku || inBtn) {
      if (plusBtn.style.display !== 'block') showBtn(currentHit);
      return;
    }

    hideBtn();
    clearCurrentHit();
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) desc.set.call(el, value);
    else el.value = value;

    el.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: value
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
      .find(b => b.querySelector('span.txt')?.textContent?.trim() === '发送')
      || Array.from(document.querySelectorAll('button'))
      .find(b => b.querySelector('span.txt')?.textContent?.trim() === '发送')
      || null;
  }

  function canSendByCooldown(now) {
    if (!CONFIG.enableSendCooldown) return true;
    return now - lastSendAt >= CONFIG.cooldownMs;
  }

  function sendDanmaku(text) {
    const now = Date.now();
    if (!canSendByCooldown(now)) {
      setDbg('lastErr', 'cooldown');
      return false;
    }
    lastSendAt = now;

    const input = findInput();
    if (!input) {
      setDbg('lastErr', 'input_not_found');
      return false;
    }

    const finalText = CONFIG.appendPlusOne ? `${text} +1` : text;
    input.focus();
    setNativeValue(input, finalText);

    const btn = findSendBtn();
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

  function scheduleFrame() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(tick);
  }

  function tick() {
    rafScheduled = false;
    rectSnapshot = new WeakMap();
    // 每次 rAF 确保 overlay 挂载在正确的 root 下（SPA 路由切换时 root 可能被替换）
    mountOverlay();
    setDbg('frame', DBG.frame + 1);

    if (mouseDirty) {
      mouseDirty = false;
      setDbg('mouse', `${mouse.x},${mouse.y}`);

      if (currentHit?.el && !isElementAlive(currentHit.el)) {
        hideBtn();
        clearCurrentHit();
      }

      const hit = findHitLive(mouse.x, mouse.y);

      if (hit) {
        if (!currentHit || currentHit.el !== hit.el) {
          if (currentHit?.el) unfreeze(currentHit.el);
          currentHit = hit;
          freeze(hit.el);
          setDbg('hitText', hit.text);
          setDbg('hitType', hit.type);
          showBtn(currentHit);
        }
        setDbg('currentConnected', isElementAlive(currentHit.el));
      } else {
        refreshHoverStateImmediate();
      }
    }
  }

  document.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouseDirty = true;
    scheduleFrame();
  }, { capture: true, passive: true });

  plusBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const now = Date.now();
    if (clickLocked || now - lastClickAt < CONFIG.clickDebounceMs) return;
    lastClickAt = now;

    if (currentHit?.el && !isElementAlive(currentHit.el)) {
      hideBtn();
      clearCurrentHit();
      return;
    }
    if (!currentHit?.text) return;

    clickLocked = true;
    setBtnFeedbackSending();

    sendDanmaku(currentHit.text);

    setTimeout(() => {
      resetBtnFeedback();
      clickLocked = false;
      hideBtn();
      clearCurrentHit();
    }, CONFIG.feedbackMs);
  });

  document.addEventListener('fullscreenchange', () => {
    mountOverlay();
    bindMutationObserverTarget();
    setDbg('fullscreen', !!document.fullscreenElement);
    dmListDirty = true;
    mouseDirty = true;
    scheduleFrame();
  });

  function bindMutationObserverTarget() {
    const nextTarget = findDmContainer() || document.documentElement;
    if (dmObserverTarget === nextTarget) return;
    mo.disconnect();
    dmObserverTarget = nextTarget;
    mo.observe(dmObserverTarget, { childList: true, subtree: true });
  }

  const mo = new MutationObserver(() => {
    dmListDirty = true;
    // 每次 MO 都检查当前命中元素是否存活（开销小），止损及时
    if (currentHit?.el && !isElementAlive(currentHit.el)) {
      hideBtn();
      clearCurrentHit();
      mouseDirty = true;
    }
    // 合并到单次 rAF 调度
    if (!moPending) {
      moPending = true;
      requestAnimationFrame(() => {
        moPending = false;
        mouseDirty = true;
        scheduleFrame();
      });
    }
  });
  bindMutationObserverTarget();

  // --- 设置菜单（仅注册一次，不动态刷新标签） ---
  function registerMenus() {
    try {
      GM_registerMenuCommand('切换发送冷却', () => {
        CONFIG.enableSendCooldown = !CONFIG.enableSendCooldown;
        storageSet('enableSendCooldown', CONFIG.enableSendCooldown);
        setDbg('enableSendCooldown', CONFIG.enableSendCooldown);
        console.log('[DM+1] 发送冷却:', CONFIG.enableSendCooldown ? '开' : '关');
      });
      CONFIG.cooldownMsOptions.forEach(ms => {
        const label = ms === 0 ? '无间隔' : `${(ms / 1000).toFixed(1)}s`;
        GM_registerMenuCommand(`发送间隔 → ${label}`, () => {
          CONFIG.cooldownMs = ms;
          storageSet('cooldownMs', ms);
          setDbg('cooldownMs', ms);
          console.log('[DM+1] 发送间隔:', label);
        });
      });
      GM_registerMenuCommand('切换按钮透明度', () => {
        const opts = [0.3, 0.5, 0.7, 0.8, 0.95];
        const idx = opts.indexOf(CONFIG.btnOpacity);
        CONFIG.btnOpacity = opts[(idx + 1) % opts.length];
        storageSet('btnOpacity', CONFIG.btnOpacity);
        plusBtn.style.opacity = CONFIG.btnOpacity;
        console.log('[DM+1] 按钮透明度:', Math.round(CONFIG.btnOpacity * 100) + '%');
      });
      GM_registerMenuCommand('切换调试面板', () => {
        CONFIG.debug = !CONFIG.debug;
        storageSet('debug', CONFIG.debug);
        debugPanel.style.display = CONFIG.debug ? 'block' : 'none';
        if (CONFIG.debug) { mountOverlay(); renderDebug(); }
        console.log('[DM+1] 调试面板:', CONFIG.debug ? '开' : '关');
      });
      GM_registerMenuCommand('重置所有设置', () => {
        ['enableSendCooldown', 'cooldownMs', 'debug', 'btnOpacity'].forEach(k => {
          try { GM_deleteValue?.(k); } catch (e) { /* ignore */ }
          try { localStorage.removeItem('dm1_' + k); } catch (e) { /* ignore */ }
        });
        location.reload();
      });
    } catch (e) { /* GM_registerMenuCommand not available in this context */ }
  }

  // init
  registerMenus();
  mountOverlay();
  bindMutationObserverTarget();
  setDbg('fullscreen', !!document.fullscreenElement);
  setDbg('cooldownMs', CONFIG.cooldownMs);
  setDbg('enableSendCooldown', CONFIG.enableSendCooldown);
  renderDebug();

  dmListDirty = true;
  mouseDirty = true;
  scheduleFrame();

  console.log('[DM+1] v0.7.0 loaded');
})();