import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync(new URL('../migrations/002_fiepa_school_settlements.sql',import.meta.url),'utf8');
test('one settlement record per invoice payment',()=>assert.match(sql,/invoice_payment_id TEXT NOT NULL UNIQUE REFERENCES school_invoice_payments/));
test('verified settlement requires verifier, date, and external reference',()=>{
 assert.match(sql,/status = 'SETTLED' AND verified_at IS NOT NULL AND verified_by IS NOT NULL AND external_reference IS NOT NULL/);
});
test('external settlement references cannot be reused',()=>assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS idx_school_settlements_external_reference/));
test('settlement migration is additive',()=>{assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;/);assert.doesNotMatch(sql,/\bDROP\s+(TABLE|COLUMN)\b/i)});
