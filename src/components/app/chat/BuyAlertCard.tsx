import { useTranslation as _useCopy } from 'react-i18next';
import { tokenLabel } from '@/lib/token-label';
/**
 * Shared Buy Alert Card
 * Renders a buy bot alert message card used across community chat, public chat, and sidebar.
 */

import { useState } from 'react';
import { Minus } from 'lucide-react';
import { formatTimeAgo } from '@/lib/feed-utils';
import dehubCoin from '@/assets/dehub-coin.png';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';

export interface BuyAlertData {
  ethSpent: number;
  ethUsd: number;
  dhbAmount: number;
  dhbUsd: number;
  buyerAddress: string;
  shortBuyer: string;
  txHash: string;
  newBalance: number;
  balanceChangePct: number;
  priceUsd: number;
  marketCapUsd: number | null;
  /** Set by the per-group bot; older DHB-only alerts leave these out. */
  symbol?: string;
  chainId?: string;
  tokenAddress?: string;
  amount?: number;
  usd?: number;
}

/** Block explorer per DexScreener chain id. */
const EXPLORERS: Record<string, string> = {
  base: 'https://basescan.org',
  ethereum: 'https://etherscan.io',
  bsc: 'https://bscscan.com',
  arbitrum: 'https://arbiscan.io',
  polygon: 'https://polygonscan.com',
  optimism: 'https://optimistic.etherscan.io',
  avalanche: 'https://snowtrace.io',
};

export function buyAlertExplorer(chainId: string | undefined): string {
  return EXPLORERS[(chainId || 'base').toLowerCase()] ?? EXPLORERS.base;
}

/** True for the platform token's alerts (old rows carry no symbol). */
export function isDhbBuyAlert(content: string): boolean {
  try {
    const symbol = (JSON.parse(content) as BuyAlertData)?.symbol;
    return !symbol || symbol.toUpperCase() === 'DHB';
  } catch {
    return false;
  }
}

export function fmtPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0';
  if (n >= 1) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;
  // Keep about four significant digits for tiny prices.
  const digits = Math.min(12, Math.max(2, 3 - Math.floor(Math.log10(n))));
  return `$${n.toFixed(digits)}`;
}

export function fmt(n: number, decimals = 2): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${n.toFixed(decimals)}`;
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${Math.round(n).toLocaleString('en-US')}`;
  return n.toFixed(2);
}

interface BuyAlertCardProps {
  content: string;
  timestamp: string;
  onHide?: () => void;
}

export function BuyAlertCard({ content, timestamp, onHide }: BuyAlertCardProps) {
  const { t: _copy } = _useCopy();
  const [confirming, setConfirming] = useState(false);

  let data: BuyAlertData | null = null;
  try { data = JSON.parse(content); } catch { return null; }
  if (!data) return null;

  const explorer = buyAlertExplorer(data.chainId);
  const basescanUrl = `${explorer}/tx/${data.txHash}`;
  const buyerUrl = `${explorer}/address/${data.buyerAddress}`;
  const isDhb = !data.symbol || data.symbol.toUpperCase() === 'DHB';
  const amount = data.amount ?? data.dhbAmount ?? 0;
  const usd = data.usd ?? data.dhbUsd ?? 0;
  const symbol = data.symbol ?? 'DHB';

  return (
    <div className="my-1.5">
      <LiquidGlassBubble shimmer noBorder className="w-full !rounded-none [&>div]:!rounded-none [&>div]:before:!rounded-none [&>div]:after:!rounded-none [&>div]:!bg-gradient-to-tl [&>div]:!from-white/5 [&>div]:!via-white/10 [&>div]:!to-white/20">
        <div className="text-xs">
          {/* Confirmation overlay */}
          {confirming && (
            <div className="mb-2.5 p-2.5 rounded-lg bg-white/5 border border-white/10">
              <p className="text-zinc-300 text-[11px] leading-relaxed mb-2">{_copy("copy.60e7431f98a2", { defaultValue: "Are you sure you want to hide all past and future buy bot messages?" })}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onHide?.();
                    setConfirming(false);
                  }}
                  className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium transition-colors"
                >{_copy("copy.eebdd24a77d9", { defaultValue: "Confirm" })}</button>
                <button
                  onClick={() => setConfirming(false)}
                  className="px-3 py-1 rounded-md bg-white/5 hover:bg-white/10 text-zinc-400 text-[11px] font-medium transition-colors"
                >{_copy("copy.19766ed6ccb2", { defaultValue: "Cancel" })}</button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              {isDhb ? (
                <img src={dehubCoin} alt={tokenLabel()} className="w-5 h-5" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-white/15 text-white text-[10px] font-bold flex items-center justify-center">
                  {symbol.slice(0, 1)}
                </span>
              )}
              <span className="font-bold text-white text-sm tracking-wide">
                {isDhb
                  ? _copy("copy.15d586130914", { defaultValue: "{{value1}} BUY", value1: fmtTokens(amount) })
                  : _copy("chat.buyAlert.title", { defaultValue: "{{amount}} ${{symbol}} BUY", amount: fmtTokens(amount), symbol })}
              </span>
            </div>
            {onHide && !confirming && (
              <button
                onClick={() => setConfirming(true)}
                className="p-0.5 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-300 transition-colors"
                title={_copy("copy.9df4802820a6", { defaultValue: "Hide buy bot alerts" })}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">💸</span>
              <span className="text-zinc-400">{_copy("copy.f541afdb3850", { defaultValue: "Spent:" })}</span>
              <span className="text-white font-semibold">
                {data.ethSpent > 0
                  ? `${data.ethSpent.toFixed(4)} ETH`
                  : fmt(usd)}
                {data.ethUsd > 0 && data.ethSpent > 0 && (
                  <span className="text-zinc-400 font-normal ml-1">({fmt(data.ethUsd)})</span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-sm">🟢</span>
              <span className="text-zinc-400">{_copy("copy.ead0a1f8a3d5", { defaultValue: "Buyer:" })}</span>
              <span className="flex items-center gap-1.5">
                <a href={buyerUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 font-mono">
                  {data.shortBuyer}
                </a>
                <span className="text-zinc-600">|</span>
                <a href={basescanUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white underline">{_copy("copy.cf8e8ad4d277", { defaultValue: "Txn" })}</a>
              </span>
            </div>

            {data.newBalance > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-sm">🔼</span>
                <span className="text-zinc-400">{_copy("copy.e0351221d473", { defaultValue: "Balance:" })}</span>
                <span className="text-white font-semibold">
                  {fmtTokens(data.newBalance)}{' '}
                  {data.balanceChangePct > 0 && (
                    <span className="text-zinc-400 font-normal">
                      (+{data.balanceChangePct.toFixed(2)}%)
                    </span>
                  )}
                </span>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <span className="text-sm">💲</span>
              <span className="text-zinc-400">{_copy("copy.bfc89dd8228b", { defaultValue: "Price:" })}</span>
              <span className="text-white font-semibold">
                {fmtPrice(data.priceUsd)}
              </span>
            </div>

            {data.marketCapUsd != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-sm">📊</span>
                <span className="text-zinc-400">{_copy("copy.32acbd96e5cd", { defaultValue: "Market cap:" })}</span>
                <span className="text-white font-semibold">
                  {fmt(data.marketCapUsd, 0)}
                </span>
              </div>
            )}
          </div>

          {/* Timestamp bottom-right */}
          <div className="flex justify-end mt-2">
            <span className="text-zinc-500 text-[10px]">{formatTimeAgo(timestamp)}</span>
          </div>
        </div>
      </LiquidGlassBubble>
    </div>
  );
}
