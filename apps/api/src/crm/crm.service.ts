import { Injectable } from '@nestjs/common';
import type { Customer, Prisma, Vehicle } from '@prisma/client';
import type {
  CreateCustomerInput,
  CreateVehicleInput,
  UpdateCustomerInput,
  UpdateVehicleInput,
} from '@erp/validation';
import type { CompanyScope } from '../auth/principal';
import { conflict, notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { isUniqueViolation } from '../org/org.service';
import { writeAudit, type AuditContext } from '../platform/audit';
import { enqueueOutbox } from '../platform/outbox';
import type { CustomerDetailDto, CustomerDto, VehicleDto } from './crm.dto';

const toCustomer = (c: Customer & { _count?: { vehicles: number } }): CustomerDto => ({
  id: c.id,
  kind: c.kind,
  name: c.name,
  nameAr: c.nameAr,
  phone: c.phone,
  email: c.email,
  notes: c.notes,
  status: c.status,
  version: c.version,
  vehicleCount: c._count?.vehicles ?? 0,
});
export const toVehicle = (v: Vehicle & { customer: { name: string } }): VehicleDto => ({
  id: v.id,
  customerId: v.customerId,
  customerName: v.customer.name,
  plate: v.plate,
  vin: v.vin,
  make: v.make,
  model: v.model,
  year: v.year,
  color: v.color,
  status: v.status,
  version: v.version,
});

/** "contains", case-insensitive; plates and phones also match without spaces. */
function textFilter(
  q: string | undefined,
  fields: string[],
): Prisma.CustomerWhereInput | Prisma.VehicleWhereInput {
  if (!q?.trim()) return {};
  const term = q.trim();
  return { OR: fields.map((f) => ({ [f]: { contains: term, mode: 'insensitive' } })) };
}

/** Customers and vehicles (WMS-001). Company-wide master data; no branch scope. */
@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  async listCustomers(scope: CompanyScope, q?: string): Promise<CustomerDto[]> {
    const rows = await this.prisma.customer.findMany({
      where: {
        companyId: scope.companyId,
        ...(textFilter(q, ['name', 'nameAr', 'phone', 'email']) as Prisma.CustomerWhereInput),
      },
      include: { _count: { select: { vehicles: true } } },
      orderBy: { name: 'asc' },
      take: 200,
    });
    return rows.map(toCustomer);
  }

  async getCustomer(scope: CompanyScope, id: string): Promise<CustomerDetailDto> {
    const c = await this.prisma.customer.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id } },
      include: {
        _count: { select: { vehicles: true } },
        vehicles: { include: { customer: true }, orderBy: { plate: 'asc' } },
      },
    });
    if (!c) throw notFound('Customer');
    return { ...toCustomer(c), vehicles: c.vehicles.map(toVehicle) };
  }

  async createCustomer(
    scope: CompanyScope,
    input: CreateCustomerInput,
    ctx: AuditContext,
  ): Promise<CustomerDto> {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.customer.create({ data: { companyId: scope.companyId, ...input } });
      await writeAudit(tx, ctx, {
        action: 'crm.customer.create',
        entityType: 'customer',
        entityId: c.id,
        companyId: scope.companyId,
        after: input,
      });
      await enqueueOutbox(tx, ctx, {
        companyId: scope.companyId,
        aggregateType: 'customer',
        aggregateId: c.id,
        eventType: 'crm.customer.created',
        payload: { customerId: c.id },
      });
      return toCustomer(c);
    });
  }

  async updateCustomer(
    scope: CompanyScope,
    id: string,
    input: UpdateCustomerInput,
    ctx: AuditContext,
  ): Promise<CustomerDto> {
    const { version, ...data } = input;
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.customer.findUnique({
        where: { companyId_id: { companyId: scope.companyId, id } },
      });
      if (!before) throw notFound('Customer');
      const n = await tx.customer.updateMany({
        where: { id, companyId: scope.companyId, version },
        data: { ...data, version: { increment: 1 } },
      });
      if (n.count === 0) throw conflict('This customer was changed by someone else; reload and try again');
      await writeAudit(tx, ctx, {
        action: 'crm.customer.update',
        entityType: 'customer',
        entityId: id,
        companyId: scope.companyId,
        before,
        after: data,
      });
      return toCustomer(
        await tx.customer.findUniqueOrThrow({
          where: { id },
          include: { _count: { select: { vehicles: true } } },
        }),
      );
    });
  }

  async listVehicles(scope: CompanyScope, q?: string): Promise<VehicleDto[]> {
    const compact = q?.replace(/\s+/g, '');
    const rows = await this.prisma.vehicle.findMany({
      where: {
        companyId: scope.companyId,
        ...(q?.trim()
          ? {
              OR: [
                { plate: { contains: q.trim(), mode: 'insensitive' } },
                ...(compact ? [{ plate: { contains: compact, mode: 'insensitive' as const } }] : []),
                { vin: { contains: q.trim(), mode: 'insensitive' } },
                { make: { contains: q.trim(), mode: 'insensitive' } },
                { model: { contains: q.trim(), mode: 'insensitive' } },
                { customer: { name: { contains: q.trim(), mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: { customer: true },
      orderBy: { plate: 'asc' },
      take: 200,
    });
    return rows.map(toVehicle);
  }

  async getVehicle(scope: CompanyScope, id: string): Promise<VehicleDto> {
    const v = await this.prisma.vehicle.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id } },
      include: { customer: true },
    });
    if (!v) throw notFound('Vehicle');
    return toVehicle(v);
  }

  private async assertCustomer(tx: Prisma.TransactionClient, companyId: string, customerId: string) {
    const c = await tx.customer.findUnique({ where: { companyId_id: { companyId, id: customerId } } });
    if (!c) throw unprocessable('customerId is not a customer of this company');
    if (c.status !== 'active') throw unprocessable('This customer is inactive');
  }

  async createVehicle(
    scope: CompanyScope,
    input: CreateVehicleInput,
    ctx: AuditContext,
  ): Promise<VehicleDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertCustomer(tx, scope.companyId, input.customerId);
        const v = await tx.vehicle.create({
          data: { companyId: scope.companyId, ...input, year: input.year ?? null },
          include: { customer: true },
        });
        await writeAudit(tx, ctx, {
          action: 'crm.vehicle.create',
          entityType: 'vehicle',
          entityId: v.id,
          companyId: scope.companyId,
          after: input,
        });
        await enqueueOutbox(tx, ctx, {
          companyId: scope.companyId,
          aggregateType: 'vehicle',
          aggregateId: v.id,
          eventType: 'crm.vehicle.created',
          payload: { vehicleId: v.id, customerId: v.customerId },
        });
        return toVehicle(v);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('A vehicle with this plate or VIN is already registered');
      throw e;
    }
  }

  /** A different customerId transfers ownership; earlier job cards keep their customer. */
  async updateVehicle(
    scope: CompanyScope,
    id: string,
    input: UpdateVehicleInput,
    ctx: AuditContext,
  ): Promise<VehicleDto> {
    const { version, ...data } = input;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await tx.vehicle.findUnique({
          where: { companyId_id: { companyId: scope.companyId, id } },
        });
        if (!before) throw notFound('Vehicle');
        if (data.customerId !== before.customerId)
          await this.assertCustomer(tx, scope.companyId, data.customerId);
        const n = await tx.vehicle.updateMany({
          where: { id, companyId: scope.companyId, version },
          data: { ...data, year: data.year ?? null, version: { increment: 1 } },
        });
        if (n.count === 0) throw conflict('This vehicle was changed by someone else; reload and try again');
        await writeAudit(tx, ctx, {
          action: data.customerId !== before.customerId ? 'crm.vehicle.transfer' : 'crm.vehicle.update',
          entityType: 'vehicle',
          entityId: id,
          companyId: scope.companyId,
          before,
          after: data,
        });
        return toVehicle(await tx.vehicle.findUniqueOrThrow({ where: { id }, include: { customer: true } }));
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('A vehicle with this plate or VIN is already registered');
      throw e;
    }
  }
}
