(() => {
  const history = document.getElementById('history');
  const title = document.getElementById('title');
  const status = document.getElementById('status');
  const list = document.getElementById('messages');
  let lastPreview = '';
  let loading = false;

  async function refresh() {
    if (document.hidden || loading) return;
    loading = true;
    try {
      const response = await fetch('?format=json', { credentials: 'omit' });
      if (!response.ok) throw new Error('Preview unavailable');
      const preview = await response.json();
      const serialized = JSON.stringify(preview);
      if (serialized === lastPreview) return;
      lastPreview = serialized;
      const atBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 24;
      title.textContent = preview.title || 'Riftn Chat';
      status.textContent = preview.state === 'restricted' ? 'Open on Riftn to access this chat.'
        : preview.state === 'unavailable' ? 'This chat is unavailable.'
        : preview.messages.length === 0 ? 'No messages yet.' : '';
      list.replaceChildren(...(preview.messages ?? []).map(message => {
        const row = document.createElement('li');
        const author = document.createElement('strong');
        const body = document.createElement('p');
        author.textContent = message.author;
        body.textContent = message.text;
        row.append(author, body);
        return row;
      }));
      if (atBottom) history.scrollTop = history.scrollHeight;
    } catch {
      lastPreview = '';
      title.textContent = 'Riftn Chat';
      list.replaceChildren();
      status.textContent = 'Chat is temporarily unavailable.';
    } finally {
      loading = false;
    }
  }

  status.textContent = 'Loading chat…';
  void refresh();
  document.addEventListener('visibilitychange', refresh);
  setInterval(refresh, 30_000);
})();
