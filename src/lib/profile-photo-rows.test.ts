import { describe, expect, it } from 'vitest';
import { profilePhotoRows } from './profile-photo-rows';

describe('profilePhotoRows', () => {
  it('uses equal, flat tracks on System even when the source shapes differ', () => {
    expect(profilePhotoRows([0.8, 1.6, 1, 2], false)).toEqual([
      { start: 0, count: 3, tracks: [1, 1, 1] },
      { start: 3, count: 1, tracks: [1, 1, 1] },
    ]);
  });

  it('adapts the tiles while keeping the original order and reserving the final tracks', () => {
    const ratios = [0.8, 1.6, undefined, 1 / 4, 5, Infinity];
    const rows = profilePhotoRows(ratios, true);
    expect(rows).toEqual([
      { start: 0, count: 2, tracks: [0.8, 1.6] },
      { start: 2, count: 3, tracks: [1, 2 / 3, 2] },
      { start: 5, count: 1, tracks: [1, 1] },
    ]);
    expect(profilePhotoRows([...ratios, 1.2, 1.8], true).slice(0, 2)).toEqual(rows.slice(0, 2));
  });
});
