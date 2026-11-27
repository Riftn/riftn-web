import { describe, expect, it } from 'vitest';
import {
  detectAiToolRequest,
  isDeHubBrandedImageRequest,
  isSupportQuestion,
  requiresImageGeneration,
  requiresVideoGeneration,
} from '@/lib/ai-intent';

/**
 * The bug these cover cost a real user real DHB on 2026-09-03.
 *
 * They asked the assistant four times why their unstaked tokens had not
 * arrived. Every message contained "withdrawal", "withdrawal" contains "draw",
 * the phrase list was tested with `includes()` — so all four opened the image
 * paywall instead of answering, and the fourth was paid: 24 DHB to the AI
 * treasury for a picture nobody wanted. The support question was never
 * answered at all.
 */
describe('assistant intent classification', () => {
  const supportQuestions = [
    'Why my staked token not received',
    'Already withdrawal',
    'I already withdrawal my token from staking but still not received',
    'My staked token withdrawal already but recieved yet',
    'i want my withdrawal',
    'show me my balance',
    'what does this transaction fee mean',
    'my wallet is locked, give me a hand',
    'the app is not working, i cannot log in',
    'can you show me why my payment failed',
  ];

  it.each(supportQuestions)('never charges for a support question: %s', (message) => {
    expect(isSupportQuestion(message)).toBe(true);
    expect(requiresImageGeneration(message, false)).toBe(false);
    expect(requiresImageGeneration(message, false, { conversational: true })).toBe(false);
    expect(requiresVideoGeneration(message)).toBe(false);
    expect(detectAiToolRequest(message, false)).toBeNull();
    expect(isDeHubBrandedImageRequest(`${message} on dehub`)).toBe(false);
  });

  it('matches phrases as whole words, not as fragments of other words', () => {
    // 'draw' inside "withdrawal", 'ad' inside "already", 'put' inside "input",
    // 'motion' inside "promotion", 'design' inside "designated".
    expect(requiresImageGeneration('how do I withdraw', false)).toBe(false);
    expect(requiresImageGeneration('the input box sits under the header', false)).toBe(false);
    expect(requiresVideoGeneration('when is the promotion running')).toBe(false);
    expect(requiresImageGeneration('who is the designated signer', false)).toBe(false);
  });

  it('still routes a genuine image request', () => {
    expect(requiresImageGeneration('draw me a chrome eagle', false)).toBe(true);
    expect(requiresImageGeneration('generate an image of a husky', false)).toBe(true);
    expect(requiresImageGeneration('make a poster for the launch', false)).toBe(true);
    expect(requiresImageGeneration('photo of a snowy mountain', false)).toBe(true);
    // An attachment plus any instruction is an edit.
    expect(requiresImageGeneration('brighter please', true)).toBe(true);
  });

  it('still routes a genuine video request, and never as an image', () => {
    expect(requiresVideoGeneration('make a video of the Riftn logo spinning')).toBe(true);
    expect(requiresImageGeneration('make a video of the Riftn logo spinning', false)).toBe(false);
    // Video wins over an attachment too, or "animate this" on an attached
    // photo is billed as an image edit.
    expect(requiresImageGeneration('animate this', true)).toBe(false);
  });

  it('keeps the conversational tail off the surface that pays without asking', () => {
    // The chat bubble signs the transfer inline, so 'show me' must not cost
    // 24 DHB there. The assistant page opens a paywall first, so it may.
    expect(requiresImageGeneration('show me a husky', false)).toBe(false);
    expect(requiresImageGeneration('show me a husky', false, { conversational: true })).toBe(true);
  });

  it('answers a "show me the link" question instead of opening the image paywall', () => {
    const ask = 'show me the link explaining how people earn money on riftn';
    expect(requiresImageGeneration(ask, false, { conversational: true })).toBe(false);
    expect(requiresImageGeneration('show me how staking works', false, { conversational: true })).toBe(false);
    expect(requiresImageGeneration('show me a picture of a husky', false, { conversational: true })).toBe(true);
  });

  it('routes an explicit request even when it mentions an account word', () => {
    expect(requiresImageGeneration('draw me a picture of a wallet', false)).toBe(true);
    expect(detectAiToolRequest('transcribe this support call', false)).toBe('speech-to-text');
  });

  it('brands an image only when Riftn is named alongside an artefact', () => {
    expect(isDeHubBrandedImageRequest('make a DeHub banner for the launch')).toBe(true);
    expect(isDeHubBrandedImageRequest('my DHB withdrawal is already pending')).toBe(false);
  });
});

describe('a question is answered, not drawn (Requests 1385bb79)', () => {
  const questions = [
    'what does "create a group" do on riftn',
    'how do I make me a creator page',
    'is it possible to design my own profile theme',
    'why does my feed render so slowly',
    'Hi, what is the best way to create a community?',
    'tell me how to generate a referral code',
    'what does riftn do',
    'I want to know who made this app',
  ];
  it.each(questions)('stays a chat answer: %s', (message) => {
    expect(requiresImageGeneration(message, false)).toBe(false);
    expect(requiresImageGeneration(message, false, { conversational: true })).toBe(false);
  });

  it.each([
    'can you give me a short summary of Riftn which I can use to share with people',
    'give me a caption for my live tonight',
    'could you write me a bio for my profile',
    'make me a short intro I can share with friends',
  ])('a request for words gets words: %s', (message) => {
    expect(requiresImageGeneration(message, false)).toBe(false);
    expect(requiresImageGeneration(message, false, { conversational: true })).toBe(false);
  });

  it('still draws when asked for a picture', () => {
    expect(requiresImageGeneration('draw me a fox I can share with people', false, { conversational: true })).toBe(true);
    expect(requiresImageGeneration('what does a snow leopard look like', false, { conversational: true })).toBe(true);
    expect(requiresImageGeneration('can you create a logo for my channel', false, { conversational: true })).toBe(true);
    expect(requiresImageGeneration('how about a picture of a fox in the snow', false)).toBe(true);
    expect(requiresImageGeneration('design a banner with neon colours', false)).toBe(true);
  });
});
