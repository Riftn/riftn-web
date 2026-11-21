import { Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { supabase } from '@/integrations/supabase/client';
import { ownKeyHeaders } from '@/lib/api/dehub/own-key-headers';
import { postComment } from '@/lib/api/dehub/comments';
import { getNotifications, markNotificationAsRead, type DeHubNotification } from '@/lib/api/dehub/notifications';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useQueryClient } from '@tanstack/react-query';
import { customNotificationKeys, customNotificationListOptions } from '@/hooks/use-custom-notifications';
import { notificationKeys } from '@/hooks/use-notifications';
import { catchUpPrompts } from '@/lib/notification-catch-up';
import { useNotificationCatchUp } from '@/lib/use-notification-catch-up';

type Props = {
  wallet: string;
  isVisible: (item: DeHubNotification) => boolean;
  onOpenNotification: (item: DeHubNotification) => void;
};

export function NotificationCatchUp({ wallet, isVisible, onOpenNotification }: Props) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const state = useNotificationCatchUp({
    wallet,
    language: i18n.resolvedLanguage || i18n.language || 'en',
    load: async () => {
      const [feed, custom] = await Promise.all([
        getNotifications(1, 50, undefined, true),
        queryClient.fetchQuery({ ...customNotificationListOptions(wallet, true), staleTime: 0 }),
      ]);
      return [...new Map([...feed.items, ...custom].map(item => [item._id, item])).values()]
        .filter(item => !item.read && isVisible(item))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    },
    analyze: async prompt => {
      const { data, error } = await supabase.functions.invoke('creator-prompt-assistant', {
        headers: ownKeyHeaders(),
        body: { persona: 'notification-catch-up', prompt },
      });
      if (error || data?.mode !== 'notification-catch-up' || typeof data.text !== 'string') throw new Error('Notification analysis unavailable');
      return data.text;
    },
    markRead: async item => {
      if (!item._id.startsWith('custom_')) {
        await markNotificationAsRead(item._id);
        return;
      }
      const { error } = await withWalletHeader(
        supabase.from('custom_notifications').update({ read: true })
          .eq('id', item._id.slice('custom_'.length)).eq('recipient_address', wallet.toLowerCase()),
        wallet,
      );
      if (error) throw error;
    },
    send: async (target, text) => {
      const content = target.username && !text.startsWith('@') ? '@' + target.username + ' ' + text : text;
      await postComment(String(target.tokenId), content, target.commentId);
    },
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      void queryClient.invalidateQueries({ queryKey: customNotificationKeys.all });
    },
  });

  const disabled = state.busy || !!state.pending;
  const status = state.status;
  const statusText = status?.key === 'sent'
    ? t('notifications.catchUp.sent', { defaultValue: '{{count}} sent · {{failed}} failed', count: status.count, failed: status.failed })
    : status?.key === 'cleared'
      ? t('notifications.catchUp.cleared', { defaultValue: '{{count}} marked read · {{failed}} failed', count: status.count, failed: status.failed })
      : status && t('notifications.catchUp.' + status.key, {
        defaultValue: {
          empty: 'You have no unread notifications in this view.',
          askError: 'Could not review your notifications. Try again.',
          undone: 'Cleanup undone.',
          writing: 'Saving changes…',
        }[status.key],
      });

  return (
    <Drawer open={state.open} onOpenChange={state.setOpen} dismissible={!state.pending} direction="bottom">
      <div className="px-3 pb-2">
        <Button variant="outline" size="sm" onClick={() => state.setOpen(true)} aria-haspopup="dialog" aria-expanded={state.open} className="gap-2 rounded-xl">
          <Sparkles className="h-4 w-4" aria-hidden />
          {t('notifications.catchUp.title', { defaultValue: 'Catch me up' })}
        </Button>
      </div>
      <DrawerContent glass column scrollable className="max-h-[85dvh]" aria-describedby={undefined}>
        <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-6 pt-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <DrawerTitle className="text-lg">{t('notifications.catchUp.title', { defaultValue: 'Catch me up' })}</DrawerTitle>
            <Button type="button" size="icon" variant="ghost" disabled={!!state.pending} onClick={() => state.setOpen(false)} aria-label={t('notifications.catchUp.close', { defaultValue: 'Close' })}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('notifications.catchUp.scope', { defaultValue: 'Ask about your 30 most recent unread notifications. Your question and notification previews are used to generate the answer.' })}
          </p>
          <div className="flex flex-wrap gap-2">
            {catchUpPrompts.map(prompt => (
              <Button key={prompt.key} type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void state.ask(prompt.question, prompt.key === 'cleanup')}>
                {t('notifications.catchUp.prompt.' + prompt.key, { defaultValue: prompt.label })}
              </Button>
            ))}
          </div>
          <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void state.ask(state.question); }}>
            <input
              className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 text-sm"
              value={state.question}
              onChange={event => state.setQuestion(event.target.value)}
              maxLength={600}
              placeholder={t('notifications.catchUp.placeholder', { defaultValue: 'Ask about unread notifications' })}
              aria-label={t('notifications.catchUp.placeholder', { defaultValue: 'Ask about unread notifications' })}
            />
            <Button type="submit" disabled={disabled || !state.question.trim()}>
              {t('notifications.catchUp.ask', { defaultValue: 'Ask' })}
            </Button>
          </form>
          {state.pending > 0 && (
            <div role="status" className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
              {t('notifications.catchUp.pending', { defaultValue: 'Marking {{count}} as read in 8 seconds.', count: state.pending })}
              <Button size="sm" variant="outline" onClick={state.undo}>{t('notifications.catchUp.undo', { defaultValue: 'Undo' })}</Button>
            </div>
          )}
          {(statusText || state.busy) && (
            <p role="status" className="text-sm text-muted-foreground">
              {statusText || t('notifications.catchUp.working', { defaultValue: 'Working…' })}
            </p>
          )}
          {!!state.result && (
            <>
              {state.result.answer && <p className="whitespace-pre-wrap text-sm">{state.result.answer}</p>}
              {(['urgent', 'replies'] as const).map(group => state.result?.[group].length ? (
                <section key={group} className="space-y-2">
                  <h3 className="text-sm font-semibold">{t('notifications.catchUp.prompt.' + group, { defaultValue: group === 'urgent' ? 'Urgent' : 'Needs a reply' })}</h3>
                  {state.result[group].map(({ index, reason }) => {
                    const item = state.items[index];
                    return (
                      <button key={index} type="button" disabled={disabled} onClick={() => { state.setOpen(false); onOpenNotification(item.source); }}
                        className="block w-full rounded-xl border p-3 text-left text-sm hover:bg-muted">
                        {item.sender && <span className="block font-semibold">{item.sender}</span>}
                        <span className="block break-words">{item.preview}</span>
                        <span className="mt-1 block text-muted-foreground">{reason}</span>
                      </button>
                    );
                  })}
                </section>
              ) : null)}
              {state.drafts.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">{t('notifications.catchUp.drafts', { defaultValue: 'Review replies' })}</h3>
                  {state.drafts.map(draft => (
                    <div key={draft.index} className="space-y-2 rounded-xl border p-3">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span>{state.items[draft.index].sender}</span>
                        <button type="button" disabled={disabled} className="text-muted-foreground hover:underline" onClick={() => state.removeDraft(draft.index)}>
                          {t('notifications.catchUp.remove', { defaultValue: 'Remove' })}
                        </button>
                      </div>
                      <p className="break-words text-sm text-muted-foreground">{state.items[draft.index].preview}</p>
                      <textarea value={draft.text} disabled={disabled} maxLength={1000}
                        aria-label={t('notifications.catchUp.editReply', { defaultValue: 'Edit reply to {{name}}', name: state.items[draft.index].sender })}
                        onChange={event => state.editDraft(draft.index, event.target.value)}
                        rows={3} className="w-full rounded-lg border bg-background p-2 text-sm" />
                    </div>
                  ))}
                  <Button type="button" disabled={disabled || !state.drafts.some(draft => draft.text.trim())} onClick={() => void state.sendDrafts()}>
                    {t('notifications.catchUp.send', { defaultValue: 'Send {{count}} replies', count: state.drafts.filter(draft => draft.text.trim()).length })}
                  </Button>
                </section>
              )}
              {state.preview ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">{t('notifications.catchUp.preview', { defaultValue: 'Cleanup preview' })}</h3>
                  {state.result.cleanup.length ? state.result.cleanup.map(index => (
                    <label key={index} className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                      <input type="checkbox" className="mt-1" disabled={disabled} checked={state.checked.includes(index)} onChange={() => state.toggle(index)} />
                      <span className="break-words">{state.items[index].sender && <strong>{state.items[index].sender} </strong>}{state.items[index].preview}</span>
                    </label>
                  )) : <p className="text-sm text-muted-foreground">{t('notifications.catchUp.noCleanup', { defaultValue: 'No low-priority notifications to clear.' })}</p>}
                  {state.result.cleanup.length > 0 && (
                    <Button type="button" disabled={disabled || !state.checked.length} onClick={state.clear}>
                      {t('notifications.catchUp.markRead', { defaultValue: 'Mark {{count}} as read', count: state.checked.length })}
                    </Button>
                  )}
                </section>
              ) : state.result.cleanup.length > 0 && (
                <Button size="sm" variant="outline" disabled={disabled} onClick={() => state.setPreview(true)}>
                  {t('notifications.catchUp.preview', { defaultValue: 'Cleanup preview' })}
                </Button>
              )}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
