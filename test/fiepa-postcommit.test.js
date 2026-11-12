import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server=readFileSync(new URL('../server/index.js',import.meta.url),'utf8');
const start=server.indexOf("if(req.method==='POST'&&route==='api/fiepa/school-invoices/pay')");
const end=server.indexOf("if(req.method==='GET'&&route==='api/fiepa/my-school-payments')");
const payment=server.slice(start,end);
test('customer payment returns confirmed response even if post-commit audit logging fails',()=>{
 assert.ok(start>=0&&end>start);
 assert.match(payment,/await client.query\('COMMIT'\)/);
 assert.match(payment,/try\{await audit\(me.sub,'PAY','SCHOOL_INVOICE'/);
 assert.match(payment,/catch\(err\)\{console.error\('Fiepa payment audit notification failed after commit'/);
 assert.match(payment,/settlementStatus:'PENDING'/);
});
const verifyStart=server.indexOf("if(req.method==='POST'&&route.startsWith('api/fiepa/school-settlements/')");
const verifyEnd=server.indexOf("if(req.method==='GET'&&route==='api/fiepa/school-invoices'){");
test('settlement verification does not falsely fail due to post-commit audit logging',()=>{
 const verify=server.slice(verifyStart,verifyEnd);
 assert.ok(verifyStart>=0&&verifyEnd>verifyStart);
 assert.match(verify,/try\{await audit\(me.sub,'VERIFY','SCHOOL_SETTLEMENT'/);
});
