import { Bold, Italic, Underline } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type ReactElement, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { POST_TEXT_STYLES, type PostTextStyle } from '@/lib/post-text-format';

export function postStyleShortcut(event: KeyboardEvent): PostTextStyle | undefined {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.nativeEvent.isComposing) return;
  return POST_TEXT_STYLES.find(style => style === event.key.toLowerCase());
}

type TextField = HTMLDivElement | HTMLTextAreaElement;

function captureSelection(field: TextField) {
  if (field instanceof HTMLTextAreaElement) {
    const { selectionStart, selectionEnd, selectionDirection } = field;
    return {
      hasSelection: selectionStart !== selectionEnd,
      restore: () => field.setSelectionRange(selectionStart, selectionEnd, selectionDirection),
    };
  }

  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
  const saved = range && field.contains(range.commonAncestorContainer) ? range.cloneRange() : undefined;
  return {
    hasSelection: !!saved && !saved.collapsed,
    restore: () => {
      if (!saved || !field.contains(saved.commonAncestorContainer)) return;
      selection?.removeAllRanges();
      selection?.addRange(saved);
    },
  };
}

export function PostTextContextMenu({ children, fieldRef, onFormat, onPasteText }: {
  children: ReactElement;
  fieldRef: RefObject<TextField | null>;
  onFormat: (style: PostTextStyle) => void;
  onPasteText?: (text: string) => void;
}) {
  const { t } = useTranslation();
  const savedSelection = useRef<ReturnType<typeof captureSelection> | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const formats = [
    { style: 'b', Icon: Bold, label: t('editor.textSelection.bold', { defaultValue: 'Bold' }) },
    { style: 'i', Icon: Italic, label: t('editor.textSelection.italic', { defaultValue: 'Italic' }) },
    { style: 'u', Icon: Underline, label: t('editor.textSelection.underline', { defaultValue: 'Underline' }) },
  ] as const;

  const focusField = (selection = savedSelection.current) => {
    const field = fieldRef.current;
    if (!field?.isConnected) return;
    field.focus({ preventScroll: true });
    selection?.restore();
    return field;
  };

  const run = (action: (field: TextField) => void) => {
    const field = focusField();
    if (field) action(field);
  };

  const paste = async () => {
    const field = fieldRef.current;
    if (!field) return;
    const selection = savedSelection.current;
    const before = field instanceof HTMLTextAreaElement ? field.value : field.textContent;
    try {
      const text = await navigator.clipboard.readText();
      if (!text || fieldRef.current !== field || savedSelection.current !== selection ||
          before !== (field instanceof HTMLTextAreaElement ? field.value : field.textContent) ||
          !focusField(selection)) return;
      if (onPasteText) {
        onPasteText(text);
      } else if (field instanceof HTMLTextAreaElement) {
        const available = field.maxLength - (field.value.length - (field.selectionEnd - field.selectionStart));
        if (available > 0) document.execCommand('insertText', false, text.slice(0, available));
      }
    } catch {
      toast.error(t('postComposer.clipboardReadFailed', { defaultValue: 'Could not read the clipboard. Use your paste shortcut.' }));
    }
  };

  return (
    <ContextMenu modal={false} onOpenChange={open => {
      if (!open || !fieldRef.current) return;
      savedSelection.current = captureSelection(fieldRef.current);
      setHasSelection(savedSelection.current.hasSelection);
    }}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent data-post-text-menu="" className="z-[200]" onCloseAutoFocus={event => {
        event.preventDefault();
        // The action may have already refocused the editor and changed its selection.
        if (fieldRef.current && document.activeElement === document.body) focusField();
      }}>
        {formats.map(({ style, Icon, label }) => (
          <ContextMenuItem key={style} className="gap-2" onSelect={() => run(() => onFormat(style))}>
            <Icon size={16} />{label}
          </ContextMenuItem>
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!hasSelection} onSelect={() => run(() => document.execCommand('cut'))}>
          {t('postComposer.cut', { defaultValue: 'Cut' })}
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasSelection} onSelect={() => run(() => document.execCommand('copy'))}>
          {t('postComposer.copy', { defaultValue: 'Copy' })}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void paste()}>
          {t('postComposer.paste', { defaultValue: 'Paste' })}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => run(field => {
          if (field instanceof HTMLTextAreaElement) {
            field.select();
          } else {
            window.getSelection()?.selectAllChildren(field);
          }
        })}>
          {t('postComposer.selectAll', { defaultValue: 'Select all' })}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
