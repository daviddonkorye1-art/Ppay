import crypto from 'node:crypto';
import { badRequest, conflict } from './http-error.js';

export function validateIdempotencyKey(value) {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) throw badRequest('Invalid Idempotency-Key');
  const key = String(value);
  if (key.length < 8 || key.length > 128) throw badRequest('Invalid Idempotency-Key');
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) throw badRequest('Invalid Idempotency-Key');
  return key;
}

export function requestHash(body) {
  return crypto.createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');
}

export function resolveStoredIdempotency(stored, userId, hash) {
  if (!stored) return null;
  if (stored.user_id !== userId || stored.request_hash !== hash) {
    throw conflict('Idempotency-Key was already used with different request data');
  }
  return {
    status: stored.status_code,
    body: typeof stored.response_json === 'string' ? JSON.parse(stored.response_json) : stored.response_json,
  };
}
