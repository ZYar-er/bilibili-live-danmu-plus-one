# B站直播弹幕 +1

<p align="center"><img src="docs/logo.svg" width="96" alt="B站直播弹幕 +1"></p>

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-≥5.0-orange)](https://www.tampermonkey.net/)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-online-brightgreen)](https://zyar-er.github.io/bili-danmu-plus1/)

鼠标悬停 B站直播弹幕，一键发送同款弹幕 +1。

> **v0.0.7** — 代码由 AI 辅助生成，人工审核与调优。

## 功能

- **悬停即用** — 鼠标划过任意弹幕，弹出 `+1` 按钮，点击即发
- **Emoji 支持** — 兼容文字 emoji、常规表情与特殊表情（resource_id 映射）
- **图文混合** — 正确处理 "哈哈哈[大笑]笑死" 等混合弹幕内容
- **弹幕冻结恢复** — 悬停时弹幕冻结，移开后从冻结位置继续滚动直至自然消失
- **发送冷却** — 可配置间隔防刷屏（默认 2s），也可关闭
- **配置持久化** — 所有设置自动保存，刷新不丢失
- **页内控制面板** — 直播间播放器控制栏内置设置面板，无需再开 Tampermonkey 菜单
- **全屏兼容** — 全屏模式下正常使用
- **调试面板** — 内置调试信息面板，方便排查问题

## 安装

介绍与安装引导页：[https://zyar-er.github.io/bili-danmu-plus1/](https://zyar-er.github.io/bili-danmu-plus1/)

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 打开 [Latest Release](https://github.com/ZYar-er/bili-danmu-plus1/releases/latest) 下载 `bili-danmu-plus1.user.js`
3. Tampermonkey 会自动弹出安装页面
4. 点击「安装」即可

## 使用

进入任意 B站直播间（`https://live.bilibili.com/<房间号>`）：

1. 鼠标移动到弹幕上 → 出现半透明 `+1` 按钮
2. 点击按钮 → 自动填入弹幕内容并发送
3. 弹幕会在冷却时间结束后才能再次发送

## 配置

进入直播间后，点击播放器控制栏中点赞按钮左侧的齿轮图标，打开「DM+1 设置」面板：

| 设置项 | 说明 |
|--------|------|
| 发送冷却 | 开启/关闭发送间隔限制 |
| 发送间隔 | 选择无间隔 / 0.3s / 0.6s / 1.2s / 2.0s / 3.0s |
| 按钮透明度 | 切换 30% → 50% → 70% → 80% → 95% |
| 调试面板 | 显示/隐藏左上角调试信息 |
| 重置所有设置 | 清除配置并刷新页面 |

> 配置保存在 GM 存储中（Tampermonkey 沙箱），不会随浏览器缓存清理丢失。

## 调试面板

开启调试面板后，左上角会显示：

```
[DM+1 DEBUG v0.0.7]
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

如遇到新表情未映射，请更新 `bilibili-emoji/bilibili-emoji.csv` 后重新生成映射文件。

## 开发

```
src/                     # 源码（esbuild 打包入口 src/index.js）
docs/                    # GitHub Pages 站点（介绍页 / 样式 / logo / 截图）
bili-danmu-plus1.user.js # 构建产物（可直接安装到 Tampermonkey）
planning/                # 内部规划文档（不发布到 GitHub Pages）
reference/               # 参考脚本（不纳入版本管理）
```

安装依赖并构建：

```
npm install
npm run build
```

更新表情映射：

```
npm run update:emoji-map
```

构建产物输出到 [bili-danmu-plus1.user.js](bili-danmu-plus1.user.js)。

`docs/` 站点在推送 `master` 后由 GitHub Actions 自动部署到 [GitHub Pages](https://zyar-er.github.io/bili-danmu-plus1/)。

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
2. 再创建并推送一个 `v0.0.7` 形式的标签
3. GitHub Actions 会自动完成 Release 发布

## 贡献

欢迎提交 Issue 或 PR。建议在提交前自测以下场景：

- 普通直播间高频弹幕
- 活动页 iframe 直播间
- 全屏切换

## License

MIT — 详见 [LICENSE](LICENSE) 文件。
