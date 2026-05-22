# Design-Implementation Alignment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the codebase with design.md by fixing hardcoded version strings, updating outdated docs, and improving element-recycling detection (known limitation #1).

**Architecture:** Three independent workstreams: (1) inject `__VERSION__` at build time via esbuild `define` so `index.js` and `debug-panel.js` always reflect the actual version; (2) update design.md §文件结构 to list all modules; (3) extend the 300ms scan cycle to detect DOM-element reuse where B站 changes textContent without triggering MutationObserver.

**Tech Stack:** JavaScript (ES2015+), esbuild, Tampermonkey (GM_* APIs), browser DOM APIs

---

### Task 1: Inject `__VERSION__` via esbuild define, replace hardcoded strings

**Files:**
- Modify: `build.js:6-8`
- Modify: `src/index.js:223`
- Modify: `src/ui/debug-panel.js:58`

- [ ] **Step 1: Add `define` to esbuild config in build.js**

In `build.js`, add a `define` option to the esbuild config so `__VERSION__` is replaced at build time:

```js
// build.js — modify the esbuild.build() call (lines 40-51)
esbuild.build({
  entryPoints: ['src/index.js'],
  bundle: true,
  outfile: 'bilibili-live-danmu-plus-one.user.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2015',
  banner: { js: userscriptBanner },
  minify: false,
  define: {
    __VERSION__: JSON.stringify('v' + version),
  },
}).then(function () {
  console.log('Build complete: bilibili-live-danmu-plus-one.user.js (v' + version + ')');
}).catch(function () { process.exit(1); });
```

- [ ] **Step 2: Replace hardcoded `v0.0.1` in src/index.js**

```js
// src/index.js line 223 — change from:
console.log('[DM+1] v0.0.1 loaded');
// to:
console.log('[DM+1] ' + (typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev') + ' loaded');
```

The `typeof` guard ensures the script doesn't crash if run without the build step (e.g., during development).

- [ ] **Step 3: Replace hardcoded `v0.0.1` in src/ui/debug-panel.js**

```js
// src/ui/debug-panel.js line 58 — change from:
'[DM+1 DEBUG v0.0.1]\n'
// to:
('[DM+1 DEBUG ' + (typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev') + ']\n')
```

- [ ] **Step 4: Build and verify version injection**

Run: `npm run build`
Expected: Build completes successfully.

Run: `head -5 bilibili-live-danmu-plus-one.user.js`
Expected: Banner shows `@version 0.0.2`.

Run: `grep -o 'DM+1.*loaded' bilibili-live-danmu-plus-one.user.js`
Expected: `[DM+1] v0.0.2 loaded` (not `v0.0.1`).

Run: `grep -o 'DM+1 DEBUG[^]]*' bilibili-live-danmu-plus-one.user.js`
Expected: `DM+1 DEBUG v0.0.2` (not `v0.0.1`).

- [ ] **Step 5: Commit**

```bash
git add build.js src/index.js src/ui/debug-panel.js
git commit -m "fix: inject __VERSION__ at build time, remove hardcoded v0.0.1"
```

---

### Task 2: Update design.md file structure section

**Files:**
- Modify: `design.md:4-31`

- [ ] **Step 1: Update the file structure tree in design.md**

The current §文件结构 (lines 11-31) omits `danmu-cache.js`, `freeze.js`, and `menus.js`. Replace lines 11-31 with:

```
```
src/
  core/
    observer.js       # MutationObserver：监听弹幕注入/移除，解析缓存，冻结节点救援
    danmu-cache.js    # WeakMap 缓存弹幕解析结果，避免重复 parse
    hit-test.js       # 鼠标命中检测（elementsFromPoint + rect fallback）
    danmu-parser.js   # 弹幕内容提取（文字/表情IMG/span.emoji）
    freeze.js         # 弹幕冻结/解冻 + ghost 清理生命周期
    env-detector.js   # 环境检测：全屏scope、活动页外壳（isActivityShell）
  ui/
    button.js         # +1 按钮 UI：创建、定位、显示/隐藏、事件绑定
    debug-panel.js    # 固定定位调试面板，全屏时迁移到 fullscreenElement
    safe-container.js # 冻结弹幕安全容器 + rescue
  sender/
    input-sender.js   # 发送：优先全屏输入框、查找发送按钮（多策略/宽松匹配）、冷却管理
  config.js           # 常量（TIMING/UI/DM_SELECTORS）+ 持久化（GM_getValue→localStorage）
  emoji-map.js        # 表情 resource_id → name 映射（由 bilibili-emoji/bilibili-emoji.csv 生成）
  state.js            # 全局状态：{currentHit,frozenRect,lastSendAt,...}
  utils.js            # 工具：root(),isElementAlive(),clamp(),pointInRect(),firstMatch()
  menus.js            # Tampermonkey 菜单注册（冷却/透明度/调试切换），接受 plusBtn DOM 引用
  index.js            # 入口：组装模块、主循环（按需启停）
build.js              # esbuild 打包：注入==UserScript==头（含@match blanc*），输出IIFE格式
bilibili-live-danmu-plus-one.user.js  # 构建产物
```
```

