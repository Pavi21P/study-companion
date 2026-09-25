import type { PublishedManualQuestion } from './manual-quiz-limits.ts';
export type QuizShare = { id: string; version_id: string; draft_revision: number; created_at: number; revoked_at: number | null };
export type GuestQuiz = { title: string; description: string; questions: { id: string; prompt: string; choices: string[] }[] };
export const validShareToken = (token: string) => /^[a-f0-9]{64}$/.test(token);
export function sharingStore(db: D1Database) {
  return {
    async list(owner: string, quizId: string) {
      return (await db.prepare('SELECT s.id,s.version_id,v.draft_revision,s.created_at,s.revoked_at FROM quiz_shares s JOIN quiz_versions v ON v.id=s.version_id JOIN authored_quizzes q ON q.id=v.quiz_id WHERE q.id=? AND q.owner_id=? ORDER BY s.created_at DESC,s.id DESC').bind(quizId, owner).all<QuizShare>()).results;
    },
    async create(owner: string, quizId: string, versionId: string) {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
      await db.prepare('INSERT INTO quiz_shares(id,version_id) SELECT ?,v.id FROM quiz_versions v JOIN authored_quizzes q ON q.id=v.quiz_id WHERE v.id=? AND q.id=? AND q.owner_id=? ON CONFLICT DO NOTHING').bind(token, versionId, quizId, owner).run();
      return db.prepare('SELECT s.id,s.version_id,v.draft_revision,s.created_at,s.revoked_at FROM quiz_shares s JOIN quiz_versions v ON v.id=s.version_id JOIN authored_quizzes q ON q.id=v.quiz_id WHERE v.id=? AND q.id=? AND q.owner_id=? AND s.revoked_at IS NULL').bind(versionId, quizId, owner).first<QuizShare>();
    },
    async revoke(owner: string, quizId: string, token: string) {
      return db.prepare('UPDATE quiz_shares SET revoked_at=COALESCE(revoked_at,unixepoch()) WHERE id=? AND version_id IN (SELECT v.id FROM quiz_versions v JOIN authored_quizzes q ON q.id=v.quiz_id WHERE q.id=? AND q.owner_id=?) RETURNING id').bind(token, quizId, owner).first<{ id: string }>();
    },
    async guest(token: string): Promise<GuestQuiz | null> {
      if (!validShareToken(token)) return null;
      const version = await db.prepare('SELECT v.title,v.description,v.questions_json FROM quiz_shares s JOIN quiz_versions v ON v.id=s.version_id WHERE s.id=? AND s.revoked_at IS NULL').bind(token).first<{ title: string; description: string; questions_json: string }>();
      if (!version) return null;
      // Explicit allowlist. Never spread version rows or published questions into public data.
      const questions = JSON.parse(version.questions_json) as PublishedManualQuestion[];
      return { title: version.title, description: version.description, questions: questions.map(q => ({ id: q.id, prompt: q.prompt, choices: q.choices })) };
    },
  };
}
