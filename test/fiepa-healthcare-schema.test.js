import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../migrations/004_fiepa_healthcare_foundation.sql',import.meta.url),'utf8');
test('healthcare provider approval requires license and verifier',()=>{
 assert.match(sql,/license_reference IS NOT NULL AND submitted_by IS NOT NULL AND review_reference IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL AND submitted_by <> verified_by/);
});
test('hospital invoices are unique per provider',()=>assert.match(sql,/UNIQUE\(provider_id,invoice_reference\)/));
test('hospital invoices accept only positive GHS amounts',()=>{
 assert.match(sql,/amount_minor BIGINT NOT NULL CHECK\(amount_minor > 0\)/);
 assert.match(sql,/currency TEXT NOT NULL DEFAULT 'GHS' CHECK\(currency='GHS'\)/);
});
test('pharmacy voucher redemption must be timestamped',()=>assert.match(sql,/status <> 'REDEEMED' OR redeemed_at IS NOT NULL/));
test('healthcare schema does not create dispensing or payment execution functions',()=>{
 assert.doesNotMatch(sql,/CREATE\s+(OR REPLACE\s+)?FUNCTION/i);
});
