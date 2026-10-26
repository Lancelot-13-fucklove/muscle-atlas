#!/usr/bin/env node
/*
 * verify_run.js — 用 CDP（Chrome DevTools Protocol）驱动无头 Edge，
 * 做「真实交互自测」与「页面截图」，替代不可靠的 --virtual-time-budget 截图。
 *
 * 为什么需要它：SwiftShader 软渲染下 rAF 帧很慢，--virtual-time-budget 的
 * 虚拟时钟推进速度与真实帧率耦合，测试容易在截图前被截断；CDP 用真实时间
 * 轮询页面状态，测试跑完后立刻截图，稳定可复现。
 *
 * 用法：
 *   node tools/verify_run.js --url <file:///...> --shot <out.png> --size 1440x960 \
 *        [--wait "<js 表达式，为真时结束等待>"] [--timeout 120000] [--settle 1200] \
 *        [--report "<js 表达式，结果 JSON>"] [--console-filter SELFTEST|]
 *
 * 退出码：0 = 等待表达式在超时前为真且截图成功；1 = 失败。
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function parseArgs(argv) {
  const out = { timeout: 120000, settle: 1200, size: '1440x960', consoleFilter: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--url') out.url = next();
    else if (a === '--shot') out.shot = next();
    else if (a === '--wait') out.wait = next();
    else if (a === '--timeout') out.timeout = Number(next());
    else if (a === '--settle') out.settle = Number(next());
    else if (a === '--size') out.size = next();
    else if (a === '--report') out.report = next();
    else if (a === '--console-filter') out.consoleFilter = next();
    else if (a === '--verbose') out.verbose = true;
    else throw new Error('unknown arg: ' + a);
  }
  if (!out.url) throw new Error('--url is required');
  return out;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.consoleLines = [];
    this.exceptions = [];
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id != null) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else p.resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const parts = (msg.params.args || []).map((arg) => {
          if (arg.value != null) return String(arg.value);
          if (arg.description != null) return String(arg.description);
          return arg.type || '';
        });
        this.consoleLines.push(parts.join(' '));
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails || {};
        this.exceptions.push((d.exception && (d.exception.description || d.exception.value)) || d.text || 'exception');
      }
    });
  }
  send(method, params) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP timeout: ' + method));
        }
      }, 30000);
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('page eval threw: ' + ((d.exception && d.exception.description) || d.text));
    }
    return r.result ? r.result.value : undefined;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const [w, h] = opts.size.split('x').map(Number);
  const port = 9400 + Math.floor(Math.random() * 400);
  const profile = path.join(os.tmpdir(), 'edge_cdp_' + Date.now() + '_' + Math.floor(Math.random() * 1e4));
  const args = [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--allow-file-access-from-files', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-sync',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    'about:blank'
  ];
  const child = spawn(EDGE, args, { stdio: 'ignore', windowsHide: true });
  let ws = null;
  let exitCode = 1;
  try {
    // 1. 等 DevTools 端点就绪
    const version = await waitFor(async () => {
      try {
        const v = await fetchJson('http://127.0.0.1:' + port + '/json/version');
        return v && v.webSocketDebuggerUrl ? v : null;
      } catch (e) { return null; }
    }, 30000, 200);
    if (!version) throw new Error('Edge DevTools endpoint not ready');

    const targets = await fetchJson('http://127.0.0.1:' + port + '/json/list');
    const page = (targets || []).find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');

    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', (e) => reject(new Error('ws error')), { once: true });
    });
    const cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: 1, mobile: false
    });

    // 2. 导航
    await cdp.send('Page.navigate', { url: opts.url });

    // 3. 等页面就绪（默认等 loading 收起 + engine 就绪）
    const waitExpr = opts.wait ||
      "(!!(window.muscleAtlas && window.muscleAtlas.engine)) && (function(){var l=document.getElementById('loading');return !l || l.classList.contains('is-hidden') || l.hidden;})()";
    const ok = await waitFor(async () => {
      try { return (await cdp.evaluate('!!(' + waitExpr + ')')) === true; } catch (e) { return false; }
    }, opts.timeout, 250);
    if (!ok) throw new Error('wait expression timed out: ' + waitExpr);

    if (opts.report) {
      const data = await cdp.evaluate(opts.report);
      console.log('REPORT ' + JSON.stringify(data));
    }
    if (opts.settle > 0) await sleep(opts.settle);

    // 4. 截图
    if (opts.shot) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.mkdirSync(path.dirname(path.resolve(opts.shot)), { recursive: true });
      fs.writeFileSync(opts.shot, Buffer.from(shot.data, 'base64'));
      console.log('SHOT ' + opts.shot + ' bytes=' + fs.statSync(opts.shot).size);
    }

    // 5. 打印页面 console（默认只打 SELFTEST 行；--verbose 打全部）
    const filter = opts.consoleFilter;
    const lines = cdp.consoleLines.filter((l) => (filter ? l.indexOf(filter) >= 0 : true));
    if (opts.consoleFilter) lines.forEach((l) => console.log('CONSOLE ' + l));
    else if (opts.verbose) lines.forEach((l) => console.log('CONSOLE ' + l));
    if (cdp.exceptions.length) {
      cdp.exceptions.slice(0, 5).forEach((e) => console.log('PAGE_ERROR ' + String(e).split('\n')[0]));
      throw new Error('page exceptions: ' + cdp.exceptions.length);
    }
    exitCode = 0;
  } catch (err) {
    console.log('VERIFY_FAIL ' + (err && err.message ? err.message : String(err)));
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
    try { child.kill(); } catch (e) { /* ignore */ }
    await sleep(600);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
  process.exit(exitCode);
}

async function waitFor(fn, timeoutMs, intervalMs) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(intervalMs);
  }
}

main().catch((err) => {
  console.log('VERIFY_FAIL ' + (err && err.message ? err.message : String(err)));
  process.exit(1);
});
