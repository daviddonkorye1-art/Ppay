import { toPublicError } from './http-error.js';
import { validateIdempotencyKey, requestHash, resolveStoredIdempotency } from './idempotency.js';

export function publicErrorResponse(error) {
  return toPublicError(error);
}

export async function loadIdempotency(req, userId, body, query) {
  const key = validateIdempotencyKey(req?.headers?.['idempotency-key']);
  if (!key) return null;

  const hash = requestHash(body);
  const result = await query('SELECT * FROM idempotency_keys WHERE key=$1', [key]);
  const stored = result?.rows?.[0];
  const replay = resolveStoredIdempotency(stored, userId, hash);
  if (replay) return replay;

  return { key, hash };
}

export async function saveIdempotency(record, userId, status, body, query) {
  if (!record?.key) return;
  await query(
    'INSERT INTO idempotency_keys(key,user_id,request_hash,response_json,status_code) VALUES($1,$2,$3,$4,$5) ON CONFLICT(key) DO NOTHING',
    [record.key, userId, record.hash, JSON.stringify(body), status],
  );
}
