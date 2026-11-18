import { describe, expect, it } from 'vitest';
import { LINKABLE_PAGE_ROWS, appPageRow } from '@/components/app/navigation/app-page-rows';
import { appPageFor } from '@/lib/app-page-paths';
import { parseDehubLink, mentionLinkFor } from '@/lib/dehub-links';

describe('linkable pages', () => {
  it('cards every menu and search-only page as itself', () => {
    for (const item of LINKABLE_PAGE_ROWS) {
      expect(appPageFor(item.path), item.path).not.toBeNull();
      const link = parseDehubLink(mentionLinkFor.page(item.path));
      expect(link?.kind, item.path).toBe('page');
      expect(appPageRow(link!.pagePath!)?.path, item.path).toBe(item.path);
    }
  });

  it('cards an item as the page it sits on', () => {
    expect(appPageRow('/packs/starter')?.path).toBe('/packs');
    expect(appPageRow('/arcade/kings-gambit')?.label).toBe("King's Gambit");
    expect(appPageRow('/arcade/not-listed')?.path).toBe('/arcade');
  });

  it('types links to the live site', () => {
    expect(mentionLinkFor.community('builders')).toBe('https://riftn.com/app/communities/builders');
    expect(mentionLinkFor.page('/app/leaderboard')).toBe('https://riftn.com/app/leaderboard');
  });
});
