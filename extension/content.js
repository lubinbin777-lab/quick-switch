(() => {
  const key = '__quickSwitchContentV2';
  if (globalThis[key]) { void globalThis[key].toggle(); return; }
  let current = null, opening = false, generation = 0;
  async function request(message) {
    const result = await chrome.runtime.sendMessage(message);
    if (!result?.ok) throw new Error(result?.error || '无法打开面板。');
    return result;
  }
  function close(revoke = true) {
    ++generation; opening = false;
    const old = current; current = null;
    if (!old) return;
    clearTimeout(old.timer);
    if (old.dialog.open) old.dialog.close();
    old.host.remove();
    if (old.focus?.isConnected) old.focus.focus({ preventScroll: true });
    if (revoke) void request({ type: 'QS_REVOKE_FRAME', token: old.token }).catch(() => {});
  }
  async function toggle() {
    if (current || opening) { close(); return; }
    opening = true; const ownGeneration = ++generation;
    try {
      const { token } = await request({ type: 'QS_CREATE_FRAME' });
      if (ownGeneration !== generation) { void request({ type: 'QS_REVOKE_FRAME', token }).catch(() => {}); return; }
      const focus = document.activeElement;
      const host = document.createElement('div');
      host.style.cssText = 'all:initial!important;position:fixed!important;z-index:2147483647!important;';
      const root = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = 'dialog{position:fixed;inset:0;margin:0;padding:0;border:0;width:100vw;height:100dvh;max-width:none;max-height:none;background:transparent;overflow:hidden}dialog::backdrop{background:transparent}iframe{display:block;width:100%;height:100%;border:0;background:transparent}';
      const dialog = document.createElement('dialog'); dialog.setAttribute('aria-label', '瞬搜');
      const frame = document.createElement('iframe'); frame.setAttribute('aria-label', '瞬搜搜索面板');
      frame.src = `${chrome.runtime.getURL('overlay.html')}?token=${encodeURIComponent(token)}`;
      frame.referrerPolicy = 'no-referrer';
      dialog.append(frame); root.append(style, dialog); document.documentElement.append(host);
      current = { host, dialog, frame, focus, token, timer: null };
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      dialog.showModal(); opening = false;
      current.timer = setTimeout(() => {
        if (current?.token !== token) return;
        close(false);
        void request({ type: 'QS_FALLBACK', token }).catch(() => {});
      }, 6000);
    } catch {
      close();
      void request({ type: 'QS_FALLBACK' }).catch(() => {});
    }
  }
  globalThis[key] = { toggle };
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message?.type === 'QS_TOGGLE') { void toggle(); reply({ ok: true }); }
    else if (message?.type === 'QS_FRAME_READY' && current?.token === message.token) {
      clearTimeout(current.timer); reply({ ok: true });
    } else if (message?.type === 'QS_CLOSE_FRAME' && current?.token === message.token) {
      close(); reply({ ok: true });
    }
  });
  void toggle();
})();
