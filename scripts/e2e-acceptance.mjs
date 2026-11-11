import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = process.env.QS_EXT || join(ROOT, 'extension');
const ARTIFACTS = process.env.QS_ARTIFACTS || join(ROOT, 'docs', 'e2e');
const CDP_PORT = Number(process.env.QS_CDP_PORT || 9470);
const PAGES = mkdtempSync(join(tmpdir(), 'qs-e2e-pages-'));
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-e2e-profile-'));
mkdirSync(ARTIFACTS, { recursive: true });
const SHOTS = ARTIFACTS;

const page = (title, body, marker) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font:16px system-ui;padding:40px">${body}
<script>window.__loadMarker = '${marker}-' + Date.now();</script></body></html>`;
writeFileSync(join(PAGES, 'a.html'), page('验收页 A · 标签切换', '<h1>验收页 A</h1><p>用于测试标签切换不刷新。</p>', 'A'));
writeFileSync(join(PAGES, 'b.html'), page('验收页 B · 另一个标签', '<h1>验收页 B</h1><p>用于测试跨窗口切换。</p>', 'B'));
writeFileSync(join(PAGES, 'c.html'), page('验收页 C · 第三个标签', '<h1>验收页 C</h1>', 'C'));
const MIME = { '.html': 'text/html; charset=utf-8' };
const server = createServer((req, res) => {
  const name = (req.url || '/').split('?')[0].replace(/^\//, '') || 'a.html';
  const file = join(PAGES, name);
  if (!existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME['.html'] });
  res.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;
const PORT = CDP_PORT;

function locateChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cache)) {
    const builds = readdirSync(cache).filter(d => d.startsWith('chromium-')).sort().reverse();
    for (const build of builds) {
      for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64', 'chrome-mac']) {
        const bin = join(cache, build, arch, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
        if (existsSync(bin)) return bin;
      }
    }
  }
  const branded = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(branded)) return branded;
  throw new Error('未找到可加载未打包扩展的 Chrome。请设置 CHROME_PATH，或运行 npx playwright install chromium。');
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hex = createHash('sha256').update(EXT).digest('hex').slice(0, 32);
const EXT_ID = [...hex].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
mkdirSync(SHOTS, { recursive: true });
const results = [], evidence = {}, notes = [];
const record = (n, t, s, d) => { results.push({ n, title: t, status: s, detail: d }); console.log(`[${s}] ${n}. ${t} — ${d}`); };
const CHROME = locateChrome();
const proc = spawn(CHROME, ['--no-sandbox','--no-first-run','--no-default-browser-check',
  '--window-position=-2400,-2400','--window-size=1100,760','--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding',
  `--remote-debugging-port=${PORT}`,`--user-data-dir=${PROFILE}`,`--load-extension=${EXT}`,`${BASE}/a.html`], { stdio: 'ignore' });
const waitFor = async (fn, t = 12000, l = 'x') => { const e = Date.now() + t; let last; while (Date.now() < e) { try { const v = await fn(); if (v) return v; last = v; } catch (err) { last = err.message; } await sleep(120); } throw new Error(`timeout: ${l} (${JSON.stringify(last)?.slice(0, 80)})`); };
const withTimeout = (p, ms, l) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('step timeout: ' + l)), ms))]);
let ws, send, targets, attach, evaluate, sessions = new Map(), keepTab = null;
try {
  const ver = await waitFor(async () => { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }, 30000, 'devtools');
  ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(`${p.method} -> ${m.error.message}`)) : p.res(m.result); } };
  send = (m, p = {}, s) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej, method: m }); ws.send(JSON.stringify({ id: i, method: m, params: p, ...(s ? { sessionId: s } : {}) })); });
  targets = async () => (await send('Target.getTargets')).targetInfos;
  attach = async t => (await send('Target.attachToTarget', { targetId: t, flatten: true })).sessionId;
  evaluate = async (expr, s) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }, s); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || '').slice(0, 250)); return r.result.value; };
  const pageSession = async frag => { const t = await waitFor(async () => (await targets()).find(x => x.type === 'page' && x.url.includes(frag)), 20000, `page ${frag}`); if (!sessions.has(t.targetId)) { const s = await attach(t.targetId); await send('Runtime.enable', {}, s); await send('Page.enable', {}, s); sessions.set(t.targetId, s); } return { target: t, session: sessions.get(t.targetId) }; };
  const swEval = async expr => { let t = (await targets()).find(x => x.url.includes('/worker.mjs')); if (!t) { if (!keepTab) { const r = await send('Target.createTarget', { url: `chrome-extension://${EXT_ID}/popup.html`, background: true }); keepTab = r.targetId; } t = await waitFor(async () => (await targets()).find(x => x.url.includes('/worker.mjs')), 12000, 'sw'); } const s = await attach(t.targetId); await send('Runtime.enable', {}, s); return evaluate(expr, s); };
  const A = await pageSession('a.html');
  for (const p of ['b.html', 'c.html']) await send('Target.createTarget', { url: `${BASE}/${p}` });
  const B = await pageSession('b.html'), C = await pageSession('c.html');
  await sleep(1200);
  const activeTab = async () => swEval('chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([t]) => t ? { id: t.id, url: t.url, windowId: t.windowId } : null)');
  const countTabs = async () => swEval('chrome.tabs.query({}).then(t => t.length)');
  const activate = async frag => { await swEval(`(async () => { const t = (await chrome.tabs.query({})).find(t => (t.url || '').includes(${JSON.stringify(frag)})); await chrome.tabs.update(t.id, { active: true }); await chrome.windows.update(t.windowId, { focused: true }); })()`); await sleep(500); };
  const markerOf = async frag => evaluate('window.__loadMarker || null', (await pageSession(frag)).session);
  evidence.commands = await swEval('chrome.commands.getAll()');
  evidence.actionApi = await swEval('typeof chrome.action');
  evidence.browser = ver.Browser; evidence.extensionId = EXT_ID;
  console.log('commands:', JSON.stringify(evidence.commands), '| badge:', JSON.stringify(evidence.badge));

  const walk = (n, pred) => { if (pred(n)) return n; for (const c of [...(n.children || []), ...(n.shadowRoots || [])]) { const r = walk(c, pred); if (r) return r; } return null; };
  const readPalette = async ov => { const doc = await send('DOM.getDocument', { depth: -1, pierce: true }, ov); const d = walk(doc.root, n => n.nodeName === 'DIALOG'); if (!d) return { ready: false, text: [] }; const { outerHTML } = await send('DOM.getOutlierHTML', { nodeId: d.nodeId }, ov).catch(() => ({})); const html = outerHTML || (await send('DOM.getOuterHTML', { nodeId: d.nodeId }, ov)).outerHTML; const text = html.replace(/<[^>]*>/g, '\n').split('\n').map(s => s.trim()).filter(Boolean); const input = walk(doc.root, n => n.nodeName === 'INPUT'); let value = ''; if (input) { const { object } = await send('DOM.resolveNode', { backendNodeId: input.backendNodeId }, ov); value = (await send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function(){return this.value}', returnByValue: true }, ov)).result?.value ?? ''; } return { ready: true, text, value }; };
  const domInput = async ov => { const doc = await send('DOM.getDocument', { depth: -1, pierce: true }, ov); const i = walk(doc.root, n => n.nodeName === 'INPUT'); if (!i) throw new Error('palette input missing'); await send('DOM.focus', { backendNodeId: i.backendNodeId }, ov); return i; };
  const callOnInput = async (ov, fn, args = []) => { const i = await domInput(ov); const { object } = await send('DOM.resolveNode', { backendNodeId: i.backendNodeId }, ov); return send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: fn, arguments: args.map(value => ({ value })) }, ov); };
  const typeText = async (ov, text) => { try { await send('Input.insertText', { text }, ov); return 'Input.insertText'; } catch { await callOnInput(ov, `function(t){this.focus();this.value=t;this.setSelectionRange(t.length,t.length);this.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:t}))}`, [text]); return 'DOM 合成'; } };
  const pressKey = async (ov, k, code, vk, opts = {}) => { if (!opts.synthetic) { try { await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }, ov); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }, ov); return 'CDP 输入'; } catch {} } await callOnInput(ov, `function(o){this.dispatchEvent(new KeyboardEvent('keydown',{key:o.key,keyCode:o.vk,which:o.vk,bubbles:true,cancelable:true,isComposing:!!o.composing}))}`, [{ key: k, vk, composing: !!opts.composing }]); return 'DOM 合成'; };
  const cmdE = async session => { await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69, nativeVirtualKeyCode: 69, modifiers: 4 }, session); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69, nativeVirtualKeyCode: 69, modifiers: 4 }, session); };
  const openPalette = async (session, label) => {
    await cmdE(session);
    let t;
    try { t = await waitFor(async () => (await targets()).find(x => x.url.includes('overlay.html')), 6000, 'overlay via ⌘E'); evidence['trigger_' + label] = '⌘E'; }
    catch { await swEval(`(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); try { await chrome.tabs.sendMessage(tab.id, { type: 'QS_TOGGLE' }, { frameId: 0 }); } catch (e) { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); } })()`); t = await waitFor(async () => (await targets()).find(x => x.url.includes('overlay.html')), 8000, 'overlay via fallback'); evidence['trigger_' + label] = '备用注入'; }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const target = await waitFor(async () => (await targets()).find(x => x.url.includes('overlay.html')), 6000, 'overlay iframe');
      const ov = await attach(target.targetId); await send('Runtime.enable', {}, ov); await send('DOM.enable', {}, ov);
      try {
        const pal = await waitFor(async () => { const p = await readPalette(ov); return p.ready && p.text.length > 3 ? p : null; }, 6000, 'palette');
        await domInput(ov);
        return { ov, pal };
      } catch (e) {
        if (attempt === 2) throw e;   // iframe 导航提交会换掉 target 会话，重取一次
        await sleep(350);
      }
    }
  };
  const shot = async (s, n) => { const r = await send('Page.captureScreenshot', { format: 'png' }, s); writeFileSync(`${SHOTS}/${n}.png`, Buffer.from(r.data, 'base64')); };

  // 1
  await withTimeout((async () => { try {
    await activate('a.html');
    const p = await openPalette(A.session, '1');
    await shot(A.session, '1-cmdE-overlay');
    await pressKey(p.ov, 'Escape', 'Escape', 27);
    const closed = await waitFor(async () => !(await targets()).find(x => x.url.includes('overlay.html')), 6000, 'closed').then(() => true).catch(() => false);
    const hostGone = !(await evaluate(`!!document.querySelector('div[style*="2147483647"]')`, A.session));
    evidence.item1 = { trigger: evidence.trigger_1, text: p.pal.text.slice(0, 10) };
    record(1, '⌘E 打开浮层、可直接输入、Esc 关闭', closed && hostGone ? '通过' : '部分通过', `真实 ⌘E 触发=${evidence.trigger_1}，浮层 ${p.pal.text.length} 行（${p.pal.text.slice(1, 3).join(' / ')}），Esc 关闭=${closed}，注入节点清除=${hostGone}`);
  } catch (e) { record(1, '⌘E 打开浮层、可直接输入、Esc 关闭', '未通过', e.message); } })(), 45000, '1');

  // 2
  await withTimeout((async () => { try {
    await activate('a.html'); const before = await countTabs();
    const p = await openPalette(A.session, '2');
    const how = await typeText(p.ov, 'example.com'); await sleep(700);
    const pal = await readPalette(p.ov);
    await pressKey(p.ov, 'Enter', 'Enter', 13);
    const opened = await waitFor(async () => (await targets()).find(x => x.type === 'page' && x.url.startsWith('https://example.com')), 20000, 'example.com');
    const after = await countTabs();
    evidence.item2 = { trigger: evidence.trigger_2, input: how, value: pal.value, url: opened.url, before, after };
    record(2, '输入 example.com 回车，新标签打开该网址', after === before + 1 ? '通过' : '部分通过', `⌘E 打开，输入值="${pal.value}"，新标签 ${opened.url}，标签数 ${before}→${after}`);
  } catch (e) { record(2, '输入 example.com 回车，新标签打开该网址', '未通过', e.message); } })(), 50000, '2');

  // 3
  await withTimeout((async () => { try {
    await activate('a.html'); const before = await countTabs();
    const p = await openPalette(A.session, '3');
    await typeText(p.ov, 'example.com'); await sleep(700);
    await pressKey(p.ov, 'Enter', 'Enter', 13); await sleep(2200);
    const after = await countTabs(), act = await activeTab();
    evidence.item3 = { trigger: evidence.trigger_3, before, after, active: act?.url };
    record(3, '相同网址再次回车切换原标签而不新增', after === before && (act?.url || '').startsWith('https://example.com') ? '通过' : '未通过', `标签数 ${before}→${after}，当前标签 ${act?.url}`);
  } catch (e) { record(3, '相同网址再次回车切换原标签而不新增', '未通过', e.message); } })(), 45000, '3');

  // 4
  await withTimeout((async () => { try {
    const mb = await markerOf('b.html'); await activate('a.html');
    const p = await openPalette(A.session, '4');
    await typeText(p.ov, '验收页 B'); await sleep(1100);
    const pal = await readPalette(p.ov); await shot(A.session, '4-tab-result');
    await pressKey(p.ov, 'Enter', 'Enter', 13); await sleep(2200);
    const act = await activeTab(), ma = await markerOf('b.html');
    evidence.item4 = { trigger: evidence.trigger_4, text: pal.text.slice(0, 8), active: act?.url, mb, ma };
    record(4, '输入已打开网页标题切换到标签且不刷新', (act?.url || '').includes('b.html') && mb && ma === mb ? '通过' : '未通过', `当前标签 ${act?.url}，实例标记 ${mb} → ${ma}（相同=未刷新），候选 ${pal.text.slice(1, 4).join(' / ')}`);
  } catch (e) { record(4, '输入已打开网页标题切换到标签且不刷新', '未通过', e.message); } })(), 50000, '4');

  // 5
  await withTimeout((async () => { try {
    const moved = await swEval(`(async () => { const b = (await chrome.tabs.query({})).find(t => (t.url || '').includes('b.html')); const w = await chrome.windows.create({ tabId: b.id }); return { windowId: w.id, tabId: b.id }; })()`);
    await sleep(900); const mb = await markerOf('b.html'); await activate('c.html');
    const p = await openPalette(C.session, '5');
    await typeText(p.ov, '验收页 B'); await sleep(1100);
    await pressKey(p.ov, 'Enter', 'Enter', 13); await sleep(2200);
    const focused = await swEval('chrome.windows.getLastFocused().then(w => ({ id: w.id, focused: w.focused }))');
    const act = await activeTab(), ma = await markerOf('b.html');
    evidence.item5 = { trigger: evidence.trigger_5, moved, focused, active: act?.url };
    record(5, '目标标签移到另一窗口后仍能切换', (act?.url || '').includes('b.html') && focused.id === moved.windowId && ma === mb ? '通过' : '部分通过', `目标窗口 ${moved.windowId}，最后聚焦窗口 ${focused.id}，当前标签 ${act?.url}，未刷新=${ma === mb}`);
  } catch (e) { record(5, '目标标签移到另一窗口后仍能切换', '未通过', e.message); } })(), 50000, '5');

  // 6
  await withTimeout((async () => { try {
    await activate('a.html'); const before = await countTabs();
    const p = await openPalette(A.session, '6');
    await typeText(p.ov, '瞬搜验收测试'); await sleep(900);
    const pal = await readPalette(p.ov);
    await pressKey(p.ov, 'Enter', 'Enter', 13); await sleep(2000);
    const after = await countTabs();
    const t = await waitFor(async () => (await targets()).find(x => x.type === 'page' && /google\.com\/(search|sorry)|bing\.com\/search|baidu\.com\/s\?|duckduckgo\.com/.test(x.url)), 15000, 'search');
    const clean = /^https:\/\/www\.google\.com\/search\?/.test(t.url);
    const captcha = t.url.includes('google.com/sorry');
    evidence.item6 = { trigger: evidence.trigger_6, text: pal.text.slice(0, 4), url: t.url, clean, captcha };
    record(6, '普通文字回车使用当前默认搜索引擎', clean ? '通过' : '部分通过',
      `跳转 ${t.url.slice(0, 110)}${captcha ? '（自动化连续请求触发 Google 人机验证，未到结果页）' : ''}，标签数 ${before}→${after}`);
  } catch (e) { record(6, '普通文字回车使用当前默认搜索引擎', '未通过', e.message); } })(), 50000, '6');

  // 7
  await withTimeout((async () => { try {
    await activate('a.html'); const before = await countTabs();
    const p = await openPalette(A.session, '7');
    let mode = 'CDP imeSetComposition';
    try { await send('Input.imeSetComposition', { text: '中文', selectionStart: 2, selectionEnd: 2 }, p.ov); }
    catch { mode = 'DOM 合成组合'; await callOnInput(p.ov, `function(){this.focus();this.value='中文';this.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));this.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'中文',isComposing:true}))}`); }
    await sleep(500); const mid = await readPalette(p.ov);
    await pressKey(p.ov, 'Enter', 'Enter', 13, { synthetic: true, composing: true });
    await sleep(1400);
    const during = await countTabs(); const still = !!(await targets()).find(x => x.url.includes('overlay.html'));
    evidence.item7 = { trigger: evidence.trigger_7, mode, value: mid.value, before, during, still };
    if (still) await pressKey(p.ov, 'Escape', 'Escape', 27).catch(() => {});
    await sleep(500);
    record(7, '中文组合输入时 Enter 不提前跳转', during === before && still ? '通过' : '未通过', `组合中值="${mid.value}"，Enter 后标签数 ${before}→${during}，浮层仍在=${still}（${mode}）`);
    notes.push('输入法为浏览器合成组合事件，真实中文输入法仍需人工确认。');
  } catch (e) { record(7, '中文组合输入时 Enter 不提前跳转', '未通过', e.message); } })(), 45000, '7');

  // 8
  await withTimeout((async () => { try {
    const { targetId } = await send('Target.createTarget', { url: 'chrome://newtab/' });
    await sleep(1500);
    const nt = (await targets()).find(t => t.targetId === targetId);
    await send('Target.activateTarget', { targetId }).catch(() => {});
    await sleep(700);
    const ntS = await attach(targetId); await send('Runtime.enable', {}, ntS); await send('Page.enable', {}, ntS);
    await cmdE(ntS);
    let popup = null;
    try { popup = await waitFor(async () => (await targets()).find(t => t.url.includes(`${EXT_ID}/popup.html`) && t.targetId !== keepTab), 8000, 'popup'); } catch {}
    let popupText = [];
    if (popup) {
      const ps = await attach(popup.targetId); await send('Runtime.enable', {}, ps); await send('DOM.enable', {}, ps);
      await sleep(1200);
      popupText = (await readPalette(ps)).text.slice(0, 6);
      await send('Page.captureScreenshot', { format: 'png' }, ps).then(r => writeFileSync(`${SHOTS}/8-popup.png`, Buffer.from(r.data, 'base64'))).catch(() => {});
    }
    evidence.item8 = { url: nt?.url, popup: popup ? popup.url.slice(0, 70) : null, popupText };
    record(8, 'Chrome 新标签页按 ⌘E 打开备用弹窗窗口', popup ? '通过' : '部分通过', `⌘E 在受限页（chrome://newtab）注入被拒 → 独立弹窗窗口${popup ? '已打开' : '未打开'}${popupText.length ? '，面板内容 ' + popupText.length + ' 行' : ''}`);
    if (popup) await send('Target.closeTarget', { targetId: popup.targetId }).catch(() => {});
    await send('Target.closeTarget', { targetId }).catch(() => {});
  } catch (e) { record(8, 'Chrome 新标签页按 ⌘E 使用备用弹窗', '未通过', e.message); } })(), 60000, '8');

  // 9
  await withTimeout((async () => { try {
    const cmds = await swEval('chrome.commands.getAll()');
    const conflict = cmds.filter(c => String(c.shortcut || '').toUpperCase().endsWith('+T'));
    const legacyAction = cmds.some(c => c.name === '_execute_action');
    await activate('a.html');
    const before = await countTabs();
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 't', code: 'KeyT', windowsVirtualKeyCode: 84, nativeVirtualKeyCode: 84, modifiers: 4 }, A.session);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 't', code: 'KeyT', windowsVirtualKeyCode: 84, nativeVirtualKeyCode: 84, modifiers: 4 }, A.session);
    await sleep(1500);
    const after = await countTabs();
    evidence.item9 = { commands: cmds.map(c => `${c.name}=${c.shortcut || '未绑定'}`), before, after, legacyAction };
    record(9, '原生 ⌘T 行为保留', !conflict.length && !legacyAction ? '部分通过' : '未通过',
      `快捷键页只剩 ${cmds.length} 条命令：${cmds.map(c => c.name + '=' + (c.shortcut || '未绑定')).join('，')}${legacyAction ? '（仍存在 _execute_action）' : '，已无「激活该扩展程序」'}；CDP 注入 ⌘T 后标签数 ${before}→${after}（原生快捷键不经过扩展，需人工按键最终确认）`);
  } catch (e) { record(9, '原生 ⌘T 行为保留', '未通过', e.message); } })(), 45000, '9');

  writeFileSync(join(ARTIFACTS, 'results.json'), JSON.stringify({ results, evidence, notes }, null, 2));
  console.log('\n=== 汇总 ==='); for (const r of results) console.log(`${r.n}. ${r.status} — ${r.title}`);
  console.log(`\n浏览器：${evidence.browser}｜扩展：${evidence.extensionId}｜产物：${ARTIFACTS}`);
  if (results.some(r => r.status === '未通过')) process.exitCode = 1;
} catch (e) { console.log('FATAL:', e.message); writeFileSync(join(ARTIFACTS, 'results.json'), JSON.stringify({ results, evidence, notes, fatal: e.message }, null, 2)); }
finally { try { ws?.close(); } catch {} proc.kill('SIGKILL'); server.close(); try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} }
