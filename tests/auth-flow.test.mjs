import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authFlow } from '../lib/auth-flow.ts';
import { safeAuthReturn, identityMode, verifiedStudyUser } from '../lib/auth-policy.ts';

const config = { origin: 'https://study.test', url: 'https://project.supabase.co' };
function fixture(overrides = {}) {
  const calls = [];
  const client = { auth: {
    signInWithOAuth: async input => { calls.push(input); return { data: { url: config.url + '/auth/v1/authorize?provider=google' }, error: null }; },
    exchangeCodeForSession: async code => { calls.push(code); return { error: null }; },
    signOut: async input => { calls.push(input); return { error: null }; },
    ...overrides,
  } };
  return { calls, handle: authFlow({ config: () => config, client: async () => client }) };
}

test('standalone identity is namespaced and unknown provider fails closed', () => {
  assert.equal(identityMode(undefined), 'sites');
  assert.equal(identityMode('supabase'), 'supabase');
  assert.equal(identityMode('typo'), 'disabled');
  assert.equal(verifiedStudyUser(null), null);
  assert.equal(verifiedStudyUser({ id: 'x', email: 'x@example.test', is_anonymous: true }), null);
  assert.equal(verifiedStudyUser({ id: 'x' }), null);
  assert.equal(verifiedStudyUser({ id: 'local_seedy', email: 'x@example.test' }).userId, 'supabase:local_seedy');
});

test('auth return destinations reject external and reserved paths', () => {
  for (const value of [null, 'https://evil.test', '//evil.test', '/\\evil.test', '/auth/callback', '/auth/../auth/logout', '/callback', '/\n/evil.test']) assert.equal(safeAuthReturn(value), '/');
  assert.equal(safeAuthReturn('/quizzes/abc?view=1#question'), '/quizzes/abc?view=1#question');
});

test('login uses configured callback and skips prefetch without starting OAuth', async () => {
  const { calls, handle } = fixture();
  const prefetched = await handle(new Request(config.origin + '/auth/sign-in', { headers: { Purpose: 'prefetch' } }), 'sign-in');
  assert.equal(prefetched.status, 204);
  assert.equal(calls.length, 0);
  const result = await handle(new Request(config.origin + '/auth/sign-in?return_to=https://evil.test'), 'sign-in');
  assert.equal(result.status, 303);
  assert.ok(result.headers.get('Location').startsWith(config.url));
  const target = new URL(calls[0].options.redirectTo);
  assert.equal(target.origin, config.origin);
  assert.equal(target.pathname, '/auth/callback');
  assert.equal(target.searchParams.get('return_to'), '/');
});

test('callback requires successful exchange and never exposes provider errors', async () => {
  const good = fixture();
  const request = new Request(config.origin + '/auth/callback?code=test-code&return_to=%2Ffolders');
  assert.equal((await good.handle(request, 'callback')).headers.get('Location'), config.origin + '/folders');
  assert.deepEqual(good.calls, ['test-code']);
  const bad = fixture({ exchangeCodeForSession: async () => { throw new Error('private-token'); } });
  const response = await bad.handle(request, 'callback');
  assert.equal(response.headers.get('Location'), config.origin + '/auth/error');
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await good.handle(new Request(config.origin + '/auth/callback?error=denied'), 'callback')).headers.get('Location'), config.origin + '/auth/error');
});

test('logout requires same-origin POST; unconfigured and wrong-host requests do not call auth', async () => {
  const { calls, handle } = fixture();
  assert.equal((await handle(new Request(config.origin + '/auth/logout'), 'logout')).status, 405);
  assert.equal((await handle(new Request(config.origin + '/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.test' } }), 'logout')).status, 403);
  assert.equal((await handle(new Request('https://evil.test/auth/sign-in'), 'sign-in')).status, 403);
  assert.equal(calls.length, 0);
  assert.equal((await handle(new Request(config.origin + '/auth/logout', { method: 'POST', headers: { Origin: config.origin } }), 'logout')).status, 303);
  assert.deepEqual(calls, [{ scope: 'local' }]);
  const disabled = authFlow({ config: () => null, client: async () => { throw new Error('must not be called'); } });
  assert.equal((await disabled(new Request(config.origin + '/auth/sign-in'), 'sign-in')).status, 503);
});

test('unexpected OAuth redirect is rejected', async () => {
  const { handle } = fixture({ signInWithOAuth: async () => ({ data: { url: 'https://evil.test/collect' }, error: null }) });
  assert.equal((await handle(new Request(config.origin + '/auth/sign-in'), 'sign-in')).headers.get('Location'), config.origin + '/auth/error');
});
