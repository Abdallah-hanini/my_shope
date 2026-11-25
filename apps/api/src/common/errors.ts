import { HttpException, HttpStatus } from '@nestjs/common';

/** Business-rule failures with a safe, user-facing detail. Rendered as RFC 9457 by the filter. */
export class DomainError extends HttpException {
  constructor(status: HttpStatus, detail: string) {
    super({ message: detail }, status);
  }
}

export const notFound = (what = 'Resource') => new DomainError(HttpStatus.NOT_FOUND, `${what} not found`);
export const forbidden = (detail: string) => new DomainError(HttpStatus.FORBIDDEN, detail);
export const conflict = (detail: string) => new DomainError(HttpStatus.CONFLICT, detail);
export const unprocessable = (detail: string) => new DomainError(HttpStatus.UNPROCESSABLE_ENTITY, detail);
export const badRequest = (detail: string) => new DomainError(HttpStatus.BAD_REQUEST, detail);
