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
    env-detector.js   # 环境检测：全屏scope
  ui/
    button.js         # +1 按钮：创建、定位（getBoundingClientRect）、显示/隐藏、freeze/unfreeze
    debug-panel.js    # 固定定位调试面板，全屏时迁移到 fullscreenElement
    safe-container.js # 冻结弹幕安全容器（position:fixed;pointer-events:none;z-index高）
  sender/
    input-sender.js   # 发送：查找输入框、查找发送按钮、冷却管理、setNativeValue
  config.js           # 常量（TIMING/UI/DM_SELECTORS）+ 持久化（GM_getValue→localStorage）
  state.js            # 全局状态：{currentHit,frozenRect,lastSendAt,lastClickAt,clickLocked,mouse,rafScheduled,...}
  utils.js            # 工具：root(),isElementAlive(),clamp(),pointInRect()
  index.js            # 入口：组装模块、主循环、Tampermonkey菜单
build.js              # esbuild 打包：注入==UserScript==头，输出IIFE格式
bilibili-live-danmu-plus-one.user.js  # 构建产物
```

## 弹幕命中与缓存策略

B站弹幕DOM特征：
- 容器：`.danmaku-item-container`（会被B站不断销毁重建）
- 弹幕节点：`div.bili-danmaku-x-dm[role="comment"]`
- 动画：CSS 自定义属性驱动，容器层 `pointer-events:none`

当前实现：
1. `mousemove` + `elementsFromPoint` 作为命中主路径
2. MutationObserver 用于新增节点解析缓存与冻结节点救援
3. 300ms 扫描兜底补缓存（仅补未缓存）
4. 命中后 freeze，使用冻结时 rect 定位按钮
5. 活动页外壳跳过初始化，iframe 内正常初始化

## 关键技术细节

### freeze/unfreeze（弹幕冻结）
- freeze：`el.style.setProperty('animation-play-state','paused','important')` + 保存原始值到`el.dataset.dm1OldAnimPlay`
- unfreeze：恢复`animationPlayState`，若在安全容器中则监听`animationend`自清理 + 30s超时兜底

### ghost模式（弹幕被B站JS清理后保留）
- MutationObserver removedNodes回调中检测`el.dataset.dm1Frozen==='1'`
- 移到dmSafeContainer（position:fixed;inset:0;overflow:visible;pointer-events:none）
- 保持pointer-events:auto使弹幕仍可交互
- 鼠标离开后unfreeze→animationend→remove

补充：若 `animationend` 不会再触发（动画已结束或 duration 为 0），应在 unfreeze 后立即检查并直接 remove，避免 30s 兜底过长。

### 按钮防闪烁
- 弹幕mouseleave→50ms setTimeout延迟隐藏
- 按钮mouseenter→clearTimeout取消隐藏
- 按钮mouseleave→50ms延迟隐藏（鼠标可能回弹幕）
- fullscreenchange→设dmObserverTarget=null强制重绑MO

### 弹幕文本提取（danmu-parser.js）
- 遍历el.childNodes（直接子节点，非递归）
- TEXT_NODE → 去空白后加入
- IMG → data-name || alt → `[name]`
- SPAN.emoji → textContent
- 空文本弹幕 → 返回{type:'unknown',text:''}，不显示按钮

补充：当前版本可正常支持标准 emoji（Unicode 字符）。
补充：B站特殊 emoji 的机制为输入框发送形如 `[XX]` 的文本后由前端解析为图片并插入文本中。由于需要先收集完整的特殊 emoji id 列表，先搁置适配；当前会跳过无名称表情，不再附加 `[表情]` 占位。

### 选择器策略
- DM_NODE_SELECTOR = `.bili-danmaku-x-dm[role="comment"]`
- DM_CONTAINER_SELECTORS = 优先级链：`#live-player .web-player-danmaku .danmaku-item-container` → `.danmaku-item-container` → `.web-player-danmaku` → `.live-player-dm-wrap`
- 选择器链通过`firstMatch(scope,selectors)`遍历，返回首个存在的元素

### 实测结论（来自 dev/inspector）

- 活动页外层是活动页 `<html lang="zh-Hans" ...>`，直播间在 iframe（`/blanc/{roomId}`）内，iframe 内是正常页面 `<html lab-style="dark">`
- 弹幕节点稳定特征：`div.bili-danmaku-x-dm[role="comment"]`
- 常见修饰类：`.bili-danmaku-x-roll`、`.bili-danmaku-x-show`
- 表情节点主要为 `IMG.bili-danmaku-x-dm-emoji`（未见 `span.emoji`）
- 部分节点在动画未开始时 `rect` 为 0，应在 freeze 后再取 rect 定位按钮


## 数据流与状态

### 数据流（简化）
```
mousemove -> hitTest(elementsFromPoint)
  -> resolveDanmuNode
  -> getParsedText (WeakMap cache, or parse on demand)

MutationObserver
  -> addedNodes -> parse + cache
```

### 全局状态字段（state.js）

当前实现字段：
- `currentHit`: 当前命中的弹幕节点（`{ el, text, type }`）
- `frozenRect`: 冻结时的 rect 快照（用于按钮稳定定位）
- `lastSendAt`: 最近一次发送时间戳
- `lastClickAt`: 最近一次点击时间戳
- `clickLocked`: 发送冷却锁
- `mouse`: 最新鼠标坐标
- `rafScheduled`: 主循环是否已排队
- `noPlayerCount`: 连续找不到容器的计数
- `dmObserverTarget`: 当前 MO 绑定目标
- `leaveTimer`: 悬停离开延迟计时器

## 边界与异常处理

- 解析失败：返回空文本，按钮不展示
- input/发送按钮缺失：显示提示并自动退避（例如 10s 以内不重试）
- 发送过快：冷却中按钮置灰并显示倒计时
- 弹幕节点被复用：若 text 变化则更新 WeakMap 缓存
- 容器查找失败：进入“降级模式”，只做鼠标命中不做 MO

## 选择器与环境检测策略

- 活动页外壳跳过初始化，iframe 内正常初始化
- 选择器优先级链维护在 `config.js`
- 支持通过调试面板实时查看命中选择器和节点结构

### 缓存失效策略

- MO 新增节点时解析并缓存
- 命中时做一次轻量校验：若 `parseText(el)` 与缓存不一致，更新缓存
- 扫描兜底只补“未缓存”的节点，避免全量解析

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

容器范围职责：

- `hit-test.js` 内部获取容器与 `rect`，并先做范围短路
- 若容器为 `null`，自动降级为全局命中（不依赖容器）

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

命中链路字段：
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

## 环境信息

- 平台：Windows 11
- Shell：bash (Git Bash)
- 浏览器：Chrome (Tampermonkey)
- Node：用于esbuild打包
- 构建命令：`npm run build` 或 `node build.js`
