import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostBgPicker } from '@/components/app/profile/PostBackground';
import { postBgFromStored } from '@/lib/post-backgrounds';

vi.mock('@/hooks/use-dehub-profile', () => ({}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

describe('Post background picker', () => {
  it('previews and saves the photo belonging to the selected scope', () => {
    const post = postBgFromStored('photo||postbgs/post-photo.webp');
    const profile = postBgFromStored('photo||postbgs/profile-photo.webp');
    const onSave = vi.fn();
    const { unmount } = render(<PostBgPicker
      open
      current={profile}
      photoUrl={profile?.image}
      name="Riftn"
      handle="@riftn"
      postId="7"
      postCurrent={post}
      onCancel={vi.fn()}
      onSave={onSave}
    />);
    const preview = screen.getByText('This is how your text posts look on your profile.').parentElement?.firstElementChild as HTMLElement | null;
    expect(preview?.style.getPropertyValue('--pbg-img')).toContain('/postbgs/post-photo.webp');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'post', photoUrl: post?.image, file: null }));

    fireEvent.click(screen.getByRole('radio', { name: 'All posts' }));
    expect(preview?.style.getPropertyValue('--pbg-img')).toContain('/postbgs/profile-photo.webp');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'all', photoUrl: profile?.image, file: null }));
    unmount();
  });
});
