// Shared by schema and future authoring/publishing validation.
export const MAX_QUIZ_QUESTIONS = 500;
export const MIN_QUIZ_CHOICES = 2;
export const MAX_QUIZ_CHOICES = 6;
export const MAX_QUIZ_TITLE = 120;
export const MAX_QUIZ_DESCRIPTION = 1000;
export const MAX_QUESTION_PROMPT = 4000;
export const MAX_CHOICE_TEXT = 1000;
export const MAX_QUESTION_EXPLANATION = 4000;
// Keep a published snapshot comfortably below D1's single-row size limit.
export const MAX_QUIZ_SNAPSHOT_BYTES = 1_000_000;

export type PublishedManualQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
};
