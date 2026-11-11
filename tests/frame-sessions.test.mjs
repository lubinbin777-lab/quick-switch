import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameSessions } from '../extension/frame-sessions.mjs';
function storage() {
  const data = {};
  return { get: async key => ({ [key]: data[key] }), set: async values => Object.assign(data, values), remove: async key => { delete data[key]; } };
}
test('框架令牌仅对创建它的标签有效', async () => {
  const sessions = createFrameSessions(storage()); const token = await sessions.create(1);
  await sessions.assert(1, token);
  await assert.rejects(sessions.assert(2, token));
  await assert.rejects(sessions.assert(1, 'invalid'));
});
test('service worker 重建后会话仍可验证，不存储查询和历史', async () => {
  const store = storage(); const token = await createFrameSessions(store).create(1);
  await createFrameSessions(store).assert(1, token);
  assert.deepEqual(Object.keys((await store.get('qs-frame:1'))['qs-frame:1']), ['token']);
});
test('关闭旧面板不能撤销新面板的令牌', async () => {
  const sessions = createFrameSessions(storage());
  const old = await sessions.create(1); const current = await sessions.create(1);
  await sessions.revoke(1, old); await sessions.assert(1, current);
  await sessions.revoke(1, current); await assert.rejects(sessions.assert(1, current));
});
test('撤销读取尚未完成时重开面板，不丢失新会话', async () => {
  const store = storage(); const sessions = createFrameSessions(store);
  const old = await sessions.create(1);
  const originalGet = store.get; let release, entered;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let first = true;
  store.get = async key => {
    const snapshot = await originalGet(key);
    if (first) { first = false; entered(); await gate; }
    return snapshot;
  };
  const closing = sessions.revoke(1, old); await enteredPromise;
  const reopening = sessions.create(1);
  await new Promise(resolve => setImmediate(resolve)); release();
  const [, current] = await Promise.all([closing, reopening]);
  await sessions.assert(1, current);
});
