import { validShareToken, type GuestQuiz } from './quiz-sharing.ts';
import type { PublishedManualQuestion } from './manual-quiz-limits.ts';
export type FolderShare = { id: string; folder_id: string; created_at: number; revoked_at: number | null };
export type SharedFolder = { id: string; name: string; folders: { id: string; name: string }[]; quizzes: { id: string; versionId: string; title: string; description: string }[] };
// Recomputed for EVERY read. A token grants its current subtree, not permanent
// independent quiz shares. No parent outside the shared root enters the result.
export const folderShareScope = `WITH RECURSIVE scope(id,owner_id,name,parent_id) AS (
  SELECT f.id,f.owner_id,f.name,f.parent_id FROM folder_shares s JOIN folders f ON f.id=s.folder_id WHERE s.id=? AND s.revoked_at IS NULL
  UNION SELECT f.id,f.owner_id,f.name,f.parent_id FROM folders f JOIN scope p ON f.parent_id=p.id AND f.owner_id=p.owner_id
)`;
export function folderSharingStore(db: D1Database) {
  return {
    async list(owner: string, folder: string) {
      return (await db.prepare('SELECT s.id,s.folder_id,s.created_at,s.revoked_at FROM folder_shares s JOIN folders f ON f.id=s.folder_id WHERE f.id=? AND f.owner_id=? ORDER BY s.created_at DESC,s.id DESC').bind(folder, owner).all<FolderShare>()).results;
    },
    async create(owner: string, folder: string) {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
      await db.prepare('INSERT INTO folder_shares(id,folder_id) SELECT ?,id FROM folders WHERE id=? AND owner_id=? ON CONFLICT DO NOTHING').bind(token, folder, owner).run();
      return db.prepare('SELECT s.id,s.folder_id,s.created_at,s.revoked_at FROM folder_shares s JOIN folders f ON f.id=s.folder_id WHERE f.id=? AND f.owner_id=? AND s.revoked_at IS NULL').bind(folder, owner).first<FolderShare>();
    },
    async revoke(owner: string, folder: string, token: string) {
      return !!await db.prepare('UPDATE folder_shares SET revoked_at=COALESCE(revoked_at,unixepoch()) WHERE id=? AND folder_id=? AND EXISTS (SELECT 1 FROM folders WHERE id=? AND owner_id=?) RETURNING id').bind(token, folder, folder, owner).first();
    },
    async browse(token: string, folder: string | null = null): Promise<SharedFolder | null> {
      if (!validShareToken(token)) return null;
      // Metadata and children come from one statement/snapshot, so revocation
      // or a concurrent move cannot slip between access checks and selection.
      const row = await db.prepare(`${folderShareScope} SELECT f.id,f.name,
        (SELECT json_group_array(json(item)) FROM (SELECT json_object('id',c.id,'name',c.name) item FROM scope c WHERE c.parent_id=f.id ORDER BY c.name,c.id)) folders_json,
        (SELECT json_group_array(json(item)) FROM (SELECT json_object('id',q.id,'versionId',v.id,'title',v.title,'description',v.description) item
          FROM quiz_folders p JOIN authored_quizzes q ON q.id=p.quiz_id AND q.owner_id=p.owner_id
          JOIN quiz_versions v ON v.quiz_id=q.id WHERE p.folder_id=f.id AND p.owner_id=f.owner_id
          AND v.draft_revision=(SELECT max(draft_revision) FROM quiz_versions WHERE quiz_id=q.id) ORDER BY v.title,q.id)) quizzes_json
        FROM scope f WHERE f.id=COALESCE(?,(SELECT folder_id FROM folder_shares WHERE id=? AND revoked_at IS NULL))`)
        .bind(token, folder, token).first<{ id: string; name: string; folders_json: string; quizzes_json: string }>();
      return row ? { id: row.id, name: row.name, folders: JSON.parse(row.folders_json), quizzes: JSON.parse(row.quizzes_json) } : null;
    },
    async guestQuiz(token: string, quiz: string, version: string): Promise<GuestQuiz | null> {
      if (!validShareToken(token)) return null;
      const row = await db.prepare(`${folderShareScope} SELECT v.title,v.description,v.questions_json FROM scope f
        JOIN quiz_folders p ON p.folder_id=f.id AND p.owner_id=f.owner_id
        JOIN authored_quizzes q ON q.id=p.quiz_id AND q.owner_id=p.owner_id
        JOIN quiz_versions v ON v.quiz_id=q.id WHERE q.id=? AND v.id=?`).bind(token, quiz, version)
        .first<{ title: string; description: string; questions_json: string }>();
      if (!row) return null;
      return { title: row.title, description: row.description, questions: (JSON.parse(row.questions_json) as PublishedManualQuestion[]).map(q => ({ id: q.id, prompt: q.prompt, choices: q.choices })) };
    },
  };
}
