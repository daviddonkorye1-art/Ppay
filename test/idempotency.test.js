import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIdempotencyKey, requestHash, resolveStoredIdempotency } from '../server/idempotency.js';

test('missing idempotency key is optional', () => {
  assert.equal(validateIdempotencyKey(undefined), null);
});

test('valid idempotency key is accepted', () => {
  assert.equal(validateIdempotencyKey('checkout-1234'), 'checkout-1234');
});

test('short, oversized, duplicate-header and unsafe keys are rejected with 400', () => {
  for (const value of ['short', 'x'.repeat(129), ['one-key-123', 'two-key-456'], 'bad key with spaces']) {
    assert.throws(() => validateIdempotencyKey(value), error => error.status === 400 && error.message === 'Invalid Idempotency-Key');
  }
});

test('request hash is deterministic and changes with request data', () => {
  assert.equal(requestHash({amount:100}), requestHash({amount:100}));
  assert.notEqual(requestHash({amount:100}), requestHash({amount:101}));
});

test('same key, user and request replays stored response', () => {
  const hash=requestHash({amount:100});
  const stored={user_id:'USR_1',request_hash:hash,status_code:201,response_json:JSON.stringify({id:'TX_1'})};
  assert.deepEqual(resolveStoredIdempotency(stored,'USR_1',hash),{status:201,body:{id:'TX_1'}});
});

test('reusing a key for different request data returns 409', () => {
  const stored={user_id:'USR_1',request_hash:requestHash({amount:100}),status_code:201,response_json:'{}'};
  assert.throws(() => resolveStoredIdempotency(stored,'USR_1',requestHash({amount:200})), error => error.status === 409);
});

test('reusing another users key returns 409', () => {
  const hash=requestHash({amount:100});
  const stored={user_id:'USR_1',request_hash:hash,status_code:201,response_json:'{}'};
  assert.throws(() => resolveStoredIdempotency(stored,'USR_2',hash), error => error.status === 409);
});
