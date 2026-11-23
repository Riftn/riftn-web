import { describe, expect, it } from 'vitest';
import { parseGuestTransfer } from '../../supabase/functions/general-ai-chat/guest-transfer';

describe('guest transfer preview', () => {
  it.each([
    'can you give me a short summary of Riftn which I can use to share with people',
    'give me 3 examples', 'send me the link', 'What is a payment?', 'send tokens', 'send 100 DHB', 'send 0 DHB to @sam',
  ])('leaves ordinary questions and incomplete transfers to chat: %s', (message) => {
    expect(parseGuestTransfer(message)).toBeNull();
  });

  it.each(['Please send 2.5 DHB to @Sam', 'give @Sam 2.5 tokens', 'tip 2.5 to sam', 'send 2.5DHB to @sam'])('previews a specified transfer: %s', (message) => {
    expect(parseGuestTransfer(message)).toEqual({ amount: '2.5', recipient: 'sam' });
  });
});
