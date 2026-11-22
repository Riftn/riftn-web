/**
 * DmLockedState — the whole thread, as one screen, while this device can't
 * open it.
 *
 * Without a key every encrypted line used to render its own "can't be opened
 * on this device" pill, so a locked wallet turned a chat into a column of the
 * same error. This replaces the list (and the composer, since anything typed
 * now would go out in the clear) with one place to unlock from.
 */
import { useId, useState } from 'react';
import type { DmMessage } from '@/lib/api/dehub';
import { useTranslation as useI18n } from 'react-i18next';
import { AppState } from '@/components/app/AppState';
import Lock from '@/components/ui/cut-icons/privacy';
import type { DmEncryptionStatus } from '@/hooks/use-dm-encryption';

interface DmLockedStateProps {
  status: DmEncryptionStatus;
  needsWalletConnection: boolean;
  peerName: string;
  onUnlock: () => void;
}

export function DmLockedState({ status, needsWalletConnection, peerName, onUnlock }: DmLockedStateProps) {
  const { t: tr } = useI18n();
  const busy = status === 'pending';

  const label = busy
    ? tr('messages.encryptionTurningOn', { defaultValue: 'Waiting for your wallet to turn on encryption…' })
    : needsWalletConnection
      ? tr('messages.encryptionReconnectWallet', { defaultValue: 'Reconnect wallet' })
      : status === 'error'
        ? tr('messages.lockedTryAgain', { defaultValue: 'Try again' })
        : tr('messages.lockedUnlock', { defaultValue: 'Unlock wallet' });

  const body = status === 'error'
    ? tr('messages.encryptionSetupFailed', { defaultValue: 'Encryption setup failed. Please try again.' })
    : needsWalletConnection
      ? tr('messages.encryptionReconnect', { defaultValue: 'Reconnect your wallet to turn on encryption.' })
      : tr('messages.lockedBody', {
          name: peerName,
          defaultValue: 'Your chat with {{name}} is end-to-end encrypted. Unlock your wallet on this device to open it.',
        });

  return (
    <div data-dm-locked className="flex-1 min-h-0 flex flex-col">
      <AppState
        icon="messages"
        kind="restricted"
        size="page"
        title={tr('messages.lockedTitle', { defaultValue: 'Unlock to read your messages' })}
        description={body}
        primaryAction={{
          label,
          onClick: onUnlock,
          disabled: busy,
          loading: busy,
          icon: busy ? undefined : <Lock className="w-4 h-4 text-current" />,
        }}
        className="flex-1"
      />
    </div>
  );
}

/** One quiet line standing in for a run of lines encrypted for another device. */
export function DmUndecryptableRun({ count }: { count: number }) {
  const { t: tr } = useI18n();
  return (
    <span data-dm-undecryptable-run className="flex items-center gap-2 my-3 text-xs text-zinc-500">
      <span className="flex-1 h-px bg-white/10" />
      <Lock className="w-3 h-3 flex-shrink-0 text-current" />
      <span>{tr('messages.undecryptableRun', { count, defaultValue: "{{count}} messages can't be opened on this device" })}</span>
      <span className="flex-1 h-px bg-white/10" />
    </span>
  );
}

/** Select an individual locked message without passing its envelope to a renderer. */
export function DmUndecryptableMessages({ messages, onDelete }: {
  messages: DmMessage[];
  onDelete: (message: DmMessage) => void;
}) {
  const { t, i18n } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const descriptionId = useId();
  const grouped = messages.length > 1;
  return (
    <div>
      {grouped && (
        <button type="button" className="flex w-full items-center gap-2 [&>span:first-child]:flex-1" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          <DmUndecryptableRun count={messages.length} />
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 border-b border-r border-current ${expanded ? 'rotate-[225deg]' : 'rotate-45'}`} />
        </button>
      )}
      {(!grouped || expanded) && (
        <ul className="space-y-1">
          {messages.map(message => (
            <li key={message._id} className="flex items-center gap-3 py-2 text-xs text-zinc-400">
              <Lock aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block">{t('messages.cannotDecrypt')}</span>
                <span id={`${descriptionId}-${message._id}`}>
                  {message.sender?.displayName || message.sender?.username}{' '}
                  <time dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleString(i18n.resolvedLanguage, { dateStyle: 'short', timeStyle: 'medium' })}
                  </time>
                </span>
              </span>
              <button type="button" className="px-2 py-3 text-zinc-300" aria-describedby={`${descriptionId}-${message._id}`} onClick={() => onDelete(message)}>
                {t('copy.e2d0a54968ea', { defaultValue: 'Delete' })}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
