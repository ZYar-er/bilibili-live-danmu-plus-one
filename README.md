# B站直播弹幕 +1

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-≥5.0-orange)](https://www.tampermonkey.net/)

鼠标悬停 B站直播弹幕，一键发送同款弹幕 +1。

## 功能

- **悬停即用** — 鼠标划过任意弹幕，弹出 `+1` 按钮，点击即发
- **Emoji 支持** — 兼容文字 emoji、图片表情（B站自定义表情自动解析为 `[表情名]`）
- **发送冷却** — 可配置间隔防刷屏（默认 2s），也可关闭
- **配置持久化** — 所有设置自动保存，刷新不丢失
- **Tampermonkey 菜单** — 右键油猴图标直接修改设置，无需编辑代码
- **全屏兼容** — 全屏模式下正常使用
- **调试面板** — 内置调试信息面板，方便排查问题

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击脚本文件 `bilibili-live-danmu-plus-one.user.js` → Tampermonkey 会自动弹出安装页面
3. 点击「安装」即可

## 使用

进入任意 B站直播间（`https://live.bilibili.com/*`）：

1. 鼠标移动到弹幕上 → 出现半透明 `+1` 按钮
2. 点击按钮 → 自动填入弹幕内容并发送
3. 弹幕会在冷却时间结束后才能再次发送

## 配置

点击浏览器工具栏的 Tampermonkey 图标 → 在「B站直播弹幕 +1」下方可以看到菜单：

| 菜单项 | 说明 |
|--------|------|
| 切换发送冷却 | 开启/关闭发送间隔限制 |
| 发送间隔 → 0.3s / 0.6s / ... | 选择冷却时间（无间隔 / 0.3s ~ 3.0s） |
| 切换按钮透明度 | 循环切换 30% → 50% → 70% → 80% → 95% |
| 切换调试面板 | 显示/隐藏左上角调试信息 |
| 重置所有设置 | 清除配置并刷新页面 |

> 配置保存在 GM 存储中（Tampermonkey 沙箱），不会随浏览器缓存清理丢失。

## 调试面板

开启调试面板后，左上角会显示：

```
[DM+1 DEBUG v0.7.0]
frame            : 1234       # rAF 帧计数
dmCount          : 35         # 当前页面的弹幕 DOM 数量
mouse            : 640,480    # 鼠标坐标
hitType          : text       # 当前命中的弹幕类型
hitText          : 233333     # 当前命中的弹幕文字
btnVisible       : true       # +1 按钮是否可见
frozen           : true       # 当前弹幕动画是否暂停
currentConnected : true       # 命中元素是否仍在 DOM 中
lastSend         : 233333     # 最后一次发送的文字
lastErr          : (none)     # 最后一次错误
enableCooldown   : true       # 冷却开关状态
cooldownMs       : 2000       # 冷却时间(ms)
fullscreen       : false      # 是否全屏
```

## 性能

在典型直播间（50 条弹幕同时可见）下：

- **CPU** — 每帧扫描开销 < 0.5ms，rAF 帧预算充足
- **内存** — 稳定运行 1 小时后内存增长 < 1MB
- **DOM 操作** — 仅在命中目标时写入样式，悬停空闲时零 DOM 写入

> 可通过 Chrome DevTools → Performance 面板录制、或使用调试面板的 frame/dmCount 字段观测。

## 兼容性

- Chrome 90+ / Edge 90+ / Firefox 90+
- Tampermonkey ≥ 5.0
- B站直播间（普通直播、赛事直播、全屏模式均测试通过）

## 开发

```
bilibili-live-danmu-plus-one.user.js   # 插件本体（可直接安装到 Tampermonkey）
```

修改后直接在 Tampermonkey 管理面板中编辑更新即可，无需构建工具。

## License

MIT
