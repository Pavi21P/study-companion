export type Course = {
  id: string;
  title: string;
  description: string;
  created_at: number;
  updated_at: number;
};
export type CourseInput = Pick<Course, 'title' | 'description'>;

export function parseCourseInput(value: unknown): CourseInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => key !== 'title' && key !== 'description')) return null;
  if (typeof record.title !== 'string' || typeof record.description !== 'string') return null;
  const title = record.title.trim();
  const description = record.description.trim();
  if (!title || title.length > 120 || description.length > 1000 || title.includes(String.fromCharCode(0)) || description.includes(String.fromCharCode(0))) return null;
  return { title, description };
}

// Identity comes from the server auth boundary, never the request body.
export function courseStore(db: D1Database) {
  const columns = 'id, title, description, created_at, updated_at';
  return {
    async list(ownerId: string) {
      return (await db.prepare(`SELECT ${columns} FROM courses WHERE owner_id = ? ORDER BY created_at DESC, id DESC`)
        .bind(ownerId).all<Course>()).results;
    },
    async get(ownerId: string, id: string) {
      return db.prepare(`SELECT ${columns} FROM courses WHERE id = ? AND owner_id = ?`).bind(id, ownerId).first<Course>();
    },
    async create(ownerId: string, input: CourseInput) {
      const id = crypto.randomUUID();
      await db.batch([
        db.prepare('INSERT INTO users (id) VALUES (?) ON CONFLICT(id) DO NOTHING').bind(ownerId),
        db.prepare('INSERT INTO courses (id, owner_id, title, description) VALUES (?, ?, ?, ?)')
          .bind(id, ownerId, input.title, input.description),
      ]);
      return this.get(ownerId, id);
    },
    async update(ownerId: string, id: string, input: CourseInput) {
      return db.prepare(`UPDATE courses SET title = ?, description = ?, updated_at = unixepoch() WHERE id = ? AND owner_id = ? RETURNING ${columns}`)
        .bind(input.title, input.description, id, ownerId).first<Course>();
    },
  };
}
