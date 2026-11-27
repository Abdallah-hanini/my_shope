import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  OVERDUE_ALERT_DAYS,
  type LowStockQuery,
  type ReorderLevelInput,
  type SalesTargetInput,
  type TargetsQuery,
} from '@erp/validation';
import type { CompanyScope, Principal } from '../auth/principal';
import { AuthzService } from '../authz/authz.service';
import { resolveScope } from '../authz/scope';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { writeAudit, type AuditContext } from '../platform/audit';
import { percent, AnalyticsService } from '../reporting/analytics.service';
import { StatementsService } from '../reporting/statements.service';
import type {
  AlertDto,
  AlertsDto,
  LowStockDto,
  ReorderLevelDto,
  SalesTargetDto,
  TargetsReportDto,
} from './planning.dto';
import { daysInMonth, expectedByNow, stockPosition } from './rules';

const D = Prisma.Decimal;
type Dec = Prisma.Decimal;
const qty = (d: Dec) => d.toFixed(3);
const money = (d: Dec) => d.toFixed(2);
const unique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const monthKey = (d: Date) => d.toISOString().slice(0, 7);
const inScope = (s: CompanyScope, branchId: string) => s.allBranches || s.branchIds.includes(branchId);

/**
 * R3a planning: reorder points and the low-stock list, owner-set monthly sales targets against
 * actual sales, and alerts computed live from the same reports (docs/REPORTING_PLAN.md). Nothing
 * here changes stock or the ledger; every figure comes from the services the reports use.
 */
