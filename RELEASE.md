# Release v0.0.7

## 更改

- **特殊表情一键发送** — 直播间专属图片表情可直接 +1，自动定位表情包 tab 并点击发送
- **可用表情过滤** — 特殊表情不在当前账号表情面板中时不显示 +1，避免误发不可用表情
- **模块重构** — 特殊表情识别、定位与发送抽离为独立模块，便于维护
- **性能优化** — 主循环容器 rect 缓存、弹幕扫描改用 `getElementsByClassName` 快路径、debug 统计收窄

## 安装方法

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展。
2. 打开 [介绍页](https://zyar-er.github.io/bili-danmu-plus1/) 点击「安装脚本」。
3. Tampermonkey 自动弹出安装页，点击「安装」即可。

## 说明

- Release 产物包含最新构建的 `bili-danmu-plus1.user.js`。
- 脚本内置自动更新指向 latest release，Tampermonkey 会定期检查更新。
