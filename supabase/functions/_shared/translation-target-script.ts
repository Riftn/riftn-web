// Keep original text and occasional Han names or quotations. Reject a
// translated result written mostly in Han for a target that doesn't use it.
export function hasUnexpectedHan(input: string, output: string, target: string): boolean {
  if (/^(?:zh|yue|ja)(?:[-_]|$)/i.test(target) || output.trim() === input.trim()) return false;

  const prose = output.replace(/(?:https?:\/\/|www\.)[^\s<>]+|[@#$][\p{L}\p{M}\p{N}_]+/giu, '');
  const han = prose.match(/\p{Script=Han}/gu)?.length ?? 0;
  if (!han) return false;

  const letters = prose.match(/\p{L}/gu)?.length ?? 0;
  return han * 2 > letters;
}
