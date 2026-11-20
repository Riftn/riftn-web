import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useDraftState } from '@/hooks/use-draft-state';
import { cn } from '@/lib/utils';

/** Character offset inside `root` under the pointer, for placing an edit caret. */
export function caretOffsetAt(root: HTMLElement, x: number, y: number): number | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let offset = 0;
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) { node = pos.offsetNode; offset = pos.offset; }
  else {
    const range = document.caretRangeFromPoint?.(x, y);
    if (range) { node = range.startContainer; offset = range.startOffset; }
  }
  if (!node || !root.contains(node)) return null;
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(node, offset);
  return before.toString().length;
}

/**
 * Click handler for your own words: opens the in-place edit with the caret
 * where you clicked. Links, buttons and a drag that selected text keep their
 * own behaviour.
 */
export function editOnClick(start: (caret: number | null) => void) {
  return (e: React.MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('a, button')) return;
    if (window.getSelection()?.toString()) return;
    e.stopPropagation();
    start(caretOffsetAt(e.currentTarget, e.clientX, e.clientY));
  };
}

interface InPlaceEditFieldProps {
  /** Draft key, so a half-typed edit survives a refresh. */
  draftKey: string;
  /** The words as they stand now. */
  text: string;
  /** Where the caret lands; null puts it at the end. */
  caret?: number | null;
  /** Saves the words; false (or a throw) keeps the field open for another go. */
  onSave: (text: string) => Promise<unknown> | unknown;
  /** The field closes. */
  onDone: () => void;
  maxLength?: number;
  /** Type size and colour, matching the line it replaces. */
  className?: string;
}

/**
 * The Requests page edit, for chat lines: the words themselves become the
 * field (same size, same place, no box), a pause in typing saves, and leaving
 * the field (click away, Enter, Esc) finishes. Emptied out, the saved words
 * come back.
 */
export function InPlaceEditField({ draftKey, text, caret = null, onSave, onDone, maxLength, className }: InPlaceEditFieldProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useDraftState(draftKey, text);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const lastSaved = useRef(text);
  const pending = useRef(false);
  const closeAfterSave = useRef(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef(caret);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => { setDraft.initialize(text); }, [text, setDraft]);

  const save = useCallback(async (): Promise<void> => {
    if (pending.current) return;
    const next = draftRef.current.trim();
    if (!next || next === lastSaved.current.trim()) {
      if (closeAfterSave.current) { closeAfterSave.current = false; setDraft.clear(); doneRef.current(); }
      return;
    }
    pending.current = true;
    let ok = false;
    try { ok = (await onSave(next)) !== false; } catch { ok = false; }
    finally { pending.current = false; }
    if (!ok) { closeAfterSave.current = false; return; }
    lastSaved.current = next;
    toast.success(t('chat.editSaved', 'Message updated'), { id: `chat-edit-${draftKey}` });
    // Typed more while that was saving: save the newer words too.
    if (draftRef.current.trim() !== next && draftRef.current.trim()) { void save(); return; }
    setDraft.clear();
    if (closeAfterSave.current) { closeAfterSave.current = false; doneRef.current(); }
  }, [draftKey, onSave, setDraft, t]);

  const finish = useCallback(() => {
    if (!draftRef.current.trim()) {
      // A message can't be blank, so put back what was saved.
      setDraft(lastSaved.current); setDraft.clear(); doneRef.current();
      return;
    }
    closeAfterSave.current = true;
    void save();
  }, [save, setDraft]);

  // Save a moment after the last keystroke.
  useEffect(() => {
    if (!draft.trim() || draft.trim() === lastSaved.current.trim()) return;
    const timer = window.setTimeout(() => { void save(); }, 1500);
    return () => window.clearTimeout(timer);
  }, [draft, save]);

  // The field grows with its words, so it sits exactly where the line was.
  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  // Land the caret where the words were clicked, or at the end.
  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const at = Math.min(caretRef.current ?? el.value.length, el.value.length);
    el.focus({ preventScroll: true });
    el.setSelectionRange(at, at);
  }, []);

  return (
    <textarea
      ref={fieldRef}
      data-in-place-edit
      data-no-navigate
      rows={1}
      value={draft}
      maxLength={maxLength}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={finish}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      aria-label={t('common.edit', 'Edit')}
      className={cn(
        'block w-full resize-none overflow-hidden bg-transparent border-0 p-0 m-0 shadow-none outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 break-words caret-white',
        className,
      )}
      onKeyDown={(e) => {
        e.stopPropagation();
        // An IME confirms its candidate with Enter; that keystroke is the
        // composition ending, not the edit being finished.
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
