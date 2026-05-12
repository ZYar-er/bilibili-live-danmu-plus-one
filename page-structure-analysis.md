# 页面结构与弹幕 DOM 分析

## 两个文件的身份

| 文件 | 实际身份 | `<html>` 标签 | 页面标题 |
|---|---|---|---|
| [dev/live.bilibili.com-1746.html](dev/live.bilibili.com-1746.html) | **正常直播间**（房间 174，主播 皮特174） | `<html lab-style="dark">` | 世界第一野排猎杀 - 皮特174 |
| [dev/live.bilibili.com-1883358196.html](dev/live.bilibili.com-1883358196.html) | **活动页**（CS赛事，Eva 框架） | `<html lang="zh-Hans" data-match-theme="dark">` | CS赛事 |

---

## 一、页面结构对比

### 正常直播页

```
<html lab-style="dark">                        ← 无 lang 属性
  <head>
    <!-- webpack live-room 打包，弹幕 CSS 直接在此 -->
  </head>
  <body>
    <div class="live-room-app">                 ← 直播间应用根节点
      <main class="app-content">
        <div class="player-section">
          <div id="live-player-ctnr">
            <div id="live-player">              ← 播放器 mount 点
              <div id="fullscreen-danmaku-vm">  ← 全屏弹幕输入框
              <div class="web-player-danmaku" style="pointer-events: none">
                <div class="danmaku-item-container" style="overflow: hidden; contain: paint">
                  <div class="bili-danmaku-x-dm ...">← 弹幕节点
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </body>
</html>
```

- 弹幕容器在**顶层文档**中，无 iframe
- webpack 命名空间：`live-room`
- 全局对象：`window.BilibiliLive {ROOMID, UID, ...}`

### 活动页

```
<html lang="zh-Hans" data-match-theme="dark">   ← 有 lang 属性
  <head>
    <!-- Eva 活动框架 -->
    <script>window.__BILIACT_ENV__ = "PC"
  </head>
  <body>
    <article id="app">
      <div data-module="match-env-all">           ← 赛事环境
        <div data-module="eva-page">
          <div data-module="era-live-non-revenue-player">
            <div id="player-ctnr">
              <iframe src="//live.bilibili.com/blanc/{roomId}?liteVersion=true">
                #document                          ← iframe 独立文档
                  <html lab-style="dark">          ← 与正常页结构一致
                    .bili-danmaku-x-dm             ← 弹幕在这里
              </iframe>
            </div>
          </div>
          <div data-module="eva-tabs">             ← 赛程、积分榜
          <div data-module="iframe-web">           ← 第三方 iframe
        </div>
      </div>
    </article>
  </body>
</html>
```

- 弹幕在 **iframe 内**，顶层文档无弹幕（日志验证：top 0 条，iframe 14 条）
- Eva 活动框架：`window.__BILIACT_ENV__` / `window.__BILIACT_PAGEINFO__`
- `EraLiveNonRevenuePlayer` 组件（React）管理 30 个房间标签页，iframe src 为 `//live.bilibili.com/blanc/{roomId}?liteVersion=true`
- 活动页自身无任何弹幕相关 DOM

### 两种页面的关系

活动页 iframe 内部**就是正常直播页的精简版**（`blanc` + `liteVersion=true`）。DOM 结构、弹幕类名、CSS 完全一致（同一 webpack `live-room` 打包）。区别仅在于弹幕所在文档层级不同。

---

## 二、弹幕节点 DOM 详细规格

### 弹幕容器层级

```
#live-player                                    ← 播放器 mount 点
  └ .web-player-danmaku                         ← 弹幕叠加层（pointer-events: none）
      └ .danmaku-item-container                 ← 弹幕轨道容器（overflow: hidden; contain: paint）
          ├ .bili-danmaku-x-dm-rotate           ← 旋转辅助 div
          └ .bili-danmaku-x-dm                  ← 实际弹幕节点（多个）
```

### 弹幕节点结构

```html
<div aria-live="polite"
     role="comment"
     class="bili-danmaku-x-dm bili-danmaku-x-roll bili-danmaku-x-show"
     style="--opacity: 0.5;
            --fontSize: 35px;
            --fontFamily: SimHei, ...;
            --fontWeight: bold;
            --color: #ffffff;
            --textShadow: 1px 0 1px #000000,...;
            --offset: 1342px;
            --translateX: -1433px;
            --duration: 10.91s;
            --top: 0px;">
  nb
</div>
```

特征：
- **扁平 `<div>`**，文本直接在 div 内（无子元素，或仅有 emoji IMG/SPAN）
- 无 `data-*` 属性，所有状态通过 CSS 自定义属性编码
- ARIA：`aria-live="polite"` + `role="comment"`（每条弹幕都有）

### CSS 自定义属性（动画驱动）

| 属性 | 示例值 | 用途 |
|---|---|---|
| `--opacity` | `0.5` | 透明度 |
| `--fontSize` | `35px` | 字号 |
| `--color` | `#ffffff` | 颜色 |
| `--offset` | `1342px` | 初始水平位置（左边缘） |
| `--translateX` | `-1433px` | 水平总位移（负=向左） |
| `--duration` | `10.91s` | 动画时长 |
| `--top` | `0px` / `40.375px` / `81.375px` | 垂直轨道位置 |
| `--display` | `none` | 隐藏标记（弹幕结束时设为 none） |

