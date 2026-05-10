// ==UserScript==
// @name         Bilibili Danmu Inspector
// @namespace    https://github.com/ZYar-er/bilibili-live-danmu-plus-one
// @version      0.2.0
// @description  抓取 B站直播间弹幕 DOM 节点结构并导出 JSON
// @match        https://live.bilibili.com/*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ====== 与 design.md 对齐的选择器 ======
  var DM_CONTAINER_SELECTORS = [
    '#live-player .web-player-danmaku .danmaku-item-container',
    '#live-player .danmaku-item-container',
    '.web-player-danmaku .danmaku-item-container',
    '.danmaku-item-container',
    '#live-player .web-player-danmaku',
    '.web-player-danmaku',
    '.live-player-dm-wrap',
    '.bili-danmaku-x-dm',
    '.bilibili-live-player-video-danmaku',
  ];

  var DM_NODE_SELECTOR = '.bili-danmaku-x-dm[role="comment"]';

  // ====== 参数 ======
  var MAX_LOG = 40;
  var SCAN_INTERVAL_MS = 200;
  var results = [];
  var count = 0;
  var observer = null;
  var scanTimer = 0;
  var seen = new WeakSet();
  var panel = null;
  var statusEl = null;

  // ====== 全屏 scope ======
  function getScope() {
    return document.fullscreenElement || document;
  }

  function findContainer() {
    var scope = getScope();
    for (var i = 0; i < DM_CONTAINER_SELECTORS.length; i++) {
      var el = scope.querySelector(DM_CONTAINER_SELECTORS[i]);
      if (el) return el;
    }
    return scope.body || scope;
  }

  // ====== 工具 ======
  function selectorPath(el) {
    var parts = [];
    var cur = el;
    for (var i = 0; i < 4 && cur && cur !== document.body && cur !== getScope(); i++) {
      var tag = cur.tagName ? cur.tagName.toLowerCase() : '';
      var id = cur.id ? '#' + cur.id : '';
      var cls = cur.classList && cur.classList.length
        ? '.' + Array.prototype.slice.call(cur.classList, 0, 3).join('.')
        : '';
      parts.unshift(tag + id + cls);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function classifyChildren(el) {
    return Array.prototype.map.call(el.childNodes, function (c) {
      if (c.nodeType === Node.TEXT_NODE) {
        var t = (c.textContent || '').trim().slice(0, 30);
        return t ? 'TEXT("' + t + '")' : 'TEXT(empty)';
      }
      if (c.nodeType === Node.ELEMENT_NODE) {
        var tag = c.tagName.toLowerCase();
        var cls = c.classList && c.classList.length
          ? '.' + Array.prototype.join.call(c.classList, '.')
          : '';

        // 按 danmu-parser 规范标记表情类型
        if (tag === 'img') {
          var emojiName = c.dataset && c.dataset.name
            || c.getAttribute && c.getAttribute('alt')
            || '';
          return 'IMG' + cls + (emojiName ? '[' + emojiName + ']' : '');
        }
        if (tag === 'span' && c.classList && c.classList.contains('emoji')) {
          return 'SPAN.emoji("' + (c.textContent || '').trim() + '")';
        }
        // 标记疑似表情容器
        if (c.querySelector && c.querySelector('img[alt], img[data-name], span.emoji')) {
          var inner = c.querySelector('img[alt], img[data-name], span.emoji');
          var innerName = '';
          if (inner.tagName === 'IMG') {
            innerName = inner.dataset && inner.dataset.name || inner.getAttribute('alt') || '';
          } else {
            innerName = (inner.textContent || '').trim();
          }
          return tag + cls + '{emoji:' + innerName + '}';
        }
        return tag + cls;
      }
      return 'NODE(' + c.nodeType + ')';
    });
  }

  function isDanmuNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    if (!(node instanceof HTMLElement)) return false;
    // 优先用标准属性匹配
    if (node.getAttribute('role') === 'comment') return true;
    // 级 select 器
    if (node.matches && node.matches(DM_NODE_SELECTOR)) return true;
    return false;
  }

  // ====== 捕获 ======
  function inspect(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    if (seen.has(node)) return;
    if (!isDanmuNode(node)) return;

    var text = (node.innerText || '').slice(0, 100);
    if (!text.trim()) {
      // 纯表情弹幕可能无文本，但应有 emoji 子元素
      var hasEmoji = node.querySelector('img[alt], img[data-name], span.emoji');
      if (!hasEmoji) return;
    }

    count += 1;
    seen.add(node);

    results.push({
      tag: node.tagName.toLowerCase(),
      className: node.className || '',
      role: node.getAttribute('role') || '',
      selector: selectorPath(node),
      text: text,
      html_len: node.innerHTML ? node.innerHTML.length : 0,
      children: classifyChildren(node),
      style_custom: {
        top: node.style.getPropertyValue('--top') || '',
        translateX: node.style.getPropertyValue('--translateX') || '',
        duration: node.style.getPropertyValue('--duration') || '',
      },
      animation: getComputedStyle(node).animationName || '',
      rect: (function () {
        var r = node.getBoundingClientRect();
        return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
      })(),
    });

    updateStatus();
    if (count >= MAX_LOG && observer) stopCapture();
  }

  // ====== 启动/停止 ======
  function startCapture() {
    stopCapture();
    results = [];
    count = 0;
    seen = new WeakSet();
    updateStatus();

    var container = findContainer();
    console.log('[DanmuInspector] container:', container.className || container.tagName);

    observer = new MutationObserver(function (mutations) {
      for (var mi = 0; mi < mutations.length; mi++) {
        var added = mutations[mi].addedNodes;
        for (var ai = 0; ai < added.length; ai++) {
          var node = added[ai];
          if (isDanmuNode(node)) inspect(node);
          if (node.nodeType === Node.ELEMENT_NODE && node.querySelectorAll) {
            var list = node.querySelectorAll(DM_NODE_SELECTOR);
            for (var di = 0; di < list.length; di++) inspect(list[di]);
          }
          if (count >= MAX_LOG) break;
        }
      }
    });
    observer.observe(container, { childList: true, subtree: true });

    scanTimer = setInterval(function () {
      var scope = getScope();
      var nodes = scope.querySelectorAll(DM_NODE_SELECTOR);
      for (var i = 0; i < nodes.length; i++) {
        inspect(nodes[i]);
        if (count >= MAX_LOG) break;
      }
    }, SCAN_INTERVAL_MS);

    updateStatus('capturing');
  }

  function stopCapture() {
    if (observer) { observer.disconnect(); observer = null; }
    if (scanTimer) { clearInterval(scanTimer); scanTimer = 0; }
    updateStatus('stopped');
  }

  // ====== 导出 ======
  function downloadResults() {
    var payload = JSON.stringify({
      count: results.length,
      time: new Date().toISOString(),
      url: location.href,
      fullscreen: !!document.fullscreenElement,
      containerSelector: (function () {
        var c = findContainer();
        return c ? selectorPath(c) : 'none';
      })(),
      items: results,
    }, null, 2);
    var blob = new Blob([payload], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'danmu-inspector-' + Date.now() + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function updateStatus(state) {
    if (!statusEl) return;
    var label = state || (observer ? 'capturing' : 'idle');
    statusEl.textContent = 'status: ' + label + ' | captured: ' + count + '/' + MAX_LOG
      + ' | scope: ' + (document.fullscreenElement ? 'fullscreen' : 'normal')
      + ' | container: ' + (findContainer() || document.body).className;
  }

  // ====== UI ======
  function createPanel() {
    panel = document.createElement('div');
    panel.id = 'dm1-inspector-panel';
    panel.innerHTML = ''
      + '<div class="dm1-title">Danmu Inspector</div>'
      + '<div class="dm1-row">'
      + '  <button id="dm1-start">Start</button>'
      + '  <button id="dm1-stop">Stop</button>'
      + '  <button id="dm1-download">Download JSON</button>'
      + '</div>'
      + '<div class="dm1-status"></div>';

    mountPanel();
    statusEl = panel.querySelector('.dm1-status');

    panel.querySelector('#dm1-start').addEventListener('click', startCapture);
    panel.querySelector('#dm1-stop').addEventListener('click', stopCapture);
    panel.querySelector('#dm1-download').addEventListener('click', downloadResults);

    updateStatus('idle');
  }

  function mountPanel() {
    if (!panel) return;
    var r = document.fullscreenElement || document.documentElement;
    if (panel.parentNode !== r) r.appendChild(panel);
  }

  GM_addStyle(''
    + '#dm1-inspector-panel { position:fixed;right:12px;top:12px;z-index:2147483647;'
    + 'background:rgba(0,0,0,0.82);color:#e7ffe7;padding:10px 12px;'
    + 'border-radius:8px;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;'
    + 'box-shadow:0 4px 16px rgba(0,0,0,0.3);pointer-events:auto;user-select:none; }'
    + '#dm1-inspector-panel .dm1-title{font-weight:700;margin-bottom:6px;}'
    + '#dm1-inspector-panel .dm1-row{display:flex;gap:6px;margin-bottom:6px;}'
    + '#dm1-inspector-panel button{padding:4px 8px;border-radius:6px;border:1px solid #7c7c7c;'
    + 'background:#1f1f1f;color:#e7ffe7;cursor:pointer;}'
    + '#dm1-inspector-panel button:hover{background:#2a2a2a;}'
    + '#dm1-inspector-panel .dm1-status{opacity:0.9;}'
  );

  // ====== 全屏面板迁移 ======
  document.addEventListener('fullscreenchange', function () {
    mountPanel();
    // 全屏后容器可能变化，快照提示
    updateStatus('fullscreen-changed');
  });

  createPanel();
})();
