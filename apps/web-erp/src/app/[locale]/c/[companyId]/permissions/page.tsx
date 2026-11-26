import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale, type MessageKey } from '@erp/localization';
import { PERMISSION_GROUPS } from '@erp/validation';
import { Check, Minus } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Card, PageHeader } from '@/components/ui';
import { roleLabel } from '@/lib/access';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';

/** WEB-226: roles (columns) × permissions (rows, grouped). Read-only; edit a role to change it. */
export default async function PermissionMatrixPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const roles = await attempt(async () =>
    unwrap(
      await ctx.data.api.GET('/api/v1/companies/{companyId}/roles', { params: { path: { companyId } } }),
    ),
  );
  if (!roles.ok) return <ProblemNotice result={roles} locale={locale} />;
  const cols = roles.data;
  const cell = 'border-b border-[var(--color-border)] px-3 py-2';
  return (
    <>
      <PageHeader title={t('nav.permissions')}>{t('perm.matrixHelp')}</PageHeader>
      <Card flush>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{t('nav.permissions')}</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className={`${cell} sticky start-0 z-10 bg-[var(--color-surface-muted)] text-start text-xs font-semibold text-[var(--color-text-muted)]`}
                >
                  {t('roles.permissions')}
                </th>
                {cols.map((r) => (
                  <th
                    key={r.id}
                    scope="col"
                    className={`${cell} min-w-28 bg-[var(--color-surface-muted)] text-center text-xs font-semibold`}
                  >
                    <Link
                      href={`/${locale}/c/${companyId}/roles/${r.id}`}
                      className="text-[var(--color-primary)] hover:underline"
                    >
                      {roleLabel(r, locale)}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            {PERMISSION_GROUPS.map((g) => (
              <tbody key={g.id}>
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={cols.length + 1}
                    className={`${cell} bg-[var(--color-background)] text-start text-xs font-semibold tracking-wide text-[var(--color-text-muted)] uppercase`}
                  >
                    {t(`perm.group.${g.id}` as MessageKey)}
                  </th>
                </tr>
                {g.permissions.map((p) => (
                  <tr key={p}>
                    <th
                      scope="row"
                      className={`${cell} sticky start-0 bg-[var(--color-surface)] text-start font-normal`}
                    >
                      {t(`perm.${p}` as MessageKey)}
                    </th>
                    {cols.map((r) => {
                      const has = r.permissions.includes(p);
                      return (
                        <td key={r.id} className={`${cell} text-center`}>
                          {has ? (
                            <Check
                              aria-label={t('perm.granted')}
                              size={16}
                              className="inline text-[var(--color-success-brand)]"
                            />
                          ) : (
                            <Minus
                              aria-label={t('perm.notGranted')}
                              size={16}
                              className="inline text-[var(--color-border)]"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Card>
    </>
  );
}
