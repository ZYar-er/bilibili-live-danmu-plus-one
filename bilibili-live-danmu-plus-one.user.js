// ==UserScript==
// @name         B站直播弹幕 +1
// @name:zh-CN   B站直播弹幕 +1
// @namespace    https://github.com/ZYar-er/bilibili-live-danmu-plus-one
// @version      0.0.4
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
// @updateURL    https://github.com/ZYar-er/bilibili-live-danmu-plus-one/releases/latest/download/bilibili-live-danmu-plus-one.user.js
// @downloadURL  https://github.com/ZYar-er/bilibili-live-danmu-plus-one/releases/latest/download/bilibili-live-danmu-plus-one.user.js
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

  // src/emoji-map.js
  var EMOJI_ID_TO_NAME = {
    "4428c84e694fbf4e0ef6c06e958d9352c3582740": "dog",
    "7dd2ef03e13998575e4d8a803c6e12909f94e72b": "\u82B1",
    "08f735d950a0fba267dda140673c9ab2edf6410d": "\u5999",
    "650c3e22c06edcbca9756365754d38952fc019c3": "\u54C7",
    "1daaa5d284dafaa16c51409447da851ff1ec557f": "\u7231",
    "b159f90431148a973824f596288e7ad6a8db014b": "\u624B\u673A",
    "4255ce6ed5d15b60311728a803d03dd9a24366b2": "\u6487\u5634",
    "69312e99a00d1db2de34ef2db9220c5686643a3f": "\u59D4\u5C48",
    "a7feb260bb5b15f97d7119b444fc698e82516b9f": "\u6293\u72C2",
    "4e029593562283f00d39b99e0557878c4199c71d": "\u6BD4\u5FC3",
    "2dd666d3651bafe8683acf770b7f4163a5f49809": "\u8D5E",
    "8624fd172037573c8600b2597e3731ef0e5ea983": "\u6ED1\u7A3D",
    "ffb53c252b085d042173379ac724694ce3196194": "\u5403\u74DC",
    "c5436c6806c32b28d471bb23d42f0f8f164a187a": "\u7B11\u54ED",
    "e6073c6849f735ae6cb7af3a20ff7dcec962b4c5": "\u6342\u8138",
    "b51824125d09923a4ca064f0c0b49fc97d3fab79": "\u559D\u5F69",
    "e2ba16f947a23179cdc00420b71cc1d627d8ae25": "\u5077\u7B11",
    "e2589d086df0db8a7b5ca2b1273c02d31d4433d4": "\u5927\u7B11",
    "9c75761c5b6e1ff59b29577deb8e6ad996b86bd7": "\u60CA\u559C",
    "b5b44f099059a1bafb2c2722cfe9a6f62c1dc531": "\u50B2\u5A07",
    "492b10d03545b7863919033db7d1ae3ef342df2f": "\u75BC",
    "c6bed64ffb78c97c93a83fbd22f6fdf951400f31": "\u5413",
    "a4df45c035b0ca0c58f162b5fb5058cf273d0d09": "\u9634\u9669",
    "bc26f29f62340091737c82109b8b91f32e6675ad": "\u60CA\u8BB6",
    "84c92239591e5ece0f986c75a39050a5c61c803c": "\u751F\u75C5",
    "b6226219384befa5da1d437cb2ff4ba06c303844": "\u5618",
    "5935e6a4103d024955f749d428311f39e120a58a": "\u5978\u7B11",
    "204413d3cf330e122230dcc99d29056f2a60e6f2": "\u56E7",
    "a2ad0cc7e390a303f6d243821479452d31902a5f": "\u6342\u81382",
    "bb8e95fa54512ffea07023ea4f2abee4a163e7a0": "\u51FA\u7A8D",
    "2b6b4cc33be42c3257dc1f6ef3a39d666b6b4b1a": "\u5410\u4E86\u554A",
    "f4ed20a70d0cb85a22c0c59c628aedfe30566b37": "\u9F3B\u5B50",
    "84fe12ecde5d3875e1090d83ac9027cb7d7fba9f": "\u8C03\u76AE",
    "98fd92c6115b0d305f544b209c78ec322e4bb4ff": "\u9178",
    "b804118a1bdb8f3bec67d9b108d5ade6e3aa93a9": "\u51B7",
    "86268b09e35fbe4215815a28ef3cf25ec71c124f": "OK",
    "f605dd8229fa0115e57d2f16cb019da28545452b": "\u5FAE\u7B11",
    "05ef7849e7313e9c32887df922613a7c1ad27f12": "\u85CF\u72D0",
    "8b99266ea7b9e86cf9d25c3d1151d80c5ba5c9a1": "\u9F87\u7259",
    "17435e60dcc28ce306762103a2a646046ff10b0a": "\u9632\u62A4",
    "a91a27f83c38b5576f4cd08d4e11a2880de78918": "\u7B11",
    "8d436de0c3701d87e4ca9c1be01c01b199ac198e": "\u4E00\u822C",
    "c409425ba1ad2c6534f0df7de350ba83a9c949e5": "\u5ACC\u5F03",
    "4781a77be9c8f0d4658274eb4e3012c47a159f23": "\u65E0\u8BED",
    "6e496946725cd66e7ff1b53021bf1cc0fc240288": "\u54C8\u6B20",
    "8e88e6a137463703e96d4f27629f878efa323456": "\u53EF\u601C",
    "bea1f0497888f3e9056d3ce14ba452885a485c02": "\u6B6A\u5634\u7B11",
    "10662d9c0d6ddb3203ecf50e77788b959d4d1928": "\u4EB2\u4EB2",
    "a0c456b6d9e3187399327828a9783901323bfdb5": "\u95EE\u53F7",
    "57dee478868ed9f1ce3cf25a36bc50bde489c404": "\u6CE2\u5409",
    "0d5123cddf389302df6f605087189fd10919dc3c": "OH",
    "f408e2af700adcc2baeca15510ef620bed8d4c43": "\u518D\u89C1",
    "7fa907ae85fa6327a0466e123aee1ac32d7c85f7": "\u767D\u773C",
    "d581d0bc30c8f9712b46ec02303579840c72c42d": "\u9F13\u638C",
    "816402551e6ce30d08b37a917f76dea8851fe529": "\u5927\u54ED",
    "179c7e2d232cd74f30b672e12fc728f8f62be9ec": "\u5446",
    "b00e2e02904096377061ec5f93bf0dd3321f1964": "\u6D41\u6C57",
    "2c69dad2e5c0f72f01b92746bc9d148aee1993b2": "\u751F\u6C14",
    "fbc3c8bc4152a65bbf4a9fd5a5d27710fbff2119": "\u52A0\u6CB9",
    "d8ce9b05c0e40cec61a15ba1979c8517edd270bf": "\u5BB3\u7F9E",
    "a51af0d7d9e60ce24f139c468a3853f9ba9bb184": "\u864E\u5E74",
    "f547cc853cf43e70f1e39095d9b3b5ac1bf70a8d": "doge2",
    "b6e8131897a9a718ee280f2510bfa92f1d84429b": "\u91D1\u94B1\u8C79",
    "fd35718ac5a278fd05fe5287ebd41de40a59259d": "\u74DC\u5B50",
    "5e01c237642c8b662a69e21b8e0fbe6e7dbc2aa1": "\u58A8\u955C",
    "5776481e380648c0fb3d4ad6173475f69f1ce149": "\u96BE\u8FC7",
    "abddb0b621b389fc8c2322b1cfcf122d8936ba91": "\u62B1\u62B1",
    "4f2155b108047d60c1fa9dccdc4d7abba18379a0": "\u8DEA\u4E86",
    "1e0a2baf088a34d56e2cc226b2de36a5f8d6c926": "\u644A\u624B",
    "6df760280b17a6cbac8c1874d357298f982ba4cf": "\u70ED",
    "0a1ab3f0f2f2e29de35c702ac1ecfec7f90e325d": "\u4E09\u661F\u5806",
    "98f842994035505c728e32e32045d649e371ecd6": "\u9F20",
    "23ae12d3a71b9d7a22c8773343969fcbb94b20d0": "\u6C64\u5706",
    "29533893115c4609a4af336f49060ea13173ca78": "\u6CFC\u6C34",
    "5d86d55ba9a2f99856b523d8311cf75cfdcccdbc": "\u9B3C\u9B42",
    "607f74ccf5eec7d2b17d91b9bb36be61a5dd196b": "\u4E0D\u884C",
    "3b2fedf09b0ac79679b5a47f5eb3e8a38e702387": "\u54CD\u6307",
    "5e61223561203c50340b4c9b41ba7e4b05e48ae2": "\u725B",
    "241b13adb4933e38b7ea6f5204e0648725e76fbf": "\u4FDD\u4F51",
    "3f170894dd08827ee293afcb5a3d2b60aecdb5b1": "\u62B1\u62F3",
    "d1ba5f4c54332a21ed2ca0dcecaedd2add587839": "\u7ED9\u529B",
    "eb2d84ba623e2335a48f73fb5bef87bcf53c1239": "\u8036"
  };

  // src/core/danmu-parser.js
  function resolveEmojiNameFromImg(img) {
    var name = img.dataset.name || img.getAttribute("alt") || "";
    if (name)
      return name;
    var rid = img.dataset.resourceId || img.getAttribute("data-resource-id") || img.getAttribute("data-resourceId") || img.dataset.id || img.getAttribute("data-id") || "";
    if (!rid) {
      var src = img.getAttribute("src") || img.src || "";
      var match = src.match(/bfs\/live\/([0-9a-f]+)/i);
      if (match)
        rid = match[1];
    }
    if (rid && EMOJI_ID_TO_NAME[rid])
      return EMOJI_ID_TO_NAME[rid];
    return "";
  }
  function getDmText(el) {
    var parts = [];
    el.childNodes.forEach(function(child) {
      if (child.nodeType === Node.TEXT_NODE) {
        var t = child.textContent.replace(/\s+/g, " ");
        if (t.trim())
          parts.push({ type: "text", value: t });
      } else if (child.tagName === "IMG") {
        var name = resolveEmojiNameFromImg(child);
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
    }).join("").replace(/\s+/g, " ").trim();
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

  // src/core/danmu-cache.js
  var _parsedCache = /* @__PURE__ */ new WeakMap();
  function cacheParsed(el, payload) {
    if (!el)
      return;
    payload._raw = el.textContent;
    _parsedCache.set(el, payload);
  }
  function getCachedParsed(el) {
    return _parsedCache.get(el);
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
    _safeContainer.appendChild(el);
    el.style.pointerEvents = "auto";
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
    if (!CONFIG.debug)
      return;
    if (DBG[k] === v)
      return;
    DBG[k] = v;
    renderDebug();
  }
  function renderDebug() {
    if (!CONFIG.debug || !_debugPanel)
      return;
    _debugPanel.textContent = "[DM+1 DEBUG " + (true ? "v0.0.4" : "dev") + "]\nframe            : " + DBG.frame + "\ndmCount          : " + DBG.dmCount + "\nmouse            : " + DBG.mouse + "\nhitType          : " + (DBG.hitType || "(none)") + "\nhitText          : " + (DBG.hitText || "(none)") + "\nhitSource        : " + (DBG.hitSource || "(none)") + "\nhitSelector      : " + (DBG.hitSelector || "(none)") + "\nhitRect          : " + (DBG.hitRect || "(none)") + "\nbtnVisible       : " + DBG.btnVisible + "\nfrozen           : " + DBG.frozen + "\ncurrentConnected : " + DBG.currentConnected + "\nlastSend         : " + (DBG.lastSend || "(none)") + "\nlastErr          : " + (DBG.lastErr || "(none)") + "\nenableCooldown   : " + DBG.enableSendCooldown + "\ncooldownMs       : " + DBG.cooldownMs + "\nfullscreen       : " + DBG.fullscreen;
  }

  // src/core/observer.js
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
  function scanAndCache(root2, opts) {
    if (!root2 || !root2.querySelectorAll)
      return;
    var doInvalidate = opts && opts.invalidate;
    var nodes = root2.querySelectorAll(DM_NODE_SELECTOR);
    var count = 0;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!(el instanceof HTMLElement))
        continue;
      var cached = getCachedParsed(el);
      if (!cached) {
        cacheParsed(el, getDmText(el));
      } else if (doInvalidate && el.textContent !== cached._raw) {
        cached._raw = el.textContent;
        var fresh = getDmText(el);
        if (fresh.text !== cached.text || fresh.type !== cached.type) {
          cacheParsed(el, fresh);
        }
      }
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
    return firstMatch(getScope(), DM_CONTAINER_SELECTORS);
  }
  var _mo;
  function bindObserverTarget(container) {
    if (state.dmObserverTarget && !state.dmObserverTarget.isConnected) {
      state.dmObserverTarget = null;
    }
    var scope = getScope();
    var dmContainer = container && container.isConnected ? container : findDmContainer();
    var nextTarget = dmContainer || scope.querySelector(".bilibili-live-player-video, #live-player") || scope;
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
          else if (node.nodeType === Node.ELEMENT_NODE)
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

  // src/core/hit-test.js
  function resolveDanmuNode(node) {
    var cur = node;
    while (cur && cur.nodeType === Node.ELEMENT_NODE) {
      if (cur.matches && cur.matches(DM_NODE_SELECTOR))
        return cur;
      cur = cur.parentElement;
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
    if (!container)
      return null;
    var scope = container;
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

  // src/core/freeze.js
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
    }
    state.currentHit = null;
    state.frozenRect = null;
    setDbg("hitText", "");
    setDbg("hitType", "");
    setDbg("currentConnected", false);
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

  // src/sender/input-sender.js
  function setNativeValue(el, value) {
    var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set)
      desc.set.call(el, value);
    else
      el.value = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText" }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function findInput() {
    var el = document.querySelector(".chat-input-ctnr textarea.chat-input");
    if (el)
      return el;
    el = document.querySelector("#fullscreen-danmaku-vm input.chat-input");
    if (el)
      return el;
    return document.querySelector(".chat-input");
  }
  function findSendBtn() {
    var btn;
    btn = document.querySelector(".chat-input-ctnr button.send-btn");
    if (btn)
      return btn;
    btn = document.querySelector(".bl-button.send-btn");
    if (btn)
      return btn;
    btn = document.querySelector("#fullscreen-danmaku-vm .send-danmaku");
    if (btn)
      return btn;
    btn = document.querySelector("#fullscreen-danmaku-vm button");
    if (btn)
      return btn;
    var btns = document.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      var text = (btns[i].textContent || "").trim();
      if (/^发送/.test(text))
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

  // src/menus.js
  function registerMenus(plusBtn) {
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
          var src = frames[i].src || frames[i].getAttribute("src") || "";
          if (src && src.indexOf("live.bilibili.com") === -1)
            continue;
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
    var dmContainerCache = null;
    var containerRect = null, containerRectTime = 0;
    document.addEventListener("mousemove", function(e) {
      state.mouse.x = e.clientX;
      state.mouse.y = e.clientY;
      mouseDirty = true;
      if (state.currentHit || document.fullscreenElement) {
        scheduleFrame();
        return;
      }
      if (!dmContainerCache)
        return;
      if (!containerRect || e.timeStamp - containerRectTime > 1e3) {
        containerRect = dmContainerCache.getBoundingClientRect();
        containerRectTime = e.timeStamp;
      }
      if (pointInRect(e.clientX, e.clientY, containerRect, UI.HIT_PADDING_PX)) {
        scheduleFrame();
      }
    }, { capture: true, passive: true });
    document.addEventListener("fullscreenchange", function() {
      mountOverlay();
      ensureSafeContainer();
      ensureDebugPanelParent();
      state.dmObserverTarget = null;
      containerRect = null;
      setDbg("fullscreen", !!document.fullscreenElement);
      scheduleFrame();
    });
    var lastTickTime = 0;
    var frameCount = 0;
    var containerWaitTimer = 0;
    var mouseDirty = false;
    var lastObserverContainer = null;
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
          dmContainerCache = container2;
          containerRect = null;
          scanAndCache(container2);
          clearInterval(containerWaitTimer);
          containerWaitTimer = 0;
          scheduleFrame();
        }
      }, TIMING.DM_WAIT_POLL_MS);
    }
    function resolvePayload(el) {
      var cached = getCachedParsed(el);
      if (cached && el.textContent === cached._raw)
        return cached;
      var parsed = getDmText(el);
      if (cached)
        cached._raw = el.textContent;
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
      if (dmContainer !== dmContainerCache)
        containerRect = null;
      dmContainerCache = dmContainer;
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
      if (dmContainer !== lastObserverContainer || !state.dmObserverTarget) {
        bindObserverTarget(dmContainer);
        lastObserverContainer = dmContainer;
      }
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
      }
      if (mouseDirty) {
        scheduleFrame();
      }
    }
    setDbg("fullscreen", !!document.fullscreenElement);
    setDbg("cooldownMs", CONFIG.cooldownMs);
    setDbg("enableSendCooldown", CONFIG.enableSendCooldown);
    renderDebug();
    registerMenus(plusBtn);
    var container = findDmContainer();
    if (container)
      scanAndCache(container);
    else
      setDbg("dmCount", 0);
    startContainerWaiter();
    setInterval(function() {
      var scope = findDmContainer();
      if (scope)
        scanAndCache(scope, { invalidate: true });
      else
        setDbg("dmCount", 0);
    }, TIMING.DM_SCAN_POLL_MS);
    scheduleFrame();
    console.log("[DM+1] " + (true ? "v0.0.4" : "dev") + " loaded");
  })();
})();
