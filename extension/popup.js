(async () => {
  const root = document.getElementById('app').attachShadow({ mode: 'closed' });
  // 备用弹窗是独立窗口，自身也会被算作当前标签，因此目标标签由打开它的标签页通过 URL 传入。
  const passed = Number(new URL(location.href).searchParams.get('context'));
  const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
  const contextTabId = Number.isInteger(passed) && passed > 0 ? passed : current?.id;
  const request = async message => {
    const response = await chrome.runtime.sendMessage({ ...message, contextTabId });
    if (!response?.ok) throw new Error(response?.error || '操作失败，请重试。');
    return response;
  };
  const view = QuickSwitchPalette.mount(root, {
    search: query => request({ type: 'QS_SEARCH', query }),
    execute: item => request({ type: 'QS_EXECUTE', item }),
    iconUrl: url => `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(url)}&size=32`,
    onClose: () => window.close(),
  }, { mode: 'popup' });
  try { view.setShortcut((await request({ type: 'QS_STATUS' })).shortcut); } catch { view.setShortcut(''); }
  // 备用面板窗口打开后按内容收缩高度，避免底部留白。
  setTimeout(() => {
    const height = Math.min(640, Math.max(220, Math.ceil(document.body.scrollHeight)));
    chrome.windows.getCurrent(win => {
      if (!win?.id || win.type !== 'popup') return; // 只有备用面板窗口才收紧高度
      chrome.windows.update(win.id, { height }).catch(() => {});
    });
  }, 160);
})().catch(() => { document.body.textContent = '无法打开瞬搜，请关闭弹窗后重试。'; });
