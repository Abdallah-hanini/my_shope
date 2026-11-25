import 'reflect-metadata';
import {
  closeFiscalPeriodSchema,
  createAccountSchema,
  createBranchSchema,
  createCompanySchema,
  createFiscalPeriodSchema,
  createRoleAssignmentSchema,
  createRoleSchema,
  createUserSchema,
  journalLineSchema,
  postJournalSchema,
  reverseJournalSchema,
} from '@erp/validation';
import type { ZodTypeAny } from 'zod';
import {
  CloseFiscalPeriodDto,
  CreateAccountDto,
  CreateFiscalPeriodDto,
  JournalLineInputDto,
  PostJournalDto,
  ReverseJournalDto,
} from '../accounting/accounting.dto';
import { CreateRoleAssignmentDto, CreateRoleDto, CreateUserDto } from '../iam/iam.dto';
import { CreateBranchDto, CreateCompanyDto } from '../org/org.dto';

// The OpenAPI document (and so every generated client) is built from these DTO classes, while the
// server validates with the shared Zod schemas. This test keeps the two from drifting apart.

function dtoKeys(dto: new () => unknown): string[] {
  const props: string[] = Reflect.getMetadata('swagger/apiModelPropertiesArray', dto.prototype) ?? [];
  return props.map((p) => p.replace(/^:/, '')).sort();
}

function zodKeys(schema: ZodTypeAny): string[] {
  let s: ZodTypeAny = schema;
  while (s._def.typeName === 'ZodEffects') s = s._def.schema;
  return Object.keys(s._def.shape()).sort();
}

describe('request DTOs match validation schemas', () => {
  it.each([
    ['CreateCompanyDto', CreateCompanyDto, createCompanySchema],
    ['CreateBranchDto', CreateBranchDto, createBranchSchema],
    ['CreateUserDto', CreateUserDto, createUserSchema],
    ['CreateRoleDto', CreateRoleDto, createRoleSchema],
    ['CreateRoleAssignmentDto', CreateRoleAssignmentDto, createRoleAssignmentSchema],
    ['CreateAccountDto', CreateAccountDto, createAccountSchema],
    ['CreateFiscalPeriodDto', CreateFiscalPeriodDto, createFiscalPeriodSchema],
    ['CloseFiscalPeriodDto', CloseFiscalPeriodDto, closeFiscalPeriodSchema],
    ['PostJournalDto', PostJournalDto, postJournalSchema],
    ['JournalLineInputDto', JournalLineInputDto, journalLineSchema],
    ['ReverseJournalDto', ReverseJournalDto, reverseJournalSchema],
  ] as const)('%s', (_name, dto, schema) => {
    expect(dtoKeys(dto as new () => unknown)).toEqual(zodKeys(schema as ZodTypeAny));
  });
});
