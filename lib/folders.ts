import { quizPlacementStore } from './quiz-placement.ts';
export type Folder = { id: string; parent_id: string | null; name: string; created_at: number; updated_at: number };
export function folderName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length > 0 && name.length <= 120 ? name : null;
}
const fields = 'id,parent_id,name,created_at,updated_at';
// Routes must supply the trusted authenticated owner, never a request-body owner.
export function folderStore(db: D1Database) {
  return {
    quizzes: (owner: string, parent: string | null) => quizPlacementStore(db).list(owner, parent),
    async list(owner: string, parent: string | null = null) {
      return (await db.prepare(`SELECT ${fields} FROM folders WHERE owner_id=? AND parent_id IS ? ORDER BY name,id`).bind(owner, parent).all<Folder>()).results;
    },
    async get(owner: string, id: string) {
      return db.prepare(`SELECT ${fields} FROM folders WHERE owner_id=? AND id=?`).bind(owner, id).first<Folder>();
    },
    async create(owner: string, value: string, parent: string | null = null) {
      const name = folderName(value); if (!name) throw new TypeError('Folder names must contain 1–120 characters.');
      await db.prepare('INSERT INTO users(id) VALUES (?) ON CONFLICT DO NOTHING').bind(owner).run();
      return db.prepare(`INSERT INTO folders(id,owner_id,parent_id,name) SELECT ?,?,?,? WHERE ? IS NULL OR EXISTS (SELECT 1 FROM folders WHERE id=? AND owner_id=?) RETURNING ${fields}`)
        .bind(crypto.randomUUID(), owner, parent, name, parent, parent, owner).first<Folder>();
    },
    async rename(owner: string, id: string, value: string) {
      const name = folderName(value); if (!name) throw new TypeError('Folder names must contain 1–120 characters.');
      return db.prepare(`UPDATE folders SET name=?,updated_at=unixepoch() WHERE owner_id=? AND id=? RETURNING ${fields}`).bind(name, owner, id).first<Folder>();
    },
    async move(owner: string, id: string, parent: string | null) {
      // The recursive check and mutation are one statement: concurrent moves
      // cannot both pass a stale, separate ancestry check. UNION bounds cycles.
      return db.prepare(`WITH RECURSIVE subtree(id) AS (
        SELECT id FROM folders WHERE id=? AND owner_id=?
        UNION SELECT f.id FROM folders f JOIN subtree s ON f.parent_id=s.id WHERE f.owner_id=?
      ) UPDATE folders SET parent_id=?,updated_at=unixepoch() WHERE id=? AND owner_id=?
        AND (? IS NULL OR EXISTS (SELECT 1 FROM folders WHERE id=? AND owner_id=?))
        AND NOT EXISTS (SELECT 1 FROM subtree WHERE id=?) RETURNING ${fields}`)
        .bind(id, owner, owner, parent, id, owner, parent, parent, owner, parent).first<Folder>();
    },
  };
}
