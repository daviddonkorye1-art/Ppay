import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);

test('release contains required application files', () => {
  for (const file of ['server/index.js','app.js','index.html','styles.css','package.json','.env.example','Dockerfile','docker-compose.yml']) {
    assert.equal(fs.existsSync(path.join(root,file)), true, file);
  }
});

test('server has core security controls', () => {
  const s = fs.readFileSync(path.join(root,'server/index.js'),'utf8');
  assert.match(s, /Idempotency-Key/);
  assert.match(s, /Too many login attempts/);
  assert.match(s, /issuer:'purposepay'/);
  assert.match(s, /audience:'purposepay-web'/);
  assert.match(s, /risk_status==='BLOCKED'/);
  assert.match(s, /role='CONTRACTOR'/);
});
