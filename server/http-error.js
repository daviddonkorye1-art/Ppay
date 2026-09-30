export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function badRequest(message) {
  return new HttpError(400, message);
}

export function conflict(message) {
  return new HttpError(409, message);
}

export function toPublicError(error) {
  if (error instanceof HttpError) {
    return { status: error.status, body: { error: error.message } };
  }
  return { status: 500, body: { error: 'Internal server error' } };
}
