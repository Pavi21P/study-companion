import type { PublishedManualQuestion } from './manual-quiz-limits.ts';
export type GuestAnswer = { questionId: string; selectedIndex: number };
export type GuestResult = { score: number; total: number; answers: { questionId: string; selectedIndex: number; correctIndex: number; explanation: string }[] };
type SavedAttempt = { score: number; question_count: number; answers_json: string; questions_json: string };
export async function attemptHash(key: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))), b => b.toString(16).padStart(2, '0')).join('');
}
export function result(row: SavedAttempt): GuestResult {
  const answers = JSON.parse(row.answers_json) as GuestAnswer[];
  const questions = JSON.parse(row.questions_json) as PublishedManualQuestion[];
  return { score: row.score, total: row.question_count, answers: questions.map(q => ({ questionId: q.id, selectedIndex: answers.find(a => a.questionId === q.id)!.selectedIndex, correctIndex: q.correctIndex, explanation: q.explanation })) };
}
export function parseGuestAnswers(value: unknown): GuestAnswer[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !('answers' in value) || !Array.isArray(value.answers) || value.answers.length < 1 || value.answers.length > 500) return null;
  const ids = new Set<string>();
  for (const answer of value.answers) {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer) || Object.keys(answer).sort().join(',') !== 'questionId,selectedIndex' || typeof answer.questionId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(answer.questionId) || ids.has(answer.questionId) || !Number.isInteger(answer.selectedIndex) || answer.selectedIndex < 0 || answer.selectedIndex > 5) return null;
    ids.add(answer.questionId);
  }
  return value.answers as GuestAnswer[];
}
export function guestAttemptStore(db: D1Database) {
  return {
    async get(share: string, hash: string) {
      const row = await db.prepare('SELECT a.score,a.question_count,a.answers_json,v.questions_json FROM guest_attempts a JOIN quiz_shares s ON s.id=a.share_id AND s.version_id=a.version_id JOIN quiz_versions v ON v.id=a.version_id WHERE a.id=? AND s.id=? AND s.revoked_at IS NULL').bind(hash, share).first<SavedAttempt>();
      return row ? result(row) : null;
    },
    async submit(share: string, hash: string, answers: GuestAnswer[]): Promise<{ result: GuestResult } | { error: 'unavailable' | 'invalid' }> {
      const saved = await this.get(share, hash);
      if (saved) return { result: saved };
      const version = await db.prepare('SELECT v.id,v.questions_json FROM quiz_shares s JOIN quiz_versions v ON v.id=s.version_id WHERE s.id=? AND s.revoked_at IS NULL').bind(share).first<{ id: string; questions_json: string }>();
      if (!version) return { error: 'unavailable' };
      const questions = JSON.parse(version.questions_json) as PublishedManualQuestion[];
      const byId = new Map(answers.map(a => [a.questionId, a.selectedIndex]));
      if (answers.length !== questions.length || byId.size !== questions.length || questions.some(q => !byId.has(q.id) || byId.get(q.id)! >= q.choices.length)) return { error: 'invalid' };
      const score = questions.filter(q => byId.get(q.id) === q.correctIndex).length;
      // A single guarded INSERT is atomic and first-write-wins. A revoked link
      // cannot submit even if revocation happens after the version was read.
      await db.prepare('INSERT INTO guest_attempts(id,share_id,version_id,answers_json,score,question_count) SELECT ?,s.id,s.version_id,?,?,? FROM quiz_shares s WHERE s.id=? AND s.version_id=? AND s.revoked_at IS NULL ON CONFLICT(id) DO NOTHING').bind(hash, JSON.stringify(answers), score, questions.length, share, version.id).run();
      const stored = await this.get(share, hash);
      return stored ? { result: stored } : { error: 'unavailable' };
    },
  };
}
