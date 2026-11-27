import type { TFunction } from 'i18next';
import { toast } from 'sonner';

export function chatEmbedCode(slug?: string): string {
  const path = slug ? `/chat/embed/${encodeURIComponent(slug)}` : '/chat/embed';
  return `<iframe src="https://riftn.com${path}" title="Riftn Chat" width="480" height="560" style="max-width: 100%; border: 0" loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>`;
}

export async function copyChatEmbedCode(t: TFunction, slug?: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(chatEmbedCode(slug));
    toast.success(t('postOptions.embedCodeCopied'));
  } catch {
    toast.error(t('postOptions.copyFailed'));
  }
}
