const MAX_INPUT = 4096;
const BLOCKED_SCHEMES = /^(?:javascript|data|file|chrome|chrome-extension|about|vbscript|mailto|tel|ftp|blob):/i;
const clean = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase();
const decode = value => { try { return decodeURIComponent(value); } catch { return value; } };

/** Preserve meaningful path, query and fragment differences; only URL-standard normalization. */
export function normalizeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

export function classifyInput(value) {
  const text = String(value ?? '').trim();
  if (!text) return { type: 'empty' };
  if (text.length > MAX_INPUT) return { type: 'blocked', message: '输入太长，请缩短后重试。' };
  if (BLOCKED_SCHEMES.test(text)) return { type: 'blocked', message: '这里仅支持 HTTP / HTTPS 网页地址。' };
  if (/^https?:/i.test(text)) {
    const url = normalizeUrl(text);
    return url ? { type: 'url', url } : { type: 'blocked', message: '网址无效，或包含账号密码，请检查后重试。' };
  }
  // Detect credentials before the email/phrase branch, including scheme-relative URLs.
  const bare = text.replace(/^\/\//, '');
  const authority = bare.split(/[/?#]/)[0];
  if (authority.includes('@')) {
    const userInfo = authority.slice(0, authority.lastIndexOf('@'));
    if (userInfo.includes(':') || bare !== authority || text.startsWith('//')) {
      return { type: 'blocked', message: '请移除网址中的账号密码后再打开。' };
    }
    return { type: 'search', text };
  }
  if (/\s/.test(text)) return { type: 'search', text };
  const hostPart = authority;
  const host = hostPart.replace(/:\d+$/, '');
  const local = /^localhost$/i.test(host) || /^127(?:\.\d{1,3}){3}$/.test(host) || host === '[::1]';
  const domain = /^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+(?:[\p{L}]{2,}|xn--[a-z\d-]+)$/iu.test(host);
  const ip = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || /^\[[a-f\d:]+\]$/i.test(host);
  if (local || domain || ip) {
    const url = normalizeUrl(`${local ? 'http' : 'https'}://${bare}`);
    if (url) return { type: 'url', url };
    return { type: 'blocked', message: '网址或端口无效，请检查后重试。' };
  }
  return { type: 'search', text };
}

export function findMatchingTab(tabs, url, currentWindowId) {
  const key = normalizeUrl(url);
  if (!key) return null;
  return tabs.filter(tab => normalizeUrl(tab.pendingUrl || tab.url) === key).sort((a, b) =>
    Number(b.windowId === currentWindowId) - Number(a.windowId === currentWindowId) ||
    (b.lastAccessed || 0) - (a.lastAccessed || 0)
  )[0] || null;
}

function candidates(tabs, history, options, empty) {
  const map = new Map();
  const current = tabs.find(tab => tab.id === options.currentTabId);
  const currentUrl = normalizeUrl(current?.pendingUrl || current?.url);
  for (const item of history) {
    const url = normalizeUrl(item.url);
    if (!url || (empty && url === currentUrl)) continue;
    const prior = map.get(url);
    if (prior && prior.lastUsed > (item.lastVisitTime || 0)) continue;
    map.set(url, {
      id: `url:${url}`, type: 'history', url, title: item.title?.trim() || new URL(url).hostname,
      lastUsed: item.lastVisitTime || 0, visits: item.visitCount || 0,
    });
  }
  const uniqueUrls = new Set(tabs.map(tab => normalizeUrl(tab.pendingUrl || tab.url)).filter(Boolean));
  for (const url of uniqueUrls) {
    if (empty && url === currentUrl) continue;
    const tab = findMatchingTab(tabs, url, options.currentWindowId);
    const prior = map.get(url);
    map.set(url, {
      id: `tab:${tab.id}`, type: 'tab', url, title: tab.title?.trim() || new URL(url).hostname,
      tabId: tab.id, windowId: tab.windowId, visits: prior?.visits || 0,
      lastUsed: Math.max(tab.lastAccessed || 0, prior?.lastUsed || 0),
    });
  }
  return [...map.values()];
}

function relevance(item, query, intent) {
  const url = new URL(item.url);
  const host = clean(url.hostname.replace(/^www\./, ''));
  const title = clean(item.title);
  const full = clean(decode(item.url));
  const q = clean(query);
  if (intent.type === 'url' && item.url === intent.url) return 1200;
  if (title === q) return 900;
  if (host === q) return 850 + Number(url.pathname === '/') * 25;
  if (title.startsWith(q)) return 740;
  if (host.startsWith(q)) return 700 + Number(url.pathname === '/' && !url.search && !url.hash) * 50;
  if (full.replace(/^https?:\/\//, '').startsWith(q)) return 680;
  if (title.includes(q)) return 570;
  if (full.includes(q)) return 520;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.every(token => `${title} ${full}`.includes(token))) return 460;
  return 0;
}

function secondaryScore(item, now) {
  const ageHours = Math.max(0, now - item.lastUsed) / 3600000;
  return 18 / (1 + ageHours / 24) + Math.min(12, Math.log2(1 + item.visits) * 2) + (item.type === 'tab' ? 15 : 0);
}

/** Results use an Arc-inspired, transparent approximation, not Arc's private ranking. */
export function buildResults(value, tabs = [], history = [], options = {}) {
  const query = String(value ?? '').trim();
  const intent = classifyInput(query);
  if (intent.type === 'blocked') return { items: [], completion: null, message: intent.message };
  const now = options.now || Date.now();
  const all = candidates(tabs, history, options, !query);
  if (!query) {
    const items = all.sort((a, b) => b.lastUsed - a.lastUsed || b.visits - a.visits).slice(0, 8);
    return { items, completion: null, message: items.length ? '' : '还没有可显示的页面，输入网址或关键词开始。' };
  }
  let ranked = all.map(item => ({ ...item, relevance: relevance(item, query, intent) }))
    .filter(item => item.relevance > 0)
    .map(item => ({ ...item, score: item.relevance + secondaryScore(item, now) }))
    .sort((a, b) => b.score - a.score || b.lastUsed - a.lastUsed);

  if (intent.type === 'url' && !ranked.some(item => item.url === intent.url)) {
    ranked.unshift({ id: `navigate:${intent.url}`, type: 'url', url: intent.url, title: intent.url, relevance: 1200, score: 1200 });
  }
  const search = { id: `search:${query}`, type: 'search', text: query, title: query };
  // Only a single strong winner precedes the always-visible verbatim search option.
  const strong = ranked[0]?.relevance >= 650;
  const items = strong ? [ranked[0], search, ...ranked.slice(1, 11)] : [search, ...ranked.slice(0, 11)];
  let completion = null;
  const winner = items[0];
  if (strong && winner.url && !/[\s/:?#@]/.test(query)) {
    const url = new URL(winner.url);
    const host = url.hostname.startsWith('www.') && !query.toLowerCase().startsWith('www.') ? url.hostname.slice(4) : url.hostname;
    if (url.pathname === '/' && !url.search && !url.hash && host.toLowerCase().startsWith(query.toLowerCase()) && host.length > query.length) {
      completion = query + host.slice(query.length);
    }
  }
  return { items, completion, message: '' };
}
