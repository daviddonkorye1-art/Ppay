import test from 'node:test';
import assert from 'node:assert/strict';

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
