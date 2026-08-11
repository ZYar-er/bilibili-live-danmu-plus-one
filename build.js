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
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByb2xlPSJpbWciIGFyaWEtbGFiZWw9IkLnq5nnm7Tmkq3lvLnluZUgKzEiPgogIDx0ZXh0IHg9IjMyIiB5PSI0NCIgZm9udC1mYW1pbHk9IkFyaWFsLCBIZWx2ZXRpY2EsICdQaW5nRmFuZyBTQycsICdNaWNyb3NvZnQgWWFIZWknLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjMyIiBmb250LXdlaWdodD0iODAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjRkI3Mjk5Ij4rMTwvdGV4dD4KPC9zdmc+Cg==
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
