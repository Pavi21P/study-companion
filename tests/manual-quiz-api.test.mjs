import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { manualQuizStore, parseDraft } from '../lib/manual-quizzes.ts';
import { sharingStore } from '../lib/quiz-sharing.ts';
import { sharingApi, guestQuizApi } from '../lib/quiz-sharing-api.ts';
import { guestAttemptStore, attemptHash } from '../lib/guest-attempts.ts';
import { guestAttemptApi } from '../lib/guest-attempt-api.ts';
import { manualQuizApi } from '../lib/manual-quiz-api.ts';

function fixture(t) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close()); sql.exec('PRAGMA foreign_keys=ON');
  for (const file of ['0000_first_blue_blade.sql', '0001_same_shard.sql', '0002_immutable_quiz_versions.sql', '0003_daffy_bill_hollister.sql', '0004_daily_ken_ellis.sql']) sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const db = {
    prepare(query) {
      const stmt = sql.prepare(query); let args = [];
      return { bind(...values) { args = values; return this; }, async first() { return stmt.get(...args) ?? null; }, async all() { return { results: stmt.all(...args) }; }, async run() { const r = stmt.run(...args); return { results: [], meta: { changes: Number(r.changes) } }; } };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const results = []; for (const stmt of statements) results.push(await stmt.run()); sql.exec('COMMIT'); return results; }
      catch (e) { sql.exec('ROLLBACK'); throw e; }
    },
  };
  return { sql, db, store: manualQuizStore(db) };
}
const question = i => ({ id: `q-${i}`, prompt: `Question ${i}?`, choices: ['Yes', 'No'], correctIndex: 0, explanation: '' });
const input = (revision = 1, count = 1) => ({ title: 'CS3310', description: '', revision, questions: Array.from({ length: count }, (_, i) => question(i)) });
const request = (method, body, origin = 'https://study.test') => new Request('https://study.test/api/quizzes', { method, headers: { origin, 'content-type': 'application/json' }, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}) });

test('create, save incomplete drafts, list and reload are private and source-free', async t => {
  const { store } = fixture(t); const quiz = await store.create('alice');
  assert.equal(quiz.questions.length, 0); assert.equal((await store.list('bob')).length, 0);
  assert.equal(await store.get('bob', quiz.id), null);
  assert.equal(await store.save('bob', quiz.id, input()), 'missing');
  const draft = { ...input(), questions: [{ ...question(0), prompt: '', choices: ['', ''], correctIndex: null }] };
  assert.ok(parseDraft(draft)); assert.equal(await store.save('alice', quiz.id, draft), 'saved');
  const loaded = await store.get('alice', quiz.id);
  assert.equal(loaded.revision, 2); assert.deepEqual(loaded.questions, draft.questions);
  assert.equal((await store.list('alice'))[0].question_count, 1);
});

test('500 questions save and reverse safely; stale revision cannot overwrite or remove them', async t => {
  const { store } = fixture(t); const quiz = await store.create('alice');
  assert.equal(await store.save('alice', quiz.id, input(1, 500)), 'saved');
  const reversed = { ...input(2, 500), questions: input(2, 500).questions.reverse() };
  assert.equal(await store.save('alice', quiz.id, reversed), 'saved');
  assert.equal(await store.save('alice', quiz.id, input(2, 0)), 'conflict');
  const loaded = await store.get('alice', quiz.id);
  assert.equal(loaded.revision, 3); assert.deepEqual(loaded.questions, reversed.questions);
});

test('revision change after precheck makes the entire save a no-op', async t => {
  const { db, sql, store } = fixture(t); const quiz = await store.create('alice');
  await store.save('alice', quiz.id, input());
  const batch = db.batch.bind(db);
  db.batch = async statements => { sql.prepare('UPDATE authored_quizzes SET revision=revision+1,title=? WHERE id=?').run('Other tab', quiz.id); return batch(statements); };
  assert.equal(await store.save('alice', quiz.id, input(2, 0)), 'conflict');
  const loaded = await store.get('alice', quiz.id);
  assert.equal(loaded.title, 'Other tab'); assert.equal(loaded.questions.length, 1);
});

test('foreign question IDs rejected and failed insert rolls back deletion', async t => {
  const { store, sql } = fixture(t); const a = await store.create('alice'); const b = await store.create('bob');
  await store.save('alice', a.id, input());
  assert.equal(await store.save('bob', b.id, input()), 'invalid-ids');
  const duplicate = { ...input(2), questions: [question(1), question(1)] };
  await assert.rejects(store.save('alice', a.id, duplicate), /UNIQUE/);
  assert.deepEqual((await store.get('alice', a.id)).questions, input().questions);
  assert.equal((await store.get('alice', a.id)).revision, 2);
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(), []);
});

