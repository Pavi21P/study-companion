import type { QuizSummary } from './manual-quizzes.ts';
export function quizPlacementStore(db: D1Database) {
  return {
    async get(owner: string, quiz: string) {
      return db.prepare('SELECT q.id,p.folder_id FROM authored_quizzes q LEFT JOIN quiz_folders p ON p.quiz_id=q.id AND p.owner_id=q.owner_id WHERE q.id=? AND q.owner_id=?').bind(quiz, owner).first<{ id: string; folder_id: string | null }>();
    },
    async list(owner: string, folder: string | null) {
      return (await db.prepare(`SELECT q.id,q.title,q.description,q.revision,q.updated_at,
        (SELECT count(*) FROM authored_questions WHERE quiz_id=q.id) AS question_count
        FROM authored_quizzes q LEFT JOIN quiz_folders p ON p.quiz_id=q.id AND p.owner_id=q.owner_id
        WHERE q.owner_id=? AND p.folder_id IS ? ORDER BY q.title,q.id`).bind(owner, folder).all<QuizSummary>()).results;
    },
    async move(owner: string, quiz: string, folder: string | null) {
      if (folder === null) {
        // Batch validates visibility and removes placement atomically. A root
        // move is idempotent and never changes the draft content revision.
        const results = await db.batch([
          db.prepare('SELECT id FROM authored_quizzes WHERE id=? AND owner_id=?').bind(quiz, owner),
          db.prepare('DELETE FROM quiz_folders WHERE quiz_id=? AND owner_id=? AND EXISTS (SELECT 1 FROM authored_quizzes WHERE id=? AND owner_id=?)').bind(quiz, owner, quiz, owner),
        ]);
        return results[0].results.length > 0;
      }
      const result = await db.prepare(`INSERT INTO quiz_folders(quiz_id,owner_id,folder_id)
        SELECT q.id,q.owner_id,f.id FROM authored_quizzes q JOIN folders f ON f.owner_id=q.owner_id
        WHERE q.id=? AND q.owner_id=? AND f.id=?
        ON CONFLICT(quiz_id) DO UPDATE SET folder_id=excluded.folder_id WHERE quiz_folders.owner_id=excluded.owner_id
        RETURNING quiz_id`).bind(quiz, owner, folder).first();
      return !!result;
    },
  };
}
