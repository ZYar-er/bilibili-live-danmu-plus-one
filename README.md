# B站直播弹幕 +1

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-≥5.0-orange)](https://www.tampermonkey.net/)

鼠标悬停 B站直播弹幕，一键发送同款弹幕 +1。

> **v0.0.1** — 大部分代码由 AI 辅助生成（Claude Code 使用 deepseek-v4 与 mimo-v2.5 模型，另含 GitHub Copilot），人工审核与调优。

## 功能

- **悬停即用** — 鼠标划过任意弹幕，弹出 `+1` 按钮，点击即发
- **Emoji 支持** — 兼容文字 emoji、常规表情（带名称的表情图）；特殊 emoji 暂不适配
- **图文混合** — 正确处理 "哈哈哈[大笑]笑死" 等混合弹幕内容
- **弹幕冻结恢复** — 悬停时弹幕冻结，移开后从冻结位置继续滚动直至自然消失
- **发送冷却** — 可配置间隔防刷屏（默认 2s），也可关闭
- **配置持久化** — 所有设置自动保存，刷新不丢失
- **Tampermonkey 菜单** — 右键油猴图标直接修改设置，无需编辑代码
- **全屏兼容** — 全屏模式下正常使用
- **调试面板** — 内置调试信息面板，方便排查问题

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 推荐打开 [Latest Release 资产](https://github.com/ZYar-er/bilibili-live-danmu-plus-one/releases/latest/download/bilibili-live-danmu-plus-one.user.js) 直接下载 `bilibili-live-danmu-plus-one.user.js`
3. 或者直接打开 [Raw 链接](https://github.com/ZYar-er/bilibili-live-danmu-plus-one/raw/master/bilibili-live-danmu-plus-one.user.js) → Tampermonkey 弹出安装页面
4. 点击「安装」即可

## 使用

进入任意 B站直播间（`https://live.bilibili.com/<房间号>`）：

1. 鼠标移动到弹幕上 → 出现半透明 `+1` 按钮
2. 点击按钮 → 自动填入弹幕内容并发送
3. 弹幕会在冷却时间结束后才能再次发送

## 配置

点击浏览器工具栏的 Tampermonkey 图标 → 在「B站直播弹幕 +1」下方可以看到菜单：

| 菜单项 | 说明 |
|--------|------|
| 切换发送冷却 | 开启/关闭发送间隔限制 |
| 发送间隔 → 无间隔 / 0.3s / ... / 3.0s | 选择冷却时间 |
| 切换按钮透明度 | 循环切换 30% → 50% → 70% → 80% → 95% |
| 切换调试面板 | 显示/隐藏左上角调试信息 |
| 重置所有设置 | 清除配置并刷新页面 |

> 配置保存在 GM 存储中（Tampermonkey 沙箱），不会随浏览器缓存清理丢失。

## 调试面板

开启调试面板后，左上角会显示：

```
[DM+1 DEBUG v0.0.1]
frame            : 1234       # rAF 帧计数
dmCount          : 35         # 当前页面的弹幕 DOM 数量
mouse            : 640,480    # 鼠标坐标
hitType          : text       # 当前命中的弹幕类型 (text/emoji/emoji-sm/mixed)
hitText          : 233333     # 当前命中的弹幕文字
hitSource        : elementsFromPoint  # 命中来源 (elementsFromPoint/fallbackScan)
hitSelector      : div.bili-danmaku-x-dm... # 命中节点路径
hitRect          : 120,80,300,36 # 命中矩形 (left,top,width,height)
btnVisible       : true       # +1 按钮是否可见
frozen           : true       # 当前弹幕动画是否暂停
currentConnected : true       # 命中元素是否仍在 DOM 中
lastSend         : 233333     # 最后一次发送的文字
lastErr          : (none)     # 最后一次错误
enableCooldown   : true       # 冷却开关状态
cooldownMs       : 2000       # 冷却时间(ms)
fullscreen       : false      # 是否全屏
```

## 兼容性

- Chrome 90+ / Edge 90+ / Firefox 90+
- Tampermonkey ≥ 5.0
- B站直播间（普通直播、赛事直播/活动页 iframe、全屏模式均测试通过）

## 已知问题

### 特殊 emoji 暂不适配

B站特殊 emoji 需要完整的 id 列表才能准确映射，目前会跳过无名称表情（不再附加 `[表情]` 占位）。

## 开发

本项目由 [Claude Code](https://claude.ai/code) 辅助完成大部分代码编写（使用 deepseek-v4 与 mimo-v2.5），并结合 GitHub Copilot。人工负责需求定义、功能验证与最终调优。

```
[bilibili-live-danmu-plus-one.user.js](bilibili-live-danmu-plus-one.user.js)   # 构建产物（可直接安装到 Tampermonkey）
[reference/](reference/)                             # 参考脚本（不纳入版本管理）
```

安装依赖并构建：

```
npm install
npm run build
```

构建产物输出到 [bilibili-live-danmu-plus-one.user.js](bilibili-live-danmu-plus-one.user.js)。

## 构建与发布

1. 更新版本号（可选）：在 [package.json](package.json) 与 userscript 头部保持一致
2. 运行构建：`npm run build`
3. 将最新构建产物发布到仓库（或替换已安装脚本）
4. 发布说明见 [RELEASE.md](RELEASE.md)

## 自动发布 Release

GitHub Actions 已配置为：

1. 推送 `v*` 标签时自动构建
2. 生成并发布 GitHub Release
3. 附带 [RELEASE.md](RELEASE.md) 作为 Release 说明

如果你要手动发布：

1. 先执行 `npm run build`
2. 再创建并推送一个 `v0.0.1` 形式的标签
3. GitHub Actions 会自动完成 Release 发布

## 贡献

欢迎提交 Issue 或 PR。建议在提交前自测以下场景：

- 普通直播间高频弹幕
- 活动页 iframe 直播间
- 全屏切换

## 作者

**ZYar-er** — [GitHub](https://github.com/ZYar-er)

## License

MIT — 详见 [LICENSE](LICENSE) 文件。
