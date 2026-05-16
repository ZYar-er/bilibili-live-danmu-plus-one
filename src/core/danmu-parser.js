import { EMOJI_ID_TO_NAME } from '../emoji-map.js';

function resolveEmojiNameFromImg(img) {
  var name = img.dataset.name || img.getAttribute('alt') || '';
  if (name) return name;

  var rid = img.dataset.resourceId
    || img.getAttribute('data-resource-id')
    || img.getAttribute('data-resourceId')
    || img.dataset.id
    || img.getAttribute('data-id')
    || '';

  if (!rid) {
    var src = img.getAttribute('src') || img.src || '';
    var match = src.match(/bfs\/live\/([0-9a-f]+)/i);
    if (match) rid = match[1];
  }

  if (rid && EMOJI_ID_TO_NAME[rid]) return EMOJI_ID_TO_NAME[rid];
  return '';
}

// 遍历直接子节点，区分 TEXT / IMG(alt) / SPAN.emoji
export function getDmText(el) {
  var parts = [];
  el.childNodes.forEach(function (child) {
    if (child.nodeType === Node.TEXT_NODE) {
      var t = child.textContent.replace(/\s+/g, ' ').trim();
      if (t) parts.push({ type: 'text', value: t });
    } else if (child.tagName === 'IMG') {
      var name = resolveEmojiNameFromImg(child);
      if (name) parts.push({ type: 'emoji', value: '[' + name + ']' });
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
