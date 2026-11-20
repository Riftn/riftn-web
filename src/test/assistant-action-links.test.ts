import { describe, expect, it } from 'vitest';
import { assistantActionIds, withoutAssistantActionLinks } from '@/lib/assistant-action-links';

const id = '6650f0c2a1b2c3d4e5f60718';

describe('assistant card links', () => {
  it('finds the card in a markdown link and takes it out of the text', () => {
    const reply = `I'll react ❤️ to 118 of Jules's posts.\n\n[Review and confirm](https://riftn.com/app/assistant?action=${id})`;
    expect(assistantActionIds(reply)).toEqual([id]);
    expect(withoutAssistantActionLinks(reply)).toBe("I'll react ❤️ to 118 of Jules's posts.");
  });

  it('finds a bare link too, and old /assistant paths', () => {
    expect(assistantActionIds(`go https://riftn.com/assistant?action=${id}`)).toEqual([id]);
  });

  it('hides a card link that is still streaming in', () => {
    expect(withoutAssistantActionLinks('Done soon.\n\n[Review and confirm](https://riftn.com/app/assis')).toBe('Done soon.');
  });

  it('leaves ordinary links alone', () => {
    const text = 'See [the blog](https://riftn.com/guides/x).';
    expect(assistantActionIds(text)).toEqual([]);
    expect(withoutAssistantActionLinks(text)).toBe(text);
  });

  it('draws a request draft as a card and keeps its board link', () => {
    const board = '[View request](/app/features?request=09349273-e205-471a-9cbf-a497dc7060d0)';
    const reply = `${board}\n\n[Review request draft](https://riftn.com/app/assistant?requestDraft=${id})`;
    expect(assistantActionIds(reply)).toEqual([id]);
    expect(withoutAssistantActionLinks(reply)).toBe(board);
  });
});
