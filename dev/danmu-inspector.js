// danmu-inspector.js
// 用法：打开 B 站直播间 DevTools Console，粘贴本文件内容后执行。
(function DanmuInspector() {
  var LOG_LIMIT = 20;
  var count = 0;
  var observer = null;
  var results = [];

  var CANDIDATES = [
    '.bili-danmaku-x-dm',
    '.live-player-dm-wrap',
    '.bilibili-live-player-video-danmaku',
    '[class*="danmaku"][class*="container"]',
    '[class*="danmaku"][class*="wrap"]',
    '[class*="danmu"][class*="wrap"]',
    '[class*="danmaku"]',
    '[class*="danmu"]',
  ];

  function findContainer() {
    for (var i = 0; i < CANDIDATES.length; i++) {
      var sel = CANDIDATES[i];
      var el = document.querySelector(sel);
      if (el) {
        console.log('[Inspector] 命中容器:', sel, el);
        return el;
      }
    }
    console.warn('[Inspector] 未命中已知容器，回退 body（可能噪音较高）');
    return document.body;
  }

  function selectorPath(el) {
    var parts = [];
    var cur = el;
    for (var i = 0; i < 4 && cur && cur !== document.body; i++) {
      var tag = cur.tagName ? cur.tagName.toLowerCase() : 'unknown';
      var id = cur.id ? '#' + cur.id : '';
      var cls = cur.classList && cur.classList.length
        ? '.' + Array.prototype.slice.call(cur.classList, 0, 2).join('.')
        : '';
      parts.unshift(tag + id + cls);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function childTypes(node) {
    return Array.prototype.map.call(node.childNodes, function (c) {
      if (c.nodeType === Node.TEXT_NODE) {
        var t = (c.textContent || '').trim().slice(0, 20);
        return 'TEXT("' + t + '")';
      }
      if (c.nodeType === Node.ELEMENT_NODE) {
        var cls = c.classList && c.classList.length ? '.' + Array.prototype.join.call(c.classList, '.') : '';
        return c.tagName.toLowerCase() + cls;
      }
      return 'NODE(' + c.nodeType + ')';
    });
  }

  function inspect(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    var className = ((node.className || '') + '').toLowerCase();
    var hasDanmuClass = className.indexOf('danmaku') >= 0 || className.indexOf('danmu') >= 0;
    var hasText = !!(node.innerText && node.innerText.trim());
    var hasEmojiPart = !!node.querySelector('img[data-name], img[alt], span.emoji, [class*="emoji"]');
    if (!hasDanmuClass && !hasEmojiPart) return;
    if (!hasText && !hasEmojiPart) return;

    var text = (node.innerText || '').slice(0, 80);
    count += 1;

    results.push({
      tag: (node.tagName || 'UNKNOWN').toLowerCase(),
      className: node.className || '',
      selector: selectorPath(node),
      text: text,
      children: childTypes(node),
    });

    var tag = (node.tagName || 'UNKNOWN').toLowerCase();
    var cls = node.classList && node.classList.length
      ? '.' + Array.prototype.slice.call(node.classList, 0, 3).join('.')
      : '';
    var line1 = '[DM #' + count + '] ' + tag + cls + ' | "' + text + '"';
    var line2 = '  selector: ' + selectorPath(node);
    var line3 = '  children: ' + childTypes(node).join(', ');
    console.log(line1 + '\n' + line2 + '\n' + line3);
    console.log('[Inspector] captured: ' + count + '/' + LOG_LIMIT);

    if (count >= LOG_LIMIT && observer) {
      observer.disconnect();
      console.log('[Inspector] 已捕获 ' + LOG_LIMIT + ' 条，自动停止');
    }
  }

  function downloadResults() {
    var payload = JSON.stringify({
      count: results.length,
      time: new Date().toISOString(),
      items: results,
    }, null, 2);
    var blob = new Blob([payload], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'danmu-inspector-' + Date.now() + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  var container = findContainer();
  observer = new MutationObserver(function (mutations) {
    for (var mi = 0; mi < mutations.length; mi++) {
      var added = mutations[mi].addedNodes;
      for (var ai = 0; ai < added.length; ai++) {
        inspect(added[ai]);
      }
    }
  });

  observer.observe(container, { childList: true, subtree: true });
  window.__danmuInspector = observer;
  window.__danmuInspectorDownload = downloadResults;
  console.log('[DanmuInspector] 已启动，将连续输出 ' + LOG_LIMIT + ' 条命中结果后自动停止。');
  console.log('[DanmuInspector] 停止：window.__danmuInspector.disconnect()');
  console.log('[DanmuInspector] 导出：window.__danmuInspectorDownload()');
})();
