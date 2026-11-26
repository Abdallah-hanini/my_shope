import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { QuoteDecisionInput, QuoteVersionInput, UpdateQuoteInput } from '@erp/validation';
import type { CompanyScope, Principal } from '../auth/principal';
import { AuthzService } from '../authz/authz.service';
import { resolveScope } from '../authz/scope';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { writeAudit, type AuditContext } from '../platform/audit';
import { formatDocumentNumber, nextDocumentNumber } from '../platform/sequence';
import { effectiveOn, isoDate } from '../settings/effective';
import { localTime } from '../workshop/scheduling';
import type { JobQuotesDto, QuoteDto } from './quote.dto';
import { quoteTotals } from './quote-math';

type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;
const CLOSED = ['delivered', 'cancelled'];
const quoteInclude = { lines: { orderBy: { lineNo: 'asc' } } } satisfies Prisma.QuoteInclude;
type QuoteRow = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;
const money = (d: Prisma.Decimal) => d.toFixed(2);
const pct = (d: Prisma.Decimal) => d.toFixed(4);

/**
 * Priced quotes on job cards (WMS-005, T-71). A draft follows the job's tasks and the current
 * labour rate and tax set-up; issuing numbers and freezes it (rates, tax and amounts as of the
 * quote date); the customer then approves or declines it. Discounts above the managers' limit
 * need the owner's approval, never by the person who set them. Every change: version check,
 * the job row locked, audit, timeline for issue and decision.
 */
