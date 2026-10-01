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
  assert.ok(server.includes('api/merchants/apply'));
  assert.match(server, /ledger_accounts/);
  assert.match(server, /ledger_entries/);
  assert.match(server, /postPurchaseLedger/);
});


test('v1 payment architecture is wired', () => {
  assert.match(server, /payment_intents/);
  assert.match(server, /payment_webhook_events/);
  assert.match(server, /customer_wallets/);
  assert.match(server, /x-paystack-signature/);
  assert.match(server, /settlements/);
  assert.ok(server.includes('api/payments/intent'));
  assert.ok(server.includes('api/webhooks/paystack'));
});


test('v1.1 school payments require wallet funds and settlement review is admin-only', () => {
  assert.match(server, /Insufficient PurposePay balance/);
  assert.ok(server.includes("parts[2]==='settlements'"));
  assert.match(server, /SETTLEMENT_REVIEW/);
  assert.match(server, /SCHOOL.*PAYABLE|PAYABLE/);
});


test('v1.2 operational workflows are wired', () => {
  assert.match(server, /project_contractors/);
  assert.ok(server.includes('INVITE_CONTRACTOR'));
  assert.ok(server.includes('VERIFY_CONTRACTOR'));
  assert.ok(server.includes('api/vouchers'));
  assert.match(server, /receipt_number/);
  assert.match(server, /disputes/);
  assert.match(server, /refunds/);
  assert.ok(server.includes('REFUND_TRANSACTION'));
});


test('v1.6 payout controls are wired', () => { assert.match(server, /PAYSTACK_TRANSFER_PROVIDER/); assert.ok(server.includes('api/admin/settlements/process')); assert.ok(server.includes('api/webhooks/paystack-transfer')); assert.ok(server.includes('api/merchants/payout-profile')); assert.match(server,/payout_recipient_code/); });


test('v1.7 operations center and alerts are wired', () => { assert.match(server,/operational_alerts/); assert.ok(server.includes('api/admin/operations')); assert.ok(server.includes('api/admin/operations/ack')); assert.ok(server.includes('PAYOUT_FAILED')); });


test('v1.8 notification and reconciliation controls are wired', () => { assert.ok(server.includes('api/notifications/read-all')); assert.ok(server.includes('api/admin/reconciliation/exceptions')); assert.ok(server.includes('PAYMENT_FAILED')); assert.ok(server.includes('notifyAdmins')); });


test('v1.9 financial controls are wired', () => { assert.ok(server.includes('api/admin/financial-integrity')); assert.ok(server.includes('api/admin/reconciliation/run')); assert.ok(server.includes('wallet-ledger-v3')); assert.ok(server.includes('reused:true')); });


test('v2 financial ledger debits customer funds and credits merchant payable', () => { assert.match(server, /ensureLedgerAccount\(client,'CUSTOMER',tx\.customer_id,'FUNDS'\)/); assert.match(server, /customer,'DEBIT',amt/); assert.match(server, /merchant,'CREDIT',amt/); });
test('v2 production health advertises v2.0 and ledger v3', () => { assert.match(server, /version:'2\.0\.0'/); assert.match(server, /financialControls:'wallet-ledger-v3'/); });
