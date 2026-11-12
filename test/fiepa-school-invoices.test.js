import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSchoolInvoice} from '../server/fiepa-school-invoices.js';
const valid={schoolId:'SCH_1',invoiceReference:'INV-2026-001',studentIdentifier:'ST-22',studentName:'Ama Mensah',academicTerm:'Term 1',amountMinor:25000,currency:'GHS'};
test('accepts a complete school invoice',()=>{const r=validateSchoolInvoice(valid);assert.equal(r.error,undefined);assert.equal(r.value.amountMinor,25000)});
test('rejects zero and fractional amounts',()=>{for(const n of [0,-1,1.5,NaN,Number.MAX_SAFE_INTEGER+1,'25000'])assert.ok(validateSchoolInvoice({...valid,amountMinor:n}).error)});
test('rejects other currencies and missing student',()=>{assert.ok(validateSchoolInvoice({...valid,currency:'USD'}).error);assert.ok(validateSchoolInvoice({...valid,studentIdentifier:''}).error)});
test('rejects malformed references and dates',()=>{assert.ok(validateSchoolInvoice({...valid,invoiceReference:'../bad'}).error);assert.ok(validateSchoolInvoice({...valid,dueAt:'tomorrow'}).error)});
test('normalizes fields and timezone-aware due date',()=>{const r=validateSchoolInvoice({...valid,studentName:' Ama Mensah ',dueAt:'2026-12-01T12:00:00+00:00'});assert.equal(r.value.studentName,'Ama Mensah');assert.equal(r.value.dueAt,'2026-12-01T12:00:00.000Z')});
