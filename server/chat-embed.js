const MAX_MESSAGES = 20;
const FRAME_POLICY = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors *; base-uri 'none'; form-action 'none'; object-src 'none'";

export function chatEmbedRoute(pathname) {
  const match = /^\/chat\/embed(?:\/([a-zA-Z0-9_-]{1,120}))?\/?$/.exec(pathname);
  return match ? { slug: match[1] ?? null } : null;
}

const previewLine = (author, content, type) => ({
  author: typeof author === 'string' && author.trim() ? author.slice(0, 100) : 'Riftn member',
  text: typeof content === 'string' && content.trim() && ['text', 'msg', undefined, null].includes(type)
    ? content.slice(0, 4000) : 'Attachment · Open on Riftn to view',
});

async function loadPreview(slug, { lookup, rpc, readPublic }) {
  if (!slug) {
    const messages = await readPublic();
    if (!Array.isArray(messages)) throw new Error('Public chat unavailable');
    return {
      title: 'Riftn Chat',
      messages: messages.slice(0, MAX_MESSAGES).reverse().map(row =>
        previewLine(row.sender?.displayName || row.sender?.username, row.content, row.messageType ?? row.type)),
    };
  }

  const fields = 'id,name,kind,is_private,entry_price,holder_gate_token';
  const group = await lookup(`communities?select=${fields}&slug=eq.${slug}&limit=1`);
  if (group === undefined) throw new Error('Group lookup unavailable');
  if (!group || !['group', 'channel'].includes(group.kind)) return { state: 'unavailable' };
  // Keep the preview anonymous even when the frame's browser has a Riftn session.
  if (group.is_private !== false || Number(group.entry_price) > 0 || group.holder_gate_token) {
    return { state: 'restricted' };
  }

  const page = await rpc('community_chat_page_v1', { _community_id: group.id, _limit: MAX_MESSAGES });
  if (!Array.isArray(page?.messages)) throw new Error('Group chat unavailable');
  return {
    title: group.name,
    messages: page.messages.slice(0, MAX_MESSAGES).reverse().map(row =>
      previewLine(row.display_name || row.username, row.content, row.message_type)),
  };
}

async function readPublic() {
  const response = await fetch(`https://api.dehub.io/api/livechat/messages?roomId=global&limit=${MAX_MESSAGES}`, {
    signal: AbortSignal.timeout(5000),
    cf: { cacheEverything: true, cacheTtlByStatus: { '200': 10, '201-599': 0 } },
  });
  if (!response.ok) throw new Error('Public chat unavailable');
  const body = await response.json();
  return body.result?.messages ?? body.messages;
}

export async function handleChatEmbed(request, { slug }, { lookup, rpc, readPublic: publicReader = readPublic }) {
  const head = request.method === 'HEAD';
  if (!head && request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const headers = {
    'Content-Security-Policy': FRAME_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  };
  if (new URL(request.url).searchParams.get('format') === 'json') {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    if (head) return new Response(null, { headers });
    try {
      return new Response(JSON.stringify(await loadPreview(slug, { lookup, rpc, readPublic: publicReader })), { headers });
    } catch {
      return new Response(JSON.stringify({ state: 'error' }), { headers, status: 503 });
    }
  }
  headers['Content-Type'] = 'text/html; charset=utf-8';
  const target = slug ? `https://riftn.com/app/communities/${slug}?tab=chat` : 'https://riftn.com/chat?chat=public';
  return new Response(head ? null : `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Riftn Chat</title>
<style>
  :root { color-scheme: dark; font: 14px/1.45 system-ui, sans-serif; background: #101012; color: #f4f4f5 }
  * { box-sizing: border-box }
  body { margin: 0; height: 100dvh; display: flex; flex-direction: column }
  header { display: flex; align-items: center; gap: 12px; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #323238 }
  h1 { margin: 0; font-size: 15px; overflow-wrap: anywhere }
  a { flex: none; color: inherit; background: #2a2a30; border-radius: 8px; padding: 7px 10px; text-decoration: none; font-size: 13px }
  a:hover { background: #424249 }
  main { min-height: 0; flex: 1; overflow: auto; padding: 12px 14px }
  #status { margin: 0; color: #b2b2bc }
  ol { list-style: none; margin: 0; padding: 0 }
  li { padding: 8px 0; overflow-wrap: anywhere }
  li + li { border-top: 1px solid #27272c }
  li p { margin: 2px 0 0; white-space: pre-wrap; color: #dedee3 }
</style>
<header><h1 id="title">Riftn Chat</h1><a href="${target}" target="_blank" rel="noopener noreferrer">Open on Riftn ↗</a></header>
<main id="history" aria-label="Recent messages" tabindex="0">
  <p id="status" role="status"></p><ol id="messages"></ol>
  <noscript>Open on Riftn to read the chat.</noscript>
</main>
<script src="/chat-embed.js" defer></script>
</html>`, { headers });
}
