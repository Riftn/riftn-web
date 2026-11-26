import { tokenLabel } from '@/lib/token-label';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import Send from '@/components/ui/cut-icons/send';
import User from '@/components/ui/cut-icons/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { DhbCoin } from '@/components/app/DhbAmount';
import { APP_TOKENS_QUERY_KEY, useAppTokens } from '@/hooks/use-app-tokens';
import {
  findAppTokenRecipient, newAppTokenKey, sendAppTokens,
  type AppTokenEntry, type AppTokenPerson,
} from '@/lib/api/dehub/app-tokens';
import dehubCoin from '@/assets/dehub-coin.png';

/**
 * App tokens in the wallet: DHB held on Riftn, not on a chain. The row opens
 * the balance and its history; Send moves app tokens to another account and
 * never touches a chain.
 */

const fmt = (amount: string | number) =>
  Number(amount).toLocaleString(undefined, { maximumFractionDigits: 6 });

function personName(p?: AppTokenPerson) {
  if (!p) return '';
  return p.username ? `@${p.username}` : `${p.address.slice(0, 6)}…${p.address.slice(-4)}`;
}

function EntryRow({ entry }: { entry: AppTokenEntry }) {
  const { t } = useTranslation();
  const who = personName(entry.counterparty);
  const label = {
    opening: t('appTokens.kindOpening'),
    send: t('appTokens.kindSent', { name: who }),
    receive: t('appTokens.kindReceived', { name: who }),
    spend: t('appTokens.kindSpent'),
    refund: t('appTokens.kindRefund'),
    deposit: t('appTokens.kindDeposit'),
    adjust: t('appTokens.kindAdjust'),
    stake: t('appTokens.kindStaked', 'Staked'),
    unstake: t('appTokens.kindUnstaked', 'Unstaked'),
  }[entry.kind];
  const positive = !entry.amount.startsWith('-');
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-white truncate">{label}</p>
        <p className="text-xs text-zinc-500 truncate">
          {new Date(entry.at).toLocaleString()}{entry.note ? ` · ${entry.note}` : ''}
        </p>
      </div>
      <span className={`shrink-0 text-sm font-medium ${positive ? 'text-emerald-400' : 'text-white'}`}>
        {positive ? '+' : '−'}{fmt(entry.amount.replace('-', ''))} <DhbCoin />
      </span>
    </div>
  );
}

