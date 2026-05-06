# Code Review

## Findings

### High (Fixed)

- [已修复] `sendDanmaku()` 冷却时间戳写入时机过早。  
  已将 `lastSendAt = now` 移动到输入框存在且已填入发送文本之后，避免 `input_not_found` 等失败路径错误占用冷却窗口。涉及文件：`bilibili-live-danmu+1.user.js`。

### Medium (Fixed)

- [已修复] `extractDmPayload()` 文本重建吞空格。  
  已将片段聚合改为 `join(' ')` 并二次规范化空白（`replace(/\\s+/g, ' ').trim()`），避免图文混排时将 `"hello [emoji] world"` 压缩成 `"hello[emoji]world"`。涉及文件：`bilibili-live-danmu+1.user.js`。

## Open Questions / Assumptions

- 当前修复按“尽量还原可读文本 + 仅成功路径占用冷却”为目标语义；若后续需要“紧凑拼接文本”或“点击即占冷却”，可再通过配置开关分流。

## Secondary Notes

- 本次审阅重点覆盖了命中检测、冻结/ghost 流程、发送链路与节流逻辑。  
- 本轮已完成两项缺陷修复，建议补 1 轮浏览器实机回归（真实直播间高频弹幕、全屏切换、输入框缺失场景）。
