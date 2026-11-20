/**
 * The assistant offers to do things (react, follow, read your chats) by
 * putting a riftn.com/app/assistant?action=<id> link in its reply. The chat
 * draws that link as a confirm card and leaves it out of the text.
 */
const ACTION_LINK = /\[([^\]]*)\]\((?:https?:\/\/[^\s)]*?)?\/(?:app\/)?assistant\?action=([a-f0-9]{24})\)|(?:https?:\/\/[^\s)]*?)\/(?:app\/)?assistant\?action=([a-f0-9]{24})/gi;

export function assistantActionIds(content: string | null | undefined): string[] {
  if (!content) return [];
  const ids: string[] = [];
  for (const m of content.matchAll(ACTION_LINK)) {
    const id = (m[2] || m[3] || '').toLowerCase();
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** The reply without the card links (the cards show instead). */
export function withoutAssistantActionLinks(content: string): string {
  if (!content) return content;
  return content
    .replace(ACTION_LINK, '')
    // Mid-stream, a card link that has not finished arriving yet.
    .replace(/\[[^\]\n]*\]\([^)\s]*$/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}
