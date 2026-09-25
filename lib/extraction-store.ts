import type { Source } from './sources';
import type { PassageInput } from './extracted-text';
export type Passage = { id: string; position: number; location: number; content: string };

export function extractionStore(db: D1Database) {
  return {
    async get(ownerId: string, id: string) {
      return db.prepare('SELECT s.* FROM sources s JOIN courses c ON c.id = s.course_id WHERE s.id = ? AND c.owner_id = ?')
        .bind(id, ownerId).first<Source & { object_key: string }>();
    },
    async passages(ownerId: string, id: string) {
      return (await db.prepare(`SELECT p.id, p.position, p.location, p.content FROM passages p
        JOIN sources s ON s.id = p.source_id JOIN courses c ON c.id = s.course_id
        WHERE s.id = ? AND c.owner_id = ? ORDER BY p.position`).bind(id, ownerId).all<Passage>()).results;
    },
    async status(ownerId: string, id: string, status: 'processing' | 'failed', error: string | null) {
      await db.prepare(`UPDATE sources SET status = ?, error_message = ? WHERE id = ? AND status != 'ready'
        AND course_id IN (SELECT id FROM courses WHERE owner_id = ?)`)
        .bind(status, error, id, ownerId).run();
    },
    async save(ownerId: string, id: string, passages: PassageInput[]) {
      const payload = JSON.stringify(passages.map(passage => ({ ...passage, id: crypto.randomUUID() })));
      // One atomic batch: concurrent/repeated completion cannot overwrite ready data.
      await db.batch([
        db.prepare(`INSERT INTO passages (id, source_id, position, location, content)
          SELECT json_extract(value, '$.id'), ?, CAST(key AS INTEGER), json_extract(value, '$.location'), json_extract(value, '$.content')
          FROM json_each(?) WHERE EXISTS (SELECT 1 FROM sources s JOIN courses c ON c.id = s.course_id
          WHERE s.id = ? AND c.owner_id = ? AND s.status != 'ready')`)
          .bind(id, payload, id, ownerId),
        db.prepare(`UPDATE sources SET status = 'ready', error_message = NULL WHERE id = ? AND status != 'ready'
          AND course_id IN (SELECT id FROM courses WHERE owner_id = ?)`)
          .bind(id, ownerId),
      ]);
    },
  };
}
