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

(() => {
  // src/config.js
  var TIMING = {
    CLICK_DEBOUNCE_MS: 320,
    FEEDBACK_MS: 280,
    GHOST_CLEANUP_MS: 3e4,
    NO_PLAYER_THRESHOLD: 30,
    LOW_FREQ_POLL_MS: 2e3,
    LEAVE_DELAY_MS: 50
  };
  var UI = {
    HIT_PADDING_PX: 2,
    MARGIN_PX: 8,
    HORIZONTAL_RATIO: 0.4,
    BTN_APPROX_W: 42,
    BTN_APPROX_H: 26,
    Z_INDEX: 2147483647,
    OPACITY_OPTIONS: [0.3, 0.5, 0.7, 0.8, 0.95]
  };
  var EMOJI_FALLBACK = "[\u8868\u60C5]";
  var DM_CONTAINER_SEL = ".bili-danmaku-x-dm";
  var DM_SCAN_SEL = ".bili-danmaku-x-dm, .bili-danmaku-x-roll";
  var PLAYER_SELECTORS = ".bilibili-live-player-video, #live-player, .live-player-container";
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
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // src/core/env-detector.js
  function isMainFrame() {
    if (window.self === window.top)
      return true;
    return !/\/activity\/|\/blackboard\//.test(location.href);
  }
  function getScope() {
    return document.fullscreenElement || document;
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
        parts.push({ type: "emoji", value: name ? "[" + name + "]" : EMOJI_FALLBACK });
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

  // src/ui/debug-panel.js
  var _debugPanel;
  function initDebugPanel() {
    _debugPanel = document.createElement("div");
    _debugPanel.style.cssText = "position:fixed;left:10px;top:10px;z-index:" + UI.Z_INDEX + ";min-width:360px;max-width:52vw;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.72);color:#7CFFB2;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;white-space:pre-wrap;word-break:break-all;pointer-events:none;display:" + (CONFIG.debug ? "block" : "none");
    var r = root();
    if (_debugPanel.parentNode !== r)
      r.appendChild(_debugPanel);
    return _debugPanel;
  }
  var DBG = {
    frame: 0,
    dmCount: 0,
    mouse: "0,0",
    hitText: "",
    hitType: "",
    btnVisible: false,
    frozen: false,
    currentConnected: false,
    lastSend: "",
    lastErr: "",
    fullscreen: false,
    cooldownMs: CONFIG.cooldownMs,
    enableSendCooldown: CONFIG.enableSendCooldown
  };
  function setDbg(k, v) {
    DBG[k] = v;
    renderDebug();
  }
  function renderDebug() {
    if (!CONFIG.debug || !_debugPanel)
      return;
    _debugPanel.textContent = "[DM+1 DEBUG v0.0.1]\nframe            : " + DBG.frame + "\ndmCount          : " + DBG.dmCount + "\nmouse            : " + DBG.mouse + "\nhitType          : " + (DBG.hitType || "(none)") + "\nhitText          : " + (DBG.hitText || "(none)") + "\nbtnVisible       : " + DBG.btnVisible + "\nfrozen           : " + DBG.frozen + "\ncurrentConnected : " + DBG.currentConnected + "\nlastSend         : " + (DBG.lastSend || "(none)") + "\nlastErr          : " + (DBG.lastErr || "(none)") + "\nenableCooldown   : " + DBG.enableSendCooldown + "\ncooldownMs       : " + DBG.cooldownMs + "\nfullscreen       : " + DBG.fullscreen;
  }

  // src/ui/safe-container.js
  var _safeContainer;
  function ensureSafeContainer() {
    if (!_safeContainer) {
      _safeContainer = document.createElement("div");
      _safeContainer.style.cssText = "position:fixed;inset:0;overflow:visible;pointer-events:none;z-index:" + (UI.Z_INDEX - 1);
    }
    var r = root();
    if (_safeContainer.parentNode !== r)
      r.appendChild(_safeContainer);
    return _safeContainer;
  }
  function rescue(el) {
    ensureSafeContainer();
    el.style.pointerEvents = "auto";
    _safeContainer.appendChild(el);
  }

  // src/ui/button.js
  var _plusBtn;
  function createPlusBtn() {
    _plusBtn = document.createElement("button");
    _plusBtn.textContent = "+1";
    _plusBtn.style.cssText = "position:fixed;display:none;z-index:" + UI.Z_INDEX + ";padding:4px 10px;border:1px solid rgba(255,255,255,.82);border-radius:8px;background:rgba(0,0,0,.86);color:#fff;font-size:12px;line-height:1;cursor:pointer;user-select:none;pointer-events:auto;box-shadow:0 2px 10px rgba(0,0,0,.4);transform:translate(-50%,-50%);will-change:left,top;opacity:" + CONFIG.btnOpacity;
    return _plusBtn;
  }
  function placeBtn(el) {
    if (!el || !isElementAlive(el))
      return;
    var r = el.getBoundingClientRect();
    if (r.width <= 4)
      return;
    var x = r.left + r.width * UI.HORIZONTAL_RATIO;
    var y = r.top + r.height / 2;
    var m = UI.MARGIN_PX;
    x = clamp(x, m + UI.BTN_APPROX_W / 2, innerWidth - m - UI.BTN_APPROX_W / 2);
    y = clamp(y, m + UI.BTN_APPROX_H / 2, innerHeight - m - UI.BTN_APPROX_H / 2);
    _plusBtn.style.left = x + "px";
    _plusBtn.style.top = y + "px";
  }
  function showBtn(el) {
    var r = root();
    if (_plusBtn.parentNode !== r)
      r.appendChild(_plusBtn);
    placeBtn(el);
    _plusBtn.style.display = "block";
    setDbg("btnVisible", true);
  }
  function hideBtn() {
    _plusBtn.style.display = "none";
    setDbg("btnVisible", false);
  }
  function placeBtnTick(el) {
    placeBtn(el);
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
    var wasInSafe = el.parentNode && el.parentNode === document.querySelector("[data-dm1-safe]");
    el.style.animationPlayState = el.dataset.dm1OldAnimPlay || "";
    delete el.dataset.dm1OldAnimPlay;
    delete el.dataset.dm1Frozen;
    if (wasInSafe) {
      el.addEventListener("animationend", function() {
        if (el.parentNode)
          el.remove();
      });
      setTimeout(function() {
        if (el.parentNode)
          el.remove();
      }, TIMING.GHOST_CLEANUP_MS);
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
    setDbg("hitText", "");
    setDbg("hitType", "");
    setDbg("currentConnected", false);
  }

  // src/core/observer.js
  function isDanmuNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE)
      return false;
    if (!(node instanceof HTMLElement))
      return false;
    return node.classList.contains("bili-danmaku-x-dm") || node.classList.contains("bili-danmaku-x-roll");
  }
  function attachEvents(el) {
    if (!(el instanceof HTMLElement))
      return;
    if (el.dataset.dm1Bound === "1")
      return;
    el.dataset.dm1Bound = "1";
    el.style.pointerEvents = "auto";
    el.addEventListener("mouseenter", function() {
      if (state.leaveTimer) {
        clearTimeout(state.leaveTimer);
        state.leaveTimer = 0;
      }
      var payload = getDmText(el);
      if (!payload.text)
        return;
      if (state.currentHit && state.currentHit.el === el)
        return;
      if (state.currentHit) {
        hideBtn();
        clearCurrentHit();
      }
      state.currentHit = { el, text: payload.text, type: payload.type };
      freeze(el);
      setDbg("hitText", payload.text);
      setDbg("hitType", payload.type);
      setDbg("currentConnected", true);
      showBtn(el);
    });
    el.addEventListener("mouseleave", function() {
      state.leaveTimer = setTimeout(function() {
        state.leaveTimer = 0;
        hideBtn();
        clearCurrentHit();
      }, 50);
    });
  }
  function scanAndBind(root2) {
    if (!root2.querySelectorAll)
      return;
    var nodes = root2.querySelectorAll(DM_SCAN_SEL);
    for (var i = 0; i < nodes.length; i++) {
      attachEvents(nodes[i]);
    }
    setDbg("dmCount", 0);
  }
  function findDmContainer() {
    return getScope().querySelector(DM_CONTAINER_SEL);
  }
  var _mo;
  function bindObserverTarget() {
    if (state.dmObserverTarget && !state.dmObserverTarget.isConnected) {
      state.dmObserverTarget = null;
    }
    var scope = getScope();
    var nextTarget = scope.querySelector(DM_CONTAINER_SEL) || scope.querySelector(".bilibili-live-player-video, #live-player") || scope;
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
            attachEvents(node);
          if (node.nodeType === Node.ELEMENT_NODE)
            scanAndBind(node);
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
    return document.querySelector('textarea[placeholder*="\u5F39\u5E55"]') || document.querySelector("textarea") || document.querySelector('input[placeholder*="\u5F39\u5E55"]') || document.querySelector('input[type="text"]');
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
    if (!isMainFrame()) {
      console.log("[DM+1] activity iframe detected, skipping init");
      return;
    }
    var plusBtn = createPlusBtn();
    initDebugPanel();
    ensureSafeContainer();
    setupButtonEvents().injectSender(sendDanmaku);
    plusBtn.addEventListener("mouseenter", function() {
      if (state.leaveTimer) {
        clearTimeout(state.leaveTimer);
        state.leaveTimer = 0;
      }
    });
    plusBtn.addEventListener("mouseleave", function() {
      state.leaveTimer = setTimeout(function() {
        state.leaveTimer = 0;
        hideBtn();
        clearCurrentHit();
      }, TIMING.LEAVE_DELAY_MS);
    });
    document.addEventListener("mousemove", function(e) {
      state.mouse.x = e.clientX;
      state.mouse.y = e.clientY;
      setDbg("mouse", state.mouse.x + "," + state.mouse.y);
    }, { capture: true, passive: true });
    document.addEventListener("fullscreenchange", function() {
      mountOverlay();
      ensureSafeContainer();
      state.dmObserverTarget = null;
      setDbg("fullscreen", !!document.fullscreenElement);
      scheduleFrame();
    });
    var lastTickTime = 0;
    function scheduleFrame() {
      if (state.rafScheduled)
        return;
      state.rafScheduled = true;
      requestAnimationFrame(tick);
    }
    function tick() {
      state.rafScheduled = false;
      lastTickTime = performance.now();
      if (!getScope().querySelector(DM_CONTAINER_SEL) && state.noPlayerCount > TIMING.NO_PLAYER_THRESHOLD) {
        setTimeout(function() {
          scheduleFrame();
        }, TIMING.LOW_FREQ_POLL_MS);
        return;
      }
      if (!getScope().querySelector(DM_CONTAINER_SEL)) {
        state.noPlayerCount++;
      } else {
        state.noPlayerCount = 0;
      }
      mountOverlay();
      ensureSafeContainer();
      bindObserverTarget();
      setDbg("frame", 1);
      if (state.currentHit && state.currentHit.el) {
        setDbg("currentConnected", isElementAlive(state.currentHit.el));
        placeBtnTick(state.currentHit.el);
      }
      scheduleFrame();
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
    var container = findDmContainer() || getScope().querySelector(PLAYER_SELECTORS) || getScope();
    scanAndBind(container);
    setInterval(function() {
      var scope = findDmContainer() || getScope().querySelector(PLAYER_SELECTORS) || getScope();
      scanAndBind(scope);
    }, 2e3);
    scheduleFrame();
    console.log("[DM+1] v0.0.1 loaded");
  })();
})();
