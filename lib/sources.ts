export type Source = {
  id: string;
  course_id: string;
  filename: string;
  format: 'pdf' | 'pptx';
  byte_size: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  error_message: string | null;
  created_at: number;
};

export function sourceStore(db: D1Database) {
  const columns = 's.id, s.course_id, s.filename, s.format, s.byte_size, s.status, s.error_message, s.created_at';
  return {
    async list(ownerId: string, courseId: string) {
      return (await db.prepare(`SELECT ${columns} FROM sources s JOIN courses c ON c.id = s.course_id WHERE c.owner_id = ? AND c.id = ? ORDER BY s.created_at DESC, s.id DESC`)
        .bind(ownerId, courseId).all<Source>()).results;
    },
    async create(ownerId: string, courseId: string, id: string, key: string, filename: string, size: number) {
      return db.prepare(`INSERT INTO sources (id, course_id, filename, format, object_key, byte_size, status)
        SELECT ?, id, ?, 'pdf', ?, ?, 'processing' FROM courses WHERE id = ? AND owner_id = ? RETURNING id`)
        .bind(id, filename, key, size, courseId, ownerId).first<{ id: string }>();
    },
    async finish(ownerId: string, id: string, error: string | null) {
      return db.prepare(`UPDATE sources SET status = ?, error_message = ? WHERE id = ? AND course_id IN (SELECT id FROM courses WHERE owner_id = ?)
        RETURNING id, course_id, filename, format, byte_size, status, error_message, created_at`)
        .bind(error ? 'failed' : 'pending', error, id, ownerId).first<Source>();
    },
  };
}
