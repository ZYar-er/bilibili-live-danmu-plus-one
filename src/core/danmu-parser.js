import { EMOJI_FALLBACK } from '../config.js';

// 遍历直接子节点，区分 TEXT / IMG(alt) / SPAN.emoji
export function getDmText(el) {
  var parts = [];
  el.childNodes.forEach(function (child) {
    if (child.nodeType === Node.TEXT_NODE) {
      var t = child.textContent.replace(/\s+/g, ' ').trim();
      if (t) parts.push({ type: 'text', value: t });
    } else if (child.tagName === 'IMG') {
      var name = child.dataset.name || child.getAttribute('alt') || '';
      parts.push({ type: 'emoji', value: name ? '[' + name + ']' : EMOJI_FALLBACK });
    } else if (child.tagName === 'SPAN' && child.classList.contains('emoji')) {
      parts.push({ type: 'emoji-sm', value: child.textContent });
    }
  });

  if (parts.length === 0) return { type: 'unknown', text: '' };

  var text = parts.map(function (p) { return p.value; }).join(' ').replace(/\s+/g, ' ').trim();

  var hasText = false, hasEmoji = false;
  parts.forEach(function (p) {
    if (p.type === 'text') hasText = true;
    if (p.type === 'emoji' || p.type === 'emoji-sm') hasEmoji = true;
  });

  var type = hasText && hasEmoji ? 'mixed' : hasText ? 'text' : hasEmoji ? 'emoji' : 'unknown';
  return { type: type, text: text };
}
