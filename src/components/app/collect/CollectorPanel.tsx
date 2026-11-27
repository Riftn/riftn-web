import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Download, FileText, Gavel, Image as ImageIcon, Loader2, Lock, Music, Paperclip, Trash2, Unlock, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  bpsLabel,
  fetchAuctionForNft,
  fetchUnlockable,
  removeUnlockableFile,
  saveUnlockableText,
  uploadUnlockableFile,
  type Unlockable,
  type UnlockableFile,
} from '@/lib/api/dehub/collect';
import { useEdition } from '@/hooks/use-edition';
import { formatCount } from '@/lib/format-count';
import { cn } from '@/lib/utils';

const KIND_ICON = { image: ImageIcon, video: Video, audio: Music, file: FileText } as const;

const fileSize = (bytes: number) =>
  bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;

interface CollectorPanelProps {
  tokenId: string | number;
  chainId: number;
  /** Collection the post was minted into; shows a live auction when there is one. */
  contract?: string | null;
  /** Override for the state gallery. */
  preview?: { unlockable: Unlockable; supply: number; royaltyBps: number };
}

/**
 * The collector side of a minted post: how many copies exist, what resales pay
 * the creator, and the extras only owners can open (files and a note). The
 * creator manages the extras here too.
 */
export function CollectorPanel({ tokenId, chainId, contract, preview }: CollectorPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const edition = useEdition(preview ? null : tokenId);
  const unlockQuery = useQuery({
    queryKey: ['unlockable', String(tokenId)],
    queryFn: () => fetchUnlockable(tokenId),
    enabled: !preview,
    staleTime: 30 * 60_000,
  });
  const auctionQuery = useQuery({
    queryKey: ['auction-for-nft', chainId, contract, String(tokenId)],
    queryFn: () => fetchAuctionForNft(chainId, contract!, String(tokenId)),
    enabled: !preview && !!contract,
    staleTime: 30_000,
  });

  const data = preview?.unlockable ?? unlockQuery.data;
  const supply = preview?.supply ?? edition.data?.supply;
  const royaltyBps = preview?.royaltyBps ?? edition.data?.royaltyBps ?? 0;
  const auction = auctionQuery.data?.auction;

  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const setData = (next: Unlockable) => {
    queryClient.setQueryData(['unlockable', String(tokenId)], next);
    queryClient.invalidateQueries({ queryKey: ['edition', String(tokenId)] });
  };

  const saveText = async () => {
    if (draft == null) return;
    setSaving(true);
    try {
      setData(await saveUnlockableText(tokenId, draft));
      setDraft(null);
      toast.success(t('collect.extrasSaved', { defaultValue: 'Saved for owners' }));
    } catch (e) {
      toast.error((e as Error)?.message || t('collect.saveFailed', { defaultValue: 'Could not save' }));
    } finally {
      setSaving(false);
    }
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (file.size > 100_000_000) {
        toast.error(t('collect.fileTooBig', { defaultValue: '{{name}} is over 100 MB', name: file.name }));
        continue;
      }
      setUploading(0);
      try {
        setData(await uploadUnlockableFile(tokenId, file, (p) => setUploading(p)));
      } catch (e) {
        toast.error((e as Error)?.message || t('collect.uploadFailed', { defaultValue: 'Upload failed' }));
      }
    }
    setUploading(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const removeFile = async (file: UnlockableFile) => {
    try {
      setData(await removeUnlockableFile(tokenId, file.id));
    } catch (e) {
      toast.error((e as Error)?.message || t('collect.saveFailed', { defaultValue: 'Could not save' }));
    }
  };

  const isCreator = !!data?.isCreator;
  const showExtras = isCreator || !!data?.has;
  if (supply == null && !showExtras && !(auction && auction.status === 'live')) return null;

  return (
    <section className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-4" data-collector-panel>
      <div className="flex flex-wrap gap-2">
        {supply != null && (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-white" data-edition-pill>
            {supply === 1
              ? t('collect.oneOfOne', { defaultValue: '1 of 1' })
              : t('collect.copiesPill', { defaultValue: '{{copies}} copies', copies: formatCount(supply) })}
          </span>
        )}
        {royaltyBps > 0 && (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-white">
            {t('collect.royaltyPill', { defaultValue: '{{pct}} to the creator on resales', pct: bpsLabel(royaltyBps) })}
          </span>
        )}
        {data?.has && (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-400/15 text-amber-200 inline-flex items-center gap-1">
            <Lock className="w-3 h-3" />
            {t('collect.ownerExtrasPill', { defaultValue: 'Owner extras' })}
          </span>
        )}
      </div>

      {auction && auction.status === 'live' && (
        <Link
          to={`/fractions?tab=nfts&chain=${chainId}&contract=${(contract ?? "").toLowerCase()}&token=${tokenId}`}
          className="flex items-center gap-3 rounded-xl bg-white/10 hover:bg-white/15 px-3 py-2.5 transition-colors"
        >
          <Gavel className="w-5 h-5 text-white shrink-0" />
          <span className="flex-1 min-w-0 text-sm text-white">
            {t('collect.liveAuctionLink', { defaultValue: 'Live auction · {{bids}} bids', bids: formatCount(auction.bidCount ?? 0) })}
          </span>
          <span className="text-xs text-white/60">{t('collect.view', { defaultValue: 'View' })}</span>
        </Link>
      )}

      {showExtras && data && (
        <div className="border-t border-white/10 pt-4 space-y-3">
          <div className="flex items-center gap-2">
            {data.canOpen ? <Unlock className="w-4 h-4 text-white/70" /> : <Lock className="w-4 h-4 text-white/70" />}
            <h2 className="text-sm font-medium text-white/80">{t('collect.extrasTitle', { defaultValue: 'Only for owners' })}</h2>
          </div>

          {!data.canOpen && (
            <p className="text-sm text-white/60" data-locked-extras>
              {t('collect.lockedSummary', {
                defaultValue: 'Collect a copy to open {{what}}.',
                what: [
                  data.summary.files > 0 ? t('collect.nFiles', { defaultValue: '{{n}} files', n: formatCount(data.summary.files) }) : null,
                  data.summary.hasText ? t('collect.aNote', { defaultValue: 'a note from the creator' }) : null,
                ].filter(Boolean).join(' + '),
              })}
            </p>
          )}

          {data.canOpen && !isCreator && data.text && (
            <p className="text-sm text-white whitespace-pre-wrap rounded-lg bg-black/20 p-3">{data.text}</p>
          )}

          {isCreator && (
            <div>
              <textarea
                value={draft ?? data.text ?? ''}
                onChange={(e) => setDraft(e.target.value.slice(0, 5000))}
                rows={3}
                placeholder={t('collect.notePlaceholder', { defaultValue: 'A note, link or code only owners see' })}
                className="w-full box-border rounded-lg bg-black/30 border border-white/15 p-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/40"
              />
              {draft != null && draft !== (data.text ?? '') && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveText}
                  className="mt-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('collect.saveNote', { defaultValue: 'Save note' })}
                </button>
              )}
            </div>
          )}

          {data.canOpen && data.files.length > 0 && (
            <ul className="space-y-2">
              {data.files.map((f) => {
                const Icon = KIND_ICON[f.kind] ?? FileText;
                return (
                  <li key={f.id} className="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2">
                    {f.kind === 'image' && f.url ? (
                      <img src={f.url} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
                    ) : (
                      <span className="w-10 h-10 rounded-md bg-white/10 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-white/70" />
                      </span>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-white truncate">{f.name}</span>
                      <span className="block text-xs text-white/40">{fileSize(f.size)}</span>
                    </span>
                    {f.url && (
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={f.name}
                        className="p-2 text-white/70 hover:text-white"
                        aria-label={t('collect.download', { defaultValue: 'Download' })}
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                    {isCreator && (
                      <button
                        type="button"
                        onClick={() => removeFile(f)}
                        className="p-2 text-white/50 hover:text-red-300"
                        aria-label={t('collect.removeFile', { defaultValue: 'Remove file' })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {isCreator && data.files.length < 10 && (
            <>
              <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
              <button
                type="button"
                disabled={uploading != null}
                onClick={() => fileInput.current?.click()}
                className={cn(
                  'w-full rounded-lg border border-dashed border-white/20 px-3 py-3 text-sm text-white/70 hover:bg-white/5 inline-flex items-center justify-center gap-2',
                  uploading != null && 'opacity-70',
                )}
              >
                {uploading != null ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                {uploading != null
                  ? t('collect.uploading', { defaultValue: 'Uploading {{pct}}%', pct: Math.round(uploading) })
                  : t('collect.addFile', { defaultValue: 'Add a picture, video, song or any file (100 MB max)' })}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
