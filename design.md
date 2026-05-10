# B站直播弹幕 +1 架构设计文档

## 项目概述

Tampermonkey 油猴脚本。在 B站直播间悬停弹幕时显示 `+1` 按钮，点击重发该弹幕内容（含文字和表情）。

## 文件结构

```
src/
  core/
    observer.js       # MutationObserver：监听弹幕注入/移除，事件绑定
    danmu-parser.js   # 弹幕内容提取（文字/表情IMG/span.emoji）
    env-detector.js   # 环境检测：活动iframe防护、全屏scope
  ui/
    button.js         # +1 按钮：创建、定位（getBoundingClientRect）、显示/隐藏、freeze/unfreeze
    debug-panel.js    # 固定定位调试面板，全屏时迁移到 fullscreenElement
    safe-container.js # 冻结弹幕安全容器（position:fixed;pointer-events:none;z-index高）
  sender/
    input-sender.js   # 发送：查找输入框、查找发送按钮、冷却管理、setNativeValue
  config.js           # 常量（TIMING/UI/DM_SELECTORS）+ 持久化（GM_getValue→localStorage）
  state.js            # 全局状态：{currentHit,lastSendAt,clickLocked,mouse,rafScheduled,...}
  utils.js            # 工具：root(),isElementAlive(),clamp(),pointInRect()
  index.js            # 入口：组装模块、主循环、Tampermonkey菜单
build.js              # esbuild 打包：注入==UserScript==头，输出IIFE格式
bilibili-live-danmu-plus-one.user.js  # 构建产物
```

## 弹幕选中：两种方案分析

B站弹幕DOM特征：
- 容器：`.bili-danmaku-x-dm`（会被B站不断销毁重建）
- 弹幕节点：`div.bili-danmaku-x-dm[role="comment"]`，可能附加 `.bili-danmaku-x-roll`、`.bili-danmaku-x-show`
- 动画：CSS自定义属性 `--translateX`、`--duration`，通过keyframes移动
- 容器级 `pointer-events:none` 使点击穿透到视频

### 方案A：MutationObserver + 节点事件绑定（当前实现）

```
MO.observe(container, {childList:true, subtree:true})
  → addedNodes → isDanmuNode(matches CSS selector)
    → el.addEventListener('mouseenter', freeze+showBtn)
    → el.addEventListener('mouseleave', delayHide)
  → removedNodes → node.dm1Frozen? → rescue到safeContainer

定期 scanAndBind(root, 300ms) 兜底捕获MO遗漏
```

| 优点 | 缺点 |
|---|---|
| 事件直接绑在节点上，响应快 | 依赖MO捕获addedNodes，元素回收时失效 |
| 不依赖鼠标坐标，无CSS transform漂移 | 必须设el.style.pointerEvents='auto'覆盖B站 |
| 按钮跟随弹幕节点，hover持续有效 | CSS选择器变化会导致matches()失败 |
| 代码量小（~100行observer.js） | 初始扫描+定时兜底增加复杂度 |
| | 全屏/SPA路由时需重绑MO+重扫 |

### 方案B：mousemove + 坐标碰撞检测（旧版实现）

```
document.addEventListener('mousemove', capture:true)
  → elementsFromPoint(x,y) 获取光标下元素栈
    → 按z-index遍历 → isLikelyDmElement + pointInRect
      → freeze + showBtn
  → fallback: 遍历dmNodeList → getBoundingClientRect碰撞

每rAF帧重建rectSnapshot WeakMap缓存
```

| 优点 | 缺点 |
|---|---|
| 不依赖MO绑定，每次mousemove实时查DOM | CSS transform可能导致getBoundingClientRect不准确 |
| 不修改pointer-events，零副作用 | 每帧遍历dmNodeList+缓存rect，有开销 |
| capture阶段绕过pointer-events:none | elementsFromPoint只返回点下元素，需回退扫描 |
| 全屏天然工作，不依赖元素作用域 | 代码量较大（需rect快照/脏标记/碰撞逻辑） |
| SPA路由/容器重建时只需重查DOM | |
| 选择器脆弱性较低（用于filter而非绑定入口） | |

### 推荐：方案B为主力 + MO辅助

原因：
1. **DOM查询天然容错**：不管B站如何创建/回收元素，mousemove时`elementsFromPoint`实时查询当前DOM，不会因绑定时机错过弹幕
2. **零副作用**：不修改B站元素的pointer-events，不影响原有行为
3. **全屏透明**：document级mousemove在任何DOM上下文中工作
4. **已知缺陷可控**：CSS transform漂移可通过在freeze时使用`el.getBoundingClientRect()`（freeze时动画已暂停，rect准确）解决

MO的辅助角色：
- `addedNodes`：解析弹幕内容存入WeakMap缓存，避免mousemove时重复解析
- `removedNodes`：救援冻结中弹幕到安全容器（已实现且稳定）

## 关键技术细节

### freeze/unfreeze（弹幕冻结）
- freeze：`el.style.setProperty('animation-play-state','paused','important')` + 保存原始值到`el.dataset.dm1OldAnimPlay`
- unfreeze：恢复`animationPlayState`，若在安全容器中则监听`animationend`自清理 + 30s超时兜底

### ghost模式（弹幕被B站JS清理后保留）
- MutationObserver remoedNodes回调中检测`el.dataset.dm1Frozen==='1'`
- 移到dmSafeContainer（position:fixed;inset:0;overflow:visible;pointer-events:none）
- 保持pointer-events:auto使弹幕仍可交互
- 鼠标离开后unfreeze→animationend→remove

### 按钮防闪烁
- 弹幕mouseleave→50ms setTimeout延迟隐藏
- 按钮mouseenter→clearTimeout取消隐藏
- 按钮mouseleave→50ms延迟隐藏（鼠标可能回弹幕）

### 全屏适配
- 所有DOM查询用`getScope() = document.fullscreenElement || document`
- overlay元素（按钮/面板/容器）在tick()中检查并迁移parentNode
- fullscreenchange→设dmObserverTarget=null强制重绑MO

### 弹幕文本提取（danmu-parser.js）
- 遍历el.childNodes（直接子节点，非递归）
- TEXT_NODE → 去空白后加入
- IMG → data-name || alt → `[name]`
- SPAN.emoji → textContent
- 空文本弹幕 → 返回{type:'unknown',text:''}，不显示按钮

### 选择器策略
- DM_NODE_SELECTOR = `.bili-danmaku-x-dm[role="comment"]`
- DM_CONTAINER_SELECTORS = 优先级链：`#live-player .web-player-danmaku .danmaku-item-container` → `.danmaku-item-container` → `.web-player-danmaku` → `.live-player-dm-wrap`
- 选择器链通过`firstMatch(scope,selectors)`遍历，返回首个存在的元素

### 构建
- esbuild: `entryPoints:['src/index.js']`, `format:'iife'`, `target:'es2015'`
- banner注入完整==UserScript==头部（含@match/@grant/@run-at）
- 产物：`bilibili-live-danmu-plus-one.user.js`（~600行）

## 已知问题

1. **element回收导致漏检**：B站可能重用DOM元素（改textContent+重启动画），MO不会触发addedNodes，300ms扫描只能部分兜底
2. **全屏容器查找**：不同直播间类型容器class可能不同，选择器链需持续维护
3. **pointer-events副作用**：方案A的pointer-events:auto在某些B站UI场景下可能干扰弹幕层的点击穿透行为

## 环境信息

- 平台：Windows 11
- Shell：bash (Git Bash)
- 浏览器：Chrome (Tampermonkey)
- Node：用于esbuild打包
- 构建命令：`npm run build` 或 `node build.js`
