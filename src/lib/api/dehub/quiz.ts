import { apiCall } from './core';

/**
 * Quizzes on posts (riftn-backend src/quiz). A creator describes a quiz in a
 * few words, gets questions written for them, edits them and attaches them to
 * their post. Each reader gets one go; right answers earn the creator's
 * channel points, more with a bigger badge. Points are never money.
 */
export interface QuizQuestion {
  q: string;
  options: string[];
  /** Index of the right option. Absent until the reader has answered. */
  answer?: number;
}

export interface QuizResult {
  answers: number[];
  correct: number;
  total: number;
  points: number;
  multiplier: number;
}

export interface PostQuiz {
  tokenId: number;
  topic: string;
  pointsPerQuestion: number;
  attempts: number;
  isCreator: boolean;
  /** The reader's badge boost, 1 to 2. */
  multiplier: number;
  questions: QuizQuestion[];
  mine: QuizResult | null;
}

export interface QuizDraft {
  topic: string;
  questions: Required<QuizQuestion>[];
  pointsPerQuestion: number;
}

export async function draftQuiz(topic: string, count = 5): Promise<{ topic: string; questions: Required<QuizQuestion>[] }> {
  return apiCall('/api/quiz/draft', { method: 'POST', body: { topic, count }, requiresAuth: true, timeoutMs: 60_000 });
}

export async function createQuiz(tokenId: number, draft: QuizDraft): Promise<{ quiz: PostQuiz }> {
  return apiCall('/api/quiz', {
    method: 'POST',
    body: { tokenId, topic: draft.topic, questions: draft.questions, pointsPerQuestion: draft.pointsPerQuestion },
    requiresAuth: true,
  });
}

export async function getQuiz(tokenId: number): Promise<{ quiz: PostQuiz }> {
  return apiCall(`/api/quiz/${tokenId}`, { requiresAuth: false });
}

export async function answerQuiz(tokenId: number, answers: number[]): Promise<QuizResult & { questions: Required<QuizQuestion>[] }> {
  return apiCall(`/api/quiz/${tokenId}/answer`, { method: 'POST', body: { answers }, requiresAuth: true });
}

/** Every question has text, 2+ answers and a right one picked. */
export function isQuizDraftValid(draft: QuizDraft | null | undefined): draft is QuizDraft {
  return !!draft && draft.questions.length > 0 && draft.questions.every(
    (q) => q.q.trim() && q.options.filter((o) => o.trim()).length >= 2 && q.answer >= 0 && q.answer < q.options.length && !!q.options[q.answer]?.trim(),
  );
}
