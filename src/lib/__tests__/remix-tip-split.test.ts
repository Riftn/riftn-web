import { describe, expect, it } from 'vitest';
import { splitRemixTip } from '../remix-links';

const link = { splitBps: 1000, sourceAddress: '0xoriginal', remixerAddress: '0xremixer' };

describe('splitRemixTip', () => {
  it('gives the original creator exactly their share', () => {
    expect(splitRemixTip(500, link)).toEqual({ source: 50, remixer: 450 });
    expect(splitRemixTip(2.01, link)).toEqual({ source: 0.201, remixer: 1.809 });
    expect(splitRemixTip(8.03, link)).toEqual({ source: 0.803, remixer: 7.227 });
    expect(splitRemixTip(1.14, { ...link, splitBps: 2500 })).toEqual({ source: 0.285, remixer: 0.855 });
  });

  it('never loses or adds value across cents', () => {
    for (let cents = 1; cents <= 20000; cents++) {
      const amount = cents / 100;
      const { source, remixer } = splitRemixTip(amount, link);
      expect(Math.round((source + remixer) * 1e6)).toBe(Math.round(amount * 1e6));
      expect(Math.round(source * 1e6)).toBe(Math.floor(Math.round(amount * 1e6) / 10));
    }
  });

  it('does not split without a link, a share, or for your own video', () => {
    expect(splitRemixTip(10, null)).toEqual({ source: 0, remixer: 10 });
    expect(splitRemixTip(10, { ...link, splitBps: 0 })).toEqual({ source: 0, remixer: 10 });
    expect(splitRemixTip(10, { ...link, remixerAddress: '0xoriginal' })).toEqual({ source: 0, remixer: 10 });
  });
});
