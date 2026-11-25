/**
 * A post's edit history, on Post Info.
 *
 * One quiet line in the Content card ("Edited 3 times") that opens a sheet
 * where the reader steps through the versions: Original, each edit, and the
 * post as it reads now. Renders nothing for a post that was never edited.
 *
 * The server keeps the words an edit replaced from the day this shipped, so a
 * post edited before then has no history to show.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Switch } from '@/components/ui/switch';
import { getPostEditHistory, type PostVersion } from '@/lib/api/dehub';
import { formatPostAge, formatPostDate, parsePostTimestamp } from '@/i18n/post-timestamp';
import { diffWords } from '@/lib/post-edit-diff';

function Marked({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);
  return (
    <>
      {parts.map((part, index) =>
        part.type === 'same' ? (
          <span key={index}>{part.text}</span>
        ) : part.type === 'add' ? (
          <ins key={index} data-edit-added className="rounded-sm bg-emerald-500/25 underline decoration-emerald-500 decoration-2 underline-offset-2">{part.text}</ins>
        ) : (
          <del key={index} data-edit-removed className="line-through decoration-red-500 decoration-2 opacity-60">{part.text}</del>
        ),
      )}
    </>
  );
}

function versionLabel(t: ReturnType<typeof useTranslation>['t'], version: PostVersion, index: number) {
  if (version.current) return t('postEditHistory.now', { defaultValue: 'Now' });
  if (index === 0) return t('postEditHistory.original', { defaultValue: 'Original' });
  return t('postEditHistory.editN', { n: index, defaultValue: 'Edit {{n}}' });
}

/** The version stepper on its own, so the state gallery can show it without a network call. */
export function PostEditHistoryViewer({ versions }: { versions: PostVersion[] }) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState(Math.max(0, versions.length - 1));
  const [showChanges, setShowChanges] = useState(true);
  const index = Math.min(selected, versions.length - 1);
  const version = versions[index];
  const previous = index > 0 ? versions[index - 1] : null;
  if (!version) return null;

  const date = parsePostTimestamp(version.at);
  const when = date ? formatPostDate(date, i18n.language, { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const marks = showChanges && !!previous;

  return (
    <div data-post-edit-viewer>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
        {versions.map((item, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === index}
            data-active={i === index ? 'true' : undefined}
            onClick={() => setSelected(i)}
            className={`flex-none rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              i === index
                ? 'border-transparent bg-white text-black'
                : 'border-white/10 bg-transparent text-white/70 hover:bg-white/10'
            }`}
          >
            {versionLabel(t, item, i)}
          </button>
        ))}
      </div>

      <div className="mt-3 min-h-[140px] rounded-xl border border-white/10 bg-white/5 p-3">
        {when && <p className="mb-2 text-xs text-white/60">{when}</p>}
        {(version.name || (marks && previous?.name)) && (
          <p className="mb-1.5 break-words font-medium text-white">
            {marks ? <Marked before={previous!.name} after={version.name} /> : version.name}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words text-sm text-white/70">
          {marks ? <Marked before={previous!.description} after={version.description} /> : version.description}
        </p>
      </div>

      <label className="mt-3 flex items-center justify-between gap-3 text-sm text-white/70">
        <span>{t('postEditHistory.showChanges', { defaultValue: 'Show what changed' })}</span>
        <Switch checked={showChanges} onCheckedChange={setShowChanges} />
      </label>
    </div>
  );
}

export function PostEditHistoryDrawer({
  open,
  onOpenChange,
  versions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: PostVersion[];
}) {
  const { t, i18n } = useTranslation();
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        data-post-edit-history-drawer
        column
        className="bg-black/60 backdrop-blur-2xl backdrop-saturate-[180%] border border-white/10 border-b-0 p-0 gap-0 rounded-t-2xl overflow-hidden z-[200] flex flex-col max-h-[80dvh]"
      >
        <DrawerHeader className="px-5 pt-4 pb-3 shrink-0">
          <DrawerTitle className="text-base font-medium text-white text-center">
            {t('postEditHistory.title', { defaultValue: 'Edit history' })}
          </DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
          {open && <PostEditHistoryViewer versions={versions} />}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** The line itself, without the fetch. */
export function PostEditHistoryLineView({ editCount, versions }: { editCount: number; versions: PostVersion[] }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const lastEdit = parsePostTimestamp(versions[versions.length - 1]?.at);
  if (editCount < 1 || versions.length < 2) return null;
  return (
    <>
      <button
        type="button"
        data-post-edit-history-line
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2.5 text-left text-sm text-white hover:bg-white/10 transition-colors"
      >
        <span className="font-medium">{t('postEditHistory.edited', { count: editCount, defaultValue: 'Edited {{count}} times' })}</span>
        <span className="flex min-w-0 items-center gap-1 text-white/60">
          {lastEdit && (
            <span className="truncate">
              {t('postEditHistory.lastEdit', { time: formatPostAge(lastEdit, i18n.language, t), defaultValue: 'Last edit {{time}}' })}
            </span>
          )}
          <ChevronRight className="h-4 w-4 shrink-0" />
        </span>
      </button>
      <PostEditHistoryDrawer open={open} onOpenChange={setOpen} versions={versions} />
    </>
  );
}

export function PostEditHistoryLine({ tokenId }: { tokenId: string | number }) {
  const { data } = useQuery({
    queryKey: ['post-edit-history', String(tokenId)],
    queryFn: () => getPostEditHistory(tokenId),
    staleTime: 1000 * 30,
  });
  if (!data) return null;
  return <PostEditHistoryLineView editCount={data.editCount} versions={data.versions} />;
}
