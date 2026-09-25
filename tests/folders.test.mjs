import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { folderStore, folderName } from '../lib/folders.ts';
import { folderApi } from '../lib/folder-api.ts';
import { quizPlacementStore } from '../lib/quiz-placement.ts';
import { quizPlacementApi } from '../lib/quiz-placement-api.ts';
import { folderSharingStore } from '../lib/folder-sharing.ts';
import { sharingStore } from '../lib/quiz-sharing.ts';
import { folderSharingApi, guestFolderApi } from '../lib/folder-sharing-api.ts';
import { folderGuestAttemptStore } from '../lib/folder-guest-attempts.ts';
import { guestAttemptApi } from '../lib/guest-attempt-api.ts';
import { attemptHash } from '../lib/guest-attempts.ts';

function fixture(t) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  sql.exec('PRAGMA foreign_keys=ON');
  const directory = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(directory).filter(f => f.endsWith('.sql')).sort()) {
    sql.exec(readFileSync(new URL(file, directory), 'utf8'));
  }
  const db = { prepare(query) {
    const statement = sql.prepare(query); let args = [];
    return { bind(...values) { args = values; return this; }, async first() { return statement.get(...args) ?? null; }, async all() { return { results: statement.all(...args) }; }, async run() { return statement.run(...args); } };
  }, async batch(statements) {
    sql.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.all()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } };
  return { sql, db, store: folderStore(db), placement: quizPlacementStore(db), shares: folderSharingStore(db), individual: sharingStore(db) };
}

async function attemptFixture(t, count = 2) {
  const base = fixture(t);
  const root = await base.store.create('alice', 'Shared');
  base.sql.exec("INSERT INTO authored_quizzes(id,owner_id) VALUES ('attempt-quiz','alice')");
  const questions = Array.from({ length: count }, (_, i) => ({ id: `q${i}`, prompt: `Question ${i}`, choices: ['Yes','No'], correctIndex: 0, explanation: 'Because yes.' }));
  base.sql.prepare("INSERT INTO quiz_versions(id,quiz_id,draft_revision,title,description,questions_json) VALUES ('attempt-version','attempt-quiz',1,'Quiz','',?)").run(JSON.stringify(questions));
  await base.placement.move('alice', 'attempt-quiz', root.id);
  const share = await base.shares.create('alice', root.id);
  return { ...base, root, share, attempts: folderGuestAttemptStore(base.db, 'attempt-quiz', 'attempt-version'), answers: questions.map(q => ({ questionId: q.id, selectedIndex: 0 })) };
}

test('folder attempts grade 500 questions, restore privately and keep first submission', async t => {
  const { attempts, share, answers, sql, db } = await attemptFixture(t, 500);
  const hash = await attemptHash('a'.repeat(64));
  const first = await attempts.submit(share.id, hash, answers);
  assert.equal(first.result.score, 500);
  const wrong = answers.map(a => ({ ...a, selectedIndex: 1 }));
  const retries = await Promise.all([attempts.submit(share.id, hash, wrong), attempts.submit(share.id, hash, answers)]);
  for (const retry of retries) assert.equal(retry.result.score, 500);
  assert.equal((await attempts.get(share.id, hash)).score, 500);
  assert.equal(await attempts.get(share.id, await attemptHash('b'.repeat(64))), null);
  assert.equal(await attempts.get('c'.repeat(64), hash), null);
  assert.equal(await folderGuestAttemptStore(db, 'wrong-quiz', 'attempt-version').get(share.id, hash), null);
  assert.equal(sql.prepare('SELECT count(*) n FROM folder_guest_attempts').get().n, 1);
  assert.equal(sql.prepare('SELECT count(*) n FROM guest_attempts').get().n, 0);
});