/** The DHB row at the top of the wallet list, plus its drawer. */
export function AppTokensRow({ onSend }: { onSend: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = useAppTokens();
  const label = data?.symbol === 'RIFT' ? '$RIFT' : tokenLabel();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-900/60 transition-colors text-left"
      >
        <img src={dehubCoin} alt="" className="w-9 h-9 rounded-full shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white capitalize">{label}</p>
          <p className="text-xs text-zinc-500 truncate">{t('appTokens.rowHint')}</p>
        </div>
        <span className="text-sm font-medium text-white">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-zinc-500" /> : fmt(data?.balance ?? 0)}
        </span>
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent data-wallet-page className="bg-zinc-950 border-zinc-800">
          <DrawerHeader>
            <DrawerTitle className="text-white">{data?.symbol === 'RIFT' ? '$RIFT' : t('appTokens.title')}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <p className="text-2xl font-bold text-white">{fmt(data?.balance ?? 0)} <DhbCoin /></p>
              {Number(data?.staked) > 0 && (
                <p className="mt-2 text-sm text-zinc-400">{t('appTokens.stakedBalance', { amount: fmt(data?.staked ?? 0), defaultValue: '{{amount}} staked' })}</p>
              )}
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">{t('appTokens.explainer')}</p>
            </div>
            <Button variant="glass" className="w-full h-11 rounded-xl gap-2" onClick={() => { setOpen(false); onSend(); }}>
              <Send className="w-4 h-4" />
              {t('wallet.send')}
            </Button>
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">{t('appTokens.history')}</p>
              {data?.entries?.length ? (
                <div className="divide-y divide-white/5">
                  {data.entries.map((e, i) => <EntryRow key={`${e.at}-${i}`} entry={e} />)}
                </div>
              ) : (
                <p className="py-4 text-sm text-zinc-500">{t('appTokens.noHistory')}</p>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/** Send app tokens to a username or address. Nothing goes on chain. */
export function AppTokenSendDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useAppTokens(open);
  const { walletAddress } = useAuth();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [recipient, setRecipient] = useState<AppTokenPerson | null>(null);
  const [looking, setLooking] = useState(false);
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<'details' | 'review' | 'sent'>('details');
  const [receipt, setReceipt] = useState<{ balance: string; to: AppTokenPerson; amount: string } | null>(null);
  const [sendError, setSendError] = useState('');
  const inFlight = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  const isMobile = useIsMobile();
  const reducedMotion = useReducedMotion();
  // One key per attempt: kept across a retry of the same send, replaced once it lands.
  const keyRef = useRef(newAppTokenKey());

  const balance = Number(data?.balance ?? 0);
  const value = Number(amount);
  const tooMuch = value > balance;
  const canSend = !!recipient && !looking && /^\d+(\.\d{1,6})?$/.test(amount) && value >= 1 && !tooMuch;
  const remaining = (Math.round(balance * 1_000_000) - Math.round(value * 1_000_000)) / 1_000_000;
  const tokenSymbol = data?.symbol === 'RIFT' ? 'RIFT' : tokenLabel();
  const stepTitle = step === 'review' ? t('appTokens.reviewTransfer', 'Review transfer')
    : step === 'sent' ? t('appTokens.transferComplete', 'Transfer complete')
    : t('appTokens.sendTitle');

  useEffect(() => {
    setRecipient(null);
    setLooking(false);
    const text = to.trim();
    if (text.length < 2) return;
    let cancelled = false;
    setLooking(true);
    const timer = setTimeout(async () => {
      try {
        const found = await findAppTokenRecipient(text);
        if (!cancelled) setRecipient(found);
      } catch {
        if (!cancelled) setRecipient(null);
      } finally {
        if (!cancelled) setLooking(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [to]);

  // A changed send is a new send, so it gets a new key.
  useEffect(() => { keyRef.current = newAppTokenKey(); }, [to, amount, note]);

  useEffect(() => {
    if (open && step !== 'details') title.current?.focus();
  }, [open, step]);

  const close = () => {
    if (inFlight.current) return;
    setStep('details');
    setReceipt(null);
    setSendError('');
    onOpenChange(false);
  };

  const send = async () => {
    if (!recipient || inFlight.current || step !== 'review') return;
    inFlight.current = true;
    setSending(true);
    setSendError('');
    try {
      const result = await sendAppTokens({ to: recipient.address, amount, key: keyRef.current, purpose: 'transfer', note: note.trim() || undefined });
      setReceipt({ ...result, amount });
      setStep('sent');
      setTo('');
      setAmount('');
      setNote('');
      const queryKey = [APP_TOKENS_QUERY_KEY, walletAddress?.toLowerCase()];
      queryClient.setQueryData<typeof data>(queryKey, current => current ? { ...current, balance: result.balance } : current);
      void queryClient.invalidateQueries({ queryKey });
    } catch (err: any) {
      const code = err?.errorCode;
      setSendError(
        code === 'INSUFFICIENT' ? t('appTokens.errorInsufficient')
          : code === 'RATE_LIMIT' ? t('appTokens.errorRateLimit')
          : code === 'NO_RECIPIENT' ? t('appTokens.errorNoRecipient')
          : code === 'SELF' ? t('appTokens.errorSelf')
          : err?.message || t('appTokens.errorGeneric'),
      );
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  const body = (
    <div className="space-y-4 px-1">
      {step === 'details' && (
        <form className="space-y-4" onSubmit={event => {
          event.preventDefault();
          if (canSend) { setSendError(''); setStep('review'); }
        }}>
          <p className="text-xs leading-relaxed text-zinc-400">{t('appTokens.sendHint')}</p>

          <div className="space-y-2">
            <label className="text-sm text-zinc-400" htmlFor="app-token-to">{t('appTokens.to')}</label>
            <Input
              id="app-token-to"
              value={to}
              onChange={e => { setRecipient(null); setTo(e.target.value); }}
              placeholder={t('appTokens.toPlaceholder')}
              autoComplete="off"
              className="bg-white/5 border-white/10 text-white"
            />
            {looking ? (
              <p className="text-xs text-zinc-500 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />{t('appTokens.looking')}</p>
            ) : recipient ? (
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                {recipient.avatarImageUrl
                  ? <img src={recipient.avatarImageUrl} alt="" className="w-6 h-6 rounded" />
                  : <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center"><User className="w-3 h-3 text-zinc-400" /></div>}
                <span className="text-sm text-white truncate">{recipient.displayName || personName(recipient)}</span>
                {recipient.displayName && <span className="text-xs text-zinc-500 truncate">{personName(recipient)}</span>}
              </div>
            ) : to.trim().length >= 2 ? (
              <p className="text-xs text-zinc-500">{t('appTokens.errorNoRecipient')}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-zinc-400" htmlFor="app-token-amount">{t('appTokens.amount')}</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">{t('appTokens.available', { amount: fmt(balance) })}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setAmount(data?.balance ?? '0')}>{t('staking.max', 'Max')}</Button>
              </div>
            </div>
            <Input
              id="app-token-amount"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').replace(/(\.\d{6})\d+$/, '$1'))}
              placeholder="0"
              className="bg-white/5 border-white/10 text-white"
            />
            {tooMuch && <p className="text-xs text-red-400">{t('appTokens.errorInsufficient')}</p>}
            {value > 0 && value < 1 && <p className="text-xs text-zinc-400">{t('appTokens.minimumTransfer', 'Minimum transfer is 1 RIFT.')}</p>}
          </div>

          <details open={note ? true : undefined}>
            <summary className="cursor-pointer text-sm text-zinc-400">{t('appTokens.addNote', 'Add a note')}</summary>
            <Input
              value={note}
            maxLength={140}
            onChange={e => setNote(e.target.value)}
              aria-label={t('appTokens.notePlaceholder')}
              placeholder={t('appTokens.notePlaceholder')}
              className="mt-2 bg-white/5 border-white/10 text-white"
            />
          </details>

          <Button type="submit" variant="glass" className="w-full h-12 rounded-xl" disabled={!canSend}>
            {t('appTokens.reviewTransfer', 'Review transfer')}
          </Button>
        </form>
      )}

      {step === 'review' && recipient && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            {recipient.avatarImageUrl && <img src={recipient.avatarImageUrl} alt="" className="mx-auto mb-2 h-10 w-10 rounded-full object-cover" />}
            <p className="text-3xl font-semibold tabular-nums">{fmt(amount)} <span className="text-lg">{tokenSymbol}</span></p>
            <p className="mt-1 break-words text-sm text-zinc-400">{recipient.displayName || personName(recipient)}{recipient.displayName && recipient.username ? ' · ' + personName(recipient) : ''}</p>
          </div>
          {note.trim() && <p className="break-words text-sm text-zinc-400">{note.trim()}</p>}
          <p className="text-sm text-zinc-400">{t('appTokens.balanceAfterSend', { amount: fmt(remaining), symbol: tokenSymbol, defaultValue: 'After sending: {{amount}} {{symbol}}' })}</p>
          {sendError && <p role="alert" className="text-sm text-red-400">{sendError}</p>}
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button variant="ghost" className="h-12" disabled={sending} onClick={() => setStep('details')}>{t('common.edit', 'Edit')}</Button>
            <Button variant="glass" className="h-12 rounded-xl" disabled={sending} onClick={() => void send()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-label={t('wallet.sending')} /> : t('appTokens.sendButton')}
            </Button>
          </div>
        </div>
      )}

      {step === 'sent' && receipt && (
        <motion.div className="space-y-4 py-2 text-center" initial={reducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
          <motion.div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-emerald-400/25 bg-emerald-400/15 text-emerald-300"
            initial={reducedMotion ? false : { scale: 0.68 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 290, damping: 17 }}>
            <Check className="h-8 w-8" aria-hidden="true" />
          </motion.div>
          <div role="status">
            <p className="text-3xl font-semibold tabular-nums">{fmt(receipt.amount)} <span className="text-lg">{tokenSymbol}</span></p>
            <p className="mt-1 text-sm text-zinc-400">{t('appTokens.sent', { amount: fmt(receipt.amount), name: personName(receipt.to) })}</p>
          </div>
          <p className="text-sm text-zinc-400">{t('appTokens.available', { amount: fmt(receipt.balance) })}</p>
          <Button variant="glass" className="h-12 w-full rounded-xl" onClick={close}>{t('common.done', 'Done')}</Button>
        </motion.div>
      )}
    </div>
  );

  const onChange = (visible: boolean) => { if (!visible) close(); };
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onChange} dismissible={!sending}>
        <DrawerContent data-wallet-page className="max-h-[92dvh] border-white/10 bg-zinc-950">
          <DrawerHeader className="text-left">
            <DrawerTitle ref={title} tabIndex={-1} className="text-white">{stepTitle}</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onChange}>
      <DialogContent data-wallet-page className="bg-black/60 backdrop-blur-[24px] backdrop-saturate-[180%] border-white/10 sm:max-w-md">
        <DialogHeader><DialogTitle ref={title} tabIndex={-1} className="text-white">{stepTitle}</DialogTitle></DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
