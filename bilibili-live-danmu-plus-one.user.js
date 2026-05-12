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
// @match        *://live.bilibili.com/blanc*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @homepageURL  https://github.com/ZYar-er/bilibili-live-danmu-plus-one
// @supportURL   https://github.com/ZYar-er/bilibili-live-danmu-plus-one/issues
// @updateURL    https://github.com/ZYar-er/bilibili-live-danmu-plus-one/raw/master/bilibili-live-danmu-plus-one.user.js
// @downloadURL  https://github.com/ZYar-er/bilibili-live-danmu-plus-one/raw/master/bilibili-live-danmu-plus-one.user.js
// ==/UserScript==

(() => {
  // src/config.js
  var TIMING = {
    CLICK_DEBOUNCE_MS: 320,
    FEEDBACK_MS: 280,
    GHOST_CLEANUP_MS: 3e4,
    NO_PLAYER_THRESHOLD: 30,
    LOW_FREQ_POLL_MS: 2e3,
    DM_WAIT_POLL_MS: 300,
    DM_SCAN_POLL_MS: 300,
    LEAVE_DELAY_MS: 50
  };
  var UI = {
    HIT_PADDING_PX: 2,
    MARGIN_PX: 8,
    BTN_APPROX_W: 42,
    BTN_APPROX_H: 26,
    Z_INDEX: 2147483647,
    OPACITY_OPTIONS: [0.3, 0.5, 0.7, 0.8, 0.95]
  };
  var DM_CONTAINER_SELECTORS = [
    "#live-player .web-player-danmaku .danmaku-item-container",
    "#live-player .danmaku-item-container",
    ".web-player-danmaku .danmaku-item-container",
    ".danmaku-item-container",
    "#live-player .web-player-danmaku",
    ".web-player-danmaku",
    ".live-player-dm-wrap"
  ];
  var DM_NODE_SELECTOR = '.bili-danmaku-x-dm[role="comment"]';
  function storageGet(key, def) {
    try {
      const v = GM_getValue(key);
      if (v !== void 0)
        return v;
    } catch (e) {
    }
    try {
      const v = localStorage.getItem("dm1_" + key);
      if (v !== null)
        return JSON.parse(v);
    } catch (e) {
    }
    return def;
  }
  function storageSet(key, val) {
    try {
      GM_setValue(key, val);
    } catch (e) {
    }
    try {
      localStorage.setItem("dm1_" + key, JSON.stringify(val));
    } catch (e) {
    }
  }
  var CONFIG = {
    enableSendCooldown: storageGet("enableSendCooldown", true),
    cooldownMs: storageGet("cooldownMs", 2e3),
    cooldownMsOptions: [0, 300, 600, 1200, 2e3, 3e3],
    appendPlusOne: false,
    debug: storageGet("debug", false),
    btnOpacity: storageGet("btnOpacity", 0.8)
  };

  // src/state.js
  var state = {
    currentHit: null,
    // { el, text, type }
    frozenRect: null,
    lastSendAt: 0,
    lastClickAt: 0,
    clickLocked: false,
    mouse: { x: 0, y: 0 },
    rafScheduled: false,
    noPlayerCount: 0,
    dmObserverTarget: null,
    leaveTimer: 0
  };

  // src/utils.js
  function root() {
    return document.fullscreenElement || document.body;
  }
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

  // src/core/env-detector.js
  function getScope() {
    return document.fullscreenElement || document;
  }
  function getPageWindow() {
    if (typeof unsafeWindow !== "undefined")
      return unsafeWindow;
    return window;
  }
  function isActivityShell() {
    if (window.self !== window.top)
      return false;
    var pageWin = getPageWindow();
    if (pageWin && pageWin.__BILIACT_ENV__)
      return true;
    var root2 = document.documentElement;
    if (root2 && root2.getAttribute && root2.getAttribute("data-match-theme") && root2.lang === "zh-Hans") {
      if (document.querySelector('[data-module="eva-page"]'))
        return true;
    }
    return false;
  }

  // src/core/danmu-parser.js
  function getDmText(el) {
    var parts = [];
    el.childNodes.forEach(function(child) {
      if (child.nodeType === Node.TEXT_NODE) {
        var t = child.textContent.replace(/\s+/g, " ").trim();
        if (t)
          parts.push({ type: "text", value: t });
      } else if (child.tagName === "IMG") {
        var name = child.dataset.name || child.getAttribute("alt") || "";
        if (!name && child.classList.contains("bili-danmaku-x-dm-emoji")) {
          name = "\u8868\u60C5";
        }
        if (name)
          parts.push({ type: "emoji", value: "[" + name + "]" });
      } else if (child.tagName === "SPAN" && child.classList.contains("emoji")) {
        parts.push({ type: "emoji-sm", value: child.textContent });
      }
    });
    if (parts.length === 0)
      return { type: "unknown", text: "" };
    var text = parts.map(function(p) {
      return p.value;
    }).join(" ").replace(/\s+/g, " ").trim();
    var hasText = false, hasEmoji = false;
    parts.forEach(function(p) {
      if (p.type === "text")
        hasText = true;
      if (p.type === "emoji" || p.type === "emoji-sm")
        hasEmoji = true;
    });
    var type = hasText && hasEmoji ? "mixed" : hasText ? "text" : hasEmoji ? "emoji" : "unknown";
    return { type, text };
  }

  // src/core/hit-test.js
  var _parsedCache = /* @__PURE__ */ new WeakMap();
  function cacheParsed(el, payload) {
    if (!el)
      return;
    _parsedCache.set(el, payload);
  }
  function getCachedParsed(el) {
    return _parsedCache.get(el);
  }
  function resolveDanmuNode(node) {
    var cur = node;
    while (cur && cur.nodeType === Node.ELEMENT_NODE) {
      if (cur.matches && cur.matches(DM_NODE_SELECTOR))
        return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  function firstMatch(scope, selectors) {
    if (!scope || !scope.querySelector)
      return null;
    for (var i = 0; i < selectors.length; i++) {
      var el = scope.querySelector(selectors[i]);
      if (el)
        return el;
    }
    return null;
  }
  function resolveContainer(container) {
    if (container && isElementAlive(container))
      return container;
    return firstMatch(getScope(), DM_CONTAINER_SELECTORS);
  }
  function buildSelector(el) {
    var parts = [];
    var cur = el;
    for (var i = 0; i < 4 && cur && cur !== document.body; i++) {
      var tag = cur.tagName ? cur.tagName.toLowerCase() : "node";
      var id = cur.id ? "#" + cur.id : "";
      var cls = cur.classList && cur.classList.length ? "." + Array.prototype.slice.call(cur.classList, 0, 2).join(".") : "";
      parts.unshift(tag + id + cls);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }
  function rectText(r) {
    return Math.round(r.left) + "," + Math.round(r.top) + "," + Math.round(r.width) + "," + Math.round(r.height);
  }
  function hitTestFromStack(x, y, container) {
    var stack = document.elementsFromPoint(x, y);
    for (var i = 0; i < stack.length; i++) {
      var el = resolveDanmuNode(stack[i]);
      if (!el)
        continue;
      if (container && !container.contains(el))
        continue;
      if (!isElementAlive(el))
        continue;
      var r = el.getBoundingClientRect();
      if (r.width <= 4)
        continue;
      if (!pointInRect(x, y, r, UI.HIT_PADDING_PX))
        continue;
      return { el, rect: r, rectText: rectText(r), selector: buildSelector(el), source: "elementsFromPoint" };
    }
    return null;
  }
  function fallbackScan(container, x, y) {
    var scope = container || getScope();
    if (!scope || !scope.querySelectorAll)
      return null;
    var nodes = scope.querySelectorAll(DM_NODE_SELECTOR);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!isElementAlive(el))
        continue;
      var r = el.getBoundingClientRect();
      if (r.width <= 4)
        continue;
      if (!pointInRect(x, y, r, UI.HIT_PADDING_PX))
        continue;
      return { el, rect: r, rectText: rectText(r), selector: buildSelector(el), source: "fallbackScan" };
    }
    return null;
  }
  function hitTest(x, y, container) {
    if (x == null || y == null)
      return null;
    var dmContainer = resolveContainer(container);
    if (dmContainer) {
      var cr = dmContainer.getBoundingClientRect();
      if (cr.width > 0 && cr.height > 0 && !pointInRect(x, y, cr, UI.HIT_PADDING_PX))
        return null;
    }
    var hit = hitTestFromStack(x, y, dmContainer);
    if (hit)
      return hit;
    return fallbackScan(dmContainer, x, y);
  }

  // src/ui/safe-container.js
  var _safeContainer;
  function ensureSafeContainer() {
    if (!_safeContainer) {
      _safeContainer = document.createElement("div");
      _safeContainer.dataset.dm1Safe = "1";
      _safeContainer.style.cssText = "position:fixed;inset:0;overflow:visible;pointer-events:none;z-index:" + (UI.Z_INDEX - 1);
    }
    var r = root();
    if (_safeContainer.parentNode !== r)
      r.appendChild(_safeContainer);
    return _safeContainer;
  }
  function getSafeContainer() {
    return _safeContainer;
  }
  function rescue(el) {
    ensureSafeContainer();
    el.style.pointerEvents = "auto";
    _safeContainer.appendChild(el);
  }

  // src/ui/debug-panel.js
  var _debugPanel;
  function initDebugPanel() {
    if (isActivityShell()) {
      var existingTop = document.querySelector('[data-dm1-debug="1"]');
      if (existingTop)
        existingTop.remove();
      return null;
    }
    if (_debugPanel && _debugPanel.isConnected)
      return _debugPanel;
    var existing = document.querySelector('[data-dm1-debug="1"]');
    if (existing) {
      _debugPanel = existing;
      _debugPanel.style.display = CONFIG.debug ? "block" : "none";
      ensureDebugPanelParent();
      return _debugPanel;
    }
    _debugPanel = document.createElement("div");
    _debugPanel.dataset.dm1Debug = "1";
    _debugPanel.style.cssText = "position:fixed;left:10px;top:10px;z-index:" + UI.Z_INDEX + ";min-width:360px;max-width:52vw;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.72);color:#7CFFB2;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;white-space:pre-wrap;word-break:break-all;pointer-events:none;display:" + (CONFIG.debug ? "block" : "none");
    ensureDebugPanelParent();
    return _debugPanel;
  }
  function ensureDebugPanelParent() {
    if (!_debugPanel)
      return;
    var r = root();
    if (_debugPanel.parentNode !== r)
      r.appendChild(_debugPanel);
  }
  var DBG = {
    frame: 0,
    dmCount: 0,
    mouse: "0,0",
    hitText: "",
    hitType: "",
    btnVisible: false,
    frozen: false,
    hitSource: "",
    hitSelector: "",
    hitRect: "",
    currentConnected: false,
    lastSend: "",
    lastErr: "",
    fullscreen: false,
    cooldownMs: CONFIG.cooldownMs,
    enableSendCooldown: CONFIG.enableSendCooldown
  };
  function setDbg(k, v) {
    if (DBG[k] === v)
      return;
    DBG[k] = v;
    renderDebug();
  }
  function renderDebug() {
    if (!CONFIG.debug || !_debugPanel)
      return;
    _debugPanel.textContent = "[DM+1 DEBUG v0.0.1]\nframe            : " + DBG.frame + "\ndmCount          : " + DBG.dmCount + "\nmouse            : " + DBG.mouse + "\nhitType          : " + (DBG.hitType || "(none)") + "\nhitText          : " + (DBG.hitText || "(none)") + "\nhitSource        : " + (DBG.hitSource || "(none)") + "\nhitSelector      : " + (DBG.hitSelector || "(none)") + "\nhitRect          : " + (DBG.hitRect || "(none)") + "\nbtnVisible       : " + DBG.btnVisible + "\nfrozen           : " + DBG.frozen + "\ncurrentConnected : " + DBG.currentConnected + "\nlastSend         : " + (DBG.lastSend || "(none)") + "\nlastErr          : " + (DBG.lastErr || "(none)") + "\nenableCooldown   : " + DBG.enableSendCooldown + "\ncooldownMs       : " + DBG.cooldownMs + "\nfullscreen       : " + DBG.fullscreen;
  }

  // src/core/observer.js
  function firstMatch2(scope, selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var el = scope.querySelector(selectors[i]);
      if (el)
        return el;
    }
    return null;
  }
  function isDanmuNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE)
      return false;
    if (!(node instanceof HTMLElement))
      return false;
    if (node.matches && node.matches(DM_NODE_SELECTOR))
      return true;
    return false;
  }
  function cacheIfNeeded(el) {
    if (!(el instanceof HTMLElement))
      return;
    var cached = getCachedParsed(el);
    if (cached)
      return;
    var parsed = getDmText(el);
    cacheParsed(el, parsed);
  }
  function scanAndCache(root2) {
    if (!root2 || !root2.querySelectorAll)
      return;
    var nodes = root2.querySelectorAll(DM_NODE_SELECTOR);
    var count = 0;
    for (var i = 0; i < nodes.length; i++) {
      cacheIfNeeded(nodes[i]);
      count++;
    }
    var container = findDmContainer();
    if (container && root2 === container) {
      setDbg("dmCount", count);
    } else if (!container) {
      setDbg("dmCount", 0);
    }
  }
  function findDmContainer() {
    return firstMatch2(getScope(), DM_CONTAINER_SELECTORS);
  }
  var _mo;
  function bindObserverTarget() {
    if (state.dmObserverTarget && !state.dmObserverTarget.isConnected) {
      state.dmObserverTarget = null;
    }
    var scope = getScope();
    var nextTarget = findDmContainer() || scope.querySelector(".bilibili-live-player-video, #live-player") || scope;
    if (state.dmObserverTarget === nextTarget)
      return;
    if (_mo)
      _mo.disconnect();
    state.dmObserverTarget = nextTarget;
    _mo = new MutationObserver(function(mutations) {
      for (var mi = 0; mi < mutations.length; mi++) {
        var added = mutations[mi].addedNodes;
        var removed = mutations[mi].removedNodes;
        for (var ai = 0; ai < added.length; ai++) {
          var node = added[ai];
          if (isDanmuNode(node))
            cacheIfNeeded(node);
          if (node.nodeType === Node.ELEMENT_NODE)
            scanAndCache(node);
        }
        for (var ri = 0; ri < removed.length; ri++) {
          var rm = removed[ri];
          if (rm.nodeType === Node.ELEMENT_NODE && rm.dataset && rm.dataset.dm1Frozen === "1") {
            rescue(rm);
            setDbg("currentConnected", true);
          }
        }
      }
    });
    _mo.observe(state.dmObserverTarget, { childList: true, subtree: true });
  }

  // src/ui/button.js
  var _plusBtn;
  function createPlusBtn() {
    _plusBtn = document.createElement("button");
    _plusBtn.textContent = "+1";
    _plusBtn.style.cssText = "position:fixed;display:none;z-index:" + UI.Z_INDEX + ";padding:4px 10px;border:1px solid rgba(255,255,255,.82);border-radius:8px;background:rgba(0,0,0,.86);color:#fff;font-size:12px;line-height:1;cursor:pointer;user-select:none;pointer-events:auto;box-shadow:0 2px 10px rgba(0,0,0,.4);transform:translate(-50%,-50%);will-change:left,top;opacity:" + CONFIG.btnOpacity;
    return _plusBtn;
  }
  function placeBtn(el, rect) {
    if (!el || !isElementAlive(el))
      return;
    var r = rect || el.getBoundingClientRect();
    if (r.width <= 4)
      return;
    var halfW = UI.BTN_APPROX_W / 2;
    var x = clamp(state.mouse.x, r.left + halfW, r.right - halfW);
    if (r.right - r.left < UI.BTN_APPROX_W)
      x = r.left + r.width / 2;
    var y = r.top + r.height / 2;
    var m = UI.MARGIN_PX;
    x = clamp(x, m + halfW, innerWidth - m - halfW);
    y = clamp(y, m + UI.BTN_APPROX_H / 2, innerHeight - m - UI.BTN_APPROX_H / 2);
    _plusBtn.style.left = x + "px";
    _plusBtn.style.top = y + "px";
  }
  function showBtn(el, rect) {
    var r = root();
    if (_plusBtn.parentNode !== r)
      r.appendChild(_plusBtn);
    placeBtn(el, rect);
    _plusBtn.style.display = "block";
    setDbg("btnVisible", true);
  }
  function hideBtn() {
    _plusBtn.style.display = "none";
    setDbg("btnVisible", false);
  }
  function placeBtnTick(el, rect) {
    placeBtn(el, rect);
  }
  function mountOverlay() {
    var r = root();
    if (_plusBtn && _plusBtn.parentNode !== r)
      r.appendChild(_plusBtn);
  }
  function setupButtonEvents() {
    _plusBtn.addEventListener("mouseenter", function() {
      if (state.leaveTimer) {
        clearTimeout(state.leaveTimer);
        state.leaveTimer = 0;
      }
    });
    _plusBtn.addEventListener("mouseleave", function() {
      state.leaveTimer = setTimeout(function() {
        state.leaveTimer = 0;
        hideBtn();
        clearCurrentHit();
      }, TIMING.LEAVE_DELAY_MS);
    });
    var _sendDanmaku;
    _plusBtn.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      var now = Date.now();
      if (state.clickLocked || now - state.lastClickAt < TIMING.CLICK_DEBOUNCE_MS)
        return;
      state.lastClickAt = now;
      if (!state.currentHit || !state.currentHit.text)
        return;
      state.clickLocked = true;
      setBtnFeedback();
      _sendDanmaku(state.currentHit.text);
      setTimeout(function() {
        resetBtnFeedback();
        state.clickLocked = false;
        hideBtn();
        clearCurrentHit();
      }, TIMING.FEEDBACK_MS);
    });
    return {
      injectSender: function(sendFn) {
        _sendDanmaku = sendFn;
      }
    };
  }
  function setBtnFeedback() {
    _plusBtn.textContent = "\u2713";
    _plusBtn.disabled = true;
    _plusBtn.style.opacity = "0.7";
    _plusBtn.style.cursor = "default";
  }
  function resetBtnFeedback() {
    _plusBtn.textContent = "+1";
    _plusBtn.disabled = false;
    _plusBtn.style.opacity = CONFIG.btnOpacity;
    _plusBtn.style.cursor = "";
  }
  function parseDurationMs(value) {
    var v = String(value || "").trim();
    if (!v)
      return 0;
    if (v.endsWith("ms"))
      return parseFloat(v) || 0;
    if (v.endsWith("s"))
      return (parseFloat(v) || 0) * 1e3;
    return parseFloat(v) || 0;
  }
  function shouldRemoveGhostNow(el) {
    var cs = getComputedStyle(el);
    if (!cs)
      return false;
    var name = cs.animationName;
    if (!name || name === "none")
      return true;
    var durations = String(cs.animationDuration || "").split(",");
    for (var i = 0; i < durations.length; i++) {
      if (parseDurationMs(durations[i]) > 0)
        return false;
    }
    return true;
  }
  function freeze(el) {
    if (!isElementAlive(el))
      return;
    if (el.dataset.dm1Frozen === "1")
      return;
    el.dataset.dm1Frozen = "1";
    el.dataset.dm1OldAnimPlay = el.style.animationPlayState || "";
    el.style.setProperty("animation-play-state", "paused", "important");
    setDbg("frozen", true);
  }
  function unfreeze(el) {
    if (!el || el.dataset.dm1Frozen !== "1")
      return;
    var safeContainer = getSafeContainer();
    var wasInSafe = el.parentNode && safeContainer && el.parentNode === safeContainer;
    el.style.animationPlayState = el.dataset.dm1OldAnimPlay || "";
    delete el.dataset.dm1OldAnimPlay;
    delete el.dataset.dm1Frozen;
    if (wasInSafe) {
      if (shouldRemoveGhostNow(el)) {
        if (el.parentNode)
          el.remove();
      } else if (el.dataset.dm1RescueCleaned !== "1") {
        el.dataset.dm1RescueCleaned = "1";
        el.addEventListener("animationend", function() {
          if (el.parentNode)
            el.remove();
        });
        setTimeout(function() {
          if (el.parentNode)
            el.remove();
        }, TIMING.GHOST_CLEANUP_MS);
      }
    }
    setDbg("frozen", false);
  }
  function clearCurrentHit() {
    var el = state.currentHit && state.currentHit.el;
    if (el && isElementAlive(el)) {
      unfreeze(el);
      if (el.parentNode && el.parentNode.dataset && el.parentNode.dataset.dm1Safe === "1") {
        el.remove();
      }
    }
    state.currentHit = null;
    state.frozenRect = null;
    setDbg("hitText", "");
    setDbg("hitType", "");
    setDbg("currentConnected", false);
  }

  // src/sender/input-sender.js
  function setNativeValue(el, value) {
    var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set)
      desc.set.call(el, value);
    else
      el.value = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: value }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function findInput() {
    return document.querySelector("#fullscreen-danmaku-vm .chat-input") || document.querySelector(".chat-input");
  }
  function findSendBtn() {
    var btns = document.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      var span = btns[i].querySelector("span.txt");
      if (span && span.textContent.trim() === "\u53D1\u9001")
        return btns[i];
    }
    return null;
  }
  function canSend(now) {
    if (!CONFIG.enableSendCooldown)
      return true;
    return now - state.lastSendAt >= CONFIG.cooldownMs;
  }
  function sendDanmaku(text) {
    var now = Date.now();
    if (!canSend(now)) {
      setDbg("lastErr", "cooldown");
      return false;
    }
    var input = findInput();
    if (!input) {
      setDbg("lastErr", "input_not_found");
      return false;
    }
    var finalText = CONFIG.appendPlusOne ? text + " +1" : text;
    input.focus();
    setNativeValue(input, finalText);
    state.lastSendAt = now;
    var btn = findSendBtn();
    if (btn) {
      btn.click();
      setDbg("lastErr", "");
    } else {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
      setDbg("lastErr", "send_btn_not_found_use_enter");
    }
    setDbg("lastSend", finalText);
    return true;
  }

  // src/index.js
  (function init() {
    if (isActivityShell()) {
      console.log("[DM+1] activity shell detected, skip init in top document");
      return;
    }
    function hasLocalDanmaku() {
      return !!(findDmContainer() || getScope().querySelector(DM_NODE_SELECTOR) || getScope().querySelector(DM_CONTAINER_SELECTORS.join(",")));
    }
    function hasDanmakuInIframes() {
      if (window.self !== window.top)
        return false;
      var frames = document.querySelectorAll("iframe");
      for (var i = 0; i < frames.length; i++) {
        try {
          var d = frames[i].contentDocument;
          if (!d)
            continue;
          if (d.querySelector(DM_NODE_SELECTOR) || d.querySelector(DM_CONTAINER_SELECTORS.join(",")))
            return true;
        } catch (e) {
        }
      }
      return false;
    }
    if (!hasLocalDanmaku() && hasDanmakuInIframes()) {
      console.log("[DM+1] danmaku detected inside iframe, skip init in top document");
      return;
    }
    var plusBtn = createPlusBtn();
    initDebugPanel();
    ensureSafeContainer();
    setupButtonEvents().injectSender(sendDanmaku);
    document.addEventListener("mousemove", function(e) {
      state.mouse.x = e.clientX;
      state.mouse.y = e.clientY;
      mouseDirty = true;
      scheduleFrame();
    }, { capture: true, passive: true });
    document.addEventListener("fullscreenchange", function() {
      mountOverlay();
      ensureSafeContainer();
      ensureDebugPanelParent();
      state.dmObserverTarget = null;
      setDbg("fullscreen", !!document.fullscreenElement);
      scheduleFrame();
    });
    var lastTickTime = 0;
    var frameCount = 0;
    var containerWaitTimer = 0;
    var mouseDirty = false;
    function scheduleFrame() {
      if (state.rafScheduled)
        return;
      state.rafScheduled = true;
      requestAnimationFrame(tick);
    }
    function startContainerWaiter() {
      if (containerWaitTimer)
        return;
      containerWaitTimer = setInterval(function() {
        var container2 = findDmContainer();
        if (container2) {
          scanAndCache(container2);
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
      if (!state.currentHit)
        return;
      if (state.leaveTimer)
        return;
      state.leaveTimer = setTimeout(function() {
        state.leaveTimer = 0;
        hideBtn();
        clearCurrentHit();
        setDbg("hitSource", "");
        setDbg("hitSelector", "");
        setDbg("hitRect", "");
      }, TIMING.LEAVE_DELAY_MS);
    }
    function tick() {
      state.rafScheduled = false;
      lastTickTime = performance.now();
      var dmContainer = findDmContainer();
      if (CONFIG.debug)
        setDbg("mouse", state.mouse.x + "," + state.mouse.y);
      if (!dmContainer) {
        state.noPlayerCount++;
        startContainerWaiter();
        if (state.noPlayerCount > TIMING.NO_PLAYER_THRESHOLD) {
          setTimeout(function() {
            scheduleFrame();
          }, TIMING.LOW_FREQ_POLL_MS);
          return;
        }
      } else {
        state.noPlayerCount = 0;
      }
      mountOverlay();
      ensureSafeContainer();
      ensureDebugPanelParent();
      bindObserverTarget();
      if (CONFIG.debug)
        setDbg("frame", ++frameCount);
      if (state.currentHit && state.currentHit.el && !isElementAlive(state.currentHit.el)) {
        hideBtn();
        clearCurrentHit();
      }
      if (mouseDirty) {
        mouseDirty = false;
        var hit = hitTest(state.mouse.x, state.mouse.y, dmContainer);
        if (!hit) {
          handleNoHit();
        } else {
          if (state.leaveTimer) {
            clearTimeout(state.leaveTimer);
            state.leaveTimer = 0;
          }
          var payload = resolvePayload(hit.el);
          if (!payload.text) {
            handleNoHit();
          } else {
            if (!state.currentHit || state.currentHit.el !== hit.el) {
              if (state.currentHit) {
                hideBtn();
                clearCurrentHit();
              }
              state.currentHit = { el: hit.el, text: payload.text, type: payload.type };
              freeze(hit.el);
              state.frozenRect = hit.rect;
              showBtn(hit.el, state.frozenRect);
            } else {
              state.currentHit.text = payload.text;
              state.currentHit.type = payload.type;
            }
            setDbg("hitText", payload.text);
            setDbg("hitType", payload.type);
            setDbg("hitSource", hit.source || "");
            setDbg("hitSelector", hit.selector || "");
            setDbg("hitRect", hit.rectText || "");
            setDbg("currentConnected", true);
          }
        }
      }
      if (state.currentHit && state.currentHit.el) {
        setDbg("currentConnected", isElementAlive(state.currentHit.el));
        placeBtnTick(state.currentHit.el, state.frozenRect);
      }
      if (mouseDirty || state.currentHit) {
        scheduleFrame();
      }
    }
    function registerMenus() {
      try {
        GM_registerMenuCommand("\u5207\u6362\u53D1\u9001\u51B7\u5374", function() {
          CONFIG.enableSendCooldown = !CONFIG.enableSendCooldown;
          storageSet("enableSendCooldown", CONFIG.enableSendCooldown);
          setDbg("enableSendCooldown", CONFIG.enableSendCooldown);
        });
        CONFIG.cooldownMsOptions.forEach(function(ms) {
          var label = ms === 0 ? "\u65E0\u95F4\u9694" : (ms / 1e3).toFixed(1) + "s";
          GM_registerMenuCommand("\u53D1\u9001\u95F4\u9694 \u2192 " + label, function() {
            CONFIG.cooldownMs = ms;
            storageSet("cooldownMs", ms);
            setDbg("cooldownMs", ms);
            console.log("[DM+1] \u53D1\u9001\u95F4\u9694:", label);
          });
        });
        GM_registerMenuCommand("\u5207\u6362\u6309\u94AE\u900F\u660E\u5EA6", function() {
          var opts = UI.OPACITY_OPTIONS;
          var idx = opts.indexOf(CONFIG.btnOpacity);
          CONFIG.btnOpacity = opts[(idx + 1) % opts.length];
          storageSet("btnOpacity", CONFIG.btnOpacity);
          plusBtn.style.opacity = CONFIG.btnOpacity;
        });
        GM_registerMenuCommand("\u5207\u6362\u8C03\u8BD5\u9762\u677F", function() {
          CONFIG.debug = !CONFIG.debug;
          storageSet("debug", CONFIG.debug);
          var dp = document.querySelector("[data-dm1-debug]");
          if (dp)
            dp.style.display = CONFIG.debug ? "block" : "none";
          if (CONFIG.debug) {
            renderDebug();
          }
        });
        GM_registerMenuCommand("\u91CD\u7F6E\u6240\u6709\u8BBE\u7F6E", function() {
          ["enableSendCooldown", "cooldownMs", "debug", "btnOpacity"].forEach(function(k) {
            try {
              GM_deleteValue && GM_deleteValue(k);
            } catch (e) {
            }
            try {
              localStorage.removeItem("dm1_" + k);
            } catch (e) {
            }
          });
          location.reload();
        });
      } catch (e) {
      }
    }
    setDbg("fullscreen", !!document.fullscreenElement);
    setDbg("cooldownMs", CONFIG.cooldownMs);
    setDbg("enableSendCooldown", CONFIG.enableSendCooldown);
    renderDebug();
    registerMenus();
    var container = findDmContainer();
    if (container)
      scanAndCache(container);
    else
      setDbg("dmCount", 0);
    startContainerWaiter();
    setInterval(function() {
      var scope = findDmContainer();
      if (scope)
        scanAndCache(scope);
      else
        setDbg("dmCount", 0);
    }, TIMING.DM_SCAN_POLL_MS);
    scheduleFrame();
    console.log("[DM+1] v0.0.1 loaded");
  })();
})();
