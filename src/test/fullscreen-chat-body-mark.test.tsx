import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_: string, o?: { defaultValue?: string }) => o?.defaultValue ?? '' }) }));

import { FullScreenChatShell } from '@/components/app/chat/FullScreenChatShell';

const up = () => document.body.hasAttribute('data-fullscreen-chat-up');

it('marks <body> while the full-screen chat is up, so menus opened from it sit above it', () => {
  const first = render(<FullScreenChatShell list={<div />} chat={null} chatOpen={false} />);
  expect(up()).toBe(true);
  const second = render(<FullScreenChatShell list={<div />} chat={null} chatOpen={false} />);
  first.unmount();
  expect(up()).toBe(true);
  second.unmount();
  expect(up()).toBe(false);
});

it('the framed gallery copy leaves <body> alone', () => {
  const view = render(<FullScreenChatShell list={<div />} chat={null} chatOpen={false} inline />);
  expect(up()).toBe(false);
  view.unmount();
});
