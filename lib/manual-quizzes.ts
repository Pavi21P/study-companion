import { MAX_QUIZ_QUESTIONS, MIN_QUIZ_CHOICES, MAX_QUIZ_CHOICES, MAX_QUIZ_TITLE, MAX_QUIZ_DESCRIPTION, MAX_QUESTION_PROMPT, MAX_CHOICE_TEXT, MAX_QUESTION_EXPLANATION, MAX_QUIZ_SNAPSHOT_BYTES } from './manual-quiz-limits.ts';

export type DraftQuestion = { id: string; prompt: string; choices: string[]; correctIndex: number | null; explanation: string };
export type DraftInput = { title: string; description: string; revision: number; questions: DraftQuestion[] };
export type QuizSummary = { id: string; title: string; description: string; revision: number; updated_at: number; question_count: number };
export type QuizDraft = QuizSummary & { questions: DraftQuestion[] };
export type QuizVersion = { id: string; quiz_id: string; draft_revision: number; title: string; description: string; questions_json: string; created_at: number };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && !v.includes('\0');
const only = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(k => keys.includes(k));

export function parseDraft(value: unknown): DraftInput | null {
  if (!record(value) || !only(value, ['title', 'description', 'revision', 'questions'])) return null;
  if (!text(value.title, MAX_QUIZ_TITLE) || !value.title.trim() || !text(value.description, MAX_QUIZ_DESCRIPTION) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1) return null;
  if (!Array.isArray(value.questions) || value.questions.length > MAX_QUIZ_QUESTIONS) return null;
  const ids = new Set<string>();
  for (const q of value.questions) {
    if (!record(q) || !only(q, ['id', 'prompt', 'choices', 'correctIndex', 'explanation'])) return null;
    if (typeof q.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(q.id) || ids.has(q.id)) return null;
    ids.add(q.id);
    if (!text(q.prompt, MAX_QUESTION_PROMPT) || !text(q.explanation, MAX_QUESTION_EXPLANATION) || !Array.isArray(q.choices) || q.choices.length < MIN_QUIZ_CHOICES || q.choices.length > MAX_QUIZ_CHOICES || !q.choices.every(c => text(c, MAX_CHOICE_TEXT))) return null;
    if (q.correctIndex !== null && (!Number.isInteger(q.correctIndex) || (q.correctIndex as number) < 0 || (q.correctIndex as number) >= q.choices.length)) return null;
  }
  if (new TextEncoder().encode(JSON.stringify(value.questions)).byteLength > MAX_QUIZ_SNAPSHOT_BYTES) return null;
  return { title: value.title.trim(), description: value.description, revision: value.revision as number, questions: value.questions as DraftQuestion[] };
}

