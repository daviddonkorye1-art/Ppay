import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const server = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');

test('package is marked as v0.6.0', () => {
  assert.equal(pkg.version, '0.6.0');
});

test('CI syntax-checks every hardening module', () => {
  assert.match(pkg.scripts.check, /server\/http-error\.js/);
  assert.match(pkg.scripts.check, /server\/idempotency\.js/);
  assert.match(pkg.scripts.check, /server\/request-safety\.js/);
});

test('API health advertises v0.6.0', () => {
  assert.match(server, /version:'0\.6\.0'/);
  assert.doesNotMatch(server, /version:'0\.5\.0'/);
});

test('global handler does not expose raw exception messages', () => {
  assert.doesNotMatch(server, /error:e\.message\|\|'Internal server error'/);
});

test('main API imports hardened request-safety helpers before release', () => {
  assert.match(server, /from ['"]\.\/request-safety\.js['"]/);
  assert.match(server, /loadIdempotency/);
  assert.match(server, /saveIdempotency/);
  assert.match(server, /publicErrorResponse/);
});
