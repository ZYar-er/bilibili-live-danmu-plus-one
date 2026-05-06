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

  // 仅在实际直播间页面运行（非 iframe、非 /all /p/ 等聚合页）
  if (window.top !== window.self) return;
  if (!/^\/\d+($|\/)/.test(location.pathname)) return;

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
  let noPlayerCount = 0; // 连续无播放器帧数，超阈值则降频
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

  // B站 JS 清理定时器回收冻结弹幕时，移入此容器保持存活
  const dmSafeContainer = document.createElement('div');
  dmSafeContainer.style.cssText = `
    position: fixed;
    inset: 0;
    overflow: visible;
    pointer-events: none;
    z-index: ${CONFIG.zIndexBtn - 1};
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
    if (dmSafeContainer.parentNode !== r) r.appendChild(dmSafeContainer);
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

  // 从 img.emote 提取表情代码（优先 alt → title → aria-label → URL推断 → fallback）
  function getEmojiCode(img) {
    const alt = (img.getAttribute('alt') || '').trim();
    if (alt) return alt;
    const title = (img.getAttribute('title') || '').trim();
    if (title) return title;
    const aria = (img.getAttribute('aria-label') || '').trim();
    if (aria) return aria;
    if (CONFIG.inferEmojiFromImageUrl) {
      const inferred = inferEmojiNameFromSrc(img.getAttribute('src') || '');
      if (inferred) return inferred;
    }
    return CONFIG.imageFallbackText;
  }

  // 遍历 childNodes 重建弹幕内容，正确处理图文混合
  function extractDmPayload(el) {
    const parts = [];
    const has = { text: false, emoji: false, large: false };

    function walk(node) {
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.TEXT_NODE) {
          const t = child.textContent.replace(/\s+/g, ' ').trim();
          if (t) { parts.push({ type: 'text', text: t }); has.text = true; }
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          // 检查元素本身是否是 emote img
          if (child.matches && child.matches('img.emote')) {
            const code = getEmojiCode(child);
            const isLarge = !!child.closest('.emote--bulge');
            parts.push({ type: isLarge ? 'emoji-large' : 'emoji', text: code });
            if (isLarge) has.large = true; else has.emoji = true;
          } else {
            // 检查子元素中是否有 emote img（如 .emote-wrap 包裹）
            const innerImg = child.querySelector && child.querySelector('img.emote');
            if (innerImg) {
              const code = getEmojiCode(innerImg);
              const isLarge = !!innerImg.closest('.emote--bulge');
              parts.push({ type: isLarge ? 'emoji-large' : 'emoji', text: code });
              if (isLarge) has.large = true; else has.emoji = true;
            } else {
              // 普通容器 → 递归
              walk(child);
            }
          }
        }
      }
    }

    walk(el);

    if (parts.length === 0) return { type: 'unknown', text: '', parts };

    const allText = parts.map(p => p.text).join('');

    let aggregateType = 'unknown';
    const hasEmoji = has.emoji || has.large;
    if (has.text && hasEmoji) aggregateType = 'mixed';
    else if (has.text) aggregateType = 'text';
    else if (has.large && !has.emoji) aggregateType = 'emoji-large';
    else if (has.emoji) aggregateType = 'emoji';

    return { type: aggregateType, text: allText, parts };
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
    // 快照 rect：B站可能通过 JS 定时器移除元素，rect 届时不可用
    if (currentHit) currentHit.lastRect = el.getBoundingClientRect();
    setDbg('frozen', true);
  }

  function scheduleRescuedCleanup(el) {
    // 安全容器内的元素恢复动画后，监听 animationend 自动移除
    el.addEventListener('animationend', () => {
      const active = el.getAnimations().filter(
        a => a.playState === 'running' || a.playState === 'pending'
      );
      if (active.length === 0 && el.parentNode) el.remove();
    });
    // 保险兜底：30s 后仍存活则移除（animationend 可能因 pause 历史丢失）
    setTimeout(() => { if (el.parentNode) el.remove(); }, 30000);
  }

  function unfreeze(el) {
    if (!el) return;
    if (el.dataset.dm1Frozen !== '1') return;
    const wasRescued = el.parentNode === dmSafeContainer;
    el.style.animationPlayState = el.dataset.dm1OldAnimPlay || '';
    delete el.dataset.dm1OldAnimPlay;
    delete el.dataset.dm1Frozen;
    if (wasRescued) scheduleRescuedCleanup(el);
    setDbg('frozen', false);
  }

  function clearCurrentHit() {
    if (currentHit?.el && isElementAlive(currentHit.el)) unfreeze(currentHit.el);
    currentHit = null;
    setDbg('hitText', '');
    setDbg('hitType', '');
    setDbg('currentConnected', false);
  }

  // 当前命中元素被 B站 JS 清理移除 → 转为 ghost 模式，保留文本和最后位置
  function markGhost() {
    if (!currentHit || !currentHit.text) return;
    if (currentHit.lastRect) return; // 已是 ghost
    // 保存元素消失前最后一帧的 rect
    if (currentHit.el && currentHit.el.getBoundingClientRect) {
      const r = currentHit.el.getBoundingClientRect();
      if (r.width > 0) currentHit.lastRect = r;
    }
    currentHit.el = null; // 释放已断开连接的 DOM 引用
    setDbg('currentConnected', false);
  }

  function placeBtnInDanmakuRowAt20(hit) {
    if (!hit) return;
    // ghost 模式：使用保存的最后位置
    if (!hit.el) {
      if (!hit.lastRect) return;
      const r = hit.lastRect;
      let x = r.left + r.width * CONFIG.horizontalRatio;
      let y = CONFIG.yInRowMode ? (r.top + r.height / 2) : (r.bottom + CONFIG.btnApproxH / 2);
      const m = CONFIG.marginPx;
      x = clamp(x, m + CONFIG.btnApproxW / 2, innerWidth - m - CONFIG.btnApproxW / 2);
      y = clamp(y, m + CONFIG.btnApproxH / 2, innerHeight - m - CONFIG.btnApproxH / 2);
      plusBtn.style.left = `${x}px`;
      plusBtn.style.top = `${y}px`;
      return;
    }
    if (!isElementAlive(hit.el)) return;

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
    // ghost 模式：弹幕已被 B站移除，但保留文本 + 最后位置，按钮继续显示
    if (!currentHit?.el) {
      if (currentHit?.lastRect) {
        const gw = currentHit.lastRect;
        const inGhost = pointInRect(mouse.x, mouse.y, gw, CONFIG.hitPaddingPx);
        const br = plusBtn.getBoundingClientRect();
        const inBtn = plusBtn.style.display === 'block' && pointInRect(mouse.x, mouse.y, br, 0);
        if (inGhost || inBtn) {
          if (plusBtn.style.display !== 'block') showBtn(currentHit);
          return;
        }
        // 鼠标已离开 ghost 区域 → 彻底清理
        hideBtn();
        clearCurrentHit();
        return;
      }
      // 无 ghost rect 也无 el → 安全退出
      if (plusBtn.style.display !== 'none') hideBtn();
      clearCurrentHit();
      return;
    }

    if (!isElementAlive(currentHit.el)) {
      markGhost();
      // 递归：下次 tick 进入 ghost 分支
      return;
    }

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

  let lastTickTime = 0;

  function scheduleFrame() {
    if (rafScheduled) return;
    // 未开播降频：mousemove 等事件仍会触发 scheduleFrame，限制最低间隔
    if (noPlayerCount > 30) {
      const now = performance.now();
      if (now - lastTickTime < 2000) return;
    }
    rafScheduled = true;
    requestAnimationFrame(tick);
  }

  function tick() {
    rafScheduled = false;
    lastTickTime = performance.now();

    // 未开播检测：无播放器容器且无弹幕节点 → 降频轮询
    if (!findDmContainer() && dmNodeList.length === 0) {
      noPlayerCount++;
      if (noPlayerCount > 30) {
        // ~0.5s 无播放器 → 切换到 2s 低频轮询，开播后恢复正常帧率
        setTimeout(() => {
          dmListDirty = true;
          scheduleFrame();
        }, 2000);
        return;
      }
    } else {
      noPlayerCount = 0;
    }

    rectSnapshot = new WeakMap();
    // 每次 rAF 确保 overlay 挂载在正确的 root 下（SPA 路由切换时 root 可能被替换）
    mountOverlay();
    setDbg('frame', DBG.frame + 1);

    if (mouseDirty) {
      mouseDirty = false;
      setDbg('mouse', `${mouse.x},${mouse.y}`);

      if (currentHit?.el && !isElementAlive(currentHit.el)) {
        markGhost();
      }

      const hit = findHitLive(mouse.x, mouse.y);

      if (hit) {
        if (!currentHit || currentHit.el !== hit.el) {
          if (currentHit?.el && isElementAlive(currentHit.el)) unfreeze(currentHit.el);
          currentHit = hit;
          freeze(hit.el);
          setDbg('hitText', hit.text);
          setDbg('hitType', hit.type);
          showBtn(currentHit);
        }
        // 每帧更新 lastRect：B站 JS 清理时 getBoundingClientRect 返回零值
        if (currentHit?.el && isElementAlive(currentHit.el)) {
          currentHit.lastRect = rectSnapshot.get(currentHit.el) || currentHit.el.getBoundingClientRect();
        }
        setDbg('currentConnected', isElementAlive(currentHit?.el));
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

    // ghost 模式：el 已回收但 text 仍有效，继续发送
    if (currentHit?.el && !isElementAlive(currentHit.el)) {
      markGhost();
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

  const mo = new MutationObserver((mutations) => {
    dmListDirty = true;

    // 拦截 B站 JS 清理定时器移除的冻结弹幕 → 移入安全容器保持存活
    for (let mi = 0; mi < mutations.length; mi++) {
      const removed = mutations[mi].removedNodes;
      for (let ri = 0; ri < removed.length; ri++) {
        const node = removed[ri];
        if (node.nodeType === Node.ELEMENT_NODE && node.dataset && node.dataset.dm1Frozen === '1') {
          dmSafeContainer.appendChild(node);
        }
      }
    }

    // 当前命中元素被 B站 JS 定时清理 → 保留 ghost，不隐藏按钮
    if (currentHit?.el && !isElementAlive(currentHit.el)) {
      markGhost();
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