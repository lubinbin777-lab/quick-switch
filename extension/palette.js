(() => {
  const CSS = `
    :host{all:initial;color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
    *{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:focus-visible{outline:2px solid #7465e8;outline-offset:3px}
    .qs-panel{color:#252530;background:rgba(245,245,248,.98);border:1px solid rgba(255,255,255,.75);border-radius:18px;box-shadow:0 24px 90px #11112838,0 4px 18px #11112818;overflow:hidden;padding:0;text-align:left;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
    dialog.qs-panel{width:min(740px,calc(100vw - 32px));max-width:none;max-height:min(680px,80vh);margin:min(23vh,200px) auto auto;position:fixed;inset:0;bottom:auto}
    dialog::backdrop{background:transparent;backdrop-filter:none}
    .qs-panel.popup{width:100%;max-width:100vw;border:0;border-radius:0;box-shadow:none}
    .qs-head{display:flex;align-items:center;gap:14px;padding:22px 24px 18px;border-bottom:1px solid #dedee780}
    .qs-search-icon{width:22px;height:22px;flex:none;color:#737381}
    .qs-input{flex:1;min-width:0;font-size:21px;font-weight:450;line-height:1.5;padding:0;border:0;outline:0;background:none;color:#292934;caret-color:#8274ed;letter-spacing:-.35px}
    .qs-input::placeholder{color:#8a8996;opacity:1}.qs-input::selection{background:#cfc8ff;color:#262335}
    .qs-escape{border:1px solid #dcdce5;background:#eeeef3;color:#8a8996;border-radius:6px;padding:3px 6px;font-size:10px;line-height:1.2;flex:none}
    .qs-label{padding:13px 24px 7px;color:#9998a5;font-size:10px;letter-spacing:1.3px;display:flex;justify-content:space-between;align-items:center}
    .qs-count{letter-spacing:0;color:#aaa9b4}
    .qs-results{padding:0 10px 10px;max-height:min(432px,48vh);overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#d4d2e0 transparent;outline:0}
    .qs-result{display:flex;align-items:center;gap:13px;min-height:58px;padding:9px 13px;border-radius:10px;cursor:pointer;user-select:none;color:#383743}
    .qs-result[aria-selected=true]{background:linear-gradient(180deg,#2c2c34 0%,#1b1b21 52%,#101014 100%);color:#f8f8fb;box-shadow:inset 0 1px 0 #ffffff14}
    .qs-result[aria-selected=true] .qs-url,.qs-result[aria-selected=true] .qs-action{color:#ffffffb0}
    .qs-result[aria-selected=true] .qs-arrow{background:#fffffff2;color:#1a1a20}
    .qs-result[aria-selected=true] .qs-icon{background:#ffffff24;color:#eeeef6}
    .qs-icon{width:32px;height:32px;display:grid;place-items:center;border-radius:8px;background:#e9e8f0;color:#7a718f;flex:none;font-size:15px;font-weight:600}
    .qs-icon img{width:20px;height:20px;object-fit:contain}.qs-icon svg{width:18px;height:18px}
    .qs-copy{min-width:0;flex:1}.qs-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px;font-weight:520;line-height:1.55}
    .qs-url{font-size:10px;line-height:1.4;color:#9693a3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
    .qs-action{font-size:11px;color:#a09caa;white-space:nowrap;margin-left:8px}.qs-arrow{width:24px;height:24px;display:grid;place-items:center;border-radius:6px;color:#a5a1b3;background:#e8e6ef;font-size:18px;flex:none}
    .qs-message{padding:25px 18px 30px;text-align:center;color:#9893a5;font-size:13px;line-height:1.8}
    .qs-status{padding:0 23px 10px;font-size:11px;line-height:1.5;color:#9a6f49}.qs-status:empty{display:none}.qs-panel[aria-busy=true] .qs-result{opacity:.6}
    .qs-panel[aria-busy=true] .qs-label:after{content:'正在检索…';letter-spacing:0;font-size:10px}
    @media(max-width:540px){.qs-head{padding:18px;gap:10px}.qs-input{font-size:18px}.qs-action{display:none}.qs-title{font-size:13px}.qs-label{padding-left:20px}}
    @media(prefers-reduced-motion:no-preference){dialog.qs-panel[open]{animation:qs-in .13s ease-out}@keyframes qs-in{from{opacity:0;transform:translateY(-5px) scale(.99)}to{opacity:1;transform:none}}}
  `;
  const SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.8"/><path d="m15.5 15.5 5 5"/></svg>';
  const actions = { tab: '切换到标签', history: '历史记录', url: '访问网址', search: '默认搜索引擎' };
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function mount(root, adapter, options = {}) {
    const popup = options.mode === 'popup';
    const previousFocus = document.activeElement;
    const style = element('style'); style.textContent = CSS;
    const panel = element(popup ? 'section' : 'dialog', `qs-panel${popup ? ' popup' : ''}`);
    panel.setAttribute('aria-label', '瞬搜：搜索或切换标签');
    if (popup) panel.setAttribute('role', 'dialog');
    const head = element('div', 'qs-head');
    const searchIcon = element('span', 'qs-search-icon'); searchIcon.innerHTML = SVG;
    searchIcon.setAttribute('aria-hidden', 'true');
    const input = element('input', 'qs-input');
    input.type = 'text'; input.placeholder = '搜索或输入网址…'; input.maxLength = 4096;
    input.setAttribute('aria-label', '搜索或输入网址'); input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'both'); input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', 'qs-results'); input.autocomplete = 'off'; input.spellcheck = false;
    const escape = element('button', 'qs-escape', 'esc'); escape.type = 'button'; escape.setAttribute('aria-label', '关闭搜索面板');
    head.append(searchIcon, input, escape);
    const label = element('div', 'qs-label'); const labelText = element('span', '', '最近访问');
    const count = element('span', 'qs-count'); label.append(labelText, count);
    const list = element('div', 'qs-results'); list.id = 'qs-results'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', '检索结果');
    const status = element('div', 'qs-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    panel.append(head, label, list, status); root.replaceChildren(style, panel);
    const UNBOUND = '快捷键未绑定，请到 chrome://extensions/shortcuts 设置。';

    let items = [], selected = 0, composing = false, busy = false, closed = false, version = 0, unbound = false;
    let rawQuery = '', pending = Promise.resolve(), timer = null, settleTimer = null;
    const rows = () => [...list.querySelectorAll('[role=option]')];

    function setSelected(index, scroll = false) {
      if (!items.length) { input.removeAttribute('aria-activedescendant'); return; }
      selected = (index + items.length) % items.length;
      rows().forEach((row, i) => row.setAttribute('aria-selected', String(i === selected)));
      input.setAttribute('aria-activedescendant', `qs-option-${selected}`);
      if (scroll) rows()[selected]?.scrollIntoView({ block: 'nearest' });
    }

    function render(result) {
      items = result.items || []; selected = 0; list.replaceChildren();
      labelText.textContent = rawQuery.trim() ? '搜索结果' : '最近访问'; count.textContent = items.length ? `${items.length} 项` : '';
      status.textContent = result.warning || (unbound ? UNBOUND : '');
      items.forEach((item, index) => {
        const row = element('div', 'qs-result'); row.id = `qs-option-${index}`; row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(index === 0));
        const icon = element('span', 'qs-icon'); icon.setAttribute('aria-hidden', 'true');
        if (item.type === 'search') icon.innerHTML = SVG;
        else {
          let host = ''; try { host = new URL(item.url).hostname.replace(/^www\./, ''); } catch { /* Keep generic fallback. */ }
          icon.textContent = host.charAt(0).toUpperCase() || '↗';
          const src = adapter.iconUrl?.(item.url);
          if (src) {
            const img = element('img'); img.alt = ''; img.src = src; img.referrerPolicy = 'no-referrer';
            img.addEventListener('error', () => { icon.textContent = host.charAt(0).toUpperCase() || '↗'; }, { once: true });
            icon.replaceChildren(img);
          }
        }
        const copy = element('div', 'qs-copy'); const title = element('div', 'qs-title', item.title);
        title.title = item.title; copy.append(title);
        if (item.url) {
          const url = new URL(item.url);
          let path = url.pathname; try { path = decodeURIComponent(path); } catch { /* Display raw path. */ }
          copy.append(element('div', 'qs-url', `${url.hostname}${path === '/' ? '' : path}${url.search ? ' · …' : ''}`));
          row.title = item.url;
        }
        const action = element('span', 'qs-action', actions[item.type] || '打开');
        const arrow = element('span', 'qs-arrow', '↗'); arrow.setAttribute('aria-hidden', 'true');
        if (item.type === 'tab') arrow.textContent = '→';
        row.append(icon, copy, action, arrow);
        row.addEventListener('pointermove', () => { if (!busy) setSelected(index); });
        row.addEventListener('mousedown', event => event.preventDefault());
        row.addEventListener('click', () => { if (panel.getAttribute('aria-busy') !== 'true') { setSelected(index); void execute(); } });
        list.append(row);
      });
      if (!items.length) list.append(element('div', 'qs-message', result.message || '输入关键词，搜索标签与浏览历史。'));
      setSelected(0);
    }

    function load(query, allowCompletion = false) {
      rawQuery = query; const requestVersion = ++version;
      clearTimeout(timer); settleTimer?.();
      panel.setAttribute('aria-busy', 'true');
      const selectionAtEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
      pending = new Promise(resolve => {
        settleTimer = resolve;
        timer = setTimeout(async () => {
          settleTimer = null;
          try {
            const result = await adapter.search(query);
            if (closed || requestVersion !== version) return;
            render(result);
            if (allowCompletion && selectionAtEnd && !composing && result.completion && query === input.value && result.completion.toLowerCase().startsWith(query.toLowerCase())) {
              input.value = result.completion; input.setSelectionRange(query.length, input.value.length);
            }
          } catch (error) {
            if (!closed && requestVersion === version) render({ items: [], message: error.message || '检索失败，请重试。' });
          } finally {
            if (!closed && requestVersion === version) panel.setAttribute('aria-busy', 'false');
            resolve();
          }
        }, query ? 65 : 0);
      });
      return pending;
    }

    async function execute() {
      if (busy || composing || closed) return;
      busy = true;
      const executionVersion = version;
      await pending;
      if (closed || executionVersion !== version) { busy = false; return; }
      const item = items[selected];
      if (!item) { busy = false; return; }
      input.readOnly = true; status.textContent = item.type === 'tab' ? '正在切换标签…' : '正在打开…';
      try { await adapter.execute(item); close(); }
      catch (error) { status.textContent = error.message || '打开失败，请重试。'; input.readOnly = false; busy = false; input.focus(); }
    }

    function close() {
      if (closed) return;
      closed = true; ++version; clearTimeout(timer); settleTimer?.();
      if (!popup && panel.open) panel.close();
      panel.remove(); style.remove();
      if (!popup && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      adapter.onClose?.();
    }

    input.addEventListener('input', event => {
      if (composing || event.isComposing) return;
      void load(input.value, !event.inputType?.startsWith('delete'));
    });
    input.addEventListener('compositionstart', () => { composing = true; ++version; });
    input.addEventListener('compositionend', () => { composing = false; void load(input.value, false); });
    input.addEventListener('keydown', event => {
      if (composing || event.isComposing || event.keyCode === 229) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); if (!busy && panel.getAttribute('aria-busy') !== 'true') setSelected(selected + (event.key === 'ArrowDown' ? 1 : -1), true);
      } else if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault(); void execute();
      } else if (event.key === 'Escape') { event.preventDefault(); close(); }
    });
    panel.addEventListener('cancel', event => { event.preventDefault(); if (!composing) close(); });
    panel.addEventListener('click', event => {
      if (popup || event.target !== panel) return;
      const rect = panel.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    });
    escape.addEventListener('click', close);
    if (!popup) panel.showModal();
    input.focus({ preventScroll: true }); void load('');
    return {
      close,
      setShortcut(shortcut) {
        unbound = !shortcut;
        if (unbound) status.textContent = UNBOUND;
        else if (status.textContent === UNBOUND) status.textContent = '';
      },
    };
  }
  globalThis.QuickSwitchPalette = { mount };
})();