export function manualQuizStore(db: D1Database) {
  const columns = 'q.id, q.title, q.description, q.revision, q.updated_at, (SELECT count(*) FROM authored_questions WHERE quiz_id=q.id) AS question_count';
  return {
    async versions(owner: string, id: string) {
      return (await db.prepare('SELECT v.id,v.draft_revision,v.created_at FROM quiz_versions v JOIN authored_quizzes q ON q.id=v.quiz_id WHERE q.id=? AND q.owner_id=? ORDER BY v.draft_revision DESC').bind(id, owner).all<Pick<QuizVersion, 'id' | 'draft_revision' | 'created_at'>>()).results;
    },
    async version(owner: string, id: string, versionId: string) {
      return db.prepare('SELECT v.* FROM quiz_versions v JOIN authored_quizzes q ON q.id=v.quiz_id WHERE q.id=? AND q.owner_id=? AND v.id=?').bind(id, owner, versionId).first<QuizVersion>();
    },
    async publish(owner: string, id: string, draft: DraftInput) {
      // The server supplies a validated snapshot read at this revision. Concurrent
      // edits fail the guard; repeated publishing returns the existing version.
      await db.prepare('INSERT INTO quiz_versions(id,quiz_id,draft_revision,title,description,questions_json) SELECT ?,id,revision,?,?,? FROM authored_quizzes WHERE id=? AND owner_id=? AND revision=? ON CONFLICT(quiz_id,draft_revision) DO NOTHING')
        .bind(crypto.randomUUID(), draft.title, draft.description, JSON.stringify(draft.questions), id, owner, draft.revision).run();
      return db.prepare('SELECT v.id,v.draft_revision FROM quiz_versions v JOIN authored_quizzes q ON q.id=v.quiz_id WHERE q.id=? AND q.owner_id=? AND v.draft_revision=?').bind(id, owner, draft.revision).first<Pick<QuizVersion, 'id' | 'draft_revision'>>();
    },
    async list(owner: string) {
      return (await db.prepare(`SELECT ${columns} FROM authored_quizzes q WHERE owner_id=? ORDER BY updated_at DESC, id DESC`).bind(owner).all<QuizSummary>()).results;
    },
    async get(owner: string, id: string): Promise<QuizDraft | null> {
      // A single statement gives metadata and ordered questions from one consistent revision.
      const row = await db.prepare(`SELECT ${columns}, (SELECT json_group_array(json(item)) FROM (SELECT json_object('id',id,'prompt',prompt,'choices',json(choices),'correctIndex',correct_index,'explanation',explanation) AS item FROM authored_questions WHERE quiz_id=q.id ORDER BY position)) AS questions_json FROM authored_quizzes q WHERE q.id=? AND owner_id=?`).bind(id, owner).first<QuizSummary & { questions_json: string }>();
      if (!row) return null;
      const { questions_json, ...quiz } = row;
      return { ...quiz, questions: JSON.parse(questions_json) as DraftQuestion[] };
    },
    async create(owner: string) {
      const id = crypto.randomUUID();
      await db.batch([
        db.prepare('INSERT INTO users(id) VALUES (?) ON CONFLICT(id) DO NOTHING').bind(owner),
        db.prepare('INSERT INTO authored_quizzes(id,owner_id) VALUES (?,?)').bind(id, owner),
      ]);
      return this.get(owner, id);
    },
    async save(owner: string, id: string, input: DraftInput): Promise<'saved' | 'missing' | 'conflict' | 'invalid-ids'> {
      const existing = await db.prepare('SELECT revision FROM authored_quizzes WHERE id=? AND owner_id=?').bind(id, owner).first<{ revision: number }>();
      if (!existing) return 'missing';
      if (existing.revision !== input.revision) return 'conflict';
      const questions = JSON.stringify(input.questions);
      const collision = await db.prepare("SELECT 1 AS found FROM authored_questions WHERE quiz_id<>? AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) LIMIT 1").bind(id, questions).first();
      if (collision) return 'invalid-ids';
      const guard = 'EXISTS (SELECT 1 FROM authored_quizzes WHERE id=? AND owner_id=? AND revision=?)';
      // Each statement is guarded, and D1 batches are atomic: stale writes change nothing.
      // Delete/reinsert permits arbitrary reorder without violating unique bounded positions.
      const results = await db.batch([
        db.prepare(`DELETE FROM authored_questions WHERE quiz_id=? AND ${guard}`).bind(id, id, owner, input.revision),
        db.prepare(`INSERT INTO authored_questions(id,quiz_id,position,prompt,choices,correct_index,explanation) SELECT json_extract(value,'$.id'),?,CAST(key AS INTEGER),json_extract(value,'$.prompt'),json_extract(value,'$.choices'),json_extract(value,'$.correctIndex'),json_extract(value,'$.explanation') FROM json_each(?) WHERE ${guard}`).bind(id, questions, id, owner, input.revision),
        db.prepare('UPDATE authored_quizzes SET title=?,description=?,revision=revision+1,updated_at=unixepoch() WHERE id=? AND owner_id=? AND revision=?').bind(input.title, input.description, id, owner, input.revision),
      ]);
      return results[2].meta.changes === 1 ? 'saved' : 'conflict';
    },
  };
}
