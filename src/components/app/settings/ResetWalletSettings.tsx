/**
 * Settings → Account Security → Reset wallet.
 *
 * Moves the account on screen (username, posts, followers, messages) onto a
 * brand-new built-in wallet. For a wallet that was lost, or whose key someone
 * else now has, including accounts first made with an outside wallet such as
 * SafePal or MetaMask.
 *
 * Proof of who you are is the account's own email or Google sign-in, never a
 * signature from the old wallet: a leaked key signs just as well as its owner.
 * So the drawer first checks that this account has such a sign-in and that
 * this browser is signed in with it, and explains the next step when not.
 */
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { PasswordStrengthMeter } from '@/components/app/wallet-setup/PasswordStrengthMeter';
import { AuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getEmailLinkStatus } from '@/lib/api/dehub';
import { assessPassword, MIN_PASSWORD_LENGTH } from '@/lib/wallet-core/passwordStrength';
import { TWO_FACTOR_REQUIRED_CODE } from '@/lib/two-factor-login';

const inputClass = 'h-12 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl';

/** What stands between this person and a reset, worked out when the drawer opens. */
export type ResetWalletReadiness = 'checking' | 'ready' | 'no-login' | 'signed-in-with-wallet';
type Readiness = ResetWalletReadiness;

export function ResetWalletDrawer({ open, onOpenChange, preview }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** State gallery only: show one step without an account behind it. */
  preview?: Readiness | 'done';
}) {
  const { t } = useTranslation();
  // useContext, not useAuth: the state gallery renders this with no AuthProvider.
  const auth = useContext(AuthContext);
  const walletAddress = auth?.walletAddress ?? (preview ? '0x5c1f…8e2a' : null);
  const [readiness, setReadiness] = useState<Readiness>(preview && preview !== 'done' ? preview : 'checking');
  const [loginEmail, setLoginEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(preview === 'done');

  const reset = () => {
    setPassword(''); setConfirm(''); setAcknowledged(false); setTwoFactorCode('');
    setNeedsTwoFactor(false); setBusy(false); setError(null); setDone(false);
  };
  const close = (v: boolean) => { if (busy) return; if (!v) reset(); onOpenChange(v); };

  useEffect(() => {
    if (!open || preview) return;
    let cancelled = false;
    setReadiness('checking');
    (async () => {
      // The account's own email/Google sign-in is the only thing that can
      // vouch for a reset. `source` is null when the account has none.
      const status = await getEmailLinkStatus().catch(() => null);
      const { data } = await supabase.auth.getSession().catch(() => ({ data: null as any }));
      if (cancelled) return;
      setLoginEmail(status?.email ?? null);
      if (status && !status.source) { setReadiness('no-login'); return; }
      setReadiness(data?.session?.access_token ? 'ready' : 'signed-in-with-wallet');
    })();
    return () => { cancelled = true; };
  }, [open, preview]);

  const submit = useCallback(async () => {
    setError(null);
    if (password !== confirm) { setError(t('resetWallet.mismatch', "Passwords don't match")); return; }
    setBusy(true);
    try {
      const assessment = await assessPassword(password);
      if (!assessment.longEnough) throw new Error(t('resetWallet.tooShort', 'Password must be at least {{count}} characters', { count: MIN_PASSWORD_LENGTH }));
      if (assessment.breached === true) throw new Error(t('resetWallet.breached', 'This password has appeared in a data breach. Choose a different one'));
      if (!assessment.acceptable) throw new Error(t('resetWallet.weak', 'Choose a stronger password (mix letters, numbers and symbols)'));
      if (!auth) throw new Error(t('resetWallet.failed', 'Could not reset your wallet. Nothing was moved. Try again.'));
      await auth.resetWallet(password, needsTwoFactor ? twoFactorCode : undefined);
      setDone(true);
    } catch (err: any) {
      if (err?.code === TWO_FACTOR_REQUIRED_CODE) {
        setNeedsTwoFactor(true);
        setError(t('resetWallet.twoFactor', 'Enter the code from your authenticator app to move your account.'));
      } else if (err?.code === 'RESET_NEEDS_LOGIN') {
        setReadiness('signed-in-with-wallet');
      } else {
        setError(err instanceof Error && err.message ? err.message : t('resetWallet.failed', 'Could not reset your wallet. Nothing was moved. Try again.'));
      }
    } finally {
      setBusy(false);
    }
  }, [password, confirm, needsTwoFactor, twoFactorCode, auth, t]);

  const fundsWarning = (
    <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-white">
      <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
      <p>{t('resetWallet.funds', 'Tokens, NFTs and other balances do not move. They stay at the old address. If you can still open the old wallet, send them out first.')}</p>
    </div>
  );

  let body: JSX.Element;
  if (done) {
    body = (
      <div className="space-y-4 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-emerald-400" />
        </div>
        <p className="text-white text-sm font-medium">{t('resetWallet.doneTitle', 'Your account is on its new wallet')}</p>
        <p className="text-white/60 text-xs leading-relaxed">{t('resetWallet.doneBody', 'Your username, posts and followers came with it. The old wallet can no longer sign in. Back up the new wallet now from Back up wallet just below.')}</p>
        {walletAddress && <p className="text-white/40 text-xs font-mono break-all">{walletAddress}</p>}
        <Button onClick={() => close(false)} className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl">
          {t('resetWallet.close', 'Done')}
        </Button>
      </div>
    );
  } else if (readiness === 'checking') {
    body = <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-white/60" /></div>;
  } else if (readiness === 'no-login') {
    body = (
      <div className="space-y-4">
        <p className="text-white/70 text-sm leading-relaxed">{t('resetWallet.noLogin', 'A reset is proved with your account\'s email or Google sign-in, not the old wallet, because anyone holding the old key could sign too. This account has no sign-in email yet.')}</p>
        <ol className="list-decimal pl-5 space-y-1 text-white/60 text-sm">
          <li>{t('resetWallet.noLoginStep1', 'Add an email under Sign-in on this page.')}</li>
          <li>{t('resetWallet.noLoginStep2', 'Log out, then log in with that email.')}</li>
          <li>{t('resetWallet.noLoginStep3', 'Come back here and press Reset.')}</li>
        </ol>
        <Button
          onClick={() => { close(false); document.querySelector('[data-setting-anchor="sign-in"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >{t('resetWallet.goToSignIn', 'Add a sign-in email')}</Button>
      </div>
    );
  } else if (readiness === 'signed-in-with-wallet') {
    body = (
      <div className="space-y-4">
        <p className="text-white/70 text-sm leading-relaxed">
          {loginEmail
            ? t('resetWallet.relogin', 'To prove it is you, log out and log back in with your sign-in email ({{email}}) or Google, then come back here.', { email: loginEmail })
            : t('resetWallet.reloginNoEmail', 'To prove it is you, log out and log back in with your account\'s email or Google, then come back here.')}
        </p>
        <Button
          onClick={() => { close(false); void auth?.disconnect(); }}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >{t('resetWallet.logOut', 'Log out')}</Button>
      </div>
    );
  } else {
    body = (
      <form onSubmit={(e) => { e.preventDefault(); if (!busy) void submit(); }} className="space-y-4">
        <p className="text-white/70 text-sm leading-relaxed">{t('resetWallet.intro', 'Makes a new Riftn wallet and moves your username, posts, followers and messages onto it. Use this if your wallet is lost or someone else has its key. The old wallet stops working for sign-in.')}</p>
        {fundsWarning}
        <div className="space-y-2">
          <Input
            type="password"
            placeholder={t('resetWallet.password', 'New wallet password (min {{count}} chars)', { count: MIN_PASSWORD_LENGTH })}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
          <PasswordStrengthMeter password={password} />
        </div>
        <Input
          type="password"
          placeholder={t('resetWallet.confirm', 'Confirm password')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
          autoComplete="new-password"
        />
        {needsTwoFactor && (
          <Input
            inputMode="numeric"
            placeholder={t('resetWallet.twoFactorPlaceholder', 'Authenticator code')}
            value={twoFactorCode}
            onChange={(e) => setTwoFactorCode(e.target.value)}
            className={inputClass}
            autoFocus
          />
        )}
        <label className="flex items-start gap-2 text-xs text-white/70">
          <Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} disabled={busy} />
          {t('resetWallet.ack', 'I understand my old funds stay in the old wallet.')}
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button
          type="submit"
          disabled={busy || !password || !confirm || !acknowledged || (needsTwoFactor && !twoFactorCode.trim())}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          {busy
            ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t('resetWallet.working', 'Moving your account…')}</span>
            : t('resetWallet.submit', 'Reset wallet')}
        </Button>
      </form>
    );
  }

  return (
    <Drawer open={open} onOpenChange={close}>
      <DrawerContent column className="bg-black/95 border-white/10">
        <DrawerHeader>
          <DrawerTitle className="text-white text-center">{t('resetWallet.title', 'Reset wallet')}</DrawerTitle>
        </DrawerHeader>
        <div className="px-6 pb-8 space-y-4">{body}</div>
      </DrawerContent>
    </Drawer>
  );
}

export function ResetWalletSettings({ preview }: { preview?: Readiness | 'done' } = {}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!!preview);
  return (
    <>
      <SettingsRow
        icon={<RefreshCw />}
        title={t('resetWallet.title', 'Reset wallet')}
        description={t('resetWallet.rowDesc', 'Lost your wallet, or someone else has its key? Move your account to a new wallet. Your username, posts and followers come with you.')}
        action={<Button variant="outline" size="sm" className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl" onClick={() => setOpen(true)}>{t('resetWallet.rowButton', 'Reset')}</Button>}
      />
      <ResetWalletDrawer open={open} onOpenChange={setOpen} preview={preview} />
    </>
  );
}
