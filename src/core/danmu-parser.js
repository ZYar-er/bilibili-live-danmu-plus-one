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

function emojiHashFromSrc(src) {
  if (!src) return '';
  var m = src.match(/bfs\/(?:live|emote)\/([0-9a-f]+)/i);
  return m ? m[1] : '';
}

// 遍历直接子节点，区分 TEXT / IMG / SPAN.emoji / 特殊图片表情
export function getDmText(el) {
  var parts = [];
  el.childNodes.forEach(function (child) {
    if (child.nodeType === Node.TEXT_NODE) {
      var t = child.textContent.replace(/\s+/g, ' ');
      if (t.trim()) parts.push({ type: 'text', value: t });
    } else if (child.tagName === 'IMG') {
      var name = resolveEmojiNameFromImg(child);
      if (name) parts.push({ type: 'emoji', value: '[' + name + ']' });
      else {
        var hash = emojiHashFromSrc(child.getAttribute('src') || child.src || '');
        if (hash) parts.push({ type: 'emoji-special', value: hash, hash: hash });
      }
    } else if (child.tagName === 'SPAN' && child.classList.contains('emoji')) {
      parts.push({ type: 'emoji-sm', value: child.textContent });
    }
  });

  if (parts.length === 0) return { type: 'unknown', text: '' };

  var text = parts.map(function (p) { return p.value; }).join('').replace(/\s+/g, ' ').trim();

  var hasText = false, hasEmoji = false, hasSpecial = false;
  parts.forEach(function (p) {
    if (p.type === 'text') hasText = true;
    if (p.type === 'emoji' || p.type === 'emoji-sm') hasEmoji = true;
    if (p.type === 'emoji-special') hasSpecial = true;
  });

  // 特殊图片表情不能和文字或其他表情混发，混排时不给发送入口
  if (hasSpecial && (hasText || hasEmoji)) return { type: 'mixed-special', text: '', hash: '' };
  if (hasSpecial) return { type: 'emoji-special', text: parts[0].hash, hash: parts[0].hash };

  var type = hasText && hasEmoji ? 'mixed' : hasText ? 'text' : hasEmoji ? 'emoji' : 'unknown';
  return { type: type, text: text };
}
