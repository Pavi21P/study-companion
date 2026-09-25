import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { sourceApi } from '../lib/source-api.ts';
import { sourceStore } from '../lib/sources.ts';
import { courseStore } from '../lib/courses.ts';
import { MAX_PDF_BYTES } from '../lib/pdf-upload.ts';
import { textPdf } from './pdf-fixture.mjs';

function fixture(t, failUpload = false, filesEnabled = true) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec(readFileSync(new URL('../drizzle/0000_first_blue_blade.sql', import.meta.url), 'utf8'));
  sqlite.exec("INSERT INTO users(id) VALUES ('alice'), ('bob'); INSERT INTO courses(id, owner_id, title) VALUES ('course-a', 'alice', 'Biology'), ('course-b', 'bob', 'Chemistry')");
  const db = { prepare(sql) {
    const stmt = sqlite.prepare(sql);
    return { bind(...params) { return {
      first: async () => stmt.get(...params) ?? null,
      all: async () => ({ results: stmt.all(...params) }),
    }; } };
  } };
  const objects = new Map();
  const api = userId => sourceApi({
    user: async () => userId ? { userId } : null,
    courses: () => courseStore(db), sources: () => sourceStore(db),
    files: () => filesEnabled ? ({
      put: async (key, bytes) => { objects.set(key, bytes); if (failUpload) throw new Error('Simulated storage outage'); return { key }; },
      delete: async key => { objects.delete(key); },
    }) : undefined,
  });
  return { api, objects, sqlite };
}
function upload(bytes = textPdf(), headers = {}) {
  return new Request('https://study.test/api/courses/course-a/sources', {
    method: 'POST', headers: { Origin: 'https://study.test', 'Content-Type': 'application/pdf', 'X-File-Name': 'biology.pdf', ...headers },
    body: bytes,
  });
}
const list = () => new Request('https://study.test/api/courses/course-a/sources');

test('without file storage, lists remain private and uploads create no records', async t => {
  const { api, sqlite } = fixture(t, false, false);
  assert.equal((await api('alice')(list(), 'course-a')).status, 200);
  assert.equal((await api('bob')(list(), 'course-a')).status, 404);
  assert.equal((await api(null)(upload(), 'course-a')).status, 401);
  const response = await api('alice')(upload(), 'course-a');
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /manual quizzes/);
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM sources').get().count, 0);
});

test('PDF bytes and pending metadata persist with opaque server IDs and private list', async t => {
  const { api, objects } = fixture(t);
  const result = await api('alice')(upload(), 'course-a');
  assert.equal(result.status, 201);
  const { source } = await result.json();
  assert.equal(source.filename, 'biology.pdf');
  assert.equal(source.status, 'pending');
  assert.equal(source.byte_size, textPdf().length);
  assert.equal(Object.hasOwn(source, 'object_key'), false);
  assert.match(source.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(objects.get(`sources/${source.id}/original.pdf`), textPdf());
  const saved = await api('alice')(list(), 'course-a');
  assert.equal(saved.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await saved.json()).sources[0].id, source.id);
});

test('anonymous, cross-owner, missing-course and cross-origin calls leave no records or bytes', async t => {
  const { api, objects, sqlite } = fixture(t);
  for (const [userId, courseId, expected] of [[null, 'course-a', 401], ['bob', 'course-a', 404], ['alice', 'missing', 404]]) {
    assert.equal((await api(userId)(upload(), courseId)).status, expected);
    assert.equal((await api(userId)(list(), courseId)).status, expected);
  }
  assert.equal((await api('alice')(upload(undefined, { Origin: 'https://evil.test' }), 'course-a')).status, 403);
  assert.equal((await api('alice')(upload(undefined, { Origin: '' }), 'course-a')).status, 403);
  assert.equal(objects.size, 0);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM sources').get().n, 0);
});

test('reject wrong format, unsafe filename, empty and incomplete PDF bytes', async t => {
  const { api, objects } = fixture(t);
  for (const headers of [{ 'X-File-Name': 'slides.pptx' }, { 'Content-Type': 'text/plain' }, { 'X-File-Name': '..%2Fnotes.pdf' }, { 'X-File-Name': '%zz.pdf' }]) {
    assert.equal((await api('alice')(upload(undefined, headers), 'course-a')).status, 415);
  }
  assert.equal((await api('alice')(upload(new Uint8Array()), 'course-a')).status, 400);
  assert.equal((await api('alice')(upload(new TextEncoder().encode('not a pdf')), 'course-a')).status, 422);
  assert.equal((await api('alice')(upload(textPdf().slice(0, -10)), 'course-a')).status, 422);
  assert.equal(objects.size, 0);
});

test('10 MiB bound is inclusive and enforced without trusting Content-Length', async t => {
  const { api } = fixture(t);
  const bytes = new Uint8Array(MAX_PDF_BYTES).fill(32);
  bytes.set(new TextEncoder().encode('%PDF-1.4\n'));
  bytes.set(new TextEncoder().encode('%%EOF\n'), bytes.length - 6);
  assert.equal((await api('alice')(upload(bytes), 'course-a')).status, 201);
  assert.equal((await api('alice')(upload(new Uint8Array(MAX_PDF_BYTES + 1), { 'Content-Length': '1' }), 'course-a')).status, 413);
  assert.equal((await api('alice')(upload(undefined, { 'Content-Length': String(MAX_PDF_BYTES + 1) }), 'course-a')).status, 413);
});

test('storage failure leaves explicit failed metadata and removes partial object', async t => {
  t.mock.method(console, 'error', () => {});
  const { api, objects } = fixture(t, true);
  assert.equal((await api('alice')(upload(), 'course-a')).status, 500);
  assert.equal(objects.size, 0);
  const { sources } = await (await api('alice')(list(), 'course-a')).json();
  assert.equal(sources[0].status, 'failed');
  assert.match(sources[0].error_message, /upload the file again/);
});
