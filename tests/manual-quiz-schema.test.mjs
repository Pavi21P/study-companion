import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { MAX_QUIZ_QUESTIONS, MAX_QUIZ_SNAPSHOT_BYTES } from '../lib/manual-quiz-limits.ts';

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(readFileSync(new URL('../drizzle/0000_first_blue_blade.sql', import.meta.url), 'utf8'));
  // Existing data must survive both additive migrations unchanged.
  db.exec("INSERT INTO users(id) VALUES ('alice'); INSERT INTO courses(id,owner_id,title) VALUES ('old-course','alice','Existing course')");
  for (const file of ['0001_same_shard.sql', '0002_immutable_quiz_versions.sql']) {
    db.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  }
  db.exec("INSERT INTO authored_quizzes(id,owner_id,title) VALUES ('quiz','alice','CS3310 Chapter 1')");
  return db;
}
const question = id => ({ id, prompt: 'Which structure uses FIFO?', choices: ['Queue', 'Stack'], correctIndex: 0, explanation: 'Queues remove the oldest entry first.' });
function publish(db, questions, revision = 1) {
  db.prepare('INSERT INTO quiz_versions(id,quiz_id,draft_revision,title,description,questions_json) VALUES (?,?,?,?,?,?)')
    .run(`version-${revision}`, 'quiz', revision, 'CS3310 Chapter 1', '', JSON.stringify(questions));
}

test('manual schema preserves existing data and creates source-free drafts', t => {
  const db = fixture(t);
  assert.equal(db.prepare("SELECT title FROM courses WHERE id='old-course'").get().title, 'Existing course');
  assert.equal(db.prepare('SELECT count(*) n FROM sources').get().n, 0);
  db.exec("INSERT INTO authored_questions(id,quiz_id,position) VALUES ('incomplete','quiz',0)");
  const draft = db.prepare("SELECT * FROM authored_questions WHERE id='incomplete'").get();
  assert.equal(draft.prompt, ''); assert.equal(draft.correct_index, null);
  assert.deepEqual(JSON.parse(draft.choices), ['', '']);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.throws(() => db.exec("INSERT INTO authored_quizzes(id,owner_id) VALUES ('orphan','nobody')"), /FOREIGN KEY/);
  assert.match(db.prepare("EXPLAIN QUERY PLAN SELECT id FROM authored_quizzes WHERE owner_id='alice' ORDER BY updated_at DESC").get().detail, /idx_authored_quizzes_owner_updated/);
});

test('500 draft questions and 500 published questions fit; question 501 is rejected', t => {
  const db = fixture(t);
  const insert = db.prepare('INSERT INTO authored_questions(id,quiz_id,position) VALUES (?,?,?)');
  for (let i = 0; i < MAX_QUIZ_QUESTIONS; i++) insert.run(`q-${i}`, 'quiz', i);
  assert.equal(db.prepare('SELECT count(*) n FROM authored_questions').get().n, 500);
  assert.throws(() => insert.run('extra', 'quiz', 500), /CHECK/);
  assert.throws(() => insert.run('same-position', 'quiz', 499), /UNIQUE/);
  const questions = Array.from({ length: MAX_QUIZ_QUESTIONS }, (_, i) => question(`q-${i}`));
  publish(db, questions);
  assert.equal(JSON.parse(db.prepare('SELECT questions_json FROM quiz_versions').get().questions_json).length, 500);
  assert.throws(() => publish(db, [...questions, question('extra')], 2), /1 to 500/);
});

test('published questions reject incomplete answers, duplicate IDs and invalid choice contents', t => {
  const db = fixture(t);
  for (const questions of [[], [{}], [{ ...question('a'), prompt: ' ' }], [{ ...question('a'), correctIndex: null }], [{ ...question('a'), correctIndex: 2 }], [{ ...question('a'), correctIndex: 0.5 }], [{ ...question('a'), choices: ['', 'Answer'] }], [{ ...question('a'), choices: ['Answer', {}] }], [question('a'), question('a')]]) {
    assert.throws(() => publish(db, questions), /Published/);
  }
  publish(db, [question('valid')]);
  assert.throws(() => publish(db, [question('duplicate-revision')]), /UNIQUE/);
});

test('editing a draft cannot mutate a published snapshot', t => {
  const db = fixture(t);
  db.exec("INSERT INTO authored_questions(id,quiz_id,position,prompt,choices,correct_index) VALUES ('draft','quiz',0,'Original?', '[\"Yes\",\"No\"]',0)");
  publish(db, [question('draft')]);
  const original = db.prepare('SELECT * FROM quiz_versions').get();
  db.exec("UPDATE authored_questions SET prompt='Edited draft' WHERE id='draft'; UPDATE authored_quizzes SET title='New title',revision=2 WHERE id='quiz'");
  assert.deepEqual(db.prepare('SELECT * FROM quiz_versions').get(), original);
  assert.throws(() => db.exec("UPDATE quiz_versions SET title='Changed'"), /immutable/);
  assert.throws(() => db.exec("UPDATE quiz_versions SET questions_json='[]'"), /immutable/);
  publish(db, [{ ...question('draft'), prompt: 'Updated question?' }], 2);
  assert.equal(db.prepare('SELECT count(*) n FROM quiz_versions').get().n, 2);
});

test('snapshot byte budget protects storage even within the question-count limit', t => {
  const db = fixture(t);
  const questions = Array.from({ length: 500 }, (_, i) => ({ ...question(String(i)), explanation: 'x'.repeat(4000) }));
  assert.ok(Buffer.byteLength(JSON.stringify(questions)) > MAX_QUIZ_SNAPSHOT_BYTES);
  assert.throws(() => publish(db, questions), /CHECK/);
});
