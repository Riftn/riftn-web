import { act, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PostDictationButton } from './PostDictationButton';

const controls = vi.hoisted(() => ({
  sample: null as null | ((file: File) => Promise<void>),
  start: vi.fn(), invoke: vi.fn(), error: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('sonner', () => ({ toast: { error: controls.error } }));
vi.mock('@/lib/ai-invoke', () => ({ invokeAi: controls.invoke, readFunctionError: () => 'failed' }));
vi.mock('@/hooks/use-voice-sample-recorder', () => ({
  useVoiceSampleRecorder: (_open: boolean, onSample: (file: File) => Promise<void>) => {
    controls.sample = onSample;
    return { recording: false, startRecording: controls.start };
  },
}));
const take = new File(['audio'], 'take.webm', { type: 'audio/webm' });
afterEach(() => vi.clearAllMocks());

it('lets the provider detect the spoken language and delivers editable text to the current draft', async () => {
  const first = vi.fn(), edited = vi.fn();
  const view = render(<PostDictationButton maxChars={50} setText={first} atLimit={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'stages.dictateText' }));
  expect(controls.start).toHaveBeenCalledOnce();
  let finish!: (response: unknown) => void;
  controls.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  let pending!: Promise<void>;
  act(() => { pending = controls.sample!(take); });
  const [endpoint, { body }] = controls.invoke.mock.calls[0];
  expect(endpoint).toBe('elevenlabs-transcribe');
  expect(body.get('file')).toBe(take);
  expect(body.has('languageCode')).toBe(false);
  expect(body.get('tagAudioEvents')).toBe('false');
  view.rerender(<PostDictationButton maxChars={50} setText={edited} atLimit={false} />);
  await act(async () => { finish({ data: { text: '  أهلاً नमस्ते merhaba  ' } }); await pending; });
  const update = edited.mock.calls[0][0];
  expect(update('edited')).toBe('edited أهلاً नमस्ते merhaba');
  expect(update('x'.repeat(49) + ' ')).toBe('x'.repeat(49) + ' ');
  expect(first).not.toHaveBeenCalled();
});

it('keeps a late transcription out of another draft', async () => {
  const append = vi.fn();
  let finish!: (response: unknown) => void;
  controls.invoke.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const view = render(<PostDictationButton maxChars={50} setText={append} atLimit={false} />);
  let pending!: Promise<void>;
  act(() => { pending = controls.sample!(take); });
  view.unmount();
  await act(async () => { finish({ data: { text: 'late' } }); await pending; });
  expect(append).not.toHaveBeenCalled();
});

it('keeps existing text when no speech is recognized', async () => {
  const append = vi.fn();
  controls.invoke.mockResolvedValueOnce({ data: { text: '  ' } });
  render(<PostDictationButton maxChars={50} setText={append} atLimit={false} />);
  await act(async () => { await controls.sample!(take); });
  expect(append).not.toHaveBeenCalled();
  expect(controls.error).toHaveBeenCalledWith('editor.captions.noSpeech');
});
