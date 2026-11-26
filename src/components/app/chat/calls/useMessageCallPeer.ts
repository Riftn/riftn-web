import { useLocation, useNavigate } from 'react-router-dom';
import { openDmDock } from '@/hooks/use-dm-dock';
import type { PeerIdentity } from './CallChrome';

export function useMessageCallPeer() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (address: string, peer: PeerIdentity) => {
    if (!address) return;
    const username = peer.name.startsWith('@') ? peer.name.slice(1) : undefined;
    if (pathname === '/chat' || pathname === '/chat/') {
      navigate('/chat', { state: { openDmWith: address, username } });
      return;
    }
    openDmDock({ address, username, avatarUrl: peer.avatarUrl ?? undefined });
  };
}
