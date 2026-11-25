import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import type { ProblemDetailsDto } from '../health/health.dto';

/**
 * Renders every error as RFC 9457 application/problem+json. Unexpected errors are logged with the
 * request id and returned as a generic 500 so internals never reach the client.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemDetails');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const body = toProblem(exception, req.originalUrl ?? req.url, req.id ? String(req.id) : undefined);
    if (body.status >= 500) {
      this.logger.error(
        { requestId: body.requestId, err: exception instanceof Error ? exception : String(exception) },
        'Unhandled error',
      );
    }
    if (body.status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
    res.status(body.status).type('application/problem+json').json(body);
  }
}

/** Messages raised by our own database triggers start with "ERP: " and are safe to show. */
const DB_RULE = /ERP: ([^\n"]+)/;

function fromDatabase(exception: unknown): { status: number; detail?: string } | undefined {
  if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
    return { status: 409, detail: 'A record with the same unique value already exists' };
  }
  if (
    exception instanceof Prisma.PrismaClientKnownRequestError ||
    exception instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    const rule = DB_RULE.exec(exception.message);
    if (rule?.[1]) return { status: 422, detail: rule[1].trim() };
    if (/40001|40P01|could not serialize|deadlock detected/i.test(exception.message)) {
      return { status: 409, detail: 'Concurrent update; retry the request' };
    }
  }
  return undefined;
}

export function toProblem(exception: unknown, instance: string, requestId?: string): ProblemDetailsDto {
  const db = fromDatabase(exception);
  if (db) {
    return {
      type: 'about:blank',
      title: humanize(HttpStatus[db.status] ?? 'ERROR'),
      status: db.status,
      ...(db.detail ? { detail: db.detail } : {}),
      instance,
      ...(requestId ? { requestId } : {}),
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const detail =
      typeof response === 'object' && response !== null && 'message' in response
        ? stringify((response as { message: unknown }).message)
        : typeof response === 'string'
          ? response
          : undefined;
    return {
      type: 'about:blank',
      title: HttpStatus[status] ? humanize(HttpStatus[status]) : exception.name,
      status,
      ...(detail && detail !== humanize(HttpStatus[status] ?? '') ? { detail } : {}),
      instance,
      ...(requestId ? { requestId } : {}),
    };
  }
  return {
    type: 'about:blank',
    title: 'Internal Server Error',
    status: 500,
    instance,
    ...(requestId ? { requestId } : {}),
  };
}

function stringify(v: unknown): string {
  return Array.isArray(v) ? v.map(String).join('; ') : String(v);
}

function humanize(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
