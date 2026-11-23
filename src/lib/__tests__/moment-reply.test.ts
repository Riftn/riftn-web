import { expect, it } from 'vitest';
import { parseMomentReply } from '../moment-reply';
const id = '6b0099334a6e07719f5908d3';
const link = `https://riftn.com/moment/${id}`;
it('keeps the original reply text and resolves old translated app links', () => {
  expect(parseMomentReply(`Anına yanıt verdi: Today: a photo!\nSecond line\n${link}`)).toEqual({ id, text: 'Today: a photo!\nSecond line' });
  expect(parseMomentReply(`Replied to your moment: nice\nhttps://dehub.io/app/moment/${id}`)).toEqual({ id, text: 'nice' });
});
it('recognizes new reply links from senders using a different language', () => {
  expect(parseMomentReply(`Risposto: Ciao\n${link}?reply=1`)).toEqual({ id, text: 'Ciao' });
});
it('leaves unrelated DM text and lookalike URLs untouched', () => {
  for (const content of [link, `Meet at: noon\n${link}`, `Replied to your moment: nice\n${link.replace('riftn.com', 'riftn.com.evil.test')}`,
    `Replied to your moment: nice\nhttps://riftn.com@evil.test/moment/${id}`, `Replied to your moment: nice\n${link}/another/path`]) {
    expect(parseMomentReply(content)).toBeNull();
  }
});
