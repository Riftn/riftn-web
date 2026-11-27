import { describe, expect, it } from 'vitest';
import { isRadioShow, newStageChannelName } from './stage-radio-show';

describe('radio shows', () => {
  it('marks a radio show by its channel name only', () => {
    expect(isRadioShow({ channel_name: newStageChannelName(true) })).toBe(true);
    expect(isRadioShow({ channel_name: newStageChannelName(false) })).toBe(false);
    expect(isRadioShow({ channel_name: null })).toBe(false);
    expect(isRadioShow(null)).toBe(false);
  });
});
