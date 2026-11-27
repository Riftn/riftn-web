import { useTranslation as _useCopy } from 'react-i18next';
import React from 'react';
import { Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';

interface DmVoiceCallButtonProps {
  recipientAddress: string;
  className?: string;
}

export const DmVoiceCallButton: React.FC<DmVoiceCallButtonProps> = ({ recipientAddress, className }) => {
  const { t: _copy } = _useCopy();
  const { startCall, currentCall } = useCall();
  const { walletAddress } = useAuth();
  const label = _copy("copy.8b968cce31a0", { defaultValue: "Voice call" });

  const handleStartCall = () => {
    if (walletAddress && recipientAddress && walletAddress !== recipientAddress) {
      startCall(recipientAddress, 'audio');
    }
  };

  if (!walletAddress || walletAddress === recipientAddress) {
    return null;
  }

  return (
    <Button
      type="button"
      onClick={handleStartCall}
      disabled={!!currentCall}
      variant="ghost"
      size="icon"
      className={className}
      aria-label={label}
      title={label}
    >
      <Phone className="h-5 w-5" />
    </Button>
  );
};
