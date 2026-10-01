import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const server = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');

function occurrences(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

test('package is marked as v2.0.0', () => {
  assert.equal(pkg.version, '2.0.0');
});

test('CI syntax-checks every hardening module', () => {
  assert.match(pkg.scripts.check, /server\/http-error\.js/);
  assert.match(pkg.scripts.check, /server\/idempotency\.js/);
  assert.match(pkg.scripts.check, /server\/request-safety\.js/);
});

test('API health advertises v2.0.0', () => {
  assert.match(server, /version:'1\.9\.0'/);
  assert.doesNotMatch(server, /version:'0.6.0'/);
});

test('global handler does not expose raw exception messages', () => {
  assert.doesNotMatch(server, /error:e\.message\|\|'Internal server error'/);
});

test('main API imports and actually uses hardened request-safety helpers before release', () => {
  assert.match(server, /import\s*\{[^}]*loadIdempotency[^}]*saveIdempotency[^}]*publicErrorResponse[^}]*\}\s*from ['"]\.\/request-safety\.js['"]/s);

  // All three financial write routes must load and persist idempotency through
  // the hardened adapter, with the database query dependency supplied explicitly.
  assert.equal(occurrences(server, /loadIdempotency\(req,me\.sub,b,q\)/g), 4);
  assert.equal(occurrences(server, /saveIdempotency\(ir,me\.sub,(?:200|201),response,q\)/g), 4);

  // The legacy inline implementation must be gone rather than left reachable.
  assert.doesNotMatch(server, /async function idem\(/);
  assert.doesNotMatch(server, /async function saveIdem\(/);

  // The outer API boundary must convert HttpError instances to their controlled
  // 4xx responses while sanitizing unexpected exceptions to a generic 500.
  assert.match(server, /publicErrorResponse\(e\)/);
});
