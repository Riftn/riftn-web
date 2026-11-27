import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Smile } from 'lucide-react';
import { EmojiPanel } from '@/components/app/emoji/EmojiPanel';

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  label: string;
  overVideo?: boolean;
}

export function EmojiPicker({ onEmojiSelect, label, overVideo }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          data-keep-dark={overVideo ? '' : undefined}
          className="h-8 w-8 shrink-0 text-current hover:text-current hover:bg-current/10"
        >
          <Smile className="w-5 h-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent collisionPadding={8}
        className="w-[calc(100vw-1rem)] sm:w-[22rem] p-0 overflow-hidden" align="end" side="top">
        <EmojiPanel
          onSelect={(emoji, { keepOpen }) => {
            onEmojiSelect(emoji);
            if (!keepOpen) setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