- [ ] **Step 2: Commit**

```bash
git add design.md
git commit -m "docs: update file structure in design.md with missing modules"
```

---

### Task 3: Add text-change detection in scan cycle to catch element recycling

**Context:** B站 may reuse DOM elements by changing `textContent` and restarting CSS animations. MutationObserver does NOT fire `addedNodes` for reused elements. The 300ms scan only catches nodes not yet in the WeakMap cache — if an element was already cached with old content, text changes go undetected until the user mouses over it. This task adds a lightweight validation pass during the scan cycle.

**Files:**
- Modify: `src/core/danmu-cache.js:1-14`
- Modify: `src/core/observer.js:25-39`

- [ ] **Step 1: Add `invalidateStale` export to danmu-cache.js**

Add a function that re-parses all cached nodes and updates any that have changed. This is called from the periodic scan, not from the hot path (hitTest already does this check via `resolvePayload`).

```js
// src/core/danmu-cache.js — add after the existing exports (after line 14)
var _parsedCache = new WeakMap();

export function cacheParsed(el, payload) {
  if (!el) return;
  _parsedCache.set(el, payload);
}

export function getCachedParsed(el) {
  return _parsedCache.get(el);
}

export function clearParsedCache() {
  _parsedCache = new WeakMap();
}

// NEW: invalidate and re-cache nodes whose textContent has changed since last parse.
// `getDmText` is injected so this module stays pure (no circular deps).
export function invalidateStale(nodes, getDmTextFn) {
  var changed = 0;
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    if (!(el instanceof HTMLElement)) continue;
    var cached = _parsedCache.get(el);
    if (!cached) continue;
    var fresh = getDmTextFn(el);
    if (fresh.text !== cached.text || fresh.type !== cached.type) {
      _parsedCache.set(el, fresh);
      changed++;
    }
  }
  return changed;
}
```

- [ ] **Step 2: Call `invalidateStale` from the periodic scan in observer.js**

Modify `scanAndCache` to optionally run invalidation on already-cached nodes:

```js
// src/core/observer.js — add import at top (line 6)
import { cacheParsed, getCachedParsed, invalidateStale } from './danmu-cache.js';

// Modify scanAndCache (lines 25-39) to accept an optional invalidate flag:
export function scanAndCache(root, opts) {
  if (!root || !root.querySelectorAll) return;
  var doInvalidate = opts && opts.invalidate;
  var nodes = root.querySelectorAll(DM_NODE_SELECTOR);
  var count = 0;
  for (var i = 0; i < nodes.length; i++) {
    cacheIfNeeded(nodes[i]);
    count++;
  }
  if (doInvalidate && nodes.length > 0) {
    var changed = invalidateStale(nodes, getDmText);
    if (changed > 0 && typeof setDbg === 'function') {
      setDbg('recycledDetected', changed);
    }
  }
  var container = findDmContainer();
  if (container && root === container) {
    setDbg('dmCount', count);
  } else if (!container) {
    setDbg('dmCount', 0);
  }
}
```

- [ ] **Step 3: Enable invalidation in the periodic scan call in index.js**

```js
// src/index.js line 217 — change the setInterval callback from:
setInterval(function () {
  var scope = findDmContainer();
  if (scope) scanAndCache(scope);
  else setDbg('dmCount', 0);
}, TIMING.DM_SCAN_POLL_MS);
// to:
setInterval(function () {
  var scope = findDmContainer();
  if (scope) scanAndCache(scope, { invalidate: true });
  else setDbg('dmCount', 0);
}, TIMING.DM_SCAN_POLL_MS);
```

- [ ] **Step 4: Build and smoke test**

Run: `npm run build`
Expected: Build completes without errors.

Run: `node -e "require('esbuild').build({entryPoints:['src/index.js'],bundle:true,outfile:'test-output.js',format:'iife',platform:'browser',target:'es2015',define:{__VERSION__:'\"v0.0.2\"'}})"`
Expected: No errors, `test-output.js` created.

Run: `grep -c 'invalidateStale' test-output.js`
Expected: `1` (function is included in bundle).

Cleanup: `rm -f test-output.js`

- [ ] **Step 5: Commit**

```bash
git add src/core/danmu-cache.js src/core/observer.js src/index.js
git commit -m "feat: detect element recycling via text-change invalidation in scan cycle"
```

---

### Verification Checklist (Manual)

After all tasks are complete, verify against design.md §测试与验证清单:

1. **普通直播间** — `npm run build`, load script in Tampermonkey, open any B站 live room. Hover over scrolling danmaku → `+1` button appears. Console shows `[DM+1] v0.0.2 loaded`.
2. **活动页/iframe** — Open a B站 event page with embedded live player. Script initializes inside iframe, button works.
3. **全屏** — Enter fullscreen, button and debug panel follow `fullscreenElement`.
4. **Element recycling** — Stay in a busy live room for 5+ minutes. Observe debug panel `recycledDetected` occasionally increments (nodes whose text changed without DOM replace).
5. **Build reproducibility** — Run `npm run build` twice, output files are identical (deterministic build).
