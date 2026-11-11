(async () => {
  const token = new URL(location.href).searchParams.get('token');
  const request = async message => {
    const response = await chrome.runtime.sendMessage({ ...message, token });
    if (!response?.ok) throw new Error(response?.error || '操作失败，请重试。');
    return response;
  };
  await request({ type: 'QS_FRAME_READY' });
  const root = document.getElementById('app').attachShadow({ mode: 'closed' });
  const view = QuickSwitchPalette.mount(root, {
    search: query => request({ type: 'QS_SEARCH', query }),
    execute: item => request({ type: 'QS_EXECUTE', item }),
    iconUrl: url => `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(url)}&size=32`,
    onClose: () => { void request({ type: 'QS_CLOSE_FRAME' }).catch(() => {}); },
  });
  try { view.setShortcut((await request({ type: 'QS_STATUS' })).shortcut); } catch { view.setShortcut(''); }
})().catch(() => {
  document.body.className = 'failed';
  document.body.textContent = '无法连接瞬搜。请按 Esc 关闭后重试。';
});
