import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migration = readFileSync(new URL('../drizzle/0000_first_blue_blade.sql', import.meta.url), 'utf8');

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(migration);
  db.exec(`
    INSERT INTO users(id) VALUES ('alice'), ('bob');
    INSERT INTO courses(id,owner_id,title) VALUES ('course-a','alice','Biology'),('course-b','bob','Chemistry');
    INSERT INTO sources(id,course_id,filename,format,object_key,byte_size) VALUES
      ('source-a','course-a','notes.pdf','pdf','private/a',100),
      ('source-b','course-b','slides.pptx','pptx','private/b',200);
    INSERT INTO passages(id,source_id,position,location,content) VALUES
      ('passage-a','source-a',0,1,'Cells have membranes.'),('passage-b','source-b',0,1,'Atoms contain protons.');
    INSERT INTO study_sets(id,source_id,kind,title,request_key) VALUES
      ('set-a','source-a','quiz','Quiz A','request-a'),('set-b','source-b','quiz','Quiz B','request-b'),
      ('cards-a','source-a','flashcards','Cards A','request-cards-a');
  `);
  const options = JSON.stringify([{ text: 'Correct', explanation: 'Supported by the passage.' }, { text: 'Incorrect', explanation: 'Contradicts the passage.' }]);
  const insert = db.prepare('INSERT INTO questions(id,study_set_id,source_id,position,prompt,options,correct_index) VALUES (?,?,?,?,?,?,?)');
  insert.run('question-a','set-a','source-a',0,'Sample question A?',options,0);
  insert.run('question-b','set-b','source-b',0,'Sample question B?',options,0);
  db.exec("INSERT INTO quiz_attempts(id,study_set_id,user_id,question_count) VALUES ('attempt-a','set-a','alice',1)");
  return db;
}

test('migration creates an intact schema with indexed course ownership', t => {
  const db = fixture(t);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table'").get().n, 10);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.exec('PRAGMA optimize');
  assert.match(db.prepare("EXPLAIN QUERY PLAN SELECT id FROM courses WHERE owner_id='alice' ORDER BY created_at").get().detail, /idx_courses_owner_created/);
  assert.throws(() => db.exec("INSERT INTO courses(id,owner_id,title) VALUES ('orphan','missing','Title')"), /FOREIGN KEY/);
  assert.throws(() => db.exec("INSERT INTO courses(id,owner_id,title) VALUES ('blank','alice','   ')"), /CHECK/);
});

test('citations and flashcards cannot cross source boundaries', t => {
  const db = fixture(t);
  db.exec("INSERT INTO question_passages VALUES ('question-a','passage-a','source-a')");
  assert.throws(() => db.exec("INSERT INTO question_passages VALUES ('question-a','passage-b','source-a')"), /FOREIGN KEY/);
  assert.throws(() => db.exec("INSERT INTO flashcards VALUES ('card-a','cards-a','source-a','passage-b',0,'Front','Back')"), /FOREIGN KEY/);
  db.exec("INSERT INTO flashcards VALUES ('card-a','cards-a','source-a','passage-a',0,'Front','Back')");
});

test('responses reject questions from another set and duplicate submissions', t => {
  const db = fixture(t);
  assert.throws(() => db.exec("INSERT INTO responses(id,attempt_id,question_id,study_set_id,selected_index,is_correct) VALUES ('bad','attempt-a','question-b','set-a',0,1)"), /FOREIGN KEY/);
  db.exec("INSERT INTO responses(id,attempt_id,question_id,study_set_id,selected_index,is_correct) VALUES ('response-a','attempt-a','question-a','set-a',0,1)");
  assert.throws(() => db.exec("INSERT INTO responses(id,attempt_id,question_id,study_set_id,selected_index,is_correct) VALUES ('duplicate','attempt-a','question-a','set-a',1,0)"), /UNIQUE/);
});

test('invalid answer keys, scores, and source sizes are rejected', t => {
  const db = fixture(t);
  assert.throws(() => db.exec("UPDATE questions SET correct_index=2 WHERE id='question-a'"), /CHECK/);
  assert.throws(() => db.exec("UPDATE questions SET options='{}' WHERE id='question-a'"), /CHECK/);
  assert.throws(() => db.exec("UPDATE quiz_attempts SET score=2, completed_at=unixepoch() WHERE id='attempt-a'"), /CHECK/);
  assert.throws(() => db.exec("UPDATE quiz_attempts SET score=1 WHERE id='attempt-a'"), /CHECK/);
  assert.throws(() => db.exec("UPDATE sources SET byte_size=10485761 WHERE id='source-a'"), /CHECK/);
  db.exec("UPDATE quiz_attempts SET score=1, completed_at=unixepoch() WHERE id='attempt-a'");
  assert.equal(db.prepare("SELECT score FROM quiz_attempts WHERE id='attempt-a'").get().score, 1);
});
