# B站直播弹幕 +1 架构设计文档

## 项目概述

Tampermonkey 油猴脚本。在 B站直播间悬停弹幕时显示 `+1` 按钮，点击重发该弹幕内容（含文字和表情）。

目标：在普通/赛事/活动页/全屏场景下稳定工作，尽量减少对原页面 DOM 和事件的副作用，同时保证性能和可维护性。

## 文件结构

```
src/
  core/
    observer.js       # MutationObserver：监听弹幕注入/移除，事件绑定
    hit-test.js       # 鼠标命中检测（elementsFromPoint + rect fallback）
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

### 最终落地策略（可执行）

1. **主路径**：document 级 `mousemove` 捕获 + `elementsFromPoint` 进行命中
2. **解析缓存**：MO 对新增弹幕做解析，结果缓存到 `WeakMap<el, parsed>`
3. **兜底扫描**：每 300ms scan 一次现存弹幕，把未缓存的解析进 WeakMap
4. **冻结时矫正**：freeze 时立即读取 `getBoundingClientRect()`，按 frozenRect 定位按钮
5. **容器重建**：fullscreenchange/DOM 变动时重绑 MO，清空命中缓存

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

## 数据流与状态

### 数据流（简化）

```
mousemove -> hitTest(elementsFromPoint)
  -> resolveDanmuNode
  -> getParsedText (WeakMap cache, or parse on demand)
  -> freeze + showButton
  -> click -> send

MutationObserver
  -> addedNodes -> parse + cache
  -> removedNodes -> ghost rescue
```

### 全局状态字段（state.js）

当前实现字段：
- `currentHit`: 当前命中的弹幕节点（`{ el, text, type }`）
- `lastSendAt`: 最近一次发送时间戳
- `lastClickAt`: 最近一次点击时间戳
- `clickLocked`: 发送冷却锁
- `mouse`: 最新鼠标坐标
- `rafScheduled`: 主循环是否已排队
- `noPlayerCount`: 连续找不到容器的计数
- `dmObserverTarget`: 当前 MO 绑定目标
- `leaveTimer`: 悬停离开延迟计时器

拟新增字段（用于 hit-test）：
- `frozenRect`: 冻结时的 rect 快照（用于按钮稳定定位）
- `lastHitAt`: 最近一次命中时间戳（用于节流）
- `hitSource`: 命中来源（`elementsFromPoint` / `fallbackScan`）

## 边界与异常处理

- 解析失败：返回空文本，按钮不展示
- input/发送按钮缺失：显示提示并自动退避（例如 10s 以内不重试）
- 发送过快：冷却中按钮置灰并显示倒计时
- 弹幕节点被复用：若 text 变化则更新 WeakMap 缓存
- 容器查找失败：进入“降级模式”，只做鼠标命中不做 MO

## 选择器与环境检测策略

- 主 frame 初始化，活动 iframe 直接跳过
- 选择器优先级链维护在 `config.js`
- 支持通过调试面板实时查看命中选择器和节点结构

## 命中检测模块（core/hit-test.js）

职责边界：

- 负责“从鼠标坐标找到弹幕节点”的逻辑
- 只返回命中结果，不直接操作 UI/发送逻辑
- 维护命中缓存（WeakMap）和临时统计

核心流程：

1. `elementsFromPoint(x, y)` 获取层级栈
2. 从栈内向上找最近的弹幕节点（`DM_NODE_SELECTOR`）
3. 若未命中，执行 `fallbackScan` 遍历当前容器内弹幕
4. 命中后返回 `{ el, rect, source }`

## Debug 面板字段规范

字段由 `debug-panel.js` 维护，`setDbg(k,v)` 为统一入口。

- `frame`: number，主循环计数
- `dmCount`: number，扫描到的弹幕数量
- `mouse`: string，`x,y`（仅 debug）
- `hitType`: string，`text/emoji/mixed/unknown`
- `hitText`: string，当前命中文本
- `btnVisible`: boolean，按钮可见状态
- `frozen`: boolean，是否处于冻结状态
- `currentConnected`: boolean，命中节点是否仍在 DOM 中
- `lastSend`: string，最近一次发送摘要
- `lastErr`: string，最近一次错误摘要
- `enableCooldown`: boolean，是否开启发送冷却
- `cooldownMs`: number，冷却时长
- `fullscreen`: boolean，全屏状态

拟新增字段（命中链路可视化）：
- `hitSource`: string，`elementsFromPoint` 或 `fallbackScan`
- `hitSelector`: string，命中节点的简短选择器路径
- `hitRect`: string，`left,top,width,height`（冻结时快照）

## 性能策略

- `mousemove` 使用 rAF 合并，1 帧仅处理最后一次坐标
- `elementsFromPoint` 只在鼠标移动且坐标变化时触发
- 弹幕解析结果只存 WeakMap，不做全局数组缓存
- 解析/命中日志仅在 debug 模式输出

## 测试与验证清单

1. 普通直播间：能命中滚动弹幕，按钮稳定显示
2. 活动页/赛事页：容器选择器命中，MO 正常工作
3. 全屏：按钮与调试面板正确迁移
4. 文字+小表情+大表情混合：复读文本正确
5. 弹幕消失后仍可点击：ghost 模式正常
6. 高频移动鼠标：无明显卡顿

### 构建
- esbuild: `entryPoints:['src/index.js']`, `format:'iife'`, `target:'es2015'`
- banner注入完整==UserScript==头部（含@match/@grant/@run-at）
- 产物：`bilibili-live-danmu-plus-one.user.js`（~600行）

## 已知问题

1. **element回收导致漏检**：B站可能重用DOM元素（改textContent+重启动画），MO不会触发addedNodes，300ms扫描只能部分兜底
2. **全屏容器查找**：不同直播间类型容器class可能不同，选择器链需持续维护
3. **pointer-events副作用**：方案A的pointer-events:auto在某些B站UI场景下可能干扰弹幕层的点击穿透行为

## 后续开发任务建议（按优先级）

1. 将 hitTest 逻辑从 observer.js 独立为 `core/hit-test.js`
2. 在 `debug-panel` 中增加命中路径和解析结果展示
3. 对 `input-sender` 增加容错：找不到输入框时延迟重试
4. 增加“忽略关键词/主播黑名单”配置项
5. 增加本地日志开关和采样比例

## 环境信息

- 平台：Windows 11
- Shell：bash (Git Bash)
- 浏览器：Chrome (Tampermonkey)
- Node：用于esbuild打包
- 构建命令：`npm run build` 或 `node build.js`
