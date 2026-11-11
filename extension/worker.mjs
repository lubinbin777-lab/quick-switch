import { createService } from './service.mjs';
import { createFrameSessions } from './frame-sessions.mjs';

const service = createService(chrome);
const frames = createFrameSessions(chrome.storage.session);
const toggles = new Map();
const actions = new Map();

async function contextFor(message, sender) {
  const source = new URL(sender.url || 'https://invalid.test');
  if (source.protocol !== 'chrome-extension:') throw new Error('不支持的调用来源。');
  if (source.pathname === '/overlay.html' && sender.tab) {
    await frames.assert(sender.tab.id, message.token);
    return chrome.tabs.get(sender.tab.id);
  }
  if (source.pathname !== '/popup.html') throw new Error('不支持的调用来源。');
  if (Number.isInteger(message.contextTabId)) return chrome.tabs.get(message.contextTabId);
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) throw new Error('找不到当前标签。');
  return tab;
}

async function commandStatus() {
  const command = (await chrome.commands.getAll()).find(command => command.name === 'toggle-palette');
  return { shortcut: command?.shortcut || '' };
}

// 受限页面（chrome://、应用商店等）无法注入 content script，改用居中小面板。
const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 420;
const fallbackWindows = new Map();

async function openFallbackPanel(tab) {
  const query = tab?.id ? `?context=${tab.id}` : '';
  let placement = {};
  try {
    const host = await chrome.windows.get(tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT);
    placement = {
      left: Math.round(host.left + (host.width - PANEL_WIDTH) / 2),
      top: Math.round(host.top + Math.max(72, host.height * 0.2)),
    };
  } catch { /* 拿不到宿主窗口时交给 Chrome 自己摆位 */ }
  const created = await chrome.windows.create({
    url: chrome.runtime.getURL(`popup.html${query}`),
    type: 'popup',
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    focused: true,
    ...placement,
  });
  if (!created?.id) return;
  fallbackWindows.set(created.id, Date.now());
  // 某些宿主页面（如 chrome://newtab）下 create 会沿用宿主窗口几何，这里再压一次尺寸。
  await chrome.windows.update(created.id, {
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    ...(placement.left != null ? { left: placement.left, top: placement.top } : {}),
  }).catch(() => {});
}

// 失去焦点即关闭，让备用面板表现为临时浮层而不是常驻窗口。
chrome.windows.onFocusChanged.addListener(windowId => {
  const now = Date.now();
  for (const [id, createdAt] of fallbackWindows) {
    if (id === windowId) continue;
    if (now - createdAt < 600) continue; // 创建瞬间的焦点抖动
    fallbackWindows.delete(id);
    chrome.windows.remove(id).catch(() => {});
  }
});

chrome.windows.onRemoved.addListener(id => { fallbackWindows.delete(id); });

async function toggle(tab) {
  if (!tab?.id) [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return openFallbackPanel();
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'QS_TOGGLE' }, { frameId: 0 });
    if (response?.ok) return;
  } catch { /* First invocation on this document: inject below. */ }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch {
    // Chrome internal pages and the Web Store cannot host a content script.
    await openFallbackPanel(tab);
  }
}

chrome.commands.onCommand.addListener((name, tab) => {
  if (name !== 'toggle-palette') return;
  const key = tab?.id || 'active';
  if (toggles.has(key)) return;
  const pending = toggle(tab).catch(() => {}).finally(() => toggles.delete(key));
  toggles.set(key, pending);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !['QS_SEARCH', 'QS_EXECUTE', 'QS_STATUS', 'QS_CREATE_FRAME', 'QS_REVOKE_FRAME', 'QS_FRAME_READY', 'QS_CLOSE_FRAME', 'QS_FALLBACK'].includes(message?.type)) return;
  (async () => {
    if (['QS_CREATE_FRAME', 'QS_REVOKE_FRAME', 'QS_FALLBACK'].includes(message.type)) {
      if (!sender.tab || sender.frameId !== 0 || sender.tab.incognito) throw new Error('不支持的调用来源。');
      if (message.type === 'QS_CREATE_FRAME') return { token: await frames.create(sender.tab.id) };
      await frames.revoke(sender.tab.id, message.token);
      if (message.type === 'QS_FALLBACK') await openFallbackPanel(sender.tab);
      return {};
    }
    const context = await contextFor(message, sender);
    if (['QS_FRAME_READY', 'QS_CLOSE_FRAME'].includes(message.type)) {
      await chrome.tabs.sendMessage(context.id, { type: message.type, token: message.token }, { frameId: 0 });
      if (message.type === 'QS_CLOSE_FRAME') await frames.revoke(context.id, message.token);
      return {};
    }
    if (message.type === 'QS_STATUS') return commandStatus();
    if (message.type === 'QS_SEARCH') return service.search(message.query, context);
    const key = context.id;
    // Suppress rapid repeated execution from the same source panel.
    if (actions.has(key)) return actions.get(key);
    const action = service.execute(message.item, context).finally(() => actions.delete(key));
    actions.set(key, action);
    return action;
  })().then(data => sendResponse({ ok: true, ...data }), error => sendResponse({ ok: false, error: error?.message || '操作失败，请重试。' }));
  return true;
});

chrome.tabs.onRemoved.addListener(id => { void frames.revoke(id); });
