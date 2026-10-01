import test from 'node:test';
import assert from 'node:assert/strict';
import { badRequest, conflict, toPublicError } from '../server/http-error.js';

test('bad request errors map to 400 with a safe message',()=>{
  assert.deepEqual(toPublicError(badRequest('Invalid Idempotency-Key')),{status:400,body:{error:'Invalid Idempotency-Key'}});
});

test('conflict errors map to 409 with a safe message',()=>{
  assert.deepEqual(toPublicError(conflict('Idempotency-Key was already used with different request data')),{status:409,body:{error:'Idempotency-Key was already used with different request data'}});
});

test('unexpected errors do not leak internal details',()=>{
  const mapped=toPublicError(new Error('password=secret host=db.internal SQL SELECT * FROM users'));
  assert.equal(mapped.status,500);
  assert.deepEqual(mapped.body,{error:'Internal server error'});
  assert.equal(JSON.stringify(mapped).includes('secret'),false);
  assert.equal(JSON.stringify(mapped).includes('db.internal'),false);
});