动画定义：
```css
@keyframes roll {
  0%   { transform: translateX(0) translateZ(0); }
  100% { transform: translateX(var(--translateX)) translateZ(0); }
}
.bili-danmaku-x-dm.bili-danmaku-x-show.bili-danmaku-x-roll {
  animation: roll linear var(--duration) forwards;
}
```

### 弹幕类型

| 类名 | 类型 | 动画 |
|---|---|---|
| `.bili-danmaku-x-roll` | 滚动（向左） | `roll` keyframe |
| `.bili-danmaku-x-reverse` | 反向滚动（向右） | `roll-reverse` keyframe |
| `.bili-danmaku-x-center` | 居中静态 | 无动画，`left:50%` |
| `.bili-danmaku-x-bidirection-reverse` | 双向反向 | `bidirection-reverse` |
| `.bili-danmaku-x-blackhole-rail` | 黑洞特效 | 嵌套复杂结构 |

### 弹幕输入框

全屏输入（`#fullscreen-danmaku-vm` 内）：
```html
<input placeholder="发个弹幕呗~" class="chat-input border-box">
<div class="send-danmaku">发送</div>
```

聊天面板输入（侧栏）：
```html
<textarea placeholder="发送粉丝留言，TA在等你开口" class="chat-input border-box"></textarea>
<button class="bl-button send-btn ..."><span class="txt">发送</span></button>
```

两个输入框共享 `.chat-input` 类名。全屏用 `<input>`，侧栏用 `<textarea>`。

---

## 三、选择器评估

### 弹幕节点选择器

| 选择器 | 精确度 | 说明 |
|---|---|---|
| `.bili-danmaku-x-dm` | 低 | 仅类名，可能匹配非弹幕元素 |
| `.bili-danmaku-x-dm[role="comment"]` | 高 | 当前使用，利用 ARIA role 精确匹配 |
| `.bili-danmaku-x-dm[role="comment"][aria-live="polite"]` | 最高 | 再加 aria-live，但冗余（role 已足够） |

**结论：当前 `DM_NODE_SELECTOR = '.bili-danmaku-x-dm[role="comment"]'` 已是最优。**

### 弹幕容器选择器

当前 `DM_CONTAINER_SELECTORS` 优先链：
```js
[
  '#live-player .web-player-danmaku .danmaku-item-container',  // 最精确
  '#live-player .danmaku-item-container',
  '.web-player-danmaku .danmaku-item-container',
  '.danmaku-item-container',
  '#live-player .web-player-danmaku',
  '.web-player-danmaku',
  '.live-player-dm-wrap',
]
```

B站会销毁/重建容器，优先链逐级降级是正确策略。**无需修改**。

### 发送输入框选择器

| 查找方式 | 可靠性 | 覆盖 |
|---|---|---|
| placeholder 包含"弹幕" | 中（文案可能变） | 仅全屏输入框 |
| `.chat-input` 类名 | 高（CSS 类名稳定） | 全屏 + 侧栏 |
| `#fullscreen-danmaku-vm .chat-input` | 最高 | 仅全屏 |

---

## 四、@match 覆盖分析

当前 `@match` 模式（已修复）：
```js
// @match        *://live.bilibili.com/0*
// ... 到 9*
// @match        *://live.bilibili.com/blanc*
```

| 场景 | URL | 匹配 | 注入结果 |
|---|---|---|---|
| 正常直播页 | `live.bilibili.com/174` | `1*` ✅ | 正常运行 |
| 活动页顶层 | `live.bilibili.com/blackboard/era/...` | 不匹配 | 不注入（不需要） |
| 活动页 iframe | `live.bilibili.com/blanc/1883358196` | `blanc*` ✅ | 正常运行 |

`blanc` 不以数字开头，需单独加 `@match` 覆盖。

### 修复

已在 [build.js](build.js) 中增加：
```js
// @match        *://live.bilibili.com/blanc*
```

修复后覆盖：

| 场景 | URL | 匹配规则 | 状态 |
|---|---|---|---|
| 正常直播页 | `live.bilibili.com/174` | `1*` | ✅ |
| 活动页 iframe | `live.bilibili.com/blanc/1883358196` | `blanc*` | ✅ |
| 活动页顶层 | `live.bilibili.com/blackboard/era/...` | 不匹配 | ✅ 不需要 |

---

## 五、总结

| 维度 | 正常页 | 活动页 |
|---|---|---|
| 弹幕位置 | 顶层文档 | iframe（`blanc/{roomId}?liteVersion=true`） |
| 页面框架 | webpack `live-room` | Eva 活动框架（React/Vue） |
| `<html>` 标签 | `<html lab-style="dark">` | `<html lang="zh-Hans" data-match-theme="dark">` |
| 嵌套 `<html>` | 无 | 无（iframe 有独立 #document） |
| 弹幕 DOM 兼容 | — | `blanc` 与正常页结构一致 |
| 脚本注入 | 正常 | ❌ **需加 @match blanc*** |
| 选择器需要修改 | — | 不需要，blanc 内结构一致 |
| 发送输入框 | `.chat-input`（两个，placeholder 不同） | blanc 内同正常页 |