test('folder attempt API validates input and loses access on revocation or move out', async t => {
  const { attempts, share, root, placement, shares, answers, sql } = await attemptFixture(t);
  const api = guestAttemptApi(() => attempts);
  const headers = { 'x-attempt-key': 'd'.repeat(64) };
  assert.equal((await api(request('POST', { answers }), share.id)).status, 404);
  for (const invalid of [answers.slice(0, 1), [answers[0], answers[0]], answers.map(a => ({ ...a, selectedIndex: 5 }))]) assert.equal((await api(request('POST', { answers: invalid }, '', headers), share.id)).status, 400);
  const submitted = await api(request('POST', { answers }, '', headers), share.id);
  assert.equal((await submitted.json()).result.score, 2);
  assert.equal((await api(request('GET', null, '', headers), share.id)).status, 200);
  await placement.move('alice', 'attempt-quiz', null);
  assert.equal((await api(request('GET', null, '', headers), share.id)).status, 404);
  assert.equal((await api(request('POST', { answers }, '', { 'x-attempt-key': 'e'.repeat(64) }), share.id)).status, 404);
  await placement.move('alice', 'attempt-quiz', root.id);
  assert.equal((await api(request('GET', null, '', headers), share.id)).status, 200);
  await shares.revoke('alice', root.id, share.id);
  assert.equal((await api(request('GET', null, '', headers), share.id)).status, 404);
  assert.equal(sql.prepare('SELECT count(*) n FROM folder_guest_attempts').get().n, 1);
});

test('folder access changing between grading and insert prevents storing an attempt', async t => {
  for (const action of ['revoke', 'move']) {
    const { db, sql, share, answers } = await attemptFixture(t);
    const guarded = { prepare(query) {
      const statement = db.prepare(query);
      if (query.includes('INSERT INTO folder_guest_attempts')) {
        const run = statement.run.bind(statement);
        statement.run = async () => {
          if (action === 'revoke') sql.prepare('UPDATE folder_shares SET revoked_at=unixepoch() WHERE id=?').run(share.id);
          else sql.exec("DELETE FROM quiz_folders WHERE quiz_id='attempt-quiz'");
          return run();
        };
      }
      return statement;
    } };
    const attempts = folderGuestAttemptStore(guarded, 'attempt-quiz', 'attempt-version');
    assert.deepEqual(await attempts.submit(share.id, 'f'.repeat(64), answers), { error: 'unavailable' });
    assert.equal(sql.prepare('SELECT count(*) n FROM folder_guest_attempts').get().n, 0);
  }
});

test('folder links are private to owners, idempotent, revocable and replaced with new tokens', async t => {
  const { store, shares } = fixture(t);
  const root = await store.create('alice', 'Course');
  assert.equal(await shares.create('bob', root.id), null);
  const share = await shares.create('alice', root.id);
  assert.match(share.id, /^[a-f0-9]{64}$/);
  assert.equal((await shares.create('alice', root.id)).id, share.id);
  assert.deepEqual(await shares.list('bob', root.id), []);
  assert.equal(await shares.revoke('bob', root.id, share.id), false);
  assert.equal((await shares.browse(share.id)).name, 'Course');
  assert.equal(await shares.revoke('alice', root.id, share.id), true);
  assert.equal(await shares.browse(share.id), null);
  const replacement = await shares.create('alice', root.id);
  assert.notEqual(replacement.id, share.id);
  assert.equal(await shares.browse('invalid'), null);
});

