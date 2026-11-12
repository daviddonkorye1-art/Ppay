import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../server/index.js',import.meta.url),'utf8');
const start=source.indexOf("if(req.method==='GET'&&route==='api/fiepa/healthcare/providers')");
const end=source.indexOf('  // Fiepa Pay invoices are opt-in',start);
const section=source.slice(start,end);
test('healthcare directory endpoint exists and defaults off',()=>{
 assert.ok(start>=0&&end>start);
 assert.match(section,/FIEPA_HEALTHCARE_ENABLED'!=='true'/);
});
test('healthcare directory requires an authenticated customer or administrator',()=>{
 assert.match(section,/role\(me,'CUSTOMER'\)/);
 assert.match(section,/role\(me,'ADMIN'\)/);
});
test('only approved providers are listed',()=>assert.match(section,/verification_status='APPROVED'/));
test('healthcare directory excludes patient, license and verification details',()=>{
 assert.match(section,/SELECT id,legal_name,provider_type FROM fiepa_healthcare_providers/);
 assert.doesNotMatch(section,/SELECT \*/);
});
test('healthcare provider type filter uses bound SQL parameter',()=>{
 assert.match(section,/provider_type=\$1/);
 assert.match(section,/\[type\]/);
});
