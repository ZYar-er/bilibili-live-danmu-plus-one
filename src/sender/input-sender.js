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

function findInput() {
  return document.querySelector('#fullscreen-danmaku-vm .chat-input')
    || document.querySelector('.chat-input');
}

function findSendBtn() {
  var btn = document.querySelector('#fullscreen-danmaku-vm .send-danmaku')
    || document.querySelector('#fullscreen-danmaku-vm button')
    || document.querySelector('.bl-button.send-btn')
    || document.querySelector('button.send-btn');
  if (btn) return btn;

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

export function sendDanmaku(text) {
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
