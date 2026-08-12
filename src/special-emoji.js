import { CONFIG } from './config.js';
import { state } from './state.js';
import { setDbg } from './ui/debug-panel.js';

var availableHashes = {};
var availableLoaded = false;

export function emojiHashFromSrc(src) {
  if (!src) return '';
  var m = src.match(/bfs\/(?:live|emote)\/([0-9a-f]+)/i);
  return m ? m[1] : '';
}

function roomIdFromPath() {
  var m = location.pathname.match(/^\/(\d+)/);
  return m ? m[1] : '';
}

export function refreshAvailableEmojis() {
  var roomId = roomIdFromPath();
  if (!roomId) return Promise.resolve(false);
  return fetch('https://api.live.bilibili.com/xlive/web-ucenter/v2/emoticon/GetEmoticons'
    + '?platform=pc&room_id=' + encodeURIComponent(roomId), { credentials: 'include' })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (!json || json.code !== 0 || !json.data || !Array.isArray(json.data.data)) return false;
      json.data.data.forEach(function (pkg) {
        if (!pkg || !Array.isArray(pkg.emoticons)) return;
        pkg.emoticons.forEach(function (e) {
          if (!e || e.perm !== 1 || e.unlock_need_gift) return;
          var unique = e.emoticon_unique || '';
          if (/^emoji_\d+$/.test(unique)) return;
          var hash = emojiHashFromSrc(e.url || '');
          if (!hash) return;
          availableHashes[hash.toLowerCase()] = 1;
        });
      });
      availableLoaded = true;
      return true;
    })
    .catch(function () { return false; });
}

export function isSpecialEmojiAvailable(hash) {
  if (!availableLoaded) return true;
  return !!availableHashes[String(hash || '').toLowerCase()];
}

export function specialEmojiFromImg(img) {
  if (!img) return '';
  return emojiHashFromSrc(img.getAttribute('src') || img.src || '');
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

function activateEmoticonTab(item) {
  var pane = item.closest ? item.closest('.img-pane') : null;
  if (!pane || !pane.parentNode) return;
  var panes = Array.prototype.filter.call(pane.parentNode.children, function (el) {
    return el.classList && el.classList.contains('img-pane');
  });
  var idx = -1;
  for (var i = 0; i < panes.length; i++) {
    if (panes[i] === pane) { idx = i; break; }
  }
  if (idx < 0) return;
  var tab = pane.parentNode.querySelectorAll('.tab-pane-item')[idx];
  if (tab && !tab.classList.contains('active')) tab.click();
}

export function sendSpecialEmoji(hash) {
  var now = Date.now();
  if (!canSend(now)) { setDbg('lastErr', 'cooldown'); return false; }
  state.lastSendAt = now;

  var btn = findPanelButton();
  var item = findEmoticonItem(hash);
  if (!item && btn && !panelOpen()) btn.click();
  else if (item) activateEmoticonTab(item);

  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    var found = findEmoticonItem(hash);
    if (found) {
      clearInterval(timer);
      activateEmoticonTab(found);
      setTimeout(function () {
        var ready = findEmoticonItem(hash);
        if (ready) ready.click();
      }, 60);
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

export function canSend(now) {
  if (!CONFIG.enableSendCooldown) return true;
  return now - state.lastSendAt >= CONFIG.cooldownMs;
}
