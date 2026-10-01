import test from 'node:test';
import assert from 'node:assert/strict';
import { loadIdempotency, saveIdempotency, publicErrorResponse } from '../server/request-safety.js';
import { badRequest } from '../server/http-error.js';

const req = key => ({ headers: key === undefined ? {} : { 'idempotency-key': key } });

test('loadIdempotency returns null when header is absent', async () => {
  let queried = false;
  const result = await loadIdempotency(req(), 'USR_1', { amount: 10 }, async () => { queried = true; });
  assert.equal(result, null);
  assert.equal(queried, false);
});

test('loadIdempotency creates a record descriptor for a new key', async () => {
  const result = await loadIdempotency(req('payment:12345678'), 'USR_1', { amount: 10 }, async () => ({ rows: [] }));
  assert.equal(result.key, 'payment:12345678');
  assert.match(result.hash, /^[a-f0-9]{64}$/);
});

test('loadIdempotency safely replays a matching stored response', async () => {
  const first = await loadIdempotency(req('payment:12345678'), 'USR_1', { amount: 10 }, async () => ({ rows: [] }));
  const stored = { user_id: 'USR_1', request_hash: first.hash, status_code: 201, response_json: JSON.stringify({ id: 'TX_1' }) };
  const replay = await loadIdempotency(req('payment:12345678'), 'USR_1', { amount: 10 }, async () => ({ rows: [stored] }));
  assert.deepEqual(replay, { status: 201, body: { id: 'TX_1' } });
});

test('saveIdempotency persists only new descriptors', async () => {
  let call;
  await saveIdempotency({ key: 'payment:12345678', hash: 'abc' }, 'USR_1', 201, { ok: true }, async (sql, params) => { call = { sql, params }; });
  assert.match(call.sql, /ON CONFLICT\(key\) DO NOTHING/);
  assert.deepEqual(call.params, ['payment:12345678', 'USR_1', 'abc', JSON.stringify({ ok: true }), 201]);
});

test('publicErrorResponse sanitizes unexpected failures', () => {
  assert.deepEqual(publicErrorResponse(new Error('password=secret db.internal')), { status: 500, body: { error: 'Internal server error' } });
  assert.deepEqual(publicErrorResponse(badRequest('Invalid Idempotency-Key')), { status: 400, body: { error: 'Invalid Idempotency-Key' } });
});
