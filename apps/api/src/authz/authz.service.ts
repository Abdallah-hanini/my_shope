import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../infra/prisma.service';
import type { AssignmentGrant } from './scope';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuthzService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active role assignments of a user in one company. Inactive companies grant nothing. */
  async grants(userId: string, companyId: string, db: Db = this.prisma): Promise<AssignmentGrant[]> {
    const rows = await db.roleAssignment.findMany({
      where: { userId, companyId, company: { status: 'active' } },
      select: { branchId: true, role: { select: { permissions: true } } },
    });
    return rows.map((r) => ({ branchId: r.branchId, permissions: r.role.permissions }));
  }
}
