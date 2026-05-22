# Release v0.0.4

## 更改

- **版本号自动注入** — 构建时通过 esbuild define 注入 `__VERSION__`，不再硬编码版本字符串
- **弹幕 DOM 元素复用检测** — 300ms 周期扫描加入 textContent 变更检测，B站回收 DOM 改内容也能正确识别
- **混合弹幕空格修复** — "001[大笑]" 类型图文混合弹幕不再出现多余空格
- **性能优化** — `resolvePayload` 缓存优先、`scanAndCache` 单次遍历、`textContent` 快速路径，`getDmText` 调用减少约 9x
- **调试面板 NaN 修复** — 双 `+` 运算符导致的 NaN 显示问题已修正
- **设计文档更新** — `design.md` 文件结构补全缺失模块

## 安装方法

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展。
2. 打开 [Latest Release](https://github.com/ZYar-er/bilibili-live-danmu-plus-one/releases/latest) 下载 `bilibili-live-danmu-plus-one.user.js`。
3. Tampermonkey 自动弹出安装页，点击「安装」即可。

## 说明

- Release 产物包含最新构建的 `bilibili-live-danmu-plus-one.user.js`。
- 脚本内置自动更新指向 latest release，Tampermonkey 会定期检查更新。
