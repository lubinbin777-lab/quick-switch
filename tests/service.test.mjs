import test from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../extension/service.mjs';

function browserFixture(initialTabs = [], histories = []) {
  const state = { tabs: structuredClone(initialTabs), searches: [], focused: null, created: [], historyCalls: [] };
  const api = {
    tabs: {
      query: async () => structuredClone(state.tabs),
      get: async id => { const tab = state.tabs.find(t => t.id === id); if (!tab) throw new Error('No tab'); return structuredClone(tab); },
      update: async (id, changes) => { const tab = state.tabs.find(t => t.id === id); if (!tab) throw new Error('No tab'); Object.assign(tab, changes); return structuredClone(tab); },
      create: async properties => { const tab = { id: 100 + state.created.length, windowId: 1, ...properties }; state.created.push(tab); state.tabs.push(tab); return tab; },
    },
    windows: { update: async (id, properties) => { if (properties.focused) state.focused = id; } },
    search: { query: async properties => { state.searches.push(properties); } },
    history: { search: async query => { state.historyCalls.push(query); return histories.filter(h => `${h.title} ${h.url}`.toLowerCase().includes(query.text.toLowerCase())).slice(0, query.maxResults); } },
  };
  return { api, state, service: createService(api) };
}
const context = { id: 9, windowId: 1, incognito: false };

test('跨窗口切换相同网址，不新建或刷新目标', async () => {
  const { service, state } = browserFixture([{ id: 1, url: 'https://example.com/a', windowId: 2, incognito: false }]);
  const result = await service.execute({ type: 'url', url: 'https://EXAMPLE.com:443/a' }, context);
  assert.equal(result.action, 'switched');
  assert.equal(state.created.length, 0);
  assert.equal(state.tabs[0].active, true);
  assert.equal(state.tabs[0].url, 'https://example.com/a');
  assert.equal(state.focused, 2);
});
test('历史页未打开时新建，不能误切换同域名其他页面', async () => {
  const { service, state } = browserFixture([{ id: 1, url: 'https://example.com/a', windowId: 1 }]);
  await service.execute({ type: 'history', url: 'https://example.com/b' }, context);
  assert.equal(state.created[0].url, 'https://example.com/b');
  assert.equal(state.tabs[0].url, 'https://example.com/a');
});
test('搜索交给默认引擎，使用原文，不硬编码引擎网址', async () => {
  const { service, state } = browserFixture();
  await service.execute({ type: 'search', text: 'AI 产品经理' }, context);
  assert.deepEqual(state.searches, [{ text: 'AI 产品经理', disposition: 'NEW_TAB' }]);
  assert.equal(state.created.length, 0);
});
test('旧结果中的 tabId 不决定跳转，按当前网址重新查询', async () => {
  const { service, state } = browserFixture([{ id: 1, url: 'https://other.test/', windowId: 1 }, { id: 2, url: 'https://example.com/a', windowId: 2 }]);
  await service.execute({ type: 'tab', tabId: 1, url: 'https://example.com/a' }, context);
  assert.equal(state.tabs[1].active, true);
  assert.equal(state.tabs[0].active, undefined);
  assert.equal(state.created.length, 0);
});
test('普通窗口不复用无痕标签，也不将无痕标签放入候选', async () => {
  const { service, state } = browserFixture([{ id: 1, url: 'https://private.test/', title: 'Private', windowId: 2, incognito: true }]);
  assert.equal((await service.search('', context)).items.length, 0);
  await service.execute({ type: 'url', url: 'https://private.test/' }, context);
  assert.equal(state.created.length, 1);
});
test('无痕上下文拒绝检索，避免读取普通历史', async () => {
  const { service, state } = browserFixture();
  await assert.rejects(service.search('', { ...context, incognito: true }), /无痕/);
  assert.equal(state.historyCalls.length, 0);
});
test('历史 API 不可用时保留标签检索，并返回明确提示', async () => {
  const { service, api } = browserFixture([{ id: 1, url: 'https://example.com/', title: 'Example', windowId: 1 }]);
  api.history.search = async () => { throw new Error('Permission denied'); };
  const result = await service.search('example', context);
  assert.ok(result.items.some(i => i.type === 'tab'));
  assert.match(result.warning, /历史/);
});
test('网址再次验证发生变化时，不激活错误页面', async () => {
  const { service, api, state } = browserFixture([{ id: 1, url: 'https://example.com/', windowId: 1 }]);
  api.tabs.get = async id => { state.tabs[0].url = 'https://changed.test/'; return state.tabs[0]; };
  await service.execute({ type: 'url', url: 'https://example.com/' }, context);
  assert.equal(state.tabs[0].active, undefined);
  assert.equal(state.created[0].url, 'https://example.com/');
});
test('危险或伪造导航和过长搜索不能调用 Chrome 导航接口', async () => {
  const { service, state } = browserFixture();
  for (const url of ['javascript:alert(1)', 'https://u:p@example.com/']) {
    await assert.rejects(service.execute({ type: 'url', url }, context));
  }
  await assert.rejects(service.execute({ type: 'search', text: 'a'.repeat(5000) }, context));
  assert.equal(state.created.length, 0);
  assert.equal(state.searches.length, 0);
});
test('API 搜索错误向上返回，不能伪装成功', async () => {
  const { service, api } = browserFixture();
  api.search.query = async () => { throw new Error('Search unavailable'); };
  await assert.rejects(service.execute({ type: 'search', text: 'test' }, context), /Search unavailable/);
});
test('不能把带凭据的无协议 URL 当作搜索提交', async () => {
  const { service, state } = browserFixture();
  await assert.rejects(service.execute({ type: 'search', text: 'user:secret@example.com/private' }, context));
  assert.equal(state.searches.length, 0);
});
