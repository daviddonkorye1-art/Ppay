import test from 'node:test';
import assert from 'node:assert/strict';

const BASE=(process.env.PURPOSEPAY_TEST_URL||'').replace(/\/$/,'');

async function json(path, options={}) {
  const response=await fetch(`${BASE}${path}`, options);
  const text=await response.text();
  let body=null;
  try { body=text ? JSON.parse(text) : null; } catch { body=text; }
  return {response,body};
}

const live=BASE ? test : test.skip;

live('production health check confirms PostgreSQL', async()=>{
  const {response,body}=await json('/api/health');
  assert.equal(response.status,200);
  assert.equal(body.ok,true);
  assert.equal(body.service,'purposepay-api');
  assert.equal(body.database,'postgres');
});

live('protected endpoint rejects anonymous requests', async()=>{
  const {response,body}=await json('/api/me');
  assert.equal(response.status,401);
  assert.equal(body.error,'Authentication required');
});

live('registration validates required fields without mutating data', async()=>{
  const {response}=await json('/api/auth/register',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({})
  });
  assert.equal(response.status,400);
});

live('login rejects invalid credentials', async()=>{
  const {response}=await json('/api/auth/login',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({email:`smoke-${Date.now()}@invalid.example`,password:'not-a-real-password'})
  });
  assert.equal(response.status,401);
});
