import { parseDraft, type DraftInput } from './manual-quizzes.ts';

export function publicationIssues(draft: DraftInput): string[] {
  const issues: string[] = [];
  if (!parseDraft(draft)) issues.push('Check the title, text lengths and question size limit.');
  if (!draft.questions.length) issues.push('Add at least one question.');
  draft.questions.forEach((question, index) => {
    const prefix = `Question ${index + 1}:`;
    if (!question.prompt.trim()) issues.push(`${prefix} add a question prompt.`);
    question.choices.forEach((choice, choiceIndex) => { if (!choice.trim()) issues.push(`${prefix} fill in choice ${choiceIndex + 1}.`); });
    if (question.correctIndex === null) issues.push(`${prefix} select the correct answer.`);
  });
  return issues;
}
