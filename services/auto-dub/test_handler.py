"""Exercise timing and voice isolation without downloading speech weights."""
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import numpy as np

sys.modules.setdefault('torch', MagicMock())
import handler


class DubTests(unittest.TestCase):
    def test_original_audio_never_enters_dub_track(self):
        original = np.full(handler.SR * 5, 0.8, dtype=np.float32)
        lines = [{'start': 1, 'end': 2, 'text': 'Hello', 'speaker': 'a'}]
        with patch.object(handler, 'synth', return_value=np.full(handler.SR, 0.25, dtype=np.float32)):
            speech, spoken = handler.render(original, lines, {'a': 'speaker.wav'}, 'en', '')
        self.assertEqual(spoken, 1)
        self.assertTrue(np.all(speech[:handler.SR] == 0))
        self.assertTrue(np.all(speech[2 * handler.SR:] == 0))
        self.assertAlmostEqual(float(speech[handler.SR]), handler.TARGET_RMS, places=4)

    def test_quiet_and_loud_lines_land_at_one_level(self):
        quiet = handler.level(np.full(handler.SR, 0.03, dtype=np.float32))
        loud = handler.level(np.full(handler.SR, 0.6, dtype=np.float32))
        self.assertAlmostEqual(float(quiet[100]), float(loud[100]), places=4)

    def test_one_unreadable_line_does_not_lose_the_dub(self):
        lines = [{'start': 0, 'end': 1, 'text': 'bad', 'speaker': 'a'}, {'start': 2, 'end': 3, 'text': 'good', 'speaker': 'a'}]
        voices = [IndexError('index out of range in self'), np.full(handler.SR // 2, 0.2, dtype=np.float32)]
        with patch.object(handler, 'synth', side_effect=voices):
            _, spoken = handler.render(np.zeros(handler.SR * 4, dtype=np.float32), lines, {'a': None}, 'en', '')
        self.assertEqual(spoken, 1)

    def test_long_text_is_read_in_sentences(self):
        text = ' '.join(['This is one sentence of the passage.'] * 20)
        parts = handler.split_text(text)
        self.assertGreater(len(parts), 1)
        self.assertTrue(all(len(part) <= handler.MAX_LINE_CHARS for part in parts))
        self.assertEqual(' '.join(parts), text)
        self.assertEqual(handler.split_text('Short line.'), ['Short line.'])

    def test_voice_is_learned_once_per_sample(self):
        engine = MagicMock()
        spoken = engine.generate.return_value.squeeze.return_value.detach.return_value.cpu.return_value.numpy.return_value
        spoken.astype.return_value = np.full(handler.SR // 4, 0.2, dtype=np.float32)
        handler._voices.clear()
        with patch.object(handler, 'tts', return_value=engine):
            handler.synth('one', 'a.wav', 'es')
            handler.synth('two', 'a.wav', 'es')
            handler.synth('three', 'b.wav', 'es')
        self.assertEqual(engine.prepare_conditionals.call_count, 2)
        self.assertNotIn('audio_prompt_path', engine.generate.call_args.kwargs)
        handler._voices.clear()

    def test_each_speaker_uses_their_own_reference(self):
        lines = [{'start': 0, 'end': 1, 'text': 'Hi', 'speaker': 'a'}, {'start': 2, 'end': 3, 'text': 'Hi', 'speaker': 'b'}]
        with patch.object(handler, 'synth', return_value=np.zeros(100)) as synth:
            handler.render(np.zeros(handler.SR * 4), lines, {'a': 'a.wav', 'b': 'b.wav'}, 'es', '')
        self.assertEqual([call.args[1] for call in synth.call_args_list], ['a.wav', 'b.wav'])

    def test_insufficient_attributable_speech_uses_stock(self):
        with tempfile.TemporaryDirectory() as tmp:
            path, voice = handler.build_reference(np.ones(handler.SR * 20), [{'start': 1, 'end': 2}], tmp)
        self.assertIsNone(path)
        self.assertEqual(voice, 'stock')

    def test_a_few_short_lines_are_enough_to_copy_a_voice(self):
        lines = [{'start': 1, 'end': 2.6}, {'start': 4, 'end': 5.1}, {'start': 7, 'end': 7.8}]
        with tempfile.TemporaryDirectory() as tmp:
            path, voice = handler.build_reference(np.ones(handler.SR * 20, dtype=np.float32), lines, tmp)
            self.assertIsNotNone(path)
        self.assertEqual(voice, 'cloned')

    def test_long_render_renews_its_upload_url(self):
        job = {'uploadUrl': 'https://example.test/old', 'callbackUrl': 'https://example.test/callback', 'dubId': 'dub', 'jobId': 'attempt', 'secret': 'test', 'acceptedAt': 0}
        fresh = MagicMock(ok=True)
        fresh.json.return_value = {'uploadUrl': 'https://example.test/new'}
        with patch.object(handler.requests, 'post', return_value=fresh) as post:
            self.assertEqual(handler.upload_url(job, 0), 'https://example.test/new')
        self.assertEqual(post.call_args.kwargs['json']['action'], 'upload')
        with patch.object(handler.requests, 'post', return_value=MagicMock(ok=False, status_code=403)):
            self.assertEqual(handler.upload_url(job, 0), 'https://example.test/old')
        with patch.object(handler.requests, 'post') as post:
            self.assertEqual(handler.upload_url({**job, 'acceptedAt': handler.time.time()}, 0), 'https://example.test/old')
        post.assert_not_called()

    def test_short_lines_do_not_merge_across_speakers(self):
        lines = [{'start': 0, 'end': 1, 'text': 'one', 'speaker': 'a'}, {'start': 1.1, 'end': 2, 'text': 'two', 'speaker': 'b'}]
        self.assertEqual(len(handler.merge_lines(lines)), 2)

    def test_callback_identifies_the_attempt(self):
        job = {'callbackUrl': 'https://example.test/callback', 'dubId': 'dub', 'jobId': 'attempt', 'secret': 'test'}
        with patch.object(handler.requests, 'post', return_value=MagicMock(ok=True)) as post:
            handler.report(job, {'ok': True, 'path': 'dub/attempt.m4a'})
        self.assertEqual(post.call_args.kwargs['json']['jobId'], 'attempt')


if __name__ == '__main__':
    unittest.main()
