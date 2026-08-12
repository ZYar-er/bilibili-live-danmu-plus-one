import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { setDbg } from '../ui/debug-panel.js';

function setNativeValue(el, value) {
  var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  var desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc && desc.set) desc.set.call(el, value);
  else el.value = value;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText' }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// 精准 → 宽泛 降级链
function findInput() {
  // 1. 侧栏：容器限定 textarea（始终可见，优先）
  var el = document.querySelector('.chat-input-ctnr textarea.chat-input');
  if (el) return el;
  // 2. 全屏：容器限定 input
  el = document.querySelector('#fullscreen-danmaku-vm input.chat-input');
  if (el) return el;
  // 3. 宽泛兜底
  return document.querySelector('.chat-input');
}

function findSendBtn() {
  var btn;
  // 1. 侧栏：容器限定发送按钮（最精确）
  btn = document.querySelector('.chat-input-ctnr button.send-btn');
  if (btn) return btn;
  // 2. 侧栏：类名限定
  btn = document.querySelector('.bl-button.send-btn');
  if (btn) return btn;
  // 3. 全屏：容器限定
  btn = document.querySelector('#fullscreen-danmaku-vm .send-danmaku');
  if (btn) return btn;
  // 4. 全屏：容器内任意 button
  btn = document.querySelector('#fullscreen-danmaku-vm button');
  if (btn) return btn;
  // 5. 宽泛扫描：文本匹配
  var btns = document.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    var text = (btns[i].textContent || '').trim();
    if (/^发送/.test(text)) return btns[i];
  }
  return null;
}

function canSend(now) {
  if (!CONFIG.enableSendCooldown) return true;
  return now - state.lastSendAt >= CONFIG.cooldownMs;
}

function queryScope(selector) {
  var scope = document.fullscreenElement || document;
  var el = scope.querySelector(selector);
  if (el) return el;
  return document.querySelector(selector);
}

function findPanelButton() {
  return queryScope('.emoticons-panel[title="表情包"]')
    || queryScope('.icon-right-part .emoticons-panel')
    || queryScope('.emoticons-panel');
}

function panelOpen() {
  return !!queryScope('.emoticons-pane, .emoticon-item');
}

function findEmoticonItem(hash) {
  var scope = document.fullscreenElement || document;
  var items = scope.querySelectorAll('.emoticon-item');
  if (!items.length) items = document.querySelectorAll('.emoticon-item');
  for (var i = 0; i < items.length; i++) {
    var img = items[i].querySelector('img');
    var src = img && (img.getAttribute('src') || img.src) || '';
    var m = src.match(/bfs\/(?:live|emote)\/([0-9a-f]+)/i);
    if (m && m[1].toLowerCase() === hash.toLowerCase()) return items[i];
  }
  return null;
}

function sendSpecialEmoji(hash) {
  var now = Date.now();
  if (!canSend(now)) { setDbg('lastErr', 'cooldown'); return false; }
  state.lastSendAt = now;

  var btn = findPanelButton();
  var item = findEmoticonItem(hash);
  if (!item && btn && !panelOpen()) btn.click();

  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    var found = findEmoticonItem(hash);
    if (found) {
      clearInterval(timer);
      found.click();
      setDbg('lastErr', '');
      setDbg('lastSend', 'emoji:' + hash);
      return;
    }
    if (!panelOpen() && btn && tries < 3) btn.click();
    if (tries >= 10) {
      clearInterval(timer);
      setDbg('lastErr', 'special_emoji_not_found');
    }
  }, 150);
  return true;
}

export function sendDanmaku(payload) {
  var text = typeof payload === 'string' ? payload : payload && payload.text;
  var hash = payload && payload.hash;
  var type = payload && payload.type;
  if (type === 'emoji-special' && hash) return sendSpecialEmoji(hash);

  var now = Date.now();
  if (!canSend(now)) { setDbg('lastErr', 'cooldown'); return false; }
  var input = findInput();
  if (!input) { setDbg('lastErr', 'input_not_found'); return false; }
  var finalText = CONFIG.appendPlusOne ? text + ' +1' : text;
  input.focus();
  setNativeValue(input, finalText);
  state.lastSendAt = now;
  var btn = findSendBtn();
  if (btn) { btn.click(); setDbg('lastErr', ''); }
  else {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    setDbg('lastErr', 'send_btn_not_found_use_enter');
  }
  setDbg('lastSend', finalText);
  return true;
}
