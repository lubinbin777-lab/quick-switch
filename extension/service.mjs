import { buildResults, classifyInput, findMatchingTab, normalizeUrl } from './core.mjs';

function assertContext(context) {
  if (!context || context.incognito) throw new Error('第一版暂不支持无痕窗口。');
  if (!Number.isInteger(context.windowId)) throw new Error('找不到当前浏览器窗口，请重新打开面板。');
}

export function createService(api) {
  const ordinaryTabs = async () => (await api.tabs.query({})).filter(tab => !tab.incognito);
  return {
    async search(query, context) {
      assertContext(context);
      query = String(query ?? '').trim();
      const intent = classifyInput(query);
      if (intent.type === 'blocked') return { items: [], completion: null, message: intent.message };
      const requests = [{ text: '', startTime: 0, maxResults: 500 }];
      if (query) {
        requests.push({ text: query, startTime: 0, maxResults: 200 });
        const tokens = query.split(/\s+/).filter(Boolean);
        if (tokens.length > 1) for (const token of [...new Set(tokens)].slice(0, 3)) requests.push({ text: token, startTime: 0, maxResults: 120 });
      }
      const [tabs, historyResults] = await Promise.all([
        ordinaryTabs(), Promise.allSettled(requests.map(request => api.history.search(request))),
      ]);
      const history = historyResults.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      const result = buildResults(query, tabs, history, { currentTabId: context.id, currentWindowId: context.windowId });
      if (historyResults.some(result => result.status === 'rejected')) result.warning = '历史记录暂时无法读取，仍可检索标签和搜索。';
      return result;
    },

    async execute(item, context) {
      assertContext(context);
      if (!item || typeof item !== 'object') throw new Error('请选择一个结果。');
      if (item.type === 'search') {
        const text = String(item.text ?? '').trim();
        const intent = classifyInput(text);
        if (!text || intent.type === 'blocked') throw new Error(intent.message || '请输入搜索内容。');
        await api.search.query({ text, disposition: 'NEW_TAB' });
        return { action: 'searched' };
      }
      if (!['tab', 'history', 'url'].includes(item.type)) throw new Error('不支持的操作。');
      const url = normalizeUrl(item.url);
      if (!url || url.length > 4096) throw new Error('仅支持有效的 HTTP / HTTPS 网页地址。');
      // A result may be stale: never activate an unrelated page just because a tab ID still exists.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const match = findMatchingTab(await ordinaryTabs(), url, context.windowId);
        if (!match) break;
        let fresh;
        try { fresh = await api.tabs.get(match.id); } catch { continue; }
        if (fresh.incognito || normalizeUrl(fresh.pendingUrl || fresh.url) !== url) continue;
        await api.tabs.update(fresh.id, { active: true });
        await api.windows.update(fresh.windowId, { focused: true });
        return { action: 'switched', tabId: fresh.id };
      }
      const opened = await api.tabs.create({ url, active: true, windowId: context.windowId });
      return { action: 'opened', tabId: opened.id };
    },
  };
}
