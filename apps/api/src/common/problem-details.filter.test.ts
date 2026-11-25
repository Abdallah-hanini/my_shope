import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { toProblem } from './problem-details.filter';

describe('toProblem (RFC 9457)', () => {
  it('maps HttpException status and title', () => {
    expect(toProblem(new NotFoundException(), '/api/v1/x', 'req-1')).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      instance: '/api/v1/x',
      requestId: 'req-1',
    });
  });

  it('keeps a specific detail message', () => {
    const p = toProblem(new ForbiddenException('Branch outside your scope'), '/a');
    expect(p).toMatchObject({ status: 403, title: 'Forbidden', detail: 'Branch outside your scope' });
  });

  it('joins validation messages', () => {
    const p = toProblem(new BadRequestException(['qty must be positive', 'sku is required']), '/a');
    expect(p.detail).toBe('qty must be positive; sku is required');
  });

  it('never leaks internal error messages for unexpected errors', () => {
    const p = toProblem(new Error('relation "secret_table" does not exist'), '/a', 'r');
    expect(p).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      instance: '/a',
      requestId: 'r',
    });
    expect(JSON.stringify(p)).not.toContain('secret_table');
  });
});
