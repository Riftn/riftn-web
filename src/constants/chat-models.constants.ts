import { translateCopy as _translateCopy } from '@/i18n/copy';
/**
 * Chat AI Model Constants
 * ========================
 * Defines available chat AI models for the assistant.
 */

export interface ChatModelOption {
  id: string;
  name: string;
  description: string;
  emoji: string;
}

// Available chat models
export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  {
    id: 'auto',
    get name() { return _translateCopy("copy.0286249762f7", { defaultValue: "Auto" }); },
    get description() { return _translateCopy("copy.4a9fd15a895c", { defaultValue: "Riftn trained model" }); },
    emoji: '✨'
  },
  {
    id: 'gemini-3-flash',
    name: 'Gemini 3 Flash',
    get description() { return _translateCopy("copy.98f96a4d8578", { defaultValue: "Fast & free" }); },
    emoji: '⚡'
  },
  {
    id: 'gemini-3-pro',
    name: 'Gemini 3 Pro',
    get description() { return _translateCopy("copy.6157bb4bd99f", { defaultValue: "Best reasoning $$" }); },
    emoji: '💎'
  },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    get description() { return _translateCopy("copy.af4707aebdfa", { defaultValue: "OpenAI $" }); },
    emoji: '🧠'
  },
  {
    id: 'grok-4',
    name: 'Grok 4',
    get description() { return _translateCopy("copy.362058144c4a", { defaultValue: "xAI flagship $$$" }); },
    emoji: '🔮'
  }
];

/** Picks saved before the Gemini 3 update open as their new versions. */
const CHAT_MODEL_RENAMES: Record<string, string> = { 'gemini-2.5-flash': 'gemini-3-flash', 'gemini-2.5-pro': 'gemini-3-pro' };

// Helper to get model by ID
export function getChatModelById(id: string): ChatModelOption | undefined {
  const next = CHAT_MODEL_RENAMES[id] ?? id;
  return CHAT_MODEL_OPTIONS.find(m => m.id === next);
}

/** A saved pick as today's id ('auto' when it no longer exists). */
export function currentChatModel(id: string | null | undefined): string {
  return (id && getChatModelById(id)?.id) || DEFAULT_CHAT_MODEL;
}

// Default model - AUTO for smart selection
export const DEFAULT_CHAT_MODEL = 'auto';

export type ChatModelKey = typeof CHAT_MODEL_OPTIONS[number]['id'];
