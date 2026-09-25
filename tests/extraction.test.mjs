import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { extractionApi } from '../lib/extraction-api.ts';
import { extractionStore } from '../lib/extraction-store.ts';
import { validatePages, makePassages } from '../lib/extracted-text.ts';

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec(readFileSync(new URL('../drizzle/0000_first_blue_blade.sql', import.meta.url), 'utf8'));
  sqlite.exec("INSERT INTO users(id) VALUES ('alice'), ('bob'); INSERT INTO courses(id,owner_id,title) VALUES ('course','alice','Biology'); INSERT INTO sources(id,course_id,filename,format,object_key,byte_size) VALUES ('source','course','notes.pdf','pdf','private-key',42)");
  const db = { prepare(sql) {
    const stmt = sqlite.prepare(sql);
    return { bind(...values) { return { first: async () => stmt.get(...values) ?? null, all: async () => ({ results: stmt.all(...values) }), run: () => stmt.run(...values) }; } };
  }, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = statements.map(statement => statement.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  const store = extractionStore(db);
  const api = (userId, exists = true, filesEnabled = true) => extractionApi({ user: async () => userId ? { userId } : null, store: () => store,
    files: () => filesEnabled ? ({ head: async () => exists ? {} : null, get: async () => exists ? { body: 'PDF bytes' } : null }) : undefined });
  return { api, store };
}
const request = (body, headers = {}) => new Request('https://study.test/api/sources/source', body === undefined ? {} : {
  method: 'POST', headers: { Origin: 'https://study.test', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});

test('missing file binding rejects original access without changing source state', async t => {
  const { api, store } = fixture(t);
  assert.equal((await api('bob', true, false)(request(), 'source')).status, 404);
  for (const body of [undefined, { action: 'start' }]) {
    const response = await api('alice', true, false)(request(body), 'source');
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /Saved passages/);
  }
  assert.equal((await store.get('alice', 'source')).status, 'pending');
});

test('ordered page validation and passage splitting preserve complete page text', () => {
  const pages = [{ page: 1, text: 'a'.repeat(4500) }, { page: 2, text: '' }, { page: 3, text: 'Cell energy' }];
  assert.ok(validatePages(pages));
  const passages = makePassages(pages);
  assert.deepEqual(passages.map(p => p.location), [1, 1, 1, 3]);
  assert.equal(passages.filter(p => p.location === 1).map(p => p.content).join(''), pages[0].text);
  assert.ok(passages.every(p => p.content.length <= 2000));
  for (const invalid of [[], [{ page: 2, text: 'x' }], [{ page: 1, text: '' }], [{ page: 1, text: 'a'.repeat(150001) }], Array.from({ length: 101 }, (_, i) => ({ page: i + 1, text: 'x' }))]) assert.equal(validatePages(invalid), null);
  assert.ok(validatePages([{ page: 1, text: 'a'.repeat(150000) }]));
});

test('source bytes, processing and completion require ownership and same-origin writes', async t => {
  const { api, store } = fixture(t);
  for (const [userId, expected] of [[null,401], ['bob',404]]) {
    assert.equal((await api(userId)(request(), 'source')).status, expected);
    assert.equal((await api(userId)(request({ action: 'start' }), 'source')).status, expected);
    assert.equal((await api(userId)(request({ action: 'complete', pages: [{page:1,text:'stolen'}] }), 'source')).status, expected);
    assert.equal((await api(userId)(request({ action: 'fail', code: 'invalid' }), 'source')).status, expected);
  }
  assert.equal((await api('alice')(request({action:'start'}, {Origin:'https://evil.test'}), 'source')).status,403);
  assert.equal((await api('alice')(request(), 'missing')).status,404);
  assert.deepEqual(await store.passages('bob','source'), []);
  const file = await api('alice')(request(),'source');
  assert.equal(file.status,200); assert.equal(file.headers.get('Cache-Control'),'private, no-store');
  assert.match(file.headers.get('Content-Disposition'),/attachment/);
});

test('successful completion saves stable citations and retries cannot overwrite ready passages', async t => {
  const {api,store}=fixture(t); const alice=api('alice');
  assert.equal((await alice(request({action:'start'}),'source')).status,200);
  assert.equal((await store.get('alice','source')).status,'processing');
  assert.equal((await alice(request({action:'complete',pages:[{page:1,text:'Mitochondria release energy.'},{page:2,text:'Cells have membranes.'}]}),'source')).status,200);
  const saved=await store.passages('alice','source');
  assert.equal(saved.length,2); assert.deepEqual(saved.map(p=>p.location),[1,2]);
  assert.equal((await store.get('alice','source')).status,'ready');
  await alice(request({action:'complete',pages:[{page:1,text:'Overwrite'}]}),'source');
  await alice(request({action:'fail',code:'invalid'}),'source');
  assert.deepEqual(await store.passages('alice','source'),saved);
  assert.equal((await store.get('alice','source')).status,'ready');
});

test('invalid text stays unready; parser failures persist; missing originals cannot complete', async t => {
  const {api,store}=fixture(t); const alice=api('alice');
  assert.equal((await alice(request({action:'complete',pages:[{page:101,text:'x'}]}),'source')).status,400);
  assert.equal((await alice(request({action:'complete',pages:[{page:1,text:'x'.repeat(1000001)}]}),'source')).status,413);
  assert.equal((await api('alice',false)(request({action:'start'}),'source')).status,409);
  assert.equal((await api('alice',false)(request({action:'complete',pages:[{page:1,text:'x'}]}),'source')).status,409);
  await alice(request({action:'fail',code:'empty'}),'source');
  assert.equal((await store.get('alice','source')).status,'failed');
  assert.match((await store.get('alice','source')).error_message,/OCR/);
  assert.deepEqual(await store.passages('alice','source'),[]);
  await alice(request({action:'start'}),'source');
  assert.equal((await store.get('alice','source')).error_message,null);
});
