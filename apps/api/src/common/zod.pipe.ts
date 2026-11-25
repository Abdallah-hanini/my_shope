import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';

/** Validates and normalizes a request part with a shared @erp/validation schema. */
export class ZodPipe<S extends ZodTypeAny> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`),
      );
    }
    return result.data;
  }
}
