import test from 'node:test';
import assert from 'node:assert/strict';

const BASE=(process.env.PURPOSEPAY_TEST_URL||'').replace(/\/$/,'');
const live=BASE ? test : test.skip;
async function req(path,{method='GET',token,body,headers={}}={}){const h={...headers};if(body!==undefined)h['content-type']='application/json';if(token)h.authorization=`Bearer ${token}`;const response=await fetch(`${BASE}${path}`,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});const text=await response.text();let data;try{data=text?JSON.parse(text):null}catch{data=text}return{response,data}}
async function login(email,password){const r=await req('/api/auth/login',{method:'POST',body:{email,password}});assert.equal(r.response.status,200);return r.data.token}

live('voucher amount rejects zero, negative and fractional values',async()=>{const token=await login('demo@purposepay.test','Demo12345!');for(const amount of [0,-1,1.5]){const r=await req('/api/vouchers',{method:'POST',token,body:{projectId:'does-not-exist',category:'Cement',amount}});assert.ok([400,404].includes(r.response.status));assert.notEqual(r.response.status,500)}});
live('authorization amount rejects invalid numeric boundaries without server failure',async()=>{const token=await login('demo@purposepay.test','Demo12345!');for(const amount of [0,-10,1.25]){const r=await req('/api/transactions/authorize',{method:'POST',token,body:{voucherId:'does-not-exist',merchantId:'does-not-exist',amount}});assert.ok([400,404].includes(r.response.status));assert.notEqual(r.response.status,500)}});
live('school payment amount rejects invalid numeric boundaries without server failure',async()=>{const token=await login('demo@purposepay.test','Demo12345!');for(const amount of [0,-5,2.5]){const r=await req('/api/schools/payments',{method:'POST',token,body:{schoolId:'does-not-exist',studentName:'Boundary Test',amount}});assert.equal(r.response.status,400);assert.notEqual(r.response.status,500)}});
live('admin endpoints remain inaccessible to merchant role',async()=>{const token=await login('merchant@purposepay.test','Merchant12345!');for(const path of ['/api/admin/kyc','/api/admin/risk','/api/admin/audit']){const r=await req(path,{token});assert.equal(r.response.status,403)}});
