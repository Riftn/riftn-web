import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { ensureFreshToken } from '@/lib/api/dehub/core';
import { Button } from '@/components/ui/button';

interface Connection { id: string; client_name: string; scopes: string[]; expires_at: number; kind?: string }
interface Pending { client_name: string; callback_origin: string; scopes: string[] }
const permissions: Record<string, { key: string; defaultValue: string }> = {
  'dehub:read': { key: 'accountConnect.read', defaultValue: 'Read your account, posts, notifications and Creator library' },
  'dehub:profile': { key: 'accountConnect.profile', defaultValue: 'Edit your profile, images and privacy settings' },
  'dehub:social': { key: 'accountConnect.social', defaultValue: 'Publish posts and comments, follow people and save bookmarks' },
  'dehub:generate': { key: 'accountConnect.generate', defaultValue: 'Generate media using your credits, confirmed payments or eligible free images' },
  'dehub:agents': { key: 'accountConnect.agents', defaultValue: 'Post, reply, react, repost, follow and edit profiles as the agents you own' },
  'dehub:moderation': { key: 'accountConnect.moderation', defaultValue: 'Read and manage the accounts you block or mute' },
};
export default function AccountConnection() {
  const { walletAddress } = useAuth();
  return <AccountConnectionPanel key={walletAddress || 'signed-out'} />;
}
function AccountConnectionPanel() {
  const { t } = useTranslation();
  const { user, walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const [query] = useSearchParams();
  const requestId = query.get('authorization');
  const [pending, setPending] = useState<Pending | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [loaded, setLoaded] = useState(false);
  async function call(route: string, body: object) {
    const token = await ensureFreshToken();
    const response = await fetch(`/mcp/oauth/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dehub-token': token, ...(walletAddress ? { 'x-wallet-address': walletAddress } : {}) }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error_description || data.error || t('accountConnect.failed'));
    return data;
  }
  useEffect(() => {
    if (!requestId) return;
    let active = true;
    fetch(`/mcp/oauth/request?id=${encodeURIComponent(requestId)}`).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error_description || t('accountConnect.failed'));
      if (active) setPending(data);
    }).catch(e => { if (active) setRequestError(e.message); });
    return () => { active = false; };
  }, [requestId, t]);
  // Existing connections are fetched only when the person opens this panel.
  async function loadConnections() {
    setBusy(true); setError('');
    try { const data = await call('connections', {}); setConnections((data.connections as Connection[]).filter(item => item.kind !== 'key')); setLoaded(true); }
    catch (e) { setError(e instanceof Error ? e.message : t('accountConnect.failed')); }
    finally { setBusy(false); }
  }
  async function decide(approve: boolean) {
    setBusy(true); setError('');
    try {
      const data = await call('approve', { request_id: requestId, approve });
      const target = new URL(data.redirect);
      if (!pending || target.protocol !== 'https:' || target.origin !== pending.callback_origin) throw new Error(t('accountConnect.failed'));
      window.location.assign(target.href);
    } catch (e) { setError(e instanceof Error ? e.message : t('accountConnect.failed')); setBusy(false); }
  }
  async function disconnect(id: string) {
    setBusy(true); setError('');
    try { await call('disconnect', { id }); setConnections(items => items.filter(item => item.id !== id)); }
    catch (e) { setError(e instanceof Error ? e.message : t('accountConnect.failed')); }
    finally { setBusy(false); }
  }

  if (requestId) {
    return (
      <section className="mx-auto max-w-lg rounded-2xl border border-white/15 bg-black/60 p-5 sm:p-6" aria-labelledby="connection-approval">
        <h1 id="connection-approval" className="text-2xl font-semibold">
          {t('accountConnect.approvalTitle', { defaultValue: 'Approve account access' })}
        </h1>
        {requestError ? (
          <>
            <p role="alert" className="mt-3 text-sm text-red-300">{requestError}</p>
            <Button asChild variant="outline" className="mt-4 min-h-11">
              <Link to="/connect/chatgpt">{t('accountConnect.startAgain', { defaultValue: 'Start again' })}</Link>
            </Button>
          </>
        ) : pending ? (
          <>
            <p className="mt-3 text-sm font-medium">{pending.client_name}</p>
            <p className="break-all text-sm text-white/70">{pending.callback_origin}</p>
            <ul className="my-4 list-disc space-y-1 pl-5 text-sm">
              {pending.scopes.map(scope => {
                const permission = permissions[scope];
                return <li key={scope}>{permission ? t(permission.key, { defaultValue: permission.defaultValue }) : scope}</li>;
              })}
            </ul>
            {isAuthenticated ? (
              <>
                <p className="mt-3 break-all text-sm">
                  {user?.displayName || user?.username || walletAddress}
                  {(user?.displayName || user?.username) && walletAddress && <span className="block text-white/70">{walletAddress}</span>}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button disabled={busy} className="min-h-11 bg-white text-black hover:bg-white/90" onClick={() => decide(true)}>
                    {t('accountConnect.allow', { defaultValue: 'Allow connection' })}
                  </Button>
                  <Button variant="outline" disabled={busy} className="min-h-11" onClick={() => decide(false)}>
                    {t('accountConnect.deny', { defaultValue: 'Cancel' })}
                  </Button>
                </div>
              </>
            ) : (
              <Button className="min-h-11 bg-white text-black hover:bg-white/90" onClick={() => openLoginModal()}>
                {t('accountConnect.signIn', { defaultValue: 'Sign in to Riftn' })}
              </Button>
            )}
          </>
        ) : (
          <p role="status" className="mt-3 text-sm text-white/70">
            {t('accountConnect.loadingRequest', { defaultValue: 'Checking the connection request…' })}
          </p>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      </section>
    );
  }

  return <section className="mt-8 rounded-2xl border border-white/15 bg-white/[0.03] p-5" aria-labelledby="linked-apps">
    <h2 id="linked-apps" className="text-xl font-semibold">{t('connectGuide.manageTitle', { defaultValue: 'Your linked apps' })}</h2>
    <p className="mt-2 text-sm text-white/70">{t('connectGuide.manageBody', { defaultValue: 'Linked apps stay connected while you use them and disconnect after 30 days unused. You can see or disconnect them at any time.' })}</p>
    {!isAuthenticated ? <Button variant="outline" className="mt-4 min-h-11" onClick={() => openLoginModal()}>{t('accountConnect.signIn', { defaultValue: 'Sign in to Riftn' })}</Button> : <>
      <Button className="mt-4 min-h-11" variant="outline" disabled={busy} onClick={loadConnections}>{t('accountConnect.manage', { defaultValue: 'Manage account connections' })}</Button>
      {loaded && <div className="mt-4 space-y-3">{connections.length === 0 ? <p className="text-sm text-white/60">{t('accountConnect.empty')}</p> : connections.map(connection => <div key={connection.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3"><div><p>{connection.client_name}</p><p className="text-xs text-white/60">{new Date(connection.expires_at).toLocaleString()}</p></div><Button variant="outline" disabled={busy} onClick={() => disconnect(connection.id)}>{t('accountConnect.disconnect')}</Button></div>)}</div>}
    </>}
    {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
  </section>;
}
