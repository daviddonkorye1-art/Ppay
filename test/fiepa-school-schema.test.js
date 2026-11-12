import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql = fs.readFileSync(new URL('../migrations/001_fiepa_school_invoices.sql', import.meta.url),'utf8');
test('school invoices are scoped to a school and invoice reference',()=>{
 assert.match(sql,/UNIQUE\s*\(school_id,\s*invoice_reference\)/);
});
test('invoice amount must be positive and currency is constrained',()=>{
 assert.match(sql,/amount_minor BIGINT NOT NULL CHECK \(amount_minor > 0\)/);
 assert.match(sql,/CHECK \(currency = 'GHS'\)/);
});
test('confirmed payments are unique per invoice',()=>{
 assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS idx_one_confirmed_payment_per_invoice/);
 assert.match(sql,/WHERE status = 'CONFIRMED'/);
});
test('migration is additive and transaction wrapped',()=>{
 assert.match(sql,/^--[^\n]*\n[\s\S]*BEGIN;/);
 assert.match(sql,/COMMIT;\s*$/);
 assert.doesNotMatch(sql,/\bDROP\s+(TABLE|COLUMN)\b/i);
});
