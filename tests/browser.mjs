import { buildResults } from '../extension/core.mjs';
const tests = [];
const test = (name, run) => tests.push({ name, run });
const assert = (value, message = '断言失败') => { if (!value) throw new Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  const end = Date.now() + 1800;
  while (!check()) { if (Date.now() > end) throw new Error('等待界面状态超时'); await delay(10); }
}
const tabs = [{ id: 1, windowId: 1, title: 'ChatGPT', url: 'https://chatgpt.com/', lastAccessed: Date.now() }];
const history = [{ title: 'Example Domain', url: 'https://example.com/', lastVisitTime: Date.now() - 5000, visitCount: 3 }];
const basicSearch = query => buildResults(query, tabs, history, { currentTabId: 99, currentWindowId: 1 });
let active = null;
function fixture(overrides = {}) {
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  const executions = [];
  const view = QuickSwitchPalette.mount(root, {
    search: async query => basicSearch(query),
    execute: async item => { executions.push(item); },
    onClose: () => host.remove(), ...overrides,
  });
  const f = { root, view, host, executions, input: root.querySelector('input'), panel: root.querySelector('dialog') };
  active = f; return f;
}
function fill(f, value, inputType = 'insertText') {
  f.input.value = value; f.input.setSelectionRange(value.length, value.length);
  f.input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType }));
}
function key(f, key, extra = {}) { f.input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })); }
async function ready(f) { await until(() => f.panel.getAttribute('aria-busy') === 'false'); }

test('打开后自动聚焦，空输入默认选中首项', async () => {
  const f = fixture(); await ready(f);
  assert(f.root.activeElement === f.input, '输入框未获得焦点');
  assert(f.root.querySelector('[aria-selected=true]').textContent.includes('ChatGPT'));
});
test('上下选择后 Enter 执行对应项，并关闭面板', async () => {
  const f = fixture(); await ready(f); key(f, 'ArrowDown'); key(f, 'Enter');
  await until(() => f.executions.length === 1);
  assert(f.executions[0].url === 'https://example.com/');
  assert(!f.host.isConnected);
});
test('输入后立即 Enter 等待新结果，不打开旧标签', async () => {
  const f = fixture(); await ready(f); fill(f, '新搜索词'); key(f, 'Enter');
  await until(() => f.executions.length === 1);
  assert(f.executions[0].type === 'search' && f.executions[0].text === '新搜索词');
});
test('中文输入法确认候选时 Enter 不触发导航', async () => {
  const f = fixture(); await ready(f);
  f.input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  f.input.value = '中文'; key(f, 'Enter', { isComposing: true, keyCode: 229 });
  await delay(20); assert(f.executions.length === 0);
  f.input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文' }));
  await ready(f); key(f, 'Enter'); await until(() => f.executions.length === 1);
  assert(f.executions[0].text === '中文');
});
test('慢旧请求不得覆盖新查询结果', async () => {
  const resolvers = new Map();
  const f = fixture({ search: query => query ? new Promise(resolve => resolvers.set(query, resolve)) : Promise.resolve(basicSearch('')) });
  await ready(f); fill(f, 'old'); await until(() => resolvers.has('old'));
  fill(f, 'new'); await until(() => resolvers.has('new'));
  resolvers.get('new')(basicSearch('new')); await ready(f);
  resolvers.get('old')(basicSearch('old')); await delay(20);
  assert(f.root.querySelector('[role=option]').textContent.includes('new'));
  assert(!f.root.querySelector('[role=option]').textContent.includes('old'));
});
test('补全选中新增后缀，删除时不立即重新补全', async () => {
  const f = fixture(); fill(f, 'exa'); await ready(f);
  assert(f.input.value === 'example.com');
  assert(f.input.selectionStart === 3 && f.input.selectionEnd === 11);
  fill(f, 'exa', 'deleteContentBackward'); await ready(f);
  assert(f.input.value === 'exa');
});
test('带前导空格的输入不被错误补全和移动选区', async () => {
  const f = fixture(); fill(f, ' exa'); await ready(f);
  assert(f.input.value === ' exa', '带空格输入被错误改写');
});
test('执行期间重复 Enter 只提交一次', async () => {
  let calls = 0, finish;
  const f = fixture({ execute: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  await ready(f); key(f, 'Enter'); await until(() => calls === 1);
  key(f, 'Enter'); key(f, 'Enter'); assert(calls === 1); finish();
});
test('打开失败保留输入，允许再次回车重试', async () => {
  let calls = 0;
  const f = fixture({ execute: async () => { if (++calls === 1) throw new Error('测试打开失败'); } });
  fill(f, 'test'); await ready(f); key(f, 'Enter');
  await until(() => f.root.querySelector('.qs-status').textContent.includes('测试打开失败'));
  assert(f.input.value === 'test' && !f.input.readOnly);
  key(f, 'Enter'); await until(() => calls === 2);
});
test('Escape 关闭并恢复先前输入框焦点', async () => {
  const previous = document.createElement('input'); document.body.append(previous); previous.focus();
  const f = fixture(); key(f, 'Escape');
  assert(!f.host.isConnected && document.activeElement === previous); previous.remove();
});
test('点击遮罩关闭，页面标题以文本显示', async () => {
  const title = '<img src=x onerror=alert(1)>';
  const f = fixture({ search: async () => ({ items: [{ type: 'history', url: 'https://example.com/', title }] }) });
  await ready(f);
  assert(f.root.querySelector('.qs-title').textContent === title);
  assert(!f.root.querySelector('.qs-title img'));
  f.panel.dispatchEvent(new MouseEvent('click', { clientX: -1, clientY: -1, bubbles: true }));
  assert(!f.host.isConnected);
});

let passed = 0;
for (const { name, run } of tests) {
  const row = document.createElement('li');
  try { await run(); passed++; row.textContent = `通过 · ${name}`; row.className = 'pass'; }
  catch (error) { row.textContent = `失败 · ${name}\n${error.message}`; row.className = 'fail'; }
  finally { active?.view.close(); active = null; }
  document.getElementById('results').append(row);
}
const summary = document.getElementById('summary');
summary.textContent = `完成：${passed} / ${tests.length} 通过，${tests.length - passed} 项失败。`;
summary.className = passed === tests.length ? 'pass' : 'fail';
