import { Prisma } from '@prisma/client';
import type { CompanyScope } from '../auth/principal';
import { forbidden, unprocessable } from '../common/errors';
import type { PrismaService } from '../infra/prisma.service';

/**
 * SQL filter on reporting.ledger_line.branch_id shared by every financial report. Branch-limited
 * callers only ever see journals of their branches (company-level journals are excluded for them);
 * an explicit branch must belong to the company and to the caller's scope.
 */
export async function ledgerBranchFilter(
  prisma: PrismaService,
  scope: CompanyScope,
  branchId: string | undefined,
  column = Prisma.raw('branch_id'),
): Promise<Prisma.Sql> {
  if (branchId) {
    const branch = await prisma.branch.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id: branchId } },
    });
    if (!branch) throw unprocessable('branchId is not a branch of this company');
    if (!scope.allBranches && !scope.branchIds.includes(branchId))
      throw forbidden('Branch is outside your reporting scope');
    return Prisma.sql`AND ${column} = ${branchId}::uuid`;
  }
  return scope.allBranches ? Prisma.empty : Prisma.sql`AND ${column} = ANY(${scope.branchIds}::uuid[])`;
}
