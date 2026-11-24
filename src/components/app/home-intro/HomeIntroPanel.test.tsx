import { cleanup, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { HomeIntroPanel } from './HomeIntroPanel';

const noop = () => {};
const panel = (liveArt?: boolean) => (
  <MemoryRouter>
    <HomeIntroPanel active={0} runId={0} onDismiss={noop} onGoTo={noop} onJoin={noop} liveArt={liveArt} />
  </MemoryRouter>
);

afterEach(cleanup);

describe('HomeIntroPanel hero art', () => {
  it('prerenders the art as <img>, first slide visible, so the first frame is the largest paint', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(panel());
    const imgs = [...host.querySelectorAll<HTMLImageElement>('img.dehub-intro-art')];
    expect(imgs.map((img) => img.style.opacity)).toEqual(['1', '0', '0']);
  });

  it('draws the app copy as border-image, never <img>, so it cannot become a later largest paint', () => {
    const { container } = render(panel(true));
    expect(container.querySelectorAll('img.dehub-intro-art')).toHaveLength(0);
    const art = [...container.querySelectorAll<HTMLElement>('.dehub-intro-art')];
    expect(art).toHaveLength(3);
    expect(art.map((el) => el.style.opacity)).toEqual(['1', '0', '0']);
    expect(art[0].style.borderImage).toContain('globe-');
  });
});