@Injectable()
export class QuoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  private async can(p: Principal, companyId: string, permission: string, branchId: string) {
    const s = resolveScope(companyId, permission, await this.authz.grants(p.userId, companyId));
    return !!s && (s.allBranches || s.branchIds.includes(branchId));
  }

  private async job(db: Tx | PrismaService, scope: CompanyScope, jobId: string, lock = false) {
    if (lock) await db.$queryRaw`SELECT 1 FROM workshop.job_card WHERE id = ${jobId}::uuid FOR UPDATE`;
    const j = await db.jobCard.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id: jobId } },
      include: {
        tasks: { orderBy: { lineNo: 'asc' } },
        company: { select: { timezone: true, baseCurrency: true } },
      },
    });
    if (!j || (!scope.allBranches && !scope.branchIds.includes(j.branchId))) throw notFound('Job card');
    return j;
  }

  /** Labour rate, tax and discount limit in force on `date` for the job's branch. */
  private async pricing(db: Tx | PrismaService, companyId: string, branchId: string, date: string) {
    const [rates, tax, settings] = await Promise.all([
      db.labourRate.findMany({ where: { companyId, branchId } }),
      db.taxSettings.findUnique({
        where: { companyId },
        include: { defaultTaxCode: { include: { rates: true } } },
      }),
      db.pricingSettings.findUnique({ where: { companyId } }),
    ]);
    const rate = effectiveOn(
      rates.map((r) => ({ ...r, effectiveFrom: isoDate(r.effectiveFrom) })),
      date,
    );
    const code = tax?.defaultTaxCode ?? null;
    const taxRate = code
      ? effectiveOn(
          code.rates.map((r) => ({ ...r, effectiveFrom: isoDate(r.effectiveFrom) })),
          date,
        )
      : null;
    if (code && !taxRate)
      throw unprocessable(`Tax ${code.code} has no rate on ${date}; the accountant must add one`);
    return {
      rate: rate?.rate ?? null,
      taxCodeId: code?.id ?? null,
      taxCode: code?.code ?? null,
      taxPct: taxRate?.ratePct ?? null,
      pricesIncludeTax: tax?.pricesIncludeTax ?? false,
      limit: settings?.managerDiscountLimitPct ?? new D(0),
    };
  }

  /** Rebuild a draft's lines from the job's tasks and price it with today's settings. */
  private async reprice(
    tx: Tx,
    q: { id: string; discountPct: Prisma.Decimal },
    job: Awaited<ReturnType<QuoteService['job']>>,
    overrides: Map<string, { amount: Prisma.Decimal | null; reason: string | null }>,
  ) {
    const today = localTime(new Date(), job.company.timezone).date;
    const pr = await this.pricing(tx, job.companyId, job.branchId, today);
    if (!pr.rate)
      throw unprocessable('Set the labour rate of this branch first (Labour rates and discounts)');
    if (!job.tasks.length) throw unprocessable('The job has no tasks to price');
    const lines = job.tasks.map((t) => ({ t, o: overrides.get(t.id) ?? { amount: null, reason: null } }));
    const totals = quoteTotals(
      lines.map(({ t, o }) => ({ hours: t.estimatedHours, rate: pr.rate!, override: o.amount })),
      q.discountPct,
      pr.taxPct,
      pr.pricesIncludeTax,
    );
    await tx.quoteLine.deleteMany({ where: { quoteId: q.id } });
    await tx.quoteLine.createMany({
      data: lines.map(({ t, o }, i) => ({
        quoteId: q.id,
        lineNo: i + 1,
        jobId: job.id,
        taskId: t.id,
        description: t.description,
        hours: t.estimatedHours,
        rate: pr.rate!,
        overrideAmount: o.amount,
        overrideReason: o.amount !== null ? o.reason : null,
        amount: totals.lines[i]!,
      })),
    });
    await tx.quote.update({
      where: { id: q.id },
      data: {
        currency: job.company.baseCurrency,
        taxCodeId: pr.taxCodeId,
        taxCode: pr.taxCode,
        taxPct: pr.taxPct,
        pricesIncludeTax: pr.pricesIncludeTax,
        subtotal: totals.subtotal,
        discountAmount: totals.discount,
        netAmount: totals.net,
        taxAmount: totals.tax,
        total: totals.total,
      },
    });
    return { today, limit: pr.limit };
  }

  async list(scope: CompanyScope, p: Principal, jobId: string): Promise<JobQuotesDto> {
    const job = await this.job(this.prisma, scope, jobId);
    const today = localTime(new Date(), job.company.timezone).date;
    const [quotes, manage, approve, rates, settings] = await Promise.all([
      this.prisma.quote.findMany({ where: { jobId }, include: quoteInclude, orderBy: { revision: 'desc' } }),
      this.can(p, scope.companyId, 'workshop.job.manage', job.branchId),
      this.can(p, scope.companyId, 'workshop.pricing.manage', job.branchId),
      this.prisma.labourRate.findMany({ where: { companyId: scope.companyId, branchId: job.branchId } }),
      this.prisma.pricingSettings.findUnique({ where: { companyId: scope.companyId } }),
    ]);
    const limit = settings?.managerDiscountLimitPct ?? new D(0);
    const names = await this.names(
      quotes.flatMap((q) => [q.discountSetBy, q.discountApprovedBy, q.issuedBy, q.decidedBy]),
    );
    const open = !CLOSED.includes(job.status);
    return {
      jobId,
      currency: job.company.baseCurrency,
      labourRate:
        effectiveOn(
          rates.map((r) => ({ ...r, effectiveFrom: isoDate(r.effectiveFrom) })),
          today,
        )?.rate.toFixed(2) ?? null,
      managerDiscountLimitPct: pct(limit),
      canCreate: manage && open && !quotes.some((q) => q.status === 'draft'),
      quotes: quotes.map((q) => this.toDto(q, names, { manage, approve, open, limit, userId: p.userId })),
    };
  }

  private toDto(
    q: QuoteRow,
    names: Map<string, string>,
    c: { manage: boolean; approve: boolean; open: boolean; limit: Prisma.Decimal; userId: string },
  ): QuoteDto {
    const needs = q.status === 'draft' && q.discountPct.greaterThan(c.limit) && !q.discountApprovedBy;
    const actions: string[] = [];
    if (c.open && q.status === 'draft' && c.manage) actions.push('edit', 'discard', 'issue');
    if (c.open && needs && c.approve && q.discountSetBy !== c.userId) actions.push('approveDiscount');
    if (c.open && q.status === 'issued' && c.manage) actions.push('decide');
    const name = (id: string | null) => (id ? (names.get(id) ?? '—') : null);
    return {
      id: q.id,
      revision: q.revision,
      number: q.number,
      status: q.status,
      currency: q.currency,
      quoteDate: q.quoteDate ? isoDate(q.quoteDate) : null,
      discountPct: pct(q.discountPct),
      discountReason: q.discountReason,
      discountSetByName: name(q.discountSetBy),
      discountNeedsApproval: needs,
      discountApprovedByName: name(q.discountApprovedBy),
      taxCode: q.taxCode,
      taxPct: q.taxPct ? pct(q.taxPct) : null,
      pricesIncludeTax: q.pricesIncludeTax,
      subtotal: money(q.subtotal),
      discountAmount: money(q.discountAmount),
      netAmount: money(q.netAmount),
      taxAmount: money(q.taxAmount),
      total: money(q.total),
      lines: q.lines.map((l) => ({
        lineNo: l.lineNo,
        taskId: l.taskId,
        description: l.description,
        hours: l.hours.toFixed(2),
        rate: money(l.rate),
        overrideAmount: l.overrideAmount ? money(l.overrideAmount) : null,
        overrideReason: l.overrideReason,
        amount: money(l.amount),
      })),
      issuedAt: q.issuedAt?.toISOString() ?? null,
      issuedByName: name(q.issuedBy),
      decidedAt: q.decidedAt?.toISOString() ?? null,
      decidedByName: name(q.decidedBy),
      authorizedByName: q.authorizedByName,
      authorizedVia: q.authorizedVia,
      declineReason: q.declineReason,
      version: q.version,
      actions,
    };
  }

  private async names(ids: (string | null)[]) {
    const u = [...new Set(ids.filter((x): x is string => !!x))];
    const rows = u.length
      ? await this.prisma.user.findMany({ where: { id: { in: u } }, select: { id: true, displayName: true } })
      : [];
    return new Map(rows.map((r) => [r.id, r.displayName]));
  }

  private async mustManage(p: Principal, companyId: string, branchId: string) {
    if (!(await this.can(p, companyId, 'workshop.job.manage', branchId)))
      throw forbidden('Only workshop managers prepare quotes');
  }

  private audit(
    tx: Tx,
    ctx: AuditContext,
    q: { id: string; companyId: string; branchId: string },
    action: string,
    after: unknown,
    reason?: string,
  ) {
    return writeAudit(tx, ctx, {
      action,
      entityType: 'quote',
      entityId: q.id,
      companyId: q.companyId,
      branchId: q.branchId,
      after,
      reason,
    });
  }

  private event(tx: Tx, job: { id: string; companyId: string }, actor: string, kind: string, note: string) {
    return tx.jobEvent.create({
      data: { companyId: job.companyId, jobId: job.id, actorUserId: actor, kind, note },
    });
  }

  async create(scope: CompanyScope, p: Principal, jobId: string, ctx: AuditContext): Promise<JobQuotesDto> {
    await this.prisma.$transaction(async (tx) => {
      const job = await this.job(tx, scope, jobId, true);
      await this.mustManage(p, scope.companyId, job.branchId);
      if (CLOSED.includes(job.status)) throw conflict(`The job is ${job.status}; it takes no new quote`);
      if (await tx.quote.count({ where: { jobId, status: 'draft' } }))
        throw conflict('A draft quote already exists; edit or discard it');
      const last = await tx.quote.findFirst({
        where: { jobId },
        orderBy: { revision: 'desc' },
        include: quoteInclude,
      });
      const q = await tx.quote.create({
        data: {
          companyId: scope.companyId,
          branchId: job.branchId,
          jobId,
          revision: (last?.revision ?? 0) + 1,
          currency: job.company.baseCurrency,
          // A new revision starts from the previous one's discount and price changes.
          discountPct: last?.discountPct ?? 0,
          discountReason: last?.discountReason ?? null,
          discountSetBy: last && last.discountPct.greaterThan(0) ? p.userId : null,
          createdBy: p.userId,
        },
      });
      const overrides = new Map(
        (last?.lines ?? [])
          .filter((l) => l.overrideAmount !== null)
          .map((l) => [l.taskId, { amount: l.overrideAmount, reason: l.overrideReason }]),
      );
      await this.reprice(tx, q, job, overrides);
      await this.audit(tx, ctx, q, 'workshop.quote.create', { revision: q.revision });
    });
    return this.list(scope, p, jobId);
  }

  private async draft(tx: Tx, scope: CompanyScope, quoteId: string, version: number) {
    const q = await tx.quote.findFirst({
      where: { id: quoteId, companyId: scope.companyId },
      include: quoteInclude,
    });
    if (!q || (!scope.allBranches && !scope.branchIds.includes(q.branchId))) throw notFound('Quote');
    if (q.status !== 'draft') throw conflict(`This quote is ${q.status} and cannot be changed`);
    if (q.version !== version) throw conflict('This quote was changed by someone else; reload and try again');
    return q;
  }

  private async bump(tx: Tx, id: string, version: number) {
    const n = await tx.quote.updateMany({ where: { id, version }, data: { version: { increment: 1 } } });
    if (n.count === 0) throw conflict('This quote was changed by someone else; reload and try again');
  }

  async update(
    scope: CompanyScope,
    p: Principal,
    quoteId: string,
    input: UpdateQuoteInput,
    ctx: AuditContext,
  ) {
    const jobId = await this.prisma.$transaction(async (tx) => {
      const pre = await tx.quote.findFirst({ where: { id: quoteId, companyId: scope.companyId } });
      if (!pre) throw notFound('Quote');
      const job = await this.job(tx, scope, pre.jobId, true);
      await this.mustManage(p, scope.companyId, job.branchId);
      const q = await this.draft(tx, scope, quoteId, input.version);
      const pctIn = new D(input.discountPct);
      const changed = !pctIn.equals(q.discountPct) || (input.discountReason ?? null) !== q.discountReason;
      const known = new Set(job.tasks.map((t) => t.id));
      for (const l of input.lines)
        if (!known.has(l.taskId)) throw unprocessable('A price change refers to a task not on this job');
      const overrides = new Map(
        q.lines
          .filter((l) => l.overrideAmount !== null)
          .map((l) => [l.taskId, { amount: l.overrideAmount, reason: l.overrideReason }]),
      );
      for (const l of input.lines)
        overrides.set(l.taskId, {
          amount: l.overrideAmount === null ? null : new D(l.overrideAmount),
          reason: l.overrideReason ?? null,
        });
      await this.bump(tx, q.id, q.version);
      await tx.quote.update({
        where: { id: q.id },
        data: changed
          ? {
              discountPct: pctIn,
              discountReason: pctIn.isZero() ? null : input.discountReason,
              discountSetBy: pctIn.isZero() ? null : p.userId,
              discountApprovedBy: null, // a changed discount needs a fresh approval
              discountApprovedAt: null,
            }
          : {},
      });
      await this.reprice(tx, { id: q.id, discountPct: pctIn }, job, overrides);
      await this.audit(tx, ctx, q, 'workshop.quote.update', input, input.discountReason ?? undefined);
      return job.id;
    });
    return this.list(scope, p, jobId);
  }

  async approveDiscount(
    scope: CompanyScope,
    p: Principal,
    quoteId: string,
    input: QuoteVersionInput,
    ctx: AuditContext,
  ) {
    const jobId = await this.prisma.$transaction(async (tx) => {
      const pre = await tx.quote.findFirst({ where: { id: quoteId, companyId: scope.companyId } });
      if (!pre) throw notFound('Quote');
      const job = await this.job(tx, scope, pre.jobId, true);
      const q = await this.draft(tx, scope, quoteId, input.version);
      if (!(await this.can(p, scope.companyId, 'workshop.pricing.manage', job.branchId)))
        throw forbidden('Only the owner (pricing permission) approves discounts above the limit');
      const settings = await tx.pricingSettings.findUnique({ where: { companyId: scope.companyId } });
      if (!q.discountPct.greaterThan(settings?.managerDiscountLimitPct ?? 0))
        throw conflict('This discount is within the managers’ limit; no approval is needed');
      if (q.discountApprovedBy) throw conflict('This discount is already approved');
      if (q.discountSetBy === p.userId)
        throw forbidden('You set this discount; another owner-level person must approve it');
      await this.bump(tx, q.id, q.version);
      await tx.quote.update({
        where: { id: q.id },
        data: { discountApprovedBy: p.userId, discountApprovedAt: new Date() },
      });
      await this.audit(tx, ctx, q, 'workshop.quote.approve_discount', { discountPct: pct(q.discountPct) });
      return job.id;
    });
    return this.list(scope, p, jobId);
  }

  async issue(
    scope: CompanyScope,
    p: Principal,
    quoteId: string,
    input: QuoteVersionInput,
    ctx: AuditContext,
  ) {
    const jobId = await this.prisma.$transaction(async (tx) => {
      const pre = await tx.quote.findFirst({ where: { id: quoteId, companyId: scope.companyId } });
      if (!pre) throw notFound('Quote');
      const job = await this.job(tx, scope, pre.jobId, true);
      await this.mustManage(p, scope.companyId, job.branchId);
      if (CLOSED.includes(job.status)) throw conflict(`The job is ${job.status}`);
      const q = await this.draft(tx, scope, quoteId, input.version);
      // Price once more with today's rates and the job's current tasks, then freeze.
      const overrides = new Map(
        q.lines
          .filter((l) => l.overrideAmount !== null)
          .map((l) => [l.taskId, { amount: l.overrideAmount, reason: l.overrideReason }]),
      );
      const { today, limit } = await this.reprice(tx, q, job, overrides);
      if (q.discountPct.greaterThan(limit) && !q.discountApprovedBy)
        throw unprocessable(
          `The discount is above the managers’ limit (${Number(limit)} %); the owner must approve it first`,
        );
      await this.bump(tx, q.id, q.version);
      await tx.quote.updateMany({
        where: { jobId: job.id, status: 'issued' },
        data: { status: 'superseded' },
      });
      const year = today.slice(0, 4);
      const n = await nextDocumentNumber(tx, scope.companyId, 'quote', year);
      const number = formatDocumentNumber('Q', year, n);
      const issued = await tx.quote.update({
        where: { id: q.id },
        data: {
          status: 'issued',
          number,
          quoteDate: new Date(`${today}T00:00:00Z`),
          issuedAt: new Date(),
          issuedBy: p.userId,
        },
      });
      await this.event(
        tx,
        job,
        p.userId,
        'quote_issued',
        `${number} · ${issued.total.toFixed(2)} ${issued.currency}`,
      );
      await this.audit(tx, ctx, q, 'workshop.quote.issue', { number, total: issued.total.toFixed(2) });
      return job.id;
    });
    return this.list(scope, p, jobId);
  }

  async decide(
    scope: CompanyScope,
    p: Principal,
    quoteId: string,
    input: QuoteDecisionInput,
    ctx: AuditContext,
  ) {
    const jobId = await this.prisma.$transaction(async (tx) => {
      const pre = await tx.quote.findFirst({ where: { id: quoteId, companyId: scope.companyId } });
      if (!pre || (!scope.allBranches && !scope.branchIds.includes(pre.branchId))) throw notFound('Quote');
      const job = await this.job(tx, scope, pre.jobId, true);
      await this.mustManage(p, scope.companyId, job.branchId);
      const q = await tx.quote.findUniqueOrThrow({ where: { id: quoteId } });
      if (q.status !== 'issued') throw conflict(`This quote is ${q.status}; only an issued quote is decided`);
      if (q.version !== input.version)
        throw conflict('This quote was changed by someone else; reload and try again');
      const approve = input.decision === 'approve';
      // One update: the version check and the decision (an issued quote changes only this way).
      const n = await tx.quote.updateMany({
        where: { id: q.id, version: input.version, status: 'issued' },
        data: {
          version: { increment: 1 },
          decidedAt: new Date(),
          decidedBy: p.userId,
          ...(approve
            ? {
                status: 'approved',
                authorizedByName: input.authorizedByName,
                authorizedVia: input.authorizedVia,
              }
            : { status: 'declined', declineReason: input.reason }),
        },
      });
      if (n.count === 0) throw conflict('This quote was changed by someone else; reload and try again');
      await this.event(
        tx,
        job,
        p.userId,
        approve ? 'quote_approved' : 'quote_declined',
        approve ? `${q.number} · ${input.authorizedByName}` : `${q.number} · ${input.reason}`,
      );
      await this.audit(
        tx,
        ctx,
        q,
        approve ? 'workshop.quote.approve' : 'workshop.quote.decline',
        input,
        approve ? undefined : input.reason,
      );
      return job.id;
    });
    return this.list(scope, p, jobId);
  }

  async discard(
    scope: CompanyScope,
    p: Principal,
    quoteId: string,
    input: QuoteVersionInput,
    ctx: AuditContext,
  ) {
    const jobId = await this.prisma.$transaction(async (tx) => {
      const pre = await tx.quote.findFirst({ where: { id: quoteId, companyId: scope.companyId } });
      if (!pre) throw notFound('Quote');
      const job = await this.job(tx, scope, pre.jobId, true);
      await this.mustManage(p, scope.companyId, job.branchId);
      const q = await this.draft(tx, scope, quoteId, input.version);
      await tx.quote.delete({ where: { id: q.id } });
      await this.audit(tx, ctx, q, 'workshop.quote.discard', { revision: q.revision });
      return job.id;
    });
    return this.list(scope, p, jobId);
  }
}
