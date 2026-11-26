import { Bold, Italic, Underline } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { POST_TEXT_STYLES, type PostTextStyle } from '@/lib/post-text-format';

export function postStyleShortcut(event: KeyboardEvent): PostTextStyle | undefined {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.nativeEvent.isComposing) return;
  return POST_TEXT_STYLES.find(style => style === event.key.toLowerCase());
}

export function PostFormatButtons({ onFormat }: { onFormat: (style: PostTextStyle) => void }) {
  const { t } = useTranslation();
  const buttons = [
    { style: 'b', Icon: Bold, label: t('editor.textSelection.bold', { defaultValue: 'Bold' }) },
    { style: 'i', Icon: Italic, label: t('editor.textSelection.italic', { defaultValue: 'Italic' }) },
    { style: 'u', Icon: Underline, label: t('editor.textSelection.underline', { defaultValue: 'Underline' }) },
  ] as const;
  return (
    <div className="flex gap-1">
      {buttons.map(({ style, Icon, label }) => (
        <button key={style} type="button" title={label} aria-label={label}
          aria-keyshortcuts={'Control+' + style.toUpperCase() + ' Meta+' + style.toUpperCase()}
          className="grid size-9 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
          onMouseDown={event => event.preventDefault()} onClick={() => onFormat(style)}>
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