test('folder sharing API guards owner writes and allows safe anonymous reads', async t => {
  const { store, shares, sql, placement } = fixture(t);
  const root = await store.create('alice', 'Shared course');
  const outside = await store.create('alice', 'Private');
  const api = folderSharingApi({ user: async () => ({ userId: 'alice' }), store: () => shares });
  const bob = folderSharingApi({ user: async () => ({ userId: 'bob' }), store: () => shares });
  const anon = folderSharingApi({ user: async () => null, store: () => { throw new Error('No storage'); } });
  assert.equal((await anon(request('POST', {}), root.id)).status, 401);
  assert.equal((await bob(request('POST', {}), root.id)).status, 404);
  for (const body of [null, [], { ownerId: 'bob' }, { folderId: outside.id }]) assert.equal((await api(request('POST', body), root.id)).status, 400);
  assert.equal((await api(request('POST', {}, '', { origin: 'https://evil.test' }), root.id)).status, 403);
  assert.equal((await api(request('POST', {}, '', { origin: '' }), root.id)).status, 403);
  assert.equal((await api(request('POST', {}, '', { 'content-type': 'text/plain' }), root.id)).status, 415);
  assert.equal((await api(request('POST', { name: 'x'.repeat(2000) }), root.id)).status, 413);
  const created = await api(request('POST', {}), root.id);
  assert.equal(created.status, 200);
  const { share } = await created.json();
  const guest = guestFolderApi(() => shares);
  const loaded = await guest(request('GET'), share.id);
  assert.equal((await loaded.json()).folder.name, 'Shared course');
  assert.equal(loaded.headers.get('cache-control'), 'private, no-store');
  assert.equal(loaded.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(loaded.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal((await guest(request('GET', null, `?folderId=${outside.id}`), share.id)).status, 404);
  assert.equal((await guest(request('GET'), 'invalid')).status, 404);
  assert.equal((await guest(request('POST', {}), share.id)).status, 405);
  sql.exec("INSERT INTO authored_quizzes(id,owner_id,title) VALUES ('quiz','alice','PRIVATE DRAFT')");
  const questions = JSON.stringify([{ id: 'q1', prompt: 'Yes?', choices: ['Yes','No'], correctIndex: 0, explanation: 'SECRET' }]);
  sql.prepare("INSERT INTO quiz_versions(id,quiz_id,draft_revision,title,description,questions_json) VALUES ('v1','quiz',1,'Published','',?)").run(questions);
  await placement.move('alice', 'quiz', root.id);
  assert.equal((await guest(request('GET'), share.id, 'quiz')).status, 404);
  const quiz = await guest(request('GET', null, '?version=v1'), share.id, 'quiz');
  const payload = await quiz.json();
  assert.equal(payload.quiz.title, 'Published');
  assert.equal(JSON.stringify(payload).includes('correctIndex'), false);
  assert.equal(JSON.stringify(payload).includes('SECRET'), false);
  assert.equal((await bob(request('DELETE', { token: share.id }), root.id)).status, 404);
  assert.equal((await api(request('DELETE', { token: share.id, ownerId: 'alice' }), root.id)).status, 400);
  assert.equal((await api(request('DELETE', { token: share.id }), root.id)).status, 200);
  assert.equal((await guest(request('GET', null, '?version=v1'), share.id, 'quiz')).status, 404);
  assert.equal((await guest(request('GET'), share.id)).status, 404);
});

test('folder guest access is published-only, subtree-bound, and removed immediately by moves', async t => {
  const { sql, store, placement, shares, individual } = fixture(t);
  const outside = await store.create('alice', 'Private parent');
  const root = await store.create('alice', 'Shared course', outside.id);
  const child = await store.create('alice', 'Chapter', root.id);
  const foreign = await store.create('bob', 'Other owner');
  sql.exec("INSERT INTO authored_quizzes(id,owner_id,title) VALUES ('published','alice','PRIVATE DRAFT TITLE'),('draft','alice','Unpublished secret'),('foreign','bob','Foreign')");
  const questions = JSON.stringify([{ id: 'q1', prompt: 'FIFO?', choices: ['Queue','Stack'], correctIndex: 0, explanation: 'SECRET KEY' }]);
  sql.prepare("INSERT INTO quiz_versions(id,quiz_id,draft_revision,title,description,questions_json) VALUES ('version1','published',1,'Published title','',?)").run(questions);
  await placement.move('alice', 'published', child.id); await placement.move('alice', 'draft', child.id);
  const share = await shares.create('alice', root.id);
  const independent = await individual.create('alice', 'published', 'version1');
  const browse = await shares.browse(share.id);
  assert.deepEqual(browse.folders, [{ id: child.id, name: 'Chapter' }]);
  assert.equal('parent_id' in browse, false);
  for (const denied of [outside.id, foreign.id, 'missing']) assert.equal(await shares.browse(share.id, denied), null);
  const chapter = await shares.browse(share.id, child.id);
  assert.equal(chapter.quizzes.length, 1);
  assert.equal(chapter.quizzes[0].title, 'Published title');
  assert.equal(JSON.stringify(chapter).includes('PRIVATE'), false);
  const guest = await shares.guestQuiz(share.id, 'published', 'version1');
  assert.equal(JSON.stringify(guest).includes('correctIndex'), false);
  assert.equal(JSON.stringify(guest).includes('SECRET'), false);
  assert.equal(await shares.guestQuiz(share.id, 'draft', 'version1'), null);
  await placement.move('alice', 'published', outside.id);
  assert.equal(await shares.guestQuiz(share.id, 'published', 'version1'), null);
  assert.ok(await individual.guest(independent.id));
  await placement.move('alice', 'published', child.id);
  await store.move('alice', child.id, outside.id);
  assert.equal(await shares.browse(share.id, child.id), null);
  assert.equal(await shares.guestQuiz(share.id, 'published', 'version1'), null);
  await store.move('alice', child.id, root.id);
  assert.ok(await shares.guestQuiz(share.id, 'published', 'version1'));
  await shares.revoke('alice', root.id, share.id);
  assert.equal(await shares.guestQuiz(share.id, 'published', 'version1'), null);
  assert.ok(await individual.guest(independent.id));
  assert.equal(sql.prepare('SELECT count(*) n FROM quiz_shares').get().n, 1);
});

test('quiz placement enforces ownership and preserves content and publication', async t => {
  const { sql, store, placement } = fixture(t);
  const folder = await store.create('alice', 'Chapter 1');
  const other = await store.create('bob', 'Private');
  sql.exec("INSERT INTO authored_quizzes(id,owner_id,title) VALUES ('quiz','alice','Existing quiz')");
  const questions = JSON.stringify([{ id: 'q1', prompt: 'Yes?', choices: ['Yes','No'], correctIndex: 0, explanation: '' }]);
  sql.prepare("INSERT INTO quiz_versions(id,quiz_id,draft_revision,title,description,questions_json) VALUES ('v1','quiz',1,'Existing quiz','',?)").run(questions);
  const original = sql.prepare("SELECT * FROM authored_quizzes WHERE id='quiz'").get();
  assert.equal((await placement.list('alice', null)).length, 1);
  assert.equal(await placement.move('bob', 'quiz', other.id), false);
  assert.equal(await placement.move('alice', 'quiz', other.id), false);
  assert.equal(await placement.move('alice', 'quiz', 'missing'), false);
  assert.equal(await placement.move('alice', 'quiz', folder.id), true);
  assert.equal((await placement.get('alice', 'quiz')).folder_id, folder.id);
  assert.equal(await placement.get('bob', 'quiz'), null);
  assert.equal((await placement.list('alice', null)).length, 0);
  assert.equal((await placement.list('alice', folder.id))[0].id, 'quiz');
  const listApi = folderApi({ user: async () => ({ userId: 'alice' }), store: () => store });
  const listed = await (await listApi(request('GET', null, `?parentId=${folder.id}`))).json();
  assert.equal(listed.quizzes[0].id, 'quiz');
  assert.equal('questions_json' in listed.quizzes[0], false);
  assert.equal((await (await listApi(request('GET'))).json()).quizzes.length, 0);
  assert.deepEqual(await placement.list('bob', folder.id), []);
  assert.throws(() => sql.prepare("UPDATE quiz_folders SET folder_id=? WHERE quiz_id='quiz'").run(other.id), /FOREIGN KEY/);
  assert.equal(await placement.move('alice', 'quiz', null), true);
  assert.equal(await placement.move('alice', 'quiz', null), true);
  assert.equal(await placement.move('bob', 'quiz', null), false);
  assert.deepEqual(sql.prepare("SELECT * FROM authored_quizzes WHERE id='quiz'").get(), original);
  assert.equal(sql.prepare("SELECT questions_json FROM quiz_versions WHERE id='v1'").get().questions_json, questions);
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(), []);
});

test('quiz placement API validates identity, origin, body and destination', async t => {
  const { sql, store, placement } = fixture(t);
  const folder = await store.create('alice', 'Course');
  sql.exec("INSERT INTO authored_quizzes(id,owner_id) VALUES ('quiz','alice')");
  const api = quizPlacementApi({ user: async () => ({ userId: 'alice' }), store: () => placement });
  const anon = quizPlacementApi({ user: async () => null, store: () => { throw new Error('No storage'); } });
  assert.equal((await anon(request('GET'), 'quiz')).status, 401);
  for (const body of [{}, { folderId: 4 }, { folderId: folder.id, ownerId: 'bob' }]) assert.equal((await api(request('PATCH', body), 'quiz')).status, 400);
  assert.equal((await api(request('PATCH', { folderId: folder.id }, '', { origin: 'https://evil.test' }), 'quiz')).status, 403);
  assert.equal((await api(request('PATCH', { folderId: 'x'.repeat(2000) }), 'quiz')).status, 413);
  assert.equal((await api(request('PATCH', { folderId: 'missing' }), 'quiz')).status, 404);
  assert.equal((await api(request('PATCH', { folderId: folder.id }), 'quiz')).status, 200);
  const response = await api(request('GET'), 'quiz');
  assert.equal((await response.json()).placement.folder_id, folder.id);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

const request = (method, body, query = '', headers = {}) => new Request(`https://study.test/api/folders${query}`, {
  method, headers: { origin: 'https://study.test', 'content-type': 'application/json', ...headers },
  ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
});
test('folder API supports private creation, browsing, rename and cycle-safe moves', async t => {
  const { store } = fixture(t);
  const alice = folderApi({ user: async () => ({ userId: 'alice' }), store: () => store });
  const bob = folderApi({ user: async () => ({ userId: 'bob' }), store: () => store });
  const created = await alice(request('POST', { name: 'CS3310' }));
  assert.equal(created.status, 201);
  const { folder: root } = await created.json();
  const { folder: child } = await (await alice(request('POST', { name: 'Chapter 1', parentId: root.id }))).json();
  assert.equal((await (await alice(request('GET', null, `?parentId=${root.id}`))).json()).folders[0].id, child.id);
  assert.equal((await alice(request('PATCH', { name: 'Introduction' }), child.id)).status, 200);
  assert.equal((await alice(request('PATCH', { parentId: child.id }), root.id)).status, 409);
  assert.equal((await alice(request('PATCH', { parentId: null }), child.id)).status, 200);
  for (const method of ['GET', 'PATCH']) assert.equal((await bob(request(method, { name: 'Stolen' }), root.id)).status, 404);
  assert.equal((await bob(request('GET', null, `?parentId=${root.id}`))).status, 404);
  assert.equal((await bob(request('POST', { name: 'Hidden', parentId: root.id }))).status, 404);
  assert.equal((await alice(request('GET'), root.id)).headers.get('cache-control'), 'private, no-store');
});

test('folder API rejects unauthenticated, forged, oversized and cross-origin writes', async t => {
  const { store } = fixture(t);
  const anonymous = folderApi({ user: async () => null, store: () => { throw new Error('Must not access storage'); } });
  assert.equal((await anonymous(request('POST', { name: 'No' }))).status, 401);
  const api = folderApi({ user: async () => ({ userId: 'alice' }), store: () => store });
  for (const body of [{ name: 'X', ownerId: 'bob' }, { name: '' }, { name: 'x'.repeat(121) }, { name: 'X', parentId: 2 }, [], null]) {
    assert.equal((await api(request('POST', body))).status, 400);
  }
  for (const headers of [{ origin: 'https://evil.test' }, { origin: '' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await api(request('POST', { name: 'X' }, '', headers))).status, 403);
  assert.equal((await api(request('POST', { name: 'X' }, '', { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await api(request('POST', { name: 'x'.repeat(3000) }))).status, 413);
  assert.equal((await api(new Request('https://study.test/api/folders', { method: 'POST', headers: { origin: 'https://study.test', 'content-type': 'application/json' }, body: '{' }))).status, 400);
  assert.equal((await api(request('PATCH', { name: 'X', parentId: null }), 'valid-id')).status, 400);
  assert.equal((await api(request('DELETE', {}), 'valid-id')).status, 405);
  assert.deepEqual(await store.list('alice'), []);
});

test('nested folders are private, named, and sorted deterministically', async t => {
  const { store } = fixture(t);
  const course = await store.create('alice', ' CS3310 ');
  const chapter2 = await store.create('alice', 'Chapter 2', course.id);
  const chapter1 = await store.create('alice', 'Chapter 1', course.id);
  const duplicate = await store.create('alice', 'Chapter 1', course.id);
  assert.equal(course.name, 'CS3310');
  assert.deepEqual((await store.list('alice')).map(f => f.id), [course.id]);
  const children = await store.list('alice', course.id);
  assert.deepEqual(children.map(f => f.id), [chapter1.id, duplicate.id].sort((a, b) => a < b ? -1 : a > b ? 1 : 0).concat(chapter2.id));
  assert.deepEqual(await store.list('bob', course.id), []);
  assert.equal(await store.get('bob', chapter1.id), null);
  assert.equal(await store.rename('bob', chapter1.id, 'Stolen'), null);
  assert.equal(await store.create('bob', 'Hidden', course.id), null);
  assert.equal(await store.create('alice', 'Orphan', 'missing'), null);
  assert.equal((await store.rename('alice', chapter1.id, 'Introduction')).name, 'Introduction');
  for (const value of ['', '   ', 'a'.repeat(121), null, {}]) assert.equal(folderName(value), null);
  await assert.rejects(store.create('alice', ' '), /1–120/);
  assert.equal(folderName('a'.repeat(120)).length, 120);
});

test('moves preserve subtrees and reject self, descendant, missing and other-owner targets', async t => {
  const { store } = fixture(t);
  const root = await store.create('alice', 'Course');
  const child = await store.create('alice', 'Chapter', root.id);
  const leaf = await store.create('alice', 'Section', child.id);
  const other = await store.create('bob', 'Private');
  for (const parent of [root.id, child.id, leaf.id, other.id, 'missing']) assert.equal(await store.move('alice', root.id, parent), null);
  assert.equal(await store.move('bob', child.id, null), null);
  assert.equal((await store.move('alice', child.id, null)).parent_id, null);
  assert.equal((await store.get('alice', leaf.id)).parent_id, child.id);
  // Competing inverse moves: only one may succeed.
  const results = await Promise.all([store.move('alice', root.id, child.id), store.move('alice', child.id, root.id)]);
  assert.equal(results.filter(Boolean).length, 1);
});

test('database rejects direct cycles, ownership changes and cross-owner parenting', async t => {
  const { sql, store } = fixture(t);
  const a = await store.create('alice', 'A');
  const b = await store.create('alice', 'B', a.id);
  const c = await store.create('alice', 'C', b.id);
  const foreign = await store.create('bob', 'Other');
  assert.throws(() => sql.prepare('UPDATE folders SET parent_id=? WHERE id=?').run(c.id, a.id), /cycle/);
  assert.throws(() => sql.prepare('UPDATE folders SET parent_id=? WHERE id=?').run(a.id, a.id), /cycle|CHECK/);
  assert.throws(() => sql.prepare('UPDATE folders SET parent_id=? WHERE id=?').run(foreign.id, c.id), /FOREIGN KEY/);
  assert.throws(() => sql.prepare("UPDATE folders SET owner_id='bob' WHERE id=?").run(a.id), /immutable/);
  assert.throws(() => sql.prepare("UPDATE folders SET id='replacement' WHERE id=?").run(c.id), /immutable/);
  assert.throws(() => sql.prepare("INSERT INTO folders(id,owner_id,parent_id,name) VALUES ('bad','bob',?,'Bad')").run(a.id), /FOREIGN KEY/);
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(), []);
});
