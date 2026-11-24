import React from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, UserX } from 'lucide-react';
import Mic from '@/components/ui/cut-icons/mic';
import MicOff from '@/components/ui/cut-icons/mic-off';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { CallModAction } from '@/lib/api/dehub/group-call-moderation';

/**
 * The chat's moderators get this on a person in a group call: mute or unmute
 * them for everyone, or remove them from the call.
 */
export function CallModMenu({ name, modMuted, onModerate, className }: {
  name: string;
  modMuted: boolean;
  onModerate: (action: CallModAction) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={className ?? 'call-mod'}
          aria-label={t('calls.modMenu', { name, defaultValue: 'Moderate {{name}}' })}
          onClick={event => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[140] min-w-[13rem]">
        <DropdownMenuItem className="gap-2.5 rounded-xl px-3 py-2.5 font-semibold" onSelect={() => onModerate(modMuted ? 'unmute' : 'mute')}>
          {modMuted ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          <span>{modMuted ? t('calls.modUnmute', { name, defaultValue: 'Unmute {{name}}' }) : t('calls.modMute', { name, defaultValue: 'Mute {{name}}' })}</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2.5 rounded-xl px-3 py-2.5 font-semibold text-red-400 focus:text-red-300" onSelect={() => onModerate('remove')}>
          <UserX className="h-4 w-4" />
          <span>{t('calls.modRemove', 'Remove from call')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