test('draft validation accepts 101 and 500 questions, rejects malformed and over-budget inputs', () => {
  assert.ok(parseDraft(input(1, 101))); assert.ok(parseDraft(input(1, 500))); assert.ok(parseDraft(input(1, 0)));
  for (const bad of [input(1, 501), { ...input(), owner_id: 'bob' }, { ...input(), revision: 0 }, { ...input(), title: ' ' }, { ...input(), questions: [question(1), question(1)] }, { ...input(), questions: [{ ...question(0), choices: ['yes', {}] }] }, { ...input(), questions: [{ ...question(0), correctIndex: 2 }] }, { ...input(), questions: [{ ...question(0), id: '../bad' }] }, { ...input(), questions: [{ ...question(0), prompt: '\0' }] }, { ...input(), questions: input(1, 500).questions.map(q => ({ ...q, prompt: 'x'.repeat(4000) })) }]) assert.equal(parseDraft(bad), null);
});

test('API enforces authentication, origin, body limits, ownership and revision conflicts', async t => {
  const { store } = fixture(t); const api = owner => manualQuizApi({ user: async () => owner ? { userId: owner } : null, store: () => store });
  assert.equal((await api(null)(request('GET'))).status, 401);
  assert.equal((await api('alice')(request('POST', {}, 'https://evil.test'))).status, 403);
  assert.equal((await api('alice')(request('POST', { owner_id: 'bob' }))).status, 400);
  const created = await api('alice')(request('POST', {})); assert.equal(created.status, 201); const { quiz } = await created.json();
  assert.equal((await api('bob')(request('GET'), quiz.id)).status, 404);
  assert.equal((await api('bob')(request('PUT', input()), quiz.id)).status, 404);
  const saved = await api('alice')(request('PUT', input()), quiz.id); assert.equal(saved.status, 200); assert.deepEqual(await saved.json(), { revision: 2 });
  assert.equal((await api('alice')(request('PUT', input()), quiz.id)).status, 409);
  assert.equal((await api('alice')(request('PUT', { text: 'x'.repeat(1_030_000) }), quiz.id)).status, 413);
  assert.equal((await api('alice')(request('GET'), quiz.id)).headers.get('cache-control'), 'private, no-store');
});

test('publishing reports unfinished questions and never exposes another owners draft', async t => {
  const { store } = fixture(t); const quiz = await store.create('alice');
  const api = owner => manualQuizApi({ user: async () => ({ userId: owner }), store: () => store });
  assert.equal((await api('bob')(request('POST', { revision: 1 }), quiz.id)).status, 404);
  const empty = await api('alice')(request('POST', { revision: 1 }), quiz.id);
  assert.equal(empty.status, 422); assert.match((await empty.json()).issues[0], /at least one/);
  await store.save('alice', quiz.id, { ...input(), questions: [{ ...question(0), prompt: '', choices: ['', 'No'], correctIndex: null }] });
  const incomplete = await api('alice')(request('POST', { revision: 2 }), quiz.id);
  assert.equal(incomplete.status, 422); assert.equal((await incomplete.json()).issues.length, 3);
  assert.equal((await store.versions('alice', quiz.id)).length, 0);
});

test('500-question publication is idempotent, private and unchanged by subsequent draft edits', async t => {
  const { store } = fixture(t); const quiz = await store.create('alice');
  const api = manualQuizApi({ user: async () => ({ userId: 'alice' }), store: () => store });
  await store.save('alice', quiz.id, input(1, 500));
  const first = await api(request('POST', { revision: 2 }), quiz.id); assert.equal(first.status, 200);
  const { version } = await first.json();
  const again = await api(request('POST', { revision: 2 }), quiz.id); assert.deepEqual((await again.json()).version, version);
  assert.equal((await store.versions('alice', quiz.id)).length, 1);
  assert.deepEqual(await store.versions('bob', quiz.id), []); assert.equal(await store.version('bob', quiz.id, version.id), null);
  assert.equal(await store.version('alice', 'other-quiz', version.id), null);
  const original = await store.version('alice', quiz.id, version.id);
  assert.equal(JSON.parse(original.questions_json).length, 500);
  await store.save('alice', quiz.id, { ...input(2, 1), title: 'Edited title' });
  assert.deepEqual(await store.version('alice', quiz.id, version.id), original);
  assert.equal((await api(request('POST', { revision: 2 }), quiz.id)).status, 409);
  const newer = await api(request('POST', { revision: 3 }), quiz.id); assert.equal(newer.status, 200);
  assert.equal((await store.versions('alice', quiz.id)).length, 2);
});

