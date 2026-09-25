import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { courseStore, parseCourseInput } from '../lib/courses.ts';
import { courseApi } from '../lib/course-api.ts';

// Execute the application's actual prepared SQL against the generated schema.
function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec(readFileSync(new URL('../drizzle/0000_first_blue_blade.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return { bind(...params) {
        return {
          first: async () => statement.get(...params) ?? null,
          all: async () => ({ results: statement.all(...params) }),
          run: () => statement.run(...params),
        };
      } };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = statements.map(statement => statement.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const store = courseStore(db);
  return userId => courseApi({ user: async () => userId ? { userId } : null, store: () => store, parse: parseCourseInput });
}
function request(method = 'GET', body, headers = {}) {
  return new Request('https://study.test/api/courses', {
    method, headers: { Origin: 'https://study.test', 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

test('courses are isolated across users for list, detail and update', async t => {
  const api = fixture(t);
  const alice = api('alice'); const bob = api('bob');
  const created = await alice(request('POST', { title: ' Biology ', description: ' Cells ' }));
  assert.equal(created.status, 201);
  const { course } = await created.json();
  assert.equal(course.title, 'Biology');
  assert.equal(course.description, 'Cells');
  assert.equal(Object.hasOwn(course, 'owner_id'), false);
  assert.equal((await (await alice(request())).json()).courses.length, 1);
  assert.deepEqual((await (await bob(request())).json()).courses, []);
  assert.equal((await bob(request(), course.id)).status, 404);
  assert.equal((await bob(request('PATCH', { title: 'Hijacked', description: '' }), course.id)).status, 404);
  assert.equal((await alice(request(), 'missing')).status, 404);
  const updated = await alice(request('PATCH', { title: 'Biology 102', description: '' }), course.id);
  assert.equal(updated.status, 200);
  assert.equal((await (await alice(request(), course.id)).json()).course.title, 'Biology 102');
  assert.equal(updated.headers.get('Cache-Control'), 'private, no-store');
});

test('unauthenticated calls never reach storage', async () => {
  const api = courseApi({ user: async () => null, store: () => { throw new Error('must not access DB'); }, parse: parseCourseInput });
  for (const [method, id] of [['GET', undefined], ['GET', 'course'], ['POST', undefined], ['PATCH', 'course']]) {
    assert.equal((await api(request(method, method === 'GET' ? undefined : {}), id)).status, 401);
  }
});

test('reject invalid fields, ownership spoofing, malformed and oversized bodies', async t => {
  const alice = fixture(t)('alice');
  for (const body of [null, [], {}, { title: ' ', description: '' }, { title: 'a'.repeat(121), description: '' }, { title: 'x', description: 'a'.repeat(1001) }, { title: 'x', description: '', owner_id: 'bob' }, '{invalid']) {
    assert.equal((await alice(request('POST', body))).status, 400);
  }
  assert.equal((await alice(request('POST', 'x'.repeat(8193)))).status, 413);
  assert.equal((await alice(request('POST', {}, { 'Content-Type': 'text/plain' }))).status, 415);
  assert.deepEqual((await (await alice(request())).json()).courses, []);
});

test('cross-origin and missing-origin mutations are rejected', async t => {
  const alice = fixture(t)('alice');
  for (const headers of [{ Origin: 'https://other.test' }, { Origin: '' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await alice(request('POST', { title: 'x', description: '' }, headers))).status, 403);
  }
});
