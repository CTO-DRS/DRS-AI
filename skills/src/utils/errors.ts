/**
 * Typed HTTP error used across the skills service.
 * Route handlers throw these; respondError() maps them to the
 * standard { success: false, error: { code, message } } envelope.
 */
export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST'): HttpError =>
  new HttpError(400, code, message);

export const unauthorized = (message = 'Authentication required'): HttpError =>
  new HttpError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'Insufficient permissions'): HttpError =>
  new HttpError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Resource not found', code = 'NOT_FOUND'): HttpError =>
  new HttpError(404, code, message);

export const conflict = (message: string): HttpError => new HttpError(409, 'CONFLICT', message);
