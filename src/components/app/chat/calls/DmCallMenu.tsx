import { ChevronDown, Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import Video from '@/components/ui/cut-icons/video';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useCall } from '@/contexts/CallContext';
import { CHAT_MENU_CONTENT } from '../ChatOptionsMenu';

export function DmCallMenu({ recipientAddress }: { recipientAddress: string }) {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const { startCall, currentCall } = useCall();
  const label = t('comparison.f.calls', 'Voice and video calls');
  if (!walletAddress || walletAddress.toLowerCase() === recipientAddress.toLowerCase()) return null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={!!currentCall} aria-label={label} title={label}
          className="gap-1.5 rounded-lg bg-white/[0.06] px-2.5 text-zinc-200 hover:bg-white/[0.12] hover:text-white">
          <Phone aria-hidden="true" />
          <span className="hidden max-w-36 truncate xl:inline">{label}</span>
          <ChevronDown aria-hidden="true" className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-chat-options-menu className={CHAT_MENU_CONTENT}>
        <DropdownMenuItem disabled={!!currentCall} onSelect={() => { void startCall(recipientAddress, 'audio'); }}>
          <Phone aria-hidden="true" />{t('copy.8b968cce31a0', { defaultValue: 'Voice call' })}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!!currentCall} onSelect={() => { void startCall(recipientAddress, 'video'); }}>
          <Video aria-hidden="true" />{t('copy.7b79b4f67293', { defaultValue: 'Video call' })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
