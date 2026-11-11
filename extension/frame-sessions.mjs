export function createFrameSessions(storage) {
  const key = id => `qs-frame:${id}`;
  const queues = new Map();
  function serial(tabId, task) {
    const operation = (queues.get(tabId) || Promise.resolve()).catch(() => {}).then(task);
    queues.set(tabId, operation);
    operation.finally(() => { if (queues.get(tabId) === operation) queues.delete(tabId); }).catch(() => {});
    return operation;
  }
  return {
    async create(tabId) {
      return serial(tabId, async () => {
        const token = crypto.randomUUID();
        await storage.set({ [key(tabId)]: { token } });
        return token;
      });
    },
    async assert(tabId, token) {
      const saved = (await storage.get(key(tabId)))[key(tabId)];
      if (!token || saved?.token !== token) throw new Error('面板已失效，请关闭后重新打开。');
    },
    async revoke(tabId, token) {
      return serial(tabId, async () => {
        const saved = (await storage.get(key(tabId)))[key(tabId)];
        if (token == null || saved?.token === token) await storage.remove(key(tabId));
      });
    },
  };
}
