import { folderShareScope } from './folder-sharing.ts';
import { result, parseGuestAnswers, type GuestAnswer, type GuestResult } from './guest-attempts.ts';
import type { PublishedManualQuestion } from './manual-quiz-limits.ts';
// The URL fixes the immutable version. Every read/write also rechecks the
// active capability and present-day placement within its owner's subtree.
const accessible = `${folderShareScope}, accessible AS (
  SELECT v.id,v.questions_json FROM scope f
  JOIN quiz_folders p ON p.folder_id=f.id AND p.owner_id=f.owner_id
  JOIN authored_quizzes q ON q.id=p.quiz_id AND q.owner_id=p.owner_id
  JOIN quiz_versions v ON v.quiz_id=q.id WHERE q.id=? AND v.id=?
)`;
export function folderGuestAttemptStore(db: D1Database, quiz: string, version: string) {
  return {
    async get(share: string, hash: string) {
      const row = await db.prepare(`${accessible} SELECT a.score,a.question_count,a.answers_json,v.questions_json
        FROM folder_guest_attempts a JOIN accessible v ON v.id=a.version_id WHERE a.id=? AND a.share_id=?`)
        .bind(share, quiz, version, hash, share).first<{ score: number; question_count: number; answers_json: string; questions_json: string }>();
      return row ? result(row) : null;
    },
    async submit(share: string, hash: string, answers: GuestAnswer[]): Promise<{ result: GuestResult } | { error: 'unavailable' | 'invalid' }> {
      const saved = await this.get(share, hash); if (saved) return { result: saved };
      if (!parseGuestAnswers({ answers })) return { error: 'invalid' };
      const row = await db.prepare(`${accessible} SELECT id,questions_json FROM accessible`).bind(share, quiz, version).first<{ id: string; questions_json: string }>();
      if (!row) return { error: 'unavailable' };
      const questions = JSON.parse(row.questions_json) as PublishedManualQuestion[];
      const byId = new Map(answers.map(a => [a.questionId, a.selectedIndex]));
      if (answers.length !== questions.length || questions.some(q => !byId.has(q.id) || byId.get(q.id)! >= q.choices.length)) return { error: 'invalid' };
      const score = questions.filter(q => byId.get(q.id) === q.correctIndex).length;
      // Atomic access guard closes revocation/move races after grading. First
      // write wins, so retries cannot overwrite scores or chosen answers.
      await db.prepare(`${accessible} INSERT INTO folder_guest_attempts(id,share_id,version_id,answers_json,score,question_count)
        SELECT ?,?,v.id,?,?,? FROM accessible v WHERE 1 ON CONFLICT(id) DO NOTHING`)
        .bind(share, quiz, version, hash, share, JSON.stringify(answers), score, questions.length).run();
      const stored = await this.get(share, hash);
      return stored ? { result: stored } : { error: 'unavailable' };
    },
  };
}
