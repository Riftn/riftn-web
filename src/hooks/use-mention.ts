/**
 * useMention Hook
 * ================
 * Handles @mention detection and dropdown state for text inputs.
 * Works with both contentEditable elements and regular textareas.
 */

import { startTransition, useState, useCallback, useRef } from 'react';
import type { MentionUser } from '@/components/app/mentions';
import { getEditorCaret, setEditorCaret } from '@/lib/editor-text';
import { fetchPeople, normalizeMentionQuery, warmMentionPeople } from '@/lib/mention-people';

interface UseMentionOptions {
  inputRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | HTMLDivElement | null>;
  onMentionInsert?: (user: MentionUser, newText: string) => void;
}

interface UseMentionReturn {
  // State
  isOpen: boolean;
  /** An @ has been typed here, so the list is likely a letter away: get it ready. */
  armed: boolean;
  query: string;
  position: { top: number; left: number };
  selectedIndex: number;
  
  // Actions
  handleInput: (text: string, cursorPosition?: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => boolean; // Returns true if event was handled
  handleSelect: (user: MentionUser) => void;
  handleClose: () => void;
  setSelectedIndex: (index: number) => void;
}

// Extract @mention query from text at cursor position
export function extractMentionQuery(text: string, cursorPos: number): { query: string; startIndex: number } | null {
  // Look backwards from cursor for @
  let startIndex = -1;
  
  for (let i = cursorPos - 1; i >= 0; i--) {
    const char = text[i];
    
    // Stop at whitespace or start of text
    if (/\s/.test(char)) {
      break;
    }
    
    // Found @
    if (char === '@') {
      startIndex = i;
      break;
    }
  }
  
  if (startIndex === -1) return null;
  
  // The @ has to start a word. One in the middle of a word is an email
  // address (name@example.com), not a tag.
  if (startIndex > 0 && !/\s/.test(text[startIndex - 1])) return null;
  
  // Extract query (characters after @)
  const query = text.substring(startIndex + 1, cursorPos);
  
  // Must have at least 1 character after @
  if (query.length < 1) return null;
  
  // Query shouldn't contain spaces
  if (/\s/.test(query)) return null;
  
  return { query, startIndex };
}

// True when `next` is `previous` with one run of characters taken out, which
// is what a backspace, a held backspace or a cut leaves behind. A composer
// that was emptied after sending and then typed into again is not a deletion,
// even though the new text is shorter than the last one seen.
export function isDeletion(previous: string, next: string): boolean {
  if (next.length >= previous.length) return false;
  let prefix = 0;
  while (prefix < next.length && previous[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) suffix++;
  return prefix + suffix === next.length;
}

// The list is a sheet with its own place on screen. It used to be a popover
// measured against the caret on every key and every scroll frame; the field
// stays for the callers that still pass it along.
const NO_POSITION = { top: 0, left: 0 };

export function useMention({ inputRef, onMentionInsert }: UseMentionOptions): UseMentionReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const mentionStartRef = useRef<number>(-1);
  const textRef = useRef<string>('');
  // Set while the person is deleting: the list stays shut until they type
  // a new character.
  const deletingRef = useRef(false);

  // Handle text input changes
  const handleInput = useCallback((text: string, cursorPosition?: number) => {
    const previous = textRef.current;
    textRef.current = text;
    // Somebody is writing: have their own people ready before the @, and
    // the list itself once there is one.
    if (text) warmMentionPeople();
    if (text.includes('@')) setArmed(true);
    
    // Deleting never opens the list, and shuts it if it was open. It comes
    // back with the next character typed. A repeat of the same text (some
    // phone keyboards send one) changes nothing.
    if (isDeletion(previous, text)) deletingRef.current = true;
    else if (text !== previous) deletingRef.current = false;
    
    if (deletingRef.current) {
      setIsOpen(false);
      setQuery('');
      mentionStartRef.current = -1;
      return;
    }
    
    // Get cursor position
    let cursorPos = cursorPosition;
    
    if (cursorPos === undefined) {
      const input = inputRef.current;
      if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
        cursorPos = input.selectionStart ?? text.length;
      } else if (input instanceof HTMLDivElement) {
        // Counted in post text (a 🔗 chip counts as its address), the same
        // text the query is read from.
        cursorPos = getEditorCaret(input) ?? undefined;
      }
    }
    
    if (cursorPos === undefined) {
      cursorPos = text.length;
    }
    
    // Check for @mention
    const mention = extractMentionQuery(text, cursorPos);
    
    if (mention) {
      // The list is opening: ask for its first answer now, while the sheet is
      // still being drawn, rather than after it is on screen.
      if (mentionStartRef.current === -1) {
        const first = normalizeMentionQuery(mention.query);
        if (first) void fetchPeople(first).catch(() => undefined);
      }
      mentionStartRef.current = mention.startIndex;
      // Not urgent next to the letter itself: the key shows in the box first,
      // then the list follows, instead of the key waiting on the list.
      startTransition(() => {
        setQuery(mention.query);
        setIsOpen(true);
        setSelectedIndex(0);
      });
    } else {
      setIsOpen(false);
      setQuery('');
      mentionStartRef.current = -1;
    }
  }, [inputRef]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
    if (!isOpen) return false;
    
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const maxIdx = Math.max(0, ((window as any).__mentionResults?.length ?? 5) - 1);
        setSelectedIndex(prev => Math.min(prev + 1, maxIdx));
        return true;
      }
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        return true;
        
      case 'Enter':
      case 'Tab':
        // Selection handled by parent through handleSelect
        // Return true to indicate we want to handle this
        return true;
        
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        return true;
        
      default:
        return false;
    }
  }, [isOpen]);

  // Handle user selection
  const handleSelect = useCallback((user: MentionUser) => {
    const text = textRef.current;
    const startIndex = mentionStartRef.current;
    
    if (startIndex === -1) return;
    
    // Get cursor position to find end of mention
    const input = inputRef.current;
    let cursorPos = text.length;
    
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      cursorPos = input.selectionStart ?? text.length;
    } else if (input instanceof HTMLDivElement) {
      cursorPos = getEditorCaret(input) ?? cursorPos;
    }
    
    // Build new text with @username inserted. A community or a page types its
    // link instead, which the sent message shows as a card.
    const before = text.substring(0, startIndex);
    const after = text.substring(cursorPos);
    const mention = `${user.insertText ?? `@${user.username}`} `;
    const newText = before + mention + after;
    
    // Call callback with new text
    if (onMentionInsert) {
      onMentionInsert(user, newText);
    }
    
    // Close dropdown
    setIsOpen(false);
    setQuery('');
    mentionStartRef.current = -1;
    
    // Focus input and set cursor after mention
    setTimeout(() => {
      if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
        input.focus();
        const newCursorPos = startIndex + mention.length;
        input.setSelectionRange(newCursorPos, newCursorPos);
      } else if (input instanceof HTMLDivElement) {
        input.focus();
        // For contentEditable, place cursor at end of inserted mention
        setEditorCaret(input, startIndex + mention.length);
      }
    }, 10);
  }, [inputRef, onMentionInsert]);

  // Handle close
  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    mentionStartRef.current = -1;
  }, []);

  return {
    isOpen,
    armed,
    query,
    position: NO_POSITION,
    selectedIndex,
    handleInput,
    handleKeyDown,
    handleSelect,
    handleClose,
    setSelectedIndex,
  };
}

export default useMention;