test('publication revision race does not insert a snapshot and body cannot supply content', async t => {
  const { store, sql } = fixture(t); const quiz = await store.create('alice');
  await store.save('alice', quiz.id, input());
  const publish = store.publish.bind(store);
  store.publish = async (...args) => { sql.prepare('UPDATE authored_quizzes SET revision=revision+1 WHERE id=?').run(quiz.id); return publish(...args); };
  const api = manualQuizApi({ user: async () => ({ userId: 'alice' }), store: () => store });
  assert.equal((await api(request('POST', { revision: 2, questions: [] }), quiz.id)).status, 400);
  assert.equal((await api(request('POST', { revision: 2 }), quiz.id)).status, 409);
  assert.deepEqual(await store.versions('alice', quiz.id), []);
});
test('share links are owner scoped, version bound, random, idempotent and revocable', async t => {
  const { db, store } = fixture(t); const sharing = sharingStore(db); const quiz = await store.create('alice');
  await store.save('alice', quiz.id, input()); const version = await store.publish('alice', quiz.id, input(2));
  assert.equal(await sharing.create('bob', quiz.id, version.id), null);
  assert.equal(await sharing.create('alice', 'wrong-quiz', version.id), null);
  assert.equal(await sharing.create('alice', quiz.id, 'draft-id'), null);
  const link = await sharing.create('alice', quiz.id, version.id); assert.match(link.id, /^[a-f0-9]{64}$/);
  assert.equal((await sharing.create('alice', quiz.id, version.id)).id, link.id);
  assert.deepEqual(await sharing.list('bob', quiz.id), []); assert.equal(await sharing.revoke('bob', quiz.id, link.id), null);
  const guest = await sharing.guest(link.id);
  assert.deepEqual(Object.keys(guest).sort(), ['description','questions','title']);
  assert.deepEqual(Object.keys(guest.questions[0]).sort(), ['choices','id','prompt']);
  assert.ok(!JSON.stringify(guest).includes('correctIndex')); assert.ok(!JSON.stringify(guest).includes('explanation'));
  await store.save('alice', quiz.id, { ...input(2), title: 'Private later title' });
  assert.deepEqual(await sharing.guest(link.id), guest);
  assert.ok(await sharing.revoke('alice', quiz.id, link.id)); assert.equal(await sharing.guest(link.id), null);
  const replacement = await sharing.create('alice', quiz.id, version.id); assert.notEqual(replacement.id, link.id);
  assert.equal(await sharing.guest(link.id), null); assert.deepEqual(await sharing.guest(replacement.id), guest);
});

test('sharing API protects mutations; guest API needs no identity and never returns keys', async t => {
  const { db, store } = fixture(t); const sharing = sharingStore(db); const quiz = await store.create('alice');
  await store.save('alice', quiz.id, input(1,500)); const version = await store.publish('alice', quiz.id, input(2,500));
  const api = owner => sharingApi({ user: async () => owner ? {userId:owner} : null, store: () => sharing });
  assert.equal((await api(null)(request('GET'), quiz.id)).status,401);
  assert.equal((await api('alice')(request('POST',{versionId:version.id},'https://evil.test'),quiz.id)).status,403);
  assert.equal((await api('bob')(request('POST',{versionId:version.id}),quiz.id)).status,404);
  assert.equal((await api('alice')(request('POST',{versionId:version.id,owner:'bob'}),quiz.id)).status,400);
  assert.equal((await api('alice')(request('POST',{text:'x'.repeat(2000)}),quiz.id)).status,413);
  const created = await api('alice')(request('POST',{versionId:version.id}),quiz.id); assert.equal(created.status,200);
  const {share}=await created.json(); const guestApi=guestQuizApi(()=>sharing);
  const response=await guestApi(share.id); assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'private, no-store');
  const body=await response.json(); assert.equal(body.quiz.questions.length,500);
  assert.ok(body.quiz.questions.every(q=>Object.keys(q).sort().join(',')==='choices,id,prompt'));
  assert.equal((await guestApi('invalid')).status,404); assert.equal((await guestApi('a'.repeat(64))).status,404);
  assert.equal((await api('alice')(request('DELETE',{token:share.id}),quiz.id)).status,200);
  assert.equal((await guestApi(share.id)).status,404);
});
async function attemptFixture(t, count = 2) {
  const f = fixture(t); const quiz = await f.store.create('alice');
  await f.store.save('alice',quiz.id,input(1,count));
  const version = await f.store.publish('alice',quiz.id,input(2,count));
  const shares=sharingStore(f.db); const share=await shares.create('alice',quiz.id,version.id);
  return {...f,quiz,version,shares,share,api:guestAttemptApi(()=>guestAttemptStore(f.db))};
}
const attemptRequest = (method,key,answers,origin='https://study.test') => new Request('https://study.test/api/shared/link/attempt',{method,headers:{'x-attempt-key':key,origin,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify({answers})}:{})});
const submitted = (count,index=0) => Array.from({length:count},(_,i)=>({questionId:`q-${i}`,selectedIndex:index}));

