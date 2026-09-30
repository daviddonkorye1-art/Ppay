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

test('release cannot ship while API health still advertises v0.5.0', () => {
  assert.doesNotMatch(server, /version:'0\.5\.0'/);
});

test('release cannot ship while global handler exposes raw exception messages', () => {
  assert.doesNotMatch(server, /error:e\.message\|\|'Internal server error'/);
});
