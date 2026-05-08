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

  const DM_SELECTORS = [
    'div[role="comment"].bili-danmaku-x-dm',
    'div[role="comment"][class*="danmaku"]',
    '.bili-danmaku-x-dm'
  ];
  const DM_SELECTOR_JOINED = DM_SELECTORS.join(',');

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
    inferEmojiFromImageUrl: true,

    debug: storageGet('debug', false),
    btnOpacity: storageGet('btnOpacity', 0.8),
  };

  // ==================== 运行时状态 ====================

  const state = {
    currentHit: null,       // {el, text, type, rect, lastRect}
    lastSendAt: 0,
    lastClickAt: 0,
    clickLocked: false,

    mouse: { x: 0, y: 0 },
    mouseDirty: false,

    rafScheduled: false,
    moPending: false,
    dmNodeList: [],
    dmListDirty: true,
    dmObserverTarget: null,
    noPlayerCount: 0,

    rectSnapshot: new WeakMap(),  // 每帧重建，缓存元素 getBoundingClientRect
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

  // B站 JS 清理定时器回收冻结弹幕时，移入此容器保持存活
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

  function pointInRect(x, y, r, p = 0) {
    return x >= r.left - p && x <= r.right + p && y >= r.top - p && y <= r.bottom + p;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function isVisibleDM(el) {
    if (!isElementAlive(el)) return false;
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

  function isLikelyDmElement(el) {
    return el instanceof HTMLElement && el.matches(DM_SELECTOR_JOINED);
  }

  // ==================== 弹幕内容提取 ====================

  function inferEmojiNameFromSrc(src) {
    if (!src) return '';
    try {
      const u = new URL(src, location.href);
      const file = (u.pathname || '').split('/').pop() || '';
      const name = file.split('.')[0] || '';
      return name ? `[emoji:${name}]` : '';
    } catch {
      return '';
    }
  }

  function getEmojiCode(img) {
    const attr = img.getAttribute('alt') || img.getAttribute('title') || img.getAttribute('aria-label');
    if (attr?.trim()) return attr.trim();
    if (CONFIG.inferEmojiFromImageUrl) {
      const inferred = inferEmojiNameFromSrc(img.getAttribute('src') || '');
      if (inferred) return inferred;
    }
    return EMOJI_FALLBACK;
  }

  function extractDmPayload(el) {
    const parts = [];
    const has = { text: false, emoji: false, large: false };

    function walk(node) {
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.TEXT_NODE) {
          const t = child.textContent.replace(/\s+/g, ' ').trim();
          if (t) { parts.push({ type: 'text', text: t }); has.text = true; }
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.matches && child.matches('img.emote')) {
            const code = getEmojiCode(child);
            const isLarge = !!child.closest('.emote--bulge');
            parts.push({ type: isLarge ? 'emoji-large' : 'emoji', text: code });
            if (isLarge) has.large = true; else has.emoji = true;
          } else {
            const innerImg = child.querySelector && child.querySelector('img.emote');
            if (innerImg) {
              const code = getEmojiCode(innerImg);
              const isLarge = !!innerImg.closest('.emote--bulge');
              parts.push({ type: isLarge ? 'emoji-large' : 'emoji', text: code });
              if (isLarge) has.large = true; else has.emoji = true;
            } else {
              walk(child);
            }
          }
        }
      }
    }

    walk(el);

    if (parts.length === 0) return { type: 'unknown', text: '', parts };

    const allText = parts.map(p => p.text).join(' ').replace(/\s+/g, ' ').trim();

    let aggregateType = 'unknown';
    const hasEmoji = has.emoji || has.large;
    if (has.text && hasEmoji) aggregateType = 'mixed';
    else if (has.text) aggregateType = 'text';
    else if (has.large && !has.emoji) aggregateType = 'emoji-large';
    else if (has.emoji) aggregateType = 'emoji';

    return { type: aggregateType, text: allText, parts };
  }

  // ==================== 弹幕检测 ====================

  function findDmContainer() {
    return document.querySelector('.bilibili-live-player-video, #live-player, .live-player-container');
  }

  function refreshDmNodeListIfNeeded() {
    if (!state.dmListDirty) return;
    bindMutationObserverTarget();

    const scope = findDmContainer() || document;

    for (let i = 0; i < DM_SELECTORS.length; i++) {
      const nodes = Array.from(scope.querySelectorAll(DM_SELECTORS[i]));
      if (nodes.length > 0) {
        state.dmNodeList = nodes;
        state.dmListDirty = false;
        setDbg('dmCount', state.dmNodeList.length);
        return;
      }
    }

    state.dmNodeList = [];
    state.dmListDirty = false;
    setDbg('dmCount', 0);
  }

  // 统一命中检测：先走 elementsFromPoint 快路径，失败则全量扫描
  function findHit(x, y) {
    const stack = document.elementsFromPoint(x, y);
    for (let i = 0; i < stack.length; i++) {
      const n = stack[i];
      if (!(n instanceof HTMLElement)) continue;
      const el = isLikelyDmElement(n) ? n : n.closest(DM_SELECTOR_JOINED);
      if (!isLikelyDmElement(el)) continue;
      if (!isVisibleDM(el)) continue;
      const rect = el.getBoundingClientRect();
      state.rectSnapshot.set(el, rect);
      if (!pointInRect(x, y, rect, UI.HIT_PADDING_PX)) continue;
      const payload = extractDmPayload(el);
      if (!payload.text) continue;
      return { el, text: payload.text, type: payload.type };
    }

    // 回退：遍历全量弹幕节点
    refreshDmNodeListIfNeeded();
    for (let i = state.dmNodeList.length - 1; i >= 0; i--) {
      const el = state.dmNodeList[i];
      if (!(el instanceof HTMLElement)) continue;
      if (!isVisibleDM(el)) continue;
      const rect = el.getBoundingClientRect();
      state.rectSnapshot.set(el, rect);
      if (!pointInRect(x, y, rect, UI.HIT_PADDING_PX)) continue;
      const payload = extractDmPayload(el);
      if (!payload.text) continue;
      return { el, text: payload.text, type: payload.type };
    }

    return null;
  }

  // ==================== 冻结 / 解冻 / 幽灵模式 ====================

  function freeze(el) {
    if (!isElementAlive(el)) return;
    if (el.dataset.dm1Frozen === '1') return;
    el.dataset.dm1Frozen = '1';
    el.dataset.dm1OldAnimPlay = el.style.animationPlayState || '';
    el.style.setProperty('animation-play-state', 'paused', 'important');
    if (state.currentHit) state.currentHit.lastRect = el.getBoundingClientRect();
    setDbg('frozen', true);
  }

  function scheduleRescuedCleanup(el) {
    el.addEventListener('animationend', () => {
      const active = el.getAnimations().filter(
        a => a.playState === 'running' || a.playState === 'pending'
      );
      if (active.length === 0 && el.parentNode) el.remove();
    });
    setTimeout(() => { if (el.parentNode) el.remove(); }, TIMING.GHOST_CLEANUP_MS);
  }

  function unfreeze(el) {
    if (!el || el.dataset.dm1Frozen !== '1') return;
    const wasRescued = el.parentNode === dmSafeContainer;
    el.style.animationPlayState = el.dataset.dm1OldAnimPlay || '';
    delete el.dataset.dm1OldAnimPlay;
    delete el.dataset.dm1Frozen;
    if (wasRescued) scheduleRescuedCleanup(el);
    setDbg('frozen', false);
  }

  function clearCurrentHit() {
    if (state.currentHit?.el && isElementAlive(state.currentHit.el)) unfreeze(state.currentHit.el);
    state.currentHit = null;
    setDbg('hitText', '');
    setDbg('hitType', '');
    setDbg('currentConnected', false);
  }

  function markGhost() {
    if (!state.currentHit || !state.currentHit.text) return;
    if (state.currentHit.lastRect) return;
    if (state.currentHit.el && state.currentHit.el.getBoundingClientRect) {
      const r = state.currentHit.el.getBoundingClientRect();
      if (r.width > 0) state.currentHit.lastRect = r;
    }
    state.currentHit.el = null;
    setDbg('currentConnected', false);
  }

  // ==================== 按钮控制 ====================

  // 统一弹幕 rect 获取（ghost 用 lastRect，live 用 snapshot / getBoundingClientRect）
  function getHitRect(hit) {
    if (!hit.el) return hit.lastRect || null;
    if (!isElementAlive(hit.el)) return null;
    return state.rectSnapshot.get(hit.el) || hit.el.getBoundingClientRect();
  }

  function placeBtn(hit) {
    if (!hit) return;
    const r = getHitRect(hit);
    if (!r) return;

    let x = r.left + r.width * UI.HORIZONTAL_RATIO;
    let y = r.top + r.height / 2;

    const m = UI.MARGIN_PX;
    x = clamp(x, m + UI.BTN_APPROX_W / 2, innerWidth - m - UI.BTN_APPROX_W / 2);
    y = clamp(y, m + UI.BTN_APPROX_H / 2, innerHeight - m - UI.BTN_APPROX_H / 2);

    plusBtn.style.left = `${x}px`;
    plusBtn.style.top = `${y}px`;
  }

  function showBtn(hit) {
    mountOverlay();
    placeBtn(hit);
    plusBtn.style.display = 'block';
    setDbg('btnVisible', true);
  }

  function hideBtn() {
    plusBtn.style.display = 'none';
    setDbg('btnVisible', false);
  }

  function refreshHoverState() {
    const hit = state.currentHit;
    if (!hit) { hideBtn(); return; }

    // 元素已断开 → 转 ghost，下次 tick 重试
    if (hit.el && !isElementAlive(hit.el)) {
      markGhost();
      return;
    }

    const r = getHitRect(hit);
    if (!r) { hideBtn(); clearCurrentHit(); return; }

    const inDanmaku = pointInRect(state.mouse.x, state.mouse.y, r, UI.HIT_PADDING_PX);
    const br = plusBtn.getBoundingClientRect();
    const inBtn = plusBtn.style.display === 'block' && pointInRect(state.mouse.x, state.mouse.y, br, 0);

    if (inDanmaku || inBtn) {
      if (plusBtn.style.display !== 'block') showBtn(hit);
      return;
    }

    hideBtn();
    clearCurrentHit();
  }

  // ==================== 弹幕发送 ====================

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) desc.set.call(el, value);
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
      .find(b => b.querySelector('span.txt')?.textContent?.trim() === '发送')
      || Array.from(document.querySelectorAll('button'))
      .find(b => b.querySelector('span.txt')?.textContent?.trim() === '发送')
      || null;
  }

  function canSendByCooldown(now) {
    if (!CONFIG.enableSendCooldown) return true;
    return now - state.lastSendAt >= CONFIG.cooldownMs;
  }

  function sendDanmaku(text) {
    const now = Date.now();
    if (!canSendByCooldown(now)) {
      setDbg('lastErr', 'cooldown');
      return false;
    }

    const input = findInput();
    if (!input) {
      setDbg('lastErr', 'input_not_found');
      return false;
    }

    const finalText = CONFIG.appendPlusOne ? `${text} +1` : text;
    input.focus();
    setNativeValue(input, finalText);
    state.lastSendAt = now;

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

  // ==================== 主渲染循环 ====================

  let lastTickTime = 0;

  function scheduleFrame() {
    if (state.rafScheduled) return;
    if (state.noPlayerCount > TIMING.NO_PLAYER_THRESHOLD) {
      const now = performance.now();
      if (now - lastTickTime < TIMING.LOW_FREQ_POLL_MS) return;
    }
    state.rafScheduled = true;
    requestAnimationFrame(tick);
  }

  // 未开播检测：无播放器容器且无弹幕节点 → 降频轮询
  function handleNoPlayer() {
    if (!findDmContainer() && state.dmNodeList.length === 0) {
      state.noPlayerCount++;
      if (state.noPlayerCount > TIMING.NO_PLAYER_THRESHOLD) {
        setTimeout(() => {
          state.dmListDirty = true;
          scheduleFrame();
        }, TIMING.LOW_FREQ_POLL_MS);
        return true;
      }
    } else {
      state.noPlayerCount = 0;
    }
    return false;
  }

  function handleHitDetection() {
    // 元素被 B站 JS 清理 → 转 ghost
    if (state.currentHit?.el && !isElementAlive(state.currentHit.el)) {
      markGhost();
    }

    const hit = findHit(state.mouse.x, state.mouse.y);

    if (hit) {
      if (!state.currentHit || state.currentHit.el !== hit.el) {
        if (state.currentHit?.el && isElementAlive(state.currentHit.el)) unfreeze(state.currentHit.el);
        state.currentHit = hit;
        freeze(hit.el);
        setDbg('hitText', hit.text);
        setDbg('hitType', hit.type);
        showBtn(hit);
      }
      // 每帧更新 lastRect：B站 JS 清理时 getBoundingClientRect 返回零值
      if (state.currentHit?.el && isElementAlive(state.currentHit.el)) {
        state.currentHit.lastRect = state.rectSnapshot.get(state.currentHit.el) || state.currentHit.el.getBoundingClientRect();
      }
      setDbg('currentConnected', isElementAlive(state.currentHit?.el));
    } else {
      refreshHoverState();
    }
  }

  function tick() {
    state.rafScheduled = false;
    lastTickTime = performance.now();

    if (handleNoPlayer()) return;

    state.rectSnapshot = new WeakMap();
    mountOverlay();
    setDbg('frame', DBG.frame + 1);

    if (state.mouseDirty) {
      state.mouseDirty = false;
      setDbg('mouse', `${state.mouse.x},${state.mouse.y}`);
      handleHitDetection();
    }
  }

  // ==================== 事件监听 ====================

  document.addEventListener('mousemove', (e) => {
    state.mouse.x = e.clientX;
    state.mouse.y = e.clientY;
    state.mouseDirty = true;
    scheduleFrame();
  }, { capture: true, passive: true });

  plusBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const now = Date.now();
    if (state.clickLocked || now - state.lastClickAt < TIMING.CLICK_DEBOUNCE_MS) return;
    state.lastClickAt = now;

    if (state.currentHit?.el && !isElementAlive(state.currentHit.el)) markGhost();
    if (!state.currentHit?.text) return;

    state.clickLocked = true;
    setBtnFeedbackSending();
    sendDanmaku(state.currentHit.text);

    setTimeout(() => {
      resetBtnFeedback();
      state.clickLocked = false;
      hideBtn();
      clearCurrentHit();
    }, TIMING.FEEDBACK_MS);
  });

  document.addEventListener('fullscreenchange', () => {
    mountOverlay();
    bindMutationObserverTarget();
    setDbg('fullscreen', !!document.fullscreenElement);
    state.dmListDirty = true;
    state.mouseDirty = true;
    scheduleFrame();
  });

  // MutationObserver：拦截 B站 JS 清理移除的冻结弹幕，检测 ghost
  function bindMutationObserverTarget() {
    const nextTarget = findDmContainer() || document.documentElement;
    if (state.dmObserverTarget === nextTarget) return;
    mo.disconnect();
    state.dmObserverTarget = nextTarget;
    mo.observe(state.dmObserverTarget, { childList: true, subtree: true });
  }

  const mo = new MutationObserver((mutations) => {
    state.dmListDirty = true;

    for (let mi = 0; mi < mutations.length; mi++) {
      const removed = mutations[mi].removedNodes;
      for (let ri = 0; ri < removed.length; ri++) {
        const node = removed[ri];
        if (node.nodeType === Node.ELEMENT_NODE && node.dataset && node.dataset.dm1Frozen === '1') {
          dmSafeContainer.appendChild(node);
        }
      }
    }

    if (state.currentHit?.el && !isElementAlive(state.currentHit.el)) {
      markGhost();
      state.mouseDirty = true;
    }

    if (!state.moPending) {
      state.moPending = true;
      requestAnimationFrame(() => {
        state.moPending = false;
        state.mouseDirty = true;
        scheduleFrame();
      });
    }
  });

  // ==================== Tampermonkey 菜单 ====================

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
        const opts = UI.OPACITY_OPTIONS;
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

  // ==================== 初始化 ====================

  registerMenus();
  mountOverlay();
  bindMutationObserverTarget();
  setDbg('fullscreen', !!document.fullscreenElement);
  setDbg('cooldownMs', CONFIG.cooldownMs);
  setDbg('enableSendCooldown', CONFIG.enableSendCooldown);
  renderDebug();

  state.dmListDirty = true;
  state.mouseDirty = true;
  scheduleFrame();

  console.log('[DM+1] v0.0.1 loaded');
})();
