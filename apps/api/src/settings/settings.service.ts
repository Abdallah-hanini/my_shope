import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AddLabourRateInput,
  AddTaxRateInput,
  CompanyProfileInput,
  CreateTaxCodeInput,
  PricingSettingsInput,
  TaxSettingsInput,
  UpdateTaxCodeInput,
} from '@erp/validation';
import type { CompanyScope, Principal } from '../auth/principal';
import { AuthzService } from '../authz/authz.service';
import { resolveScope } from '../authz/scope';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { writeAudit, type AuditContext } from '../platform/audit';
import { localTime } from '../workshop/scheduling';
import { effectiveOn, isoDate } from './effective';
import { processLogo } from './logo';
import type { CompanyProfileDto, DatedRateDto, PricingDto, TaxCodeDto, TaxSetupDto } from './settings.dto';

type Tx = Prisma.TransactionClient;
const unique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const pct = (d: Prisma.Decimal) => d.toFixed(4);

/**
 * Company settings for pricing (D-05): the accountant's tax set-up (no built-in rates), labour
 * rates per branch and the managers' discount limit, and the letterhead. Dated rates are history:
 * a new rate starts today or later, and only rates that have not started may be removed.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  /** Company-level permission (a role without a branch restriction). */
  private async companyWide(p: Principal, companyId: string, permission: string) {
    const s = resolveScope(companyId, permission, await this.authz.grants(p.userId, companyId));
    return !!s && s.allBranches;
  }
  private async onBranch(p: Principal, companyId: string, permission: string, branchId: string) {
    const s = resolveScope(companyId, permission, await this.authz.grants(p.userId, companyId));
    return !!s && (s.allBranches || s.branchIds.includes(branchId));
  }
  private async company(companyId: string) {
    return this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  }
  private async today(companyId: string) {
    return localTime(new Date(), (await this.company(companyId)).timezone).date;
  }
  private audit(
    tx: Tx,
    ctx: AuditContext,
    companyId: string,
    action: string,
    entityType: string,
    entityId: string,
    after: unknown,
    branchId?: string,
  ) {
    return writeAudit(tx, ctx, { action, entityType, entityId, companyId, branchId, after });
  }
  private dated(rows: { id: string; value: string; effectiveFrom: string }[], today: string): DatedRateDto[] {
    return [...rows]
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
      .map((r) => ({ ...r, canRemove: r.effectiveFrom > today }));
  }

  // ── tax (accountant) ───────────────────────────────────────────────────────

  async tax(scope: CompanyScope, p: Principal): Promise<TaxSetupDto> {
    const today = await this.today(scope.companyId);
    const [settings, codes] = await Promise.all([
      this.prisma.taxSettings.findUnique({ where: { companyId: scope.companyId } }),
      this.prisma.taxCode.findMany({
        where: { companyId: scope.companyId },
        include: { rates: true, outputAccount: { select: { id: true, code: true, name: true } } },
        orderBy: { code: 'asc' },
      }),
    ]);
    return {
      today,
      pricesIncludeTax: settings?.pricesIncludeTax ?? false,
      defaultTaxCodeId: settings?.defaultTaxCodeId ?? null,
      taxRegistrationNo: settings?.taxRegistrationNo ?? null,
      version: settings?.version ?? 0,
      canManage: await this.companyWide(p, scope.companyId, 'accounting.tax.manage'),
      codes: codes.map((c): TaxCodeDto => {
        const rows = c.rates.map((r) => ({
          id: r.id,
          value: pct(r.ratePct),
          effectiveFrom: isoDate(r.effectiveFrom),
        }));
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          nameAr: c.nameAr,
          active: c.active,
          outputAccount: c.outputAccount,
          currentRatePct: effectiveOn(rows, today)?.value ?? null,
          rates: this.dated(rows, today),
          version: c.version,
        };
      }),
    };
  }

  private async mustManageTax(p: Principal, companyId: string) {
    if (!(await this.companyWide(p, companyId, 'accounting.tax.manage')))
      throw forbidden('Only the accountant (tax set-up permission for the whole company) changes taxes');
  }

  private async checkTaxAccount(companyId: string, accountId: string | null | undefined) {
    if (!accountId) return;
    const a = await this.prisma.account.findUnique({ where: { companyId_id: { companyId, id: accountId } } });
    if (!a || a.type !== 'liability' || !a.isPosting || a.status !== 'active')
      throw unprocessable('Choose an active liability posting account for the tax');
  }

  async createTaxCode(scope: CompanyScope, p: Principal, input: CreateTaxCodeInput, ctx: AuditContext) {
    await this.mustManageTax(p, scope.companyId);
    await this.checkTaxAccount(scope.companyId, input.outputAccountId);
    try {
      await this.prisma.$transaction(async (tx) => {
        const c = await tx.taxCode.create({
          data: {
            companyId: scope.companyId,
            code: input.code,
            name: input.name,
            nameAr: input.nameAr,
            outputAccountId: input.outputAccountId ?? null,
          },
        });
        await this.audit(tx, ctx, scope.companyId, 'accounting.tax_code.create', 'tax_code', c.id, input);
      });
    } catch (e) {
      if (unique(e)) throw conflict(`Tax code ${input.code} already exists`);
      throw e;
    }
    return this.tax(scope, p);
  }

  async updateTaxCode(
    scope: CompanyScope,
    p: Principal,
    id: string,
    input: UpdateTaxCodeInput,
    ctx: AuditContext,
  ) {
    await this.mustManageTax(p, scope.companyId);
    const c = await this.prisma.taxCode.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id } },
    });
    if (!c) throw notFound('Tax code');
    await this.checkTaxAccount(scope.companyId, input.outputAccountId);
    if (c.active && !input.active) {
      const s = await this.prisma.taxSettings.findUnique({ where: { companyId: scope.companyId } });
      if (s?.defaultTaxCodeId === id) throw conflict('This is the default tax; choose another default first');
    }
    await this.prisma.$transaction(async (tx) => {
      const n = await tx.taxCode.updateMany({
        where: { id, version: input.version },
        data: {
          name: input.name,
          nameAr: input.nameAr,
          outputAccountId: input.outputAccountId ?? null,
          active: input.active,
          version: { increment: 1 },
        },
      });
      if (n.count === 0) throw conflict('This tax code was changed by someone else; reload and try again');
      await this.audit(tx, ctx, scope.companyId, 'accounting.tax_code.update', 'tax_code', id, input);
    });
    return this.tax(scope, p);
  }

  async addTaxRate(scope: CompanyScope, p: Principal, id: string, input: AddTaxRateInput, ctx: AuditContext) {
    await this.mustManageTax(p, scope.companyId);
    const c = await this.prisma.taxCode.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id } },
    });
    if (!c) throw notFound('Tax code');
    if (input.effectiveFrom < (await this.today(scope.companyId)))
      throw unprocessable('A new rate starts today or later; rates already in use are never changed');
    try {
      await this.prisma.$transaction(async (tx) => {
        const r = await tx.taxRate.create({
          data: {
            companyId: scope.companyId,
            taxCodeId: id,
            ratePct: input.rate,
            effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00Z`),
            createdBy: p.userId,
          },
        });
        await this.audit(tx, ctx, scope.companyId, 'accounting.tax_rate.add', 'tax_rate', r.id, {
          taxCode: c.code,
          ...input,
        });
      });
    } catch (e) {
      if (unique(e)) throw conflict(`${c.code} already has a rate from ${input.effectiveFrom}`);
      throw e;
    }
    return this.tax(scope, p);
  }

  async removeTaxRate(scope: CompanyScope, p: Principal, id: string, rateId: string, ctx: AuditContext) {
    await this.mustManageTax(p, scope.companyId);
    const r = await this.prisma.taxRate.findFirst({
      where: { id: rateId, taxCodeId: id, companyId: scope.companyId },
    });
    if (!r) throw notFound('Tax rate');
    if (isoDate(r.effectiveFrom) <= (await this.today(scope.companyId)))
      throw conflict('This rate has started; add a new rate instead of changing it');
    await this.prisma.$transaction(async (tx) => {
      await tx.taxRate.delete({ where: { id: rateId } });
      await this.audit(tx, ctx, scope.companyId, 'accounting.tax_rate.remove', 'tax_rate', rateId, {
        ratePct: pct(r.ratePct),
        effectiveFrom: isoDate(r.effectiveFrom),
      });
    });
    return this.tax(scope, p);
  }

  async setTaxSettings(scope: CompanyScope, p: Principal, input: TaxSettingsInput, ctx: AuditContext) {
    await this.mustManageTax(p, scope.companyId);
    if (input.defaultTaxCodeId) {
      const c = await this.prisma.taxCode.findUnique({
        where: { companyId_id: { companyId: scope.companyId, id: input.defaultTaxCodeId } },
      });
      if (!c || !c.active) throw unprocessable('Choose an active tax code as the default');
    }
    await this.prisma.$transaction(async (tx) => {
      const data = {
        pricesIncludeTax: input.pricesIncludeTax,
        defaultTaxCodeId: input.defaultTaxCodeId,
        taxRegistrationNo: input.taxRegistrationNo,
      };
      if (input.version === 0) {
        try {
          await tx.taxSettings.create({ data: { companyId: scope.companyId, ...data } });
        } catch (e) {
          if (unique(e))
            throw conflict('The tax settings were changed by someone else; reload and try again');
          throw e;
        }
      } else {
        const n = await tx.taxSettings.updateMany({
          where: { companyId: scope.companyId, version: input.version },
          data: { ...data, version: { increment: 1 } },
        });
        if (n.count === 0)
          throw conflict('The tax settings were changed by someone else; reload and try again');
      }
      await this.audit(
        tx,
        ctx,
        scope.companyId,
        'accounting.tax_settings.set',
        'tax_settings',
        scope.companyId,
        data,
      );
    });
    return this.tax(scope, p);
  }

  // ── labour rates and discount limit ────────────────────────────────────────

  async pricing(scope: CompanyScope, p: Principal): Promise<PricingDto> {
    const company = await this.company(scope.companyId);
    const today = localTime(new Date(), company.timezone).date;
    const [settings, branches, grants] = await Promise.all([
      this.prisma.pricingSettings.findUnique({ where: { companyId: scope.companyId } }),
      this.prisma.branch.findMany({
        where: {
          companyId: scope.companyId,
          status: 'active',
          ...(scope.allBranches ? {} : { id: { in: scope.branchIds } }),
        },
        include: { labourRates: true },
        orderBy: { code: 'asc' },
      }),
      this.authz.grants(p.userId, scope.companyId),
    ]);
    const manage = resolveScope(scope.companyId, 'workshop.pricing.manage', grants);
    return {
      today,
      currency: company.baseCurrency,
      managerDiscountLimitPct: pct(settings?.managerDiscountLimitPct ?? new Prisma.Decimal(0)),
      version: settings?.version ?? 0,
      canManageSettings: !!manage?.allBranches,
      branches: branches.map((b) => {
        const rows = b.labourRates.map((r) => ({
          id: r.id,
          value: r.rate.toFixed(2),
          effectiveFrom: isoDate(r.effectiveFrom),
        }));
        return {
          branchId: b.id,
          branchCode: b.code,
          branchName: b.name,
          currentRate: effectiveOn(rows, today)?.value ?? null,
          rates: this.dated(rows, today),
          canManage: !!manage && (manage.allBranches || manage.branchIds.includes(b.id)),
        };
      }),
    };
  }

  async addLabourRate(
    scope: CompanyScope,
    p: Principal,
    branchId: string,
    input: AddLabourRateInput,
    ctx: AuditContext,
  ) {
    if (!scope.allBranches && !scope.branchIds.includes(branchId)) throw notFound('Branch');
    const branch = await this.prisma.branch.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id: branchId } },
    });
    if (!branch) throw notFound('Branch');
    if (!(await this.onBranch(p, scope.companyId, 'workshop.pricing.manage', branchId)))
      throw forbidden('Only the owner (pricing permission) sets labour rates');
    if (input.effectiveFrom < (await this.today(scope.companyId)))
      throw unprocessable('A new rate starts today or later; rates already in use are never changed');
    try {
      await this.prisma.$transaction(async (tx) => {
        const r = await tx.labourRate.create({
          data: {
            companyId: scope.companyId,
            branchId,
            rate: input.rate,
            effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00Z`),
            createdBy: p.userId,
          },
        });
        await this.audit(
          tx,
          ctx,
          scope.companyId,
          'workshop.labour_rate.add',
          'labour_rate',
          r.id,
          input,
          branchId,
        );
      });
    } catch (e) {
      if (unique(e)) throw conflict(`${branch.code} already has a rate from ${input.effectiveFrom}`);
      throw e;
    }
    return this.pricing(scope, p);
  }

  async removeLabourRate(scope: CompanyScope, p: Principal, rateId: string, ctx: AuditContext) {
    const r = await this.prisma.labourRate.findFirst({ where: { id: rateId, companyId: scope.companyId } });
    if (!r || (!scope.allBranches && !scope.branchIds.includes(r.branchId))) throw notFound('Labour rate');
    if (!(await this.onBranch(p, scope.companyId, 'workshop.pricing.manage', r.branchId)))
      throw forbidden('Only the owner (pricing permission) sets labour rates');
    if (isoDate(r.effectiveFrom) <= (await this.today(scope.companyId)))
      throw conflict('This rate has started; add a new rate instead of changing it');
    await this.prisma.$transaction(async (tx) => {
      await tx.labourRate.delete({ where: { id: rateId } });
      await this.audit(
        tx,
        ctx,
        scope.companyId,
        'workshop.labour_rate.remove',
        'labour_rate',
        rateId,
        {
          rate: r.rate.toFixed(2),
          effectiveFrom: isoDate(r.effectiveFrom),
        },
        r.branchId,
      );
    });
    return this.pricing(scope, p);
  }

  async setPricingSettings(
    scope: CompanyScope,
    p: Principal,
    input: PricingSettingsInput,
    ctx: AuditContext,
  ) {
    if (!(await this.companyWide(p, scope.companyId, 'workshop.pricing.manage')))
      throw forbidden('Only the owner (pricing permission for the whole company) sets the discount limit');
    await this.prisma.$transaction(async (tx) => {
      const data = { managerDiscountLimitPct: input.managerDiscountLimitPct };
      if (input.version === 0) {
        try {
          await tx.pricingSettings.create({ data: { companyId: scope.companyId, ...data } });
        } catch (e) {
          if (unique(e))
            throw conflict('The pricing settings were changed by someone else; reload and try again');
          throw e;
        }
      } else {
        const n = await tx.pricingSettings.updateMany({
          where: { companyId: scope.companyId, version: input.version },
          data: { ...data, version: { increment: 1 } },
        });
        if (n.count === 0)
          throw conflict('The pricing settings were changed by someone else; reload and try again');
      }
      await this.audit(
        tx,
        ctx,
        scope.companyId,
        'workshop.pricing_settings.set',
        'pricing_settings',
        scope.companyId,
        data,
      );
    });
    return this.pricing(scope, p);
  }

  // ── letterhead ─────────────────────────────────────────────────────────────

  async profile(scope: CompanyScope, p: Principal): Promise<CompanyProfileDto> {
    const [c, logo, tax] = await Promise.all([
      this.company(scope.companyId),
      this.prisma.companyLogo.findUnique({
        where: { companyId: scope.companyId },
        select: { updatedAt: true },
      }),
      this.prisma.taxSettings.findUnique({
        where: { companyId: scope.companyId },
        select: { taxRegistrationNo: true },
      }),
    ]);
    return {
      legalName: c.legalName,
      legalNameAr: c.legalNameAr,
      crNumber: c.crNumber,
      address: c.address,
      addressAr: c.addressAr,
      phone: c.phone,
      logoVersion: logo ? String(logo.updatedAt.getTime()) : null,
      taxRegistrationNo: tax?.taxRegistrationNo ?? null,
      version: c.version,
      canManage: await this.companyWide(p, scope.companyId, 'org.company.manage'),
    };
  }

  private async mustManageCompany(p: Principal, companyId: string) {
    if (!(await this.companyWide(p, companyId, 'org.company.manage')))
      throw forbidden('Only company administrators change the company details');
  }

  async setProfile(scope: CompanyScope, p: Principal, input: CompanyProfileInput, ctx: AuditContext) {
    await this.mustManageCompany(p, scope.companyId);
    await this.prisma.$transaction(async (tx) => {
      const data = {
        crNumber: input.crNumber,
        address: input.address,
        addressAr: input.addressAr,
        phone: input.phone,
      };
      const n = await tx.company.updateMany({
        where: { id: scope.companyId, version: input.version },
        data: { ...data, version: { increment: 1 } },
      });
      if (n.count === 0)
        throw conflict('The company details were changed by someone else; reload and try again');
      await this.audit(tx, ctx, scope.companyId, 'org.company.profile', 'company', scope.companyId, data);
    });
    return this.profile(scope, p);
  }

  async setLogo(scope: CompanyScope, p: Principal, file: Buffer | undefined, ctx: AuditContext) {
    await this.mustManageCompany(p, scope.companyId);
    if (!file?.length) throw unprocessable('Choose an image file');
    const processed = await processLogo(file);
    const logo = { png: Uint8Array.from(processed.png), width: processed.width, height: processed.height };
    await this.prisma.$transaction(async (tx) => {
      await tx.companyLogo.upsert({
        where: { companyId: scope.companyId },
        create: { companyId: scope.companyId, ...logo },
        update: logo,
      });
      await this.audit(tx, ctx, scope.companyId, 'org.company.logo', 'company', scope.companyId, {
        width: logo.width,
        height: logo.height,
        bytes: logo.png.length,
      });
    });
    return this.profile(scope, p);
  }

  async removeLogo(scope: CompanyScope, p: Principal, ctx: AuditContext) {
    await this.mustManageCompany(p, scope.companyId);
    await this.prisma.$transaction(async (tx) => {
      await tx.companyLogo.deleteMany({ where: { companyId: scope.companyId } });
      await this.audit(tx, ctx, scope.companyId, 'org.company.logo_removed', 'company', scope.companyId, {});
    });
    return this.profile(scope, p);
  }

  async logo(scope: CompanyScope): Promise<Buffer> {
    const l = await this.prisma.companyLogo.findUnique({ where: { companyId: scope.companyId } });
    if (!l) throw notFound('Logo');
    return Buffer.from(l.png);
  }
}
