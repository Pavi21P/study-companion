import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { MAX_QUIZ_QUESTIONS, MIN_QUIZ_CHOICES, MAX_QUIZ_CHOICES, MAX_QUIZ_TITLE, MAX_QUIZ_DESCRIPTION, MAX_QUESTION_PROMPT, MAX_QUESTION_EXPLANATION, MAX_QUIZ_SNAPSHOT_BYTES, type PublishedManualQuestion } from '../lib/manual-quiz-limits';

// IDs are assigned by server code; timestamps are Unix seconds.
const id = () => text('id').primaryKey();
const createdAt = () => integer('created_at').notNull().default(sql`(unixepoch())`);

export const users = sqliteTable('users', {
  id: id(), // Stable, Site-scoped identity supplied by trusted Sites authentication.
  createdAt: createdAt(),
});

// Parent ownership is enforced even for direct database writes. Cycle triggers
// live in the folder migration; keep them when evolving this table.
export const folders = sqliteTable('folders', {
  id: id(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  parentId: text('parent_id'),
  name: text('name').notNull(),
  createdAt: createdAt(),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
}, table => [
  uniqueIndex('uq_folders_id_owner').on(table.id, table.ownerId),
  foreignKey({ columns: [table.parentId, table.ownerId], foreignColumns: [table.id, table.ownerId] }),
  index('idx_folders_owner_parent_name').on(table.ownerId, table.parentId, table.name, table.id),
  check('folder_name', sql`length(trim(${table.name})) BETWEEN 1 AND 120`),
  check('folder_not_self', sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`),
]);

export const folderShares = sqliteTable('folder_shares', {
  id: id(), // Random 256-bit capability, independently revocable.
  folderId: text('folder_id').notNull().references(() => folders.id),
  createdAt: createdAt(),
  revokedAt: integer('revoked_at'),
}, table => [
  uniqueIndex('uq_folder_shares_active').on(table.folderId).where(sql`${table.revokedAt} IS NULL`),
  index('idx_folder_shares_folder').on(table.folderId),
  check('folder_share_token', sql`length(${table.id}) = 64`),
  check('folder_share_revocation', sql`${table.revokedAt} IS NULL OR ${table.revokedAt} >= ${table.createdAt}`),
]);

// Manual drafts have no dependency on documents, passages or AI configuration.
export const authoredQuizzes = sqliteTable('authored_quizzes', {
  id: id(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  title: text('title').notNull().default('Untitled quiz'),
  description: text('description').notNull().default(''),
  revision: integer('revision').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
}, table => [
  index('idx_authored_quizzes_owner_updated').on(table.ownerId, table.updatedAt),
  uniqueIndex('uq_authored_quizzes_id_owner').on(table.id, table.ownerId),
  check('authored_quiz_title', sql`length(trim(${table.title})) BETWEEN 1 AND ${sql.raw(String(MAX_QUIZ_TITLE))}`),
  check('authored_quiz_description', sql`length(${table.description}) <= ${sql.raw(String(MAX_QUIZ_DESCRIPTION))}`),
  check('authored_quiz_revision', sql`typeof(${table.revision}) = 'integer' AND ${table.revision} >= 1`),
]);

// Organization is separate from content revisions and immutable publications.
export const quizFolders = sqliteTable('quiz_folders', {
  quizId: text('quiz_id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  folderId: text('folder_id').notNull(),
}, table => [
  foreignKey({ columns: [table.quizId, table.ownerId], foreignColumns: [authoredQuizzes.id, authoredQuizzes.ownerId] }),
  foreignKey({ columns: [table.folderId, table.ownerId], foreignColumns: [folders.id, folders.ownerId] }),
  index('idx_quiz_folders_owner_folder').on(table.ownerId, table.folderId),
]);

export const authoredQuestions = sqliteTable('authored_questions', {
  id: id(),
  quizId: text('quiz_id').notNull().references(() => authoredQuizzes.id),
  position: integer('position').notNull(),
  prompt: text('prompt').notNull().default(''),
  choices: text('choices', { mode: 'json' }).$type<string[]>().notNull().default(sql`'["",""]'`),
  correctIndex: integer('correct_index'), // Null and blank text are allowed in drafts.
  explanation: text('explanation').notNull().default(''),
}, table => [
  uniqueIndex('uq_authored_questions_quiz_position').on(table.quizId, table.position),
  check('authored_question_position', sql`typeof(${table.position}) = 'integer' AND ${table.position} BETWEEN 0 AND ${sql.raw(String(MAX_QUIZ_QUESTIONS - 1))}`),
  check('authored_question_prompt', sql`length(${table.prompt}) <= ${sql.raw(String(MAX_QUESTION_PROMPT))}`),
  check('authored_question_explanation', sql`length(${table.explanation}) <= ${sql.raw(String(MAX_QUESTION_EXPLANATION))}`),
  check('authored_question_choices_json', sql`json_valid(${table.choices})`),
  check('authored_question_choices_array', sql`json_type(${table.choices}) = 'array' AND json_array_length(${table.choices}) BETWEEN ${sql.raw(String(MIN_QUIZ_CHOICES))} AND ${sql.raw(String(MAX_QUIZ_CHOICES))}`),
  check('authored_question_correct_index', sql`${table.correctIndex} IS NULL OR (typeof(${table.correctIndex}) = 'integer' AND ${table.correctIndex} >= 0 AND ${table.correctIndex} < json_array_length(${table.choices}))`),
]);

// Immutable payloads include answer keys: never serialize this record to guests.
// Share links and attempts will reference the version ID, not the mutable draft.
export const quizVersions = sqliteTable('quiz_versions', {
  id: id(),
  quizId: text('quiz_id').notNull().references(() => authoredQuizzes.id),
  draftRevision: integer('draft_revision').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  questionsJson: text('questions_json', { mode: 'json' }).$type<PublishedManualQuestion[]>().notNull(),
  createdAt: createdAt(),
}, table => [
  uniqueIndex('uq_quiz_versions_quiz_revision').on(table.quizId, table.draftRevision),
  check('quiz_version_revision', sql`typeof(${table.draftRevision}) = 'integer' AND ${table.draftRevision} >= 1`),
  check('quiz_version_title', sql`length(trim(${table.title})) BETWEEN 1 AND ${sql.raw(String(MAX_QUIZ_TITLE))}`),
  check('quiz_version_description', sql`length(${table.description}) <= ${sql.raw(String(MAX_QUIZ_DESCRIPTION))}`),
  check('quiz_version_questions_json', sql`json_valid(${table.questionsJson})`),
  check('quiz_version_question_count', sql`json_type(${table.questionsJson}) = 'array' AND json_array_length(${table.questionsJson}) BETWEEN 1 AND ${sql.raw(String(MAX_QUIZ_QUESTIONS))}`),
  check('quiz_version_snapshot_size', sql`length(CAST(${table.questionsJson} AS BLOB)) <= ${sql.raw(String(MAX_QUIZ_SNAPSHOT_BYTES))}`),
]);

export const quizShares = sqliteTable('quiz_shares', {
  id: id(), // 256-bit opaque link token, generated server-side.
  versionId: text('version_id').notNull().references(() => quizVersions.id),
  createdAt: createdAt(),
  revokedAt: integer('revoked_at'),
}, table => [
  uniqueIndex('uq_quiz_shares_active_version').on(table.versionId).where(sql`${table.revokedAt} IS NULL`),
  index('idx_quiz_shares_version').on(table.versionId),
  uniqueIndex('uq_quiz_shares_id_version').on(table.id, table.versionId),
  check('quiz_share_token_length', sql`length(${table.id}) = 64`),
  check('quiz_share_revocation', sql`${table.revokedAt} IS NULL OR ${table.revokedAt} >= ${table.createdAt}`),
]);

// Completed anonymous attempts. The id is a SHA-256 hash of a private client
// capability; neither this id nor the private capability is a public share URL.
export const guestAttempts = sqliteTable('guest_attempts', {
  id: id(),
  shareId: text('share_id').notNull(),
  versionId: text('version_id').notNull(),
  answersJson: text('answers_json').notNull(),
  score: integer('score').notNull(),
  questionCount: integer('question_count').notNull(),
  createdAt: createdAt(),
}, table => [
  foreignKey({ columns: [table.shareId, table.versionId], foreignColumns: [quizShares.id, quizShares.versionId] }),
  index('idx_guest_attempts_share').on(table.shareId),
  check('guest_attempt_id', sql`length(${table.id}) = 64`),
  check('guest_attempt_count', sql`${table.questionCount} BETWEEN 1 AND 500`),
  check('guest_attempt_score', sql`${table.score} BETWEEN 0 AND ${table.questionCount}`),
  check('guest_attempt_answers', sql`json_valid(${table.answersJson}) AND json_type(${table.answersJson}) = 'array' AND json_array_length(${table.answersJson}) = ${table.questionCount}`),
]);

export const folderGuestAttempts = sqliteTable('folder_guest_attempts', {
  id: id(), // SHA-256 of private visitor capability, never a URL token.
  shareId: text('share_id').notNull().references(() => folderShares.id),
  versionId: text('version_id').notNull().references(() => quizVersions.id),
  answersJson: text('answers_json').notNull(),
  score: integer('score').notNull(),
  questionCount: integer('question_count').notNull(),
  createdAt: createdAt(),
}, table => [
  index('idx_folder_guest_attempts_share').on(table.shareId),
  check('folder_attempt_id', sql`length(${table.id}) = 64`),
  check('folder_attempt_count', sql`${table.questionCount} BETWEEN 1 AND 500`),
  check('folder_attempt_score', sql`${table.score} BETWEEN 0 AND ${table.questionCount}`),
  check('folder_attempt_answers', sql`json_valid(${table.answersJson}) AND json_type(${table.answersJson}) = 'array' AND json_array_length(${table.answersJson}) = ${table.questionCount}`),
]);

export const courses = sqliteTable('courses', {
  id: id(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  createdAt: createdAt(),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
}, table => [
  index('idx_courses_owner_created').on(table.ownerId, table.createdAt),
  check('courses_title_length', sql`length(trim(${table.title})) BETWEEN 1 AND 120`),
  check('courses_description_length', sql`length(${table.description}) <= 1000`),
]);

export const sources = sqliteTable('sources', {
  id: id(),
  courseId: text('course_id').notNull().references(() => courses.id),
  filename: text('filename').notNull(),
  format: text('format', { enum: ['pdf', 'pptx'] }).notNull(),
  objectKey: text('object_key').notNull(), // Private R2 key, never a public URL.
  byteSize: integer('byte_size').notNull(),
  status: text('status', { enum: ['pending', 'processing', 'ready', 'failed'] }).notNull().default('pending'),
  errorMessage: text('error_message'),
  createdAt: createdAt(),
}, table => [
  index('idx_sources_course').on(table.courseId),
  uniqueIndex('uq_sources_object_key').on(table.objectKey),
  check('sources_size', sql`${table.byteSize} BETWEEN 1 AND 10485760`),
  check('sources_format', sql`${table.format} IN ('pdf', 'pptx')`),
  check('sources_status', sql`${table.status} IN ('pending', 'processing', 'ready', 'failed')`),
]);

export const passages = sqliteTable('passages', {
  id: id(),
  sourceId: text('source_id').notNull().references(() => sources.id),
  position: integer('position').notNull(),
  location: integer('location').notNull(), // One-based PDF page or PPTX slide.
  heading: text('heading'),
  content: text('content').notNull(),
}, table => [
  uniqueIndex('uq_passages_source_position').on(table.sourceId, table.position),
  uniqueIndex('uq_passages_id_source').on(table.id, table.sourceId),
  check('passages_position', sql`${table.position} >= 0`),
  check('passages_location', sql`${table.location} BETWEEN 1 AND 100`),
  check('passages_content', sql`length(trim(${table.content})) > 0`),
]);

export const studySets = sqliteTable('study_sets', {
  id: id(),
  sourceId: text('source_id').notNull().references(() => sources.id),
  kind: text('kind', { enum: ['quiz', 'flashcards'] }).notNull(),
  title: text('title').notNull(),
  status: text('status', { enum: ['pending', 'generating', 'ready', 'failed'] }).notNull().default('pending'),
  model: text('model'),
  promptVersion: text('prompt_version'),
  requestKey: text('request_key').notNull(), // Server idempotency key for one generation request.
  errorMessage: text('error_message'),
  createdAt: createdAt(),
}, table => [
  index('idx_study_sets_source').on(table.sourceId),
  uniqueIndex('uq_study_sets_request').on(table.requestKey),
  uniqueIndex('uq_study_sets_id_source').on(table.id, table.sourceId),
  check('study_sets_kind', sql`${table.kind} IN ('quiz', 'flashcards')`),
  check('study_sets_status', sql`${table.status} IN ('pending', 'generating', 'ready', 'failed')`),
]);

export const questions = sqliteTable('questions', {
  id: id(),
  studySetId: text('study_set_id').notNull(),
  sourceId: text('source_id').notNull(),
  position: integer('position').notNull(),
  prompt: text('prompt').notNull(),
  // Structured options contain explanations. Keep this server-only until submission.
  options: text('options', { mode: 'json' }).$type<Array<{ text: string; explanation: string }>>().notNull(),
  correctIndex: integer('correct_index').notNull(),
}, table => [
  foreignKey({ columns: [table.studySetId, table.sourceId], foreignColumns: [studySets.id, studySets.sourceId] }),
  uniqueIndex('uq_questions_set_position').on(table.studySetId, table.position),
  uniqueIndex('uq_questions_id_set').on(table.id, table.studySetId),
  uniqueIndex('uq_questions_id_source').on(table.id, table.sourceId),
  check('questions_position', sql`${table.position} >= 0`),
  check('questions_prompt', sql`length(trim(${table.prompt})) > 0`),
  check('questions_options_json', sql`json_valid(${table.options})`),
  check('questions_options_array', sql`json_type(${table.options}) = 'array' AND json_array_length(${table.options}) BETWEEN 2 AND 6`),
  check('questions_correct_index', sql`${table.correctIndex} >= 0 AND ${table.correctIndex} < json_array_length(${table.options})`),
]);

export const questionPassages = sqliteTable('question_passages', {
  questionId: text('question_id').notNull(),
  passageId: text('passage_id').notNull(),
  sourceId: text('source_id').notNull(),
}, table => [
  uniqueIndex('uq_question_passages_pair').on(table.questionId, table.passageId),
  foreignKey({ columns: [table.questionId, table.sourceId], foreignColumns: [questions.id, questions.sourceId] }),
  foreignKey({ columns: [table.passageId, table.sourceId], foreignColumns: [passages.id, passages.sourceId] }),
]);

export const flashcards = sqliteTable('flashcards', {
  id: id(),
  studySetId: text('study_set_id').notNull(),
  sourceId: text('source_id').notNull(),
  passageId: text('passage_id').notNull(),
  position: integer('position').notNull(),
  front: text('front').notNull(),
  back: text('back').notNull(),
}, table => [
  foreignKey({ columns: [table.studySetId, table.sourceId], foreignColumns: [studySets.id, studySets.sourceId] }),
  foreignKey({ columns: [table.passageId, table.sourceId], foreignColumns: [passages.id, passages.sourceId] }),
  uniqueIndex('uq_flashcards_set_position').on(table.studySetId, table.position),
  check('flashcards_position', sql`${table.position} >= 0`),
  check('flashcards_text', sql`length(trim(${table.front})) > 0 AND length(trim(${table.back})) > 0`),
]);

export const quizAttempts = sqliteTable('quiz_attempts', {
  id: id(),
  studySetId: text('study_set_id').notNull().references(() => studySets.id),
  userId: text('user_id').notNull().references(() => users.id),
  questionCount: integer('question_count').notNull(),
  score: integer('score'),
  createdAt: createdAt(),
  completedAt: integer('completed_at'),
}, table => [
  index('idx_attempts_user_created').on(table.userId, table.createdAt),
  index('idx_attempts_set').on(table.studySetId),
  uniqueIndex('uq_attempts_id_set').on(table.id, table.studySetId),
  check('attempts_question_count', sql`${table.questionCount} > 0`),
  check('attempts_score', sql`${table.score} IS NULL OR ${table.score} BETWEEN 0 AND ${table.questionCount}`),
  check('attempts_completion', sql`(${table.completedAt} IS NULL AND ${table.score} IS NULL) OR (${table.completedAt} IS NOT NULL AND ${table.score} IS NOT NULL AND ${table.completedAt} >= ${table.createdAt})`),
]);

export const responses = sqliteTable('responses', {
  id: id(),
  attemptId: text('attempt_id').notNull(),
  questionId: text('question_id').notNull(),
  studySetId: text('study_set_id').notNull(),
  selectedIndex: integer('selected_index').notNull(),
  isCorrect: integer('is_correct', { mode: 'boolean' }).notNull(),
  createdAt: createdAt(),
}, table => [
  foreignKey({ columns: [table.attemptId, table.studySetId], foreignColumns: [quizAttempts.id, quizAttempts.studySetId] }),
  foreignKey({ columns: [table.questionId, table.studySetId], foreignColumns: [questions.id, questions.studySetId] }),
  uniqueIndex('uq_responses_attempt_question').on(table.attemptId, table.questionId),
  check('responses_selected_index', sql`${table.selectedIndex} BETWEEN 0 AND 5`),
  check('responses_correct_boolean', sql`${table.isCorrect} IN (0, 1)`),
]);
