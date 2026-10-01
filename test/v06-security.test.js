import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const server=fs.readFileSync(path.join(process.cwd(),'server/index.js'),'utf8');

const BASE=(process.env.PURPOSEPAY_TEST_URL||'').replace(/\/$/,'');
const live=BASE ? test : test.skip;

async function request(path,{method='GET',token,body,headers={}}={}){
  const h={...headers};
  if(body!==undefined)h['content-type']='application/json';
  if(token)h.authorization=`Bearer ${token}`;
  const response=await fetch(`${BASE}${path}`,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await response.text();
  let data=null; try{data=text?JSON.parse(text):null}catch{data=text}
  return {response,data};
}

live('malformed bearer token is rejected',async()=>{
  const {response}=await request('/api/me',{token:'definitely-not-a-jwt'});
  assert.equal(response.status,401);
});

live('protected business endpoints reject anonymous writes',async()=>{
  for(const path of ['/api/kyc/submit','/api/projects','/api/school-payments']){
    const {response}=await request(path,{method:'POST',body:{}});
    assert.equal(response.status,401,`${path} should require authentication`);
  }
});

live('health response does not expose secrets',async()=>{
  const {response,data}=await request('/api/health');
  assert.equal(response.status,200);
  const serialized=JSON.stringify(data).toLowerCase();
  assert.equal(serialized.includes('password'),false);
  assert.equal(serialized.includes('database_url'),false);
  assert.equal(serialized.includes('jwt'),false);
});

live('oversimplified login payload is rejected',async()=>{
  const {response}=await request('/api/auth/login',{method:'POST',body:{}});
  assert.equal(response.status,401);
});


test('v0.8 KYC data is encrypted and customer responses are masked', () => {
  assert.match(server, /function encryptKycValue\(value\)/);
  assert.match(server, /aes-256-gcm/);
  assert.match(server, /document_number_last4/);
  assert.match(server, /documentNumberLast4/);
  assert.doesNotMatch(server, /return out\(res,200,\{kyc:k\|\|null\}\)/);
});

test('v0.8 API emits baseline browser security headers', () => {
  assert.match(server, /x-content-type-options/);
  assert.match(server, /x-frame-options/);
  assert.match(server, /content-security-policy/);
  assert.match(server, /cache-control/);
});


test('v0.9 merchant onboarding and ledger are wired', () => {
  assert.match(server, /merchant_applications/);
  assert.match(server, /POST.*api\\/merchants\\/apply|api\\/merchants\\/apply/);
  assert.match(server, /ledger_accounts/);
  assert.match(server, /ledger_entries/);
  assert.match(server, /postPurchaseLedger/);
});
