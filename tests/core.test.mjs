import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyInput, normalizeUrl, buildResults, findMatchingTab } from '../extension/core.mjs';

const now = 1800000000000;
const tab = (id, url, title, extra = {}) => ({ id, url, title, windowId: 1, lastAccessed: now - id * 1000, ...extra });
const history = (url, title, extra = {}) => ({ url, title, lastVisitTime: now - 60000, visitCount: 4, ...extra });
const options = { now, currentTabId: 99, currentWindowId: 1 };

test('普通中文和带空格文字作为搜索，空输入无动作', () => {
  assert.deepEqual(classifyInput(' AI 产品经理 '), { type: 'search', text: 'AI 产品经理' });
  assert.equal(classifyInput('   ').type, 'empty');
  assert.equal(classifyInput('hello@example.com').type, 'search');
});
test('域名、国际化域名与路径补 HTTPS', () => {
  assert.equal(classifyInput('example.com/docs?q=one#two').url, 'https://example.com/docs?q=one#two');
  assert.equal(classifyInput('例子.中国').type, 'url');
  assert.equal(classifyInput('www.example.com').url, 'https://www.example.com/');
});
test('保留显式协议；localhost 与回环地址支持端口', () => {
  assert.equal(classifyInput('http://example.com:8080/a').url, 'http://example.com:8080/a');
  assert.equal(classifyInput('localhost:3000/app').url, 'http://localhost:3000/app');
  assert.equal(classifyInput('127.0.0.1:5173').url, 'http://127.0.0.1:5173/');
  assert.equal(classifyInput('[::1]:3000').url, 'http://[::1]:3000/');
});
test('危险协议、账号密码 URL 被拒绝，不能当搜索发送', () => {
  for (const input of ['javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', 'chrome://settings', 'https://user:secret@example.com/']) {
    assert.equal(classifyInput(input).type, 'blocked', input);
  }
  assert.equal(classifyInput('https://').type, 'blocked');
});
test('省略协议的凭据网址也拒绝，普通邮箱仍可搜索', () => {
  for (const input of ['user:secret@example.com/private', '//user:secret@example.com/private', 'user@example.com/private']) {
    assert.equal(classifyInput(input).type, 'blocked', input);
  }
  assert.equal(classifyInput('hello@example.com').type, 'search');
  assert.equal(classifyInput('example.com/a@b').type, 'url');
});
test('URL 规范化处理默认端口与主机大小写，保留路径、参数、hash', () => {
  assert.equal(normalizeUrl('https://EXAMPLE.com:443'), 'https://example.com/');
  assert.notEqual(normalizeUrl('https://example.com/a'), normalizeUrl('https://example.com/b'));
  assert.notEqual(normalizeUrl('https://example.com/a?q=1'), normalizeUrl('https://example.com/a?q=2'));
  assert.notEqual(normalizeUrl('https://example.com/#a'), normalizeUrl('https://example.com/#b'));
  assert.notEqual(normalizeUrl('http://example.com/'), normalizeUrl('https://example.com/'));
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
});
test('匹配原标签优先当前窗口，同域名不同路径不算相同页面', () => {
  const tabs = [tab(1, 'https://example.com/a', 'A', { windowId: 2 }), tab(2, 'https://example.com/a', 'A'), tab(3, 'https://example.com/b', 'B')];
  assert.equal(findMatchingTab(tabs, 'https://EXAMPLE.com:443/a', 1).id, 2);
  assert.equal(findMatchingTab(tabs, 'https://example.com/c', 1), null);
});
test('空列表按最近访问排序，去重并排除当前标签', () => {
  const tabs = [tab(1, 'https://one.test/', 'One'), tab(99, 'https://current.test/', 'Current')];
  const histories = [history('https://one.test/', 'Old One'), history('https://two.test/', 'Two', { lastVisitTime: now })];
  const { items } = buildResults('', tabs, histories, options);
  assert.deepEqual(items.map(i => i.url), ['https://two.test/', 'https://one.test/']);
  assert.equal(items[1].type, 'tab');
});
test('空输入排除当前 URL 的历史副本', () => {
  const result = buildResults('', [tab(99, 'https://current.test/', 'Current')], [history('https://current.test/', 'Current')], options);
  assert.equal(result.items.length, 0);
});
test('中文标题强匹配位于搜索项之前，历史同 URL 合并为标签项', () => {
  const { items } = buildResults('AI数字', [tab(1, 'https://a.test/post/1', 'AI数字员工实战')], [history('https://a.test/post/1', 'AI数字员工实战')], options);
  assert.equal(items[0].type, 'tab');
  assert.equal(items[1].type, 'search');
  assert.equal(items.filter(i => i.url === 'https://a.test/post/1').length, 1);
});
test('多关键词和大小写匹配，弱匹配不抢默认搜索', () => {
  const { items } = buildResults('agent CLAW', [tab(1, 'https://a.test/post', 'OpenClaw + Agent 实战')], [], options);
  assert.equal(items[0].type, 'search');
  assert.equal(items[1].type, 'tab');
});
test('输入确切网址优先复用标签，并保留搜索原文选项', () => {
  const { items } = buildResults('example.com/a', [tab(1, 'https://example.com/a', 'A')], [], options);
  assert.equal(items[0].type, 'tab');
  assert.equal(items[0].url, 'https://example.com/a');
  assert.equal(items.filter(i => i.url === 'https://example.com/a').length, 1);
  assert.ok(items.some(i => i.type === 'search' && i.text === 'example.com/a'));
});
test('域名前缀可补全已知主页，普通标题不得改写输入', () => {
  const { completion, items } = buildResults('exa', [], [history('https://example.com/', 'Example')], options);
  assert.equal(completion, 'example.com');
  assert.equal(items[0].type, 'history');
  assert.equal(buildResults('AI数字', [tab(1, 'https://a.test/', 'AI数字员工')], [], options).completion, null);
});
test('历史中的非网页协议和带密码 URL 不进入列表', () => {
  const { items } = buildResults('', [], [history('chrome://settings/', 'Settings'), history('https://u:p@example.com/', 'Secret')], options);
  assert.equal(items.length, 0);
});
test('历史查询结果有上限且搜索项不会被大量结果挤掉', () => {
  const tabs = Array.from({ length: 30 }, (_, i) => tab(i, `https://example.com/${i}`, `Example ${i}`));
  const { items } = buildResults('Example', tabs, [], options);
  assert.ok(items.length <= 12);
  assert.ok(items.some(i => i.type === 'search'));
  assert.ok(buildResults('', tabs, [], options).items.length <= 8);
});
test('危险输入没有可执行候选', () => {
  const result = buildResults('javascript:alert(1)', [], [], options);
  assert.equal(result.items.length, 0);
  assert.ok(result.message);
});
