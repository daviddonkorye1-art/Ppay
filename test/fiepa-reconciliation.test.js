import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../migrations/003_fiepa_school_reconciliation.sql',import.meta.url),'utf8');
const server=readFileSync(new URL('../server/index.js',import.meta.url),'utf8');
test('reconciliation flags missing settlement',()=>assert.match(sql,/MISSING_SETTLEMENT/));
test('reconciliation flags amount and currency mismatches',()=>{assert.match(sql,/AMOUNT_MISMATCH/);assert.match(sql,/CURRENCY_MISMATCH/)});
test('reconciliation flags premature school completion',()=>assert.match(sql,/COMPLETED_WITHOUT_SETTLEMENT/));
test('reconciliation flags settlement not reflected in school payment',()=>assert.match(sql,/SETTLED_PAYMENT_NOT_COMPLETED/));
test('reconciliation query is admin restricted',()=>{
 const section=server.slice(server.indexOf("if(req.method==='GET'&&route==='api/fiepa/school-reconciliation')"),server.indexOf("if(req.method==='GET'&&route==='api/fiepa/school-settlements')"));
 assert.match(section,/role\(me,'ADMIN'\)/);
 assert.match(section,/WHERE reconciliation_status <> 'OK'/);
});
