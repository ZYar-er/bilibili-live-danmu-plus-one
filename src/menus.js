import { CONFIG, UI, storageSet } from './config.js';
import { setDbg, renderDebug } from './ui/debug-panel.js';

export function registerMenus(plusBtn) {
  try {
    GM_registerMenuCommand('切换发送冷却', function () {
      CONFIG.enableSendCooldown = !CONFIG.enableSendCooldown;
      storageSet('enableSendCooldown', CONFIG.enableSendCooldown);
      setDbg('enableSendCooldown', CONFIG.enableSendCooldown);
    });

    CONFIG.cooldownMsOptions.forEach(function (ms) {
      var label = ms === 0 ? '无间隔' : (ms / 1000).toFixed(1) + 's';
      GM_registerMenuCommand('发送间隔 → ' + label, function () {
        CONFIG.cooldownMs = ms;
        storageSet('cooldownMs', ms);
        setDbg('cooldownMs', ms);
        console.log('[DM+1] 发送间隔:', label);
      });
    });

    GM_registerMenuCommand('切换按钮透明度', function () {
      var opts = UI.OPACITY_OPTIONS;
      var idx = opts.indexOf(CONFIG.btnOpacity);
      CONFIG.btnOpacity = opts[(idx + 1) % opts.length];
      storageSet('btnOpacity', CONFIG.btnOpacity);
      plusBtn.style.opacity = CONFIG.btnOpacity;
    });

    GM_registerMenuCommand('切换调试面板', function () {
      CONFIG.debug = !CONFIG.debug;
      storageSet('debug', CONFIG.debug);
      var dp = document.querySelector('[data-dm1-debug]');
      if (dp) dp.style.display = CONFIG.debug ? 'block' : 'none';
      if (CONFIG.debug) { renderDebug(); }
    });

    GM_registerMenuCommand('重置所有设置', function () {
      ['enableSendCooldown', 'cooldownMs', 'debug', 'btnOpacity'].forEach(function (k) {
        try { GM_deleteValue && GM_deleteValue(k); } catch (e) {}
        try { localStorage.removeItem('dm1_' + k); } catch (e) {}
      });
      location.reload();
    });
  } catch (e) {}
}
