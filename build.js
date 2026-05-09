const esbuild = require('esbuild');
const fs = require('fs');

const userscriptBanner = `// ==UserScript==
// @name         B站直播弹幕 +1
// @name:zh-CN   B站直播弹幕 +1
// @namespace    https://github.com/ZYar-er/bilibili-live-danmu-plus-one
// @version      0.0.1
// @description  鼠标悬停弹幕即可一键发送同款弹幕+1，支持文字/emoji/表情图片，可配置发送间隔
// @description:zh-CN  鼠标悬停弹幕即可一键发送同款弹幕+1，支持文字/emoji/表情图片，可配置发送间隔
// @author       ZYar-er
// @license      MIT
// @match        *://live.bilibili.com/0*
// @match        *://live.bilibili.com/1*
// @match        *://live.bilibili.com/2*
// @match        *://live.bilibili.com/3*
// @match        *://live.bilibili.com/4*
// @match        *://live.bilibili.com/5*
// @match        *://live.bilibili.com/6*
// @match        *://live.bilibili.com/7*
// @match        *://live.bilibili.com/8*
// @match        *://live.bilibili.com/9*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @homepageURL  https://github.com/ZYar-er/bilibili-live-danmu-plus-one
// @supportURL   https://github.com/ZYar-er/bilibili-live-danmu-plus-one/issues
// @updateURL    https://github.com/ZYar-er/bilibili-live-danmu-plus-one/raw/master/bilibili-live-danmu-plus-one.user.js
// @downloadURL  https://github.com/ZYar-er/bilibili-live-danmu-plus-one/raw/master/bilibili-live-danmu-plus-one.user.js
// ==/UserScript==
`;

esbuild.build({
  entryPoints: ['src/index.js'],
  bundle: true,
  outfile: 'bilibili-live-danmu-plus-one.user.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2015',
  banner: { js: userscriptBanner },
  minify: false,
}).then(function () {
  console.log('Build complete: bilibili-live-danmu-plus-one.user.js');
}).catch(function () { process.exit(1); });
