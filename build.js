const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
var version = process.env.VERSION || pkg.version;
if (version.startsWith('v')) version = version.slice(1);

const userscriptBanner = `// ==UserScript==
// @name         B站直播弹幕 +1
// @name:zh-CN   B站直播弹幕 +1
// @namespace    https://github.com/ZYar-er/bili-danmu-plus1
// @version      ${version}
// @description  鼠标悬停弹幕即可一键发送同款弹幕+1，支持文字/emoji/表情图片，可配置发送间隔
// @description:zh-CN  鼠标悬停弹幕即可一键发送同款弹幕+1，支持文字/emoji/表情图片，可配置发送间隔
// @author       ZYar-er
// @license      MIT
// @icon         https://raw.githubusercontent.com/ZYar-er/bili-danmu-plus1/master/docs/logo.svg
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
// @match        *://live.bilibili.com/blanc*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-idle
// @homepageURL  https://github.com/ZYar-er/bili-danmu-plus1
// @supportURL   https://github.com/ZYar-er/bili-danmu-plus1/issues
// @updateURL    https://github.com/ZYar-er/bili-danmu-plus1/releases/latest/download/bili-danmu-plus1.user.js
// @downloadURL  https://github.com/ZYar-er/bili-danmu-plus1/releases/latest/download/bili-danmu-plus1.user.js
// ==/UserScript==
`;

esbuild.build({
  entryPoints: ['src/index.js'],
  bundle: true,
  outfile: 'bili-danmu-plus1.user.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2015',
  banner: { js: userscriptBanner },
  minify: false,
  define: {
    __VERSION__: JSON.stringify('v' + version),
  },
}).then(function () {
  console.log('Build complete: bili-danmu-plus1.user.js (v' + version + ')');
}).catch(function () { process.exit(1); });
