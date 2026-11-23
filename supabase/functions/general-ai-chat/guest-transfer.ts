// A guest can preview a transfer by supplying both its amount and recipient.
export function parseGuestTransfer(message: string): { amount: string; recipient: string } | null {
  const amountFirst = message.match(/\b(?:send|transfer|pay|tip|give)\s+(\d+(?:\.\d+)?)(?:\s*(?:dhb|tokens?|coins?)\s+|\s+)(?:to\s+)?@?(\w+)\b/i);
  const recipientFirst = message.match(/\b(?:send|transfer|pay|tip|give)\s+@?(\w+)\s+(\d+(?:\.\d+)?)\b/i);
  const amount = amountFirst?.[1] ?? recipientFirst?.[2];
  const recipient = amountFirst?.[2] ?? recipientFirst?.[1];
  if (!amount || !recipient || Number(amount) <= 0 || /^(?:dhb|tokens?|coins?|to|me|us|my|the|a|an)$/i.test(recipient)) return null;
  return { amount, recipient: recipient.toLowerCase() };
}
