import { cleanup, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { HomeIntroPanel } from './HomeIntroPanel';

const noop = () => {};
const panel = (artHidden?: boolean) => (
  <MemoryRouter>
    <HomeIntroPanel active={0} runId={0} onDismiss={noop} onGoTo={noop} onJoin={noop} artHidden={artHidden} />
  </MemoryRouter>
);
const opacities = (root: ParentNode) =>
  [...root.querySelectorAll<HTMLImageElement>('.dehub-intro-art')].map((img) => img.style.opacity);

afterEach(cleanup);

describe('HomeIntroPanel hero art', () => {
  it('shows the first slide at full opacity in the prerendered markup', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(panel());
    expect(opacities(host)).toEqual(['1', '0', '0']);
  });

  it('holds every slide at opacity 0 while the app copy waits to fade in', () => {
    const { container } = render(panel(true));
    expect(opacities(container)).toEqual(['0', '0', '0']);
  });
});