test('anonymous results are server graded, private and restorable only with their own capability',async t=>{
  const {api,share,sql}=await attemptFixture(t); const keyA='a'.repeat(64),keyB='b'.repeat(64);
  assert.equal((await api(attemptRequest('GET',keyA),share.id)).status,404);
  const first=await api(attemptRequest('POST',keyA,[{questionId:'q-0',selectedIndex:0},{questionId:'q-1',selectedIndex:1}]),share.id);
  assert.equal(first.status,200); const body=await first.json(); assert.equal(body.result.score,1); assert.equal(body.result.total,2); assert.equal(body.result.answers[1].correctIndex,0);
  assert.equal((await api(attemptRequest('GET',keyB),share.id)).status,404);
  assert.equal((await api(attemptRequest('GET',keyA),'f'.repeat(64))).status,404);
  const second=await api(attemptRequest('POST',keyB,submitted(2,1)),share.id); assert.equal((await second.json()).result.score,0);
  const restored=await api(attemptRequest('GET',keyA),share.id); assert.deepEqual(await restored.json(),body); assert.equal(restored.headers.get('cache-control'),'private, no-store');
  assert.notEqual(sql.prepare('SELECT id FROM guest_attempts LIMIT 1').get().id,keyA); assert.equal(sql.prepare('SELECT count(*) n FROM guest_attempts').get().n,2);
});

test('500-question grading, concurrent retry and later edits cannot overwrite a submitted result',async t=>{
  const {api,share,store,quiz,sql}=await attemptFixture(t,500); const key='c'.repeat(64);
  await store.save('alice',quiz.id,{...input(2,1),questions:[{...question(0),correctIndex:1}]});
  const outcomes=await Promise.all([api(attemptRequest('POST',key,submitted(500)),share.id),api(attemptRequest('POST',key,submitted(500,1)),share.id)]);
  const a=await outcomes[0].json(),b=await outcomes[1].json(); assert.deepEqual(a,b); assert.equal(a.result.total,500); assert.equal(a.result.score,500);
  const retry=await api(attemptRequest('POST',key,submitted(500,1)),share.id); assert.deepEqual(await retry.json(),a);
  assert.equal(sql.prepare('SELECT count(*) n FROM guest_attempts').get().n,1);
});

test('invalid answers, forged score and cross-origin requests leave no attempts',async t=>{
  const {api,share,sql}=await attemptFixture(t); const key='d'.repeat(64);
  for(const answers of [[],submitted(1),[...submitted(2),{questionId:'other',selectedIndex:0}],[submitted(2)[0],submitted(2)[0]],submitted(2,2),submitted(2,-1),[{questionId:'wrong',selectedIndex:0},{questionId:'q-1',selectedIndex:0}],submitted(2).map(a=>({...a,correctIndex:0}))]) assert.equal((await api(attemptRequest('POST',key,answers),share.id)).status,400);
  assert.equal((await api(attemptRequest('POST',key,submitted(2),'https://evil.test'),share.id)).status,403);
  assert.equal((await api(attemptRequest('GET',''),share.id)).status,404);
  const spoof=new Request('https://study.test/api/shared/link/attempt',{method:'POST',headers:{'content-type':'application/json',origin:'https://study.test','x-attempt-key':key},body:JSON.stringify({answers:submitted(2),score:2})});
  assert.equal((await api(spoof,share.id)).status,400);
  assert.equal((await api(attemptRequest('POST',key,'x'.repeat(130000)),share.id)).status,413);
  assert.equal(sql.prepare('SELECT count(*) n FROM guest_attempts').get().n,0);
});

test('revocation blocks new submissions and old results including revocation during grading',async t=>{
  const {api,share,shares,quiz,sql,db}=await attemptFixture(t); const key='e'.repeat(64);
  assert.equal((await api(attemptRequest('POST',key,submitted(2)),share.id)).status,200);
  await shares.revoke('alice',quiz.id,share.id);
  assert.equal((await api(attemptRequest('GET',key),share.id)).status,404);
  assert.equal((await api(attemptRequest('POST','f'.repeat(64),submitted(2)),share.id)).status,404);
  const replacement=await shares.create('alice',quiz.id,(await shares.list('alice',quiz.id))[0].version_id);
  const prepare=db.prepare.bind(db);
  db.prepare=query=>{
    const statement=prepare(query);
    if(query.startsWith('INSERT INTO guest_attempts')){
      const run=statement.run.bind(statement);
      statement.run=async()=>{sql.prepare('UPDATE quiz_shares SET revoked_at=unixepoch() WHERE id=?').run(replacement.id);return run();};
    }
    return statement;
  };
  assert.equal((await api(attemptRequest('POST','f'.repeat(64),submitted(2)),replacement.id)).status,404);
  assert.equal(sql.prepare('SELECT count(*) n FROM guest_attempts').get().n,1);
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal((await attemptHash(key)).length,64);
});