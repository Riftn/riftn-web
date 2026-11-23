export const FEATURE_PROMPT_MAX_LENGTH = 10_000;

/** Let explicit board commands reach the assistant even when they mention media generation. */
export function isRequestBoardCommand(text: string): boolean {
  return /\b(?:add|post|submit|file|create|log|raise|draft)\s+(?:(?:a|an|this|my|the)\s+)?(?:new\s+)?(?:(?:feature|bug|improvement)\s+)?(?:request|bug report)\b/i.test(text)
    || /\b(?:add|post|submit|file|put|log|report)\b[\s\S]*\b(?:on|to)\s+(?:the\s+)?(?:riftn\s+)?requests(?:\s+(?:board|page))?\b/i.test(text);
}

/** Keep the existing request row contract while accepting one free-form prompt. */
export function featurePromptFields(prompt: string, title = '', device = '') {
  const description = prompt.trim();
  const heading = (title.trim() || description.split(/\r?\n/)[0]).slice(0, 100)
    .replace(/[\uD800-\uDBFF]$/, '');
  return {
    title: heading,
    description: device.trim() ? `${description}\n\nDevice & OS: ${device.trim()}` : description,
  };
}