@Injectable()
export class PlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    private readonly analytics: AnalyticsService,
    private readonly statements: StatementsService,
  ) {}

  private async branchOf(companyId: string, branchId: string) {
    const b = await this.prisma.branch.findUnique({ where: { companyId_id: { companyId, id: branchId } } });
    if (!b) throw notFound('Branch');
    return b;
  }
  private async today(companyId: string) {
    const c = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: c.timezone }).format(new Date());
    return { date, currency: c.baseCurrency };
  }

  // ── reorder points ────────────────────────────────────────────────────────

  async setReorderLevel(
    scope: CompanyScope,
    p: Principal,
    partId: string,
    branchId: string,
    input: ReorderLevelInput,
    ctx: AuditContext,
  ): Promise<ReorderLevelDto> {
    const part = await this.prisma.part.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id: partId } },
    });
    if (!part) throw notFound('Part');
    await this.branchOf(scope.companyId, branchId);
    if (!inScope(scope, branchId))
      throw forbidden('You can set reorder points only at branches where you manage stock');
    const data = {
      minQuantity: new D(input.minQuantity),
      reorderQuantity: new D(input.reorderQuantity),
      updatedBy: p.userId,
    };
    const row = await this.prisma.$transaction(async (tx) => {
      let saved;
      if (input.version === undefined) {
        try {
          saved = await tx.reorderLevel.create({
            data: { companyId: scope.companyId, branchId, partId, ...data },
          });
        } catch (e) {
          if (unique(e)) throw conflict('A reorder point is already set here; reload and try again');
          throw e;
        }
      } else {
        const n = await tx.reorderLevel.updateMany({
          where: { companyId: scope.companyId, branchId, partId, version: input.version },
          data: { ...data, version: { increment: 1 } },
        });
        if (n.count === 0) {
          if (!(await tx.reorderLevel.findFirst({ where: { companyId: scope.companyId, branchId, partId } })))
            throw notFound('Reorder point');
          throw conflict('This reorder point was changed by someone else; reload and try again');
        }
        saved = await tx.reorderLevel.findUniqueOrThrow({ where: { branchId_partId: { branchId, partId } } });
      }
      await writeAudit(tx, ctx, {
        action: 'inventory.reorder_level.set',
        entityType: 'part',
        entityId: partId,
        companyId: scope.companyId,
        after: { branchId, minQuantity: input.minQuantity, reorderQuantity: input.reorderQuantity },
      });
      return saved;
    });
    return {
      partId,
      branchId,
      minQuantity: qty(row.minQuantity),
      reorderQuantity: qty(row.reorderQuantity),
      version: row.version,
    };
  }

  async removeReorderLevel(scope: CompanyScope, partId: string, branchId: string, ctx: AuditContext) {
    await this.branchOf(scope.companyId, branchId);
    if (!inScope(scope, branchId))
      throw forbidden('You can remove reorder points only at branches where you manage stock');
    await this.prisma.$transaction(async (tx) => {
      const n = await tx.reorderLevel.deleteMany({ where: { companyId: scope.companyId, branchId, partId } });
      if (n.count === 0) throw notFound('Reorder point');
      await writeAudit(tx, ctx, {
        action: 'inventory.reorder_level.remove',
        entityType: 'part',
        entityId: partId,
        companyId: scope.companyId,
        after: { branchId },
      });
    });
  }

  async lowStock(scope: CompanyScope, q: LowStockQuery): Promise<LowStockDto> {
    if (q.branchId) {
      await this.branchOf(scope.companyId, q.branchId);
      if (!inScope(scope, q.branchId)) throw forbidden('Branch is outside your scope');
    }
    const branchWhere = q.branchId
      ? { branchId: q.branchId }
      : scope.allBranches
        ? {}
        : { branchId: { in: scope.branchIds } };
    const { currency } = await this.today(scope.companyId);
    const r = await this.prisma.$transaction(
      async (tx) => {
        const levels = await tx.reorderLevel.findMany({
          where: { companyId: scope.companyId, ...branchWhere, part: { active: true } },
          include: { part: true, branch: { select: { code: true } } },
        });
        const pairs = levels.map((l) => ({ branchId: l.branchId, partId: l.partId }));
        if (pairs.length === 0) return { levels, stock: [], reserved: [] };
        const [stock, reserved] = await Promise.all([
          tx.stock.findMany({ where: { companyId: scope.companyId, OR: pairs } }),
          tx.jobPart.groupBy({
            by: ['branchId', 'partId'],
            where: { companyId: scope.companyId, status: 'reserved', OR: pairs },
            _sum: { quantity: true },
          }),
        ]);
        return { levels, stock, reserved };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const lines: LowStockDto['lines'] = [];
    let suggestedValue = new D(0);
    for (const l of r.levels) {
      const s = r.stock.find((x) => x.branchId === l.branchId && x.partId === l.partId);
      const onHand = s?.onHand ?? new D(0);
      const res =
        r.reserved.find((x) => x.branchId === l.branchId && x.partId === l.partId)?._sum.quantity ?? new D(0);
      const pos = stockPosition(onHand, res, l.minQuantity, l.reorderQuantity);
      if (pos.status === 'ok') continue;
      const avg = s && s.onHand.greaterThan(0) ? s.value.dividedBy(s.onHand) : null;
      const value = avg ? pos.suggested.times(avg).toDecimalPlaces(2, D.ROUND_HALF_UP) : null;
      if (value) suggestedValue = suggestedValue.plus(value);
      lines.push({
        partId: l.partId,
        sku: l.part.sku,
        name: l.part.name,
        nameAr: l.part.nameAr,
        unit: l.part.unit,
        branchId: l.branchId,
        branchCode: l.branch.code,
        onHand: qty(onHand),
        reserved: qty(res),
        available: qty(pos.available),
        minQuantity: qty(l.minQuantity),
        reorderQuantity: qty(l.reorderQuantity),
        status: pos.status,
        suggested: qty(pos.suggested),
        averageCost: avg ? avg.toFixed(4) : null,
        suggestedValue: value ? money(value) : null,
      });
    }
    lines.sort((a, b) =>
      a.status !== b.status
        ? a.status === 'out'
          ? -1
          : 1
        : a.sku.localeCompare(b.sku) || a.branchCode.localeCompare(b.branchCode),
    );
    return {
      branchId: q.branchId ?? null,
      currency,
      levelsSet: r.levels.length,
      outCount: lines.filter((l) => l.status === 'out').length,
      lowCount: lines.filter((l) => l.status === 'low').length,
      suggestedValue: money(suggestedValue),
      lines,
      asOf: new Date().toISOString(),
    };
  }

  // ── sales targets ─────────────────────────────────────────────────────────

  async setTarget(scope: CompanyScope, p: Principal, input: SalesTargetInput, ctx: AuditContext) {
    if (input.branchId) {
      await this.branchOf(scope.companyId, input.branchId);
      if (!inScope(scope, input.branchId)) throw forbidden('Branch is outside your scope');
    } else if (!scope.allBranches) {
      throw forbidden('Only someone who sets targets for the whole company sets the company target');
    }
    const month = new Date(`${input.month}-01T00:00:00Z`);
    const data = { amount: new D(input.amount), updatedBy: p.userId };
    const id = await this.prisma.$transaction(async (tx) => {
      let rowId: string;
      if (input.version === undefined) {
        try {
          rowId = (
            await tx.salesTarget.create({
              data: { companyId: scope.companyId, branchId: input.branchId, month, ...data },
            })
          ).id;
        } catch (e) {
          if (unique(e)) throw conflict('A target is already set for this month; reload and try again');
          throw e;
        }
      } else {
        const where = { companyId: scope.companyId, branchId: input.branchId, month };
        const n = await tx.salesTarget.updateMany({
          where: { ...where, version: input.version },
          data: { ...data, version: { increment: 1 } },
        });
        const row = await tx.salesTarget.findFirst({ where });
        if (!row) throw notFound('Target');
        if (n.count === 0) throw conflict('This target was changed by someone else; reload and try again');
        rowId = row.id;
      }
      await writeAudit(tx, ctx, {
        action: 'reports.target.set',
        entityType: 'sales_target',
        entityId: rowId,
        companyId: scope.companyId,
        after: { month: input.month, branchId: input.branchId, amount: input.amount },
      });
      return rowId;
    });
    return this.targetDto(
      await this.prisma.salesTarget.findUniqueOrThrow({ where: { id }, include: { branch: true } }),
    );
  }

  async removeTarget(scope: CompanyScope, id: string, ctx: AuditContext) {
    const row = await this.prisma.salesTarget.findFirst({ where: { id, companyId: scope.companyId } });
    if (!row || (row.branchId && !inScope(scope, row.branchId)) || (!row.branchId && !scope.allBranches))
      throw notFound('Target');
    await this.prisma.$transaction(async (tx) => {
      await tx.salesTarget.delete({ where: { id } });
      await writeAudit(tx, ctx, {
        action: 'reports.target.remove',
        entityType: 'sales_target',
        entityId: id,
        companyId: scope.companyId,
        before: { month: monthKey(row.month), branchId: row.branchId, amount: money(row.amount) },
      });
    });
  }

  private targetDto(t: {
    id: string;
    month: Date;
    branchId: string | null;
    amount: Dec;
    version: number;
    branch: { code: string } | null;
  }): SalesTargetDto {
    return {
      id: t.id,
      month: monthKey(t.month),
      branchId: t.branchId,
      branchCode: t.branch?.code ?? null,
      amount: money(t.amount),
      version: t.version,
    };
  }

  async targets(scope: CompanyScope, p: Principal, q: TargetsQuery): Promise<TargetsReportDto> {
    if (!q.branchId && !scope.allBranches)
      throw unprocessable('Choose one of your branches: company targets cover branches outside your scope');
    const from = `${q.year}-01-01`;
    const to = `${q.year}-12-31`;
    const [sales, all, today, manage] = await Promise.all([
      this.analytics.sales(scope, { from, to, branchId: q.branchId }),
      this.prisma.salesTarget.findMany({
        where: {
          companyId: scope.companyId,
          month: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
          ...(scope.allBranches ? {} : { branchId: { in: scope.branchIds } }),
        },
        include: { branch: true },
        orderBy: [{ month: 'asc' }],
      }),
      this.today(scope.companyId),
      this.authz
        .grants(p.userId, scope.companyId)
        .then((g) => resolveScope(scope.companyId, 'reports.targets.manage', g)),
    ]);
    const mine = all.filter((t) => t.branchId === (q.branchId ?? null));
    let targetTotal = new D(0);
    let actualOfTargeted = new D(0);
    const months = Array.from({ length: 12 }, (_, i) => {
      const month = `${q.year}-${String(i + 1).padStart(2, '0')}`;
      const target = mine.find((t) => monthKey(t.month) === month)?.amount ?? null;
      const actual = new D(sales.byMonth.find((m) => m.month === month)?.sales ?? 0);
      if (target) {
        targetTotal = targetTotal.plus(target);
        actualOfTargeted = actualOfTargeted.plus(actual);
      }
      return {
        month,
        target: target ? money(target) : null,
        actual: money(actual),
        achievementPct: target ? percent(actual, target) : null,
      };
    });
    const thisMonth = today.date.slice(0, 7);
    const current = months.find((m) => m.month === thisMonth && m.target);
    let pace: TargetsReportDto['pace'] = null;
    if (current) {
      const [y, mo, day] = today.date.split('-').map(Number) as [number, number, number];
      const days = daysInMonth(y, mo);
      const expected = expectedByNow(new D(current.target!), day, days);
      pace = {
        month: thisMonth,
        day,
        days,
        target: current.target!,
        expected: money(expected),
        actual: current.actual,
        behind: new D(current.actual).lessThan(expected),
      };
    }
    return {
      year: q.year,
      branchId: q.branchId ?? null,
      currency: today.currency,
      months,
      targetTotal: money(targetTotal),
      actualOfTargeted: money(actualOfTargeted),
      pace,
      targets: all.map((t) => this.targetDto(t)),
      canManage: !!manage,
      asOf: new Date().toISOString(),
    };
  }

  // ── alerts ────────────────────────────────────────────────────────────────

  /** Alerts the caller may see, each from the report that explains it (any member may ask). */
  async alerts(companyId: string, p: Principal): Promise<AlertsDto> {
    const grants = await this.authz.grants(p.userId, companyId);
    if (grants.length === 0) throw notFound('Company');
    const inv = resolveScope(companyId, 'inventory.read', grants);
    const fin = resolveScope(companyId, 'reports.financial.read', grants);
    const { date, currency } = await this.today(companyId);
    const alerts: AlertDto[] = [];
    const add = (a: Partial<AlertDto> & Pick<AlertDto, 'key' | 'severity' | 'href'>) =>
      alerts.push({ count: null, amount: null, expected: null, ...a });

    if (inv) {
      const ls = await this.lowStock(inv, {});
      if (ls.outCount)
        add({ key: 'stock_out', severity: 'danger', count: ls.outCount, href: 'reports/low-stock' });
      if (ls.lowCount)
        add({ key: 'stock_low', severity: 'warning', count: ls.lowCount, href: 'reports/low-stock' });
    }
    if (fin) {
      const [ar, ap] = await Promise.all([
        this.statements.receivablesAging(fin, { asOf: date }),
        this.statements.payablesAging(fin, { asOf: date }),
      ]);
      const oldAr = ar.documents.filter((d) => d.days > OVERDUE_ALERT_DAYS);
      if (oldAr.length)
        add({
          key: 'receivables_overdue',
          severity: 'warning',
          count: oldAr.length,
          amount: money(oldAr.reduce((s, d) => s.plus(d.balance), new D(0))),
          href: 'reports/receivables',
        });
      const dueAp = ap.documents.filter((d) => d.days > 0);
      if (dueAp.length)
        add({
          key: 'payables_overdue',
          severity: 'warning',
          count: dueAp.length,
          amount: money(dueAp.reduce((s, d) => s.plus(d.balance), new D(0))),
          href: 'reports/payables',
        });
      if (ar.ledgerBalance !== null && !ar.reconciled)
        add({ key: 'receivables_unreconciled', severity: 'danger', href: 'reports/receivables' });
      if (ap.ledgerBalance !== null && !ap.reconciled)
        add({ key: 'payables_unreconciled', severity: 'danger', href: 'reports/payables' });

      const monthStart = `${date.slice(0, 7)}-01`;
      const pl = await this.statements.profitAndLoss(fin, { from: monthStart, to: date, compare: 'none' });
      if (new D(pl.grossProfit.amount).isNegative())
        add({
          key: 'negative_gross_margin',
          severity: 'danger',
          amount: pl.grossProfit.amount,
          href: 'reports/profit-and-loss',
        });

      // Pace against the company target (whole-company readers) or each own branch's target.
      const branches = fin.allBranches ? [undefined] : fin.branchIds;
      for (const branchId of branches) {
        const t = await this.targets(fin, p, { year: Number(date.slice(0, 4)), branchId });
        if (t.pace?.behind)
          add({
            key: 'sales_behind_target',
            severity: 'warning',
            amount: t.pace.actual,
            expected: t.pace.expected,
            href: branchId ? `reports/targets?branch=${branchId}` : 'reports/targets',
          });
      }
    }
    alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'danger' ? -1 : 1));
    return { currency, alerts, overdueDays: OVERDUE_ALERT_DAYS, asOf: new Date().toISOString() };
  }
}
