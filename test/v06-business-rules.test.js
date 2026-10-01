import test from 'node:test';
import assert from 'node:assert/strict';

const BASE=(process.env.PURPOSEPAY_TEST_URL||'').replace(/\/$/,'');
const live=BASE ? test : test.skip;

async function call(path,{method='GET',token,body,headers={}}={}){
  const h={...headers}; if(body!==undefined)h['content-type']='application/json'; if(token)h.authorization=`Bearer ${token}`;
  const response=await fetch(`${BASE}${path}`,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await response.text(); let data=null; try{data=text?JSON.parse(text):null}catch{data=text}
  return {response,data};
}
async function login(email,password){
  const {response,data}=await call('/api/auth/login',{method:'POST',body:{email,password}});
  assert.equal(response.status,200); assert.ok(data.token); return data.token;
}

live('merchant cannot create a customer project',async()=>{
  const token=await login('merchant@purposepay.test','Merchant12345!');
  const {response}=await call('/api/projects',{method:'POST',token,body:{name:'Forbidden',location:'Test'}});
  assert.equal(response.status,403);
});

live('contractor cannot create vouchers',async()=>{
  const token=await login('contractor@purposepay.test','Contractor12345!');
  const {response}=await call('/api/vouchers',{method:'POST',token,body:{projectId:'none',category:'Cement',amount:1}});
  assert.equal(response.status,403);
});

live('merchant cannot authorize voucher spending',async()=>{
  const token=await login('merchant@purposepay.test','Merchant12345!');
  const {response}=await call('/api/transactions/authorize',{method:'POST',token,body:{voucherId:'none',merchantId:'none',amount:1}});
  assert.equal(response.status,403);
});

live('customer cannot complete a merchant transaction',async()=>{
  const token=await login('demo@purposepay.test','Demo12345!');
  const {response}=await call('/api/transactions/complete',{method:'POST',token,body:{transactionId:'none',authorizationCode:'none'}});
  assert.equal(response.status,403);
});

live('customer cannot access admin risk controls',async()=>{
  const token=await login('demo@purposepay.test','Demo12345!');
  const {response}=await call('/api/admin/risk',{token});
  assert.equal(response.status,403);
});

live('invalid idempotency key returns controlled validation error',async()=>{
  const token=await login('demo@purposepay.test','Demo12345!');
  const {response,data}=await call('/api/transactions/authorize',{method:'POST',token,headers:{'idempotency-key':'short'},body:{voucherId:'none',merchantId:'none',amount:1}});
  assert.equal(response.status,400);
  assert.equal(data?.error,'Invalid Idempotency-Key');
});
