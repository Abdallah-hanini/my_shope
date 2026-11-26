import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SearchQuery } from '@erp/validation';
import type { Principal } from '../auth/principal';
import { formatMoney } from '../accounting/money';
import { AuthzService } from '../authz/authz.service';
import { resolveScope } from '../authz/scope';
import { notFound } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { escapeLike } from './like';
import type { SearchGroupDto, SearchHitDto, SearchResultDto, SearchType } from './search.dto';

/** Which permission makes each record type searchable (the same one its list screen needs). */
const PERMISSION: Record<SearchType, string> = {
  journal: 'accounting.journal.read',
  account: 'accounting.account.read',
  branch: 'org.branch.read',
  period: 'accounting.period.read',
  user: 'iam.assignment.read',
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * WEB-237 global search. Every record type is filtered on the server by the caller's permission
 * and branch scope, exactly like its list screen; types the caller cannot read are left out.
 * Matching is "contains", case-insensitive and tolerant of Arabic spelling variants
 * (reporting.search_normalize, migration global_search).
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  async search(companyId: string, p: Principal, q: SearchQuery): Promise<SearchResultDto> {
    const grants = await this.authz.grants(p.userId, companyId);
    // No role here (or the company is inactive): the company does not exist for this caller.
    if (grants.length === 0) throw notFound('Company');

    const contains = `%${escapeLike(q.q)}%`;
    const prefix = `${escapeLike(q.q)}%`;
    const match = (col: Prisma.Sql) =>
      Prisma.sql`reporting.search_normalize(${col}) LIKE reporting.search_normalize(${contains}) ESCAPE '\\'`;
    const starts = (col: Prisma.Sql) =>
      Prisma.sql`reporting.search_normalize(${col}) LIKE reporting.search_normalize(${prefix}) ESCAPE '\\'`;
    const take = q.limit + 1;

    const runners: Record<SearchType, (branchFilter: Prisma.Sql) => Promise<SearchHitDto[]>> = {
      journal: async (bf) => {
        const rows = await this.prisma.$queryRaw<
          {
            id: string;
            number: string;
            description: string;
            posting_date: Date;
            total_debit: Prisma.Decimal;
            currency: string;
            source_type: string;
          }[]
        >`
          SELECT id, number, description, posting_date, total_debit, currency, source_type::text AS source_type
            FROM accounting.journal
           WHERE company_id = ${companyId}::uuid ${bf}
             AND (${match(Prisma.sql`number`)} OR ${match(Prisma.sql`description`)})
           ORDER BY ${starts(Prisma.sql`number`)} DESC, posting_date DESC, number DESC
           LIMIT ${take}`;
        return rows.map((r) => ({
          id: r.id,
          code: r.number,
          name: r.description,
          nameAr: null,
          detail: `${formatMoney(r.total_debit, r.currency)} ${r.currency}`,
          date: isoDate(r.posting_date),
          status: r.source_type,
        }));
      },
      account: async () => {
        const rows = await this.prisma.$queryRaw<
          {
            id: string;
            code: string;
            name: string;
            name_ar: string | null;
            type: string;
            is_posting: boolean;
            status: string;
          }[]
        >`
          SELECT id, code, name, name_ar, type::text AS type, is_posting, status::text AS status
            FROM accounting.account
           WHERE company_id = ${companyId}::uuid
             AND (${match(Prisma.sql`code`)} OR ${match(Prisma.sql`name`)} OR ${match(Prisma.sql`coalesce(name_ar, '')`)})
           ORDER BY ${starts(Prisma.sql`code`)} DESC, code
           LIMIT ${take}`;
        return rows.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          nameAr: r.name_ar,
          detail: r.is_posting ? r.type : `${r.type}:header`,
          date: null,
          status: r.status,
        }));
      },
      branch: async (bf) => {
        const rows = await this.prisma.$queryRaw<
          { id: string; code: string; name: string; name_ar: string | null; status: string }[]
        >`
          SELECT id, code, name, name_ar, status::text AS status
            FROM org.branch
           WHERE company_id = ${companyId}::uuid ${bf}
             AND (${match(Prisma.sql`code`)} OR ${match(Prisma.sql`name`)} OR ${match(Prisma.sql`coalesce(name_ar, '')`)})
           ORDER BY ${starts(Prisma.sql`code`)} DESC, code
           LIMIT ${take}`;
        return rows.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          nameAr: r.name_ar,
          detail: null,
          date: null,
          status: r.status,
        }));
      },
      period: async () => {
        const rows = await this.prisma.$queryRaw<
          { id: string; name: string; start_date: Date; end_date: Date; status: string }[]
        >`
          SELECT id, name, start_date, end_date, status::text AS status
            FROM accounting.fiscal_period
           WHERE company_id = ${companyId}::uuid AND ${match(Prisma.sql`name`)}
           ORDER BY start_date DESC
           LIMIT ${take}`;
        return rows.map((r) => ({
          id: r.id,
          code: null,
          name: r.name,
          nameAr: null,
          detail: isoDate(r.end_date),
          date: isoDate(r.start_date),
          status: r.status,
        }));
      },
      user: async (bf) => {
        // People who hold a role in this company (within the caller's branches when branch-limited).
        const rows = await this.prisma.$queryRaw<
          { id: string; display_name: string; email: string; status: string }[]
        >`
          SELECT u.id, u.display_name, u.email, u.status::text AS status
            FROM iam."user" u
           WHERE EXISTS (SELECT 1 FROM iam.role_assignment a
                          WHERE a.user_id = u.id AND a.company_id = ${companyId}::uuid ${bf})
             AND (${match(Prisma.sql`u.display_name`)} OR ${match(Prisma.sql`u.email`)})
           ORDER BY ${starts(Prisma.sql`u.display_name`)} DESC, u.display_name
           LIMIT ${take}`;
        return rows.map((r) => ({
          id: r.id,
          code: null,
          name: r.display_name,
          nameAr: null,
          detail: r.email,
          date: null,
          status: r.status,
        }));
      },
    };

    // Column holding the branch for each type's scope filter; null = not branch-scoped.
    const branchColumn: Record<SearchType, Prisma.Sql | null> = {
      journal: Prisma.sql`branch_id`,
      account: null,
      branch: Prisma.sql`id`,
      period: null,
      user: Prisma.sql`a.branch_id`,
    };

    const groups: SearchGroupDto[] = [];
    for (const type of Object.keys(runners) as SearchType[]) {
      const scope = resolveScope(companyId, PERMISSION[type], grants);
      if (!scope) continue; // not permitted: the type is left out entirely
      const col = branchColumn[type];
      const bf =
        !col || scope.allBranches ? Prisma.empty : Prisma.sql`AND ${col} = ANY(${scope.branchIds}::uuid[])`;
      const hits = await runners[type](bf);
      groups.push({ type, items: hits.slice(0, q.limit), more: hits.length > q.limit });
    }
    return { query: q.q, groups };
  }
}
