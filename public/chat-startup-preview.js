const phone = '(max-width: 767px)';
const style = `
  .public-chat-preview {
    position: fixed; inset: 0; z-index: 71; display: flex; flex-direction: column;
    padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
    background: var(--boot-bg, #000); color: var(--boot-fg, #fff);
  }
  .public-chat-preview__header {
    display: flex; align-items: center; min-height: 3.5rem; padding: 0 1rem;
    border-bottom: 1px solid var(--bskel, rgba(255,255,255,.12));
  }
  .public-chat-preview__header::before {
    content: ''; width: 6rem; height: .75rem; border-radius: .375rem;
    background: var(--bskel, rgba(255,255,255,.12));
  }
  .public-chat-preview__list { flex: 1; min-height: 0; overflow-y: auto; margin: 0; padding: .5rem 1rem; list-style: none; }
  .public-chat-preview__row { padding: .5rem .25rem; font-size: .875rem; line-height: 1.4; overflow-wrap: anywhere; }
  .public-chat-preview__row strong { display: block; font-size: .75rem; }
  .public-chat-preview__row p { margin: .125rem 0 0; white-space: pre-wrap; }
  .public-chat-preview::after { content: ''; flex: none; height: 3.5rem; border-top: 1px solid var(--bskel, rgba(255,255,255,.12)); }
`;

function publicGuest() {
  try {
    if (localStorage.getItem('dehub_token') || localStorage.getItem('dehub_refresh_token') ||
        localStorage.getItem('dehub_wallet') || localStorage.getItem('dhb_kids_mode') === '1') return false;
    for (let i = 0; i < localStorage.length; i++) {
      if (/^sb-.*-auth-token$/.test(localStorage.key(i) || '')) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function publicPreviewRows(payload) {
  const rows = payload?.result?.messages ?? payload?.messages;
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 20).flatMap((row) => {
    const sender = row?.sender?.displayName || row?.sender?.username;
    if (row?.roomId !== 'global' || (row.type || row.messageType) !== 'text' ||
        row.isDeleted || row.deletedAt || row.isHidden || row.media?.length ||
        typeof sender !== 'string' || !sender.trim() ||
        typeof row.content !== 'string' || !row.content.trim()) return [];
    return [{ sender: sender.slice(0, 120), content: row.content }];
  }).reverse();
}

async function previewAvailable() {
  try {
    const response = await fetch('/maintenance.json', { cache: 'no-store', credentials: 'omit' });
    return response.ok && (await response.json())?.enabled === false;
  } catch {
    return false;
  }
}

/** Show the already-fetched public text while the normal chat tree loads. */
export async function showPublicChatPreview(history) {
  if (!publicGuest()) return;
  const [payload, available] = await Promise.all([history, previewAvailable()]);
  const root = document.getElementById('root');
  const viewport = matchMedia(phone);
  const params = new URLSearchParams(location.search);
  if (!available || !viewport.matches || !publicGuest() ||
      !/^\/chat\/?$/i.test(location.pathname) || params.get('chat') !== 'public' || params.has('msg') || params.has('with') ||
      !root?.querySelector('.bskel-chat')) return;
  const rows = publicPreviewRows(payload);
  if (!rows.length) return;

  const preview = document.createElement('section');
  preview.className = 'public-chat-preview';
  preview.setAttribute('aria-label', document.title);
  const sheet = document.createElement('style');
  sheet.textContent = style;
  const header = document.createElement('div');
  header.className = 'public-chat-preview__header';
  header.setAttribute('aria-hidden', 'true');
  const list = document.createElement('ul');
  list.className = 'public-chat-preview__list';
  list.tabIndex = 0;
  for (const row of rows) {
    const item = document.createElement('li');
    item.className = 'public-chat-preview__row';
    const author = document.createElement('strong');
    author.textContent = row.sender;
    const message = document.createElement('p');
    message.textContent = row.content;
    item.append(author, message);
    list.append(item);
  }
  preview.append(sheet, header, list);
  root.after(preview);
  list.scrollTop = list.scrollHeight;

  const observer = new MutationObserver(() => {
    if (root.querySelector('[data-public-chat-ready]') ||
        (!root.querySelector('.bskel-chat') && !root.querySelector('[data-fullscreen-chat]'))) remove();
  });
  const timeout = setTimeout(remove, 45_000);
  function remove() {
    clearTimeout(timeout);
    observer.disconnect();
    viewport.removeEventListener('change', remove);
    window.removeEventListener('popstate', remove);
    window.removeEventListener('storage', remove);
    preview.remove();
  }
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-public-chat-ready'] });
  viewport.addEventListener('change', remove);
  window.addEventListener('popstate', remove);
  window.addEventListener('storage', remove);
}
