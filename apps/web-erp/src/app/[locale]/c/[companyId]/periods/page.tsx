import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale } from '@erp/localization';
import { CalendarRange } from 'lucide-react';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { SimpleForm } from '@/components/SimpleForm';
import { Card, EmptyState, Ltr, PageHeader } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { closePeriodAction, createPeriodAction } from '../actions';

export default async function PeriodsPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can, company } = ctx.data;
  const periods = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/fiscal-periods', { params: { path: { companyId } } }),
    ),
  );
  const manage = can('accounting.period.manage');
  return (
    <>
      <PageHeader title={t('nav.periods')} />
      {manage ? (
        <Card title={t('period.new')} id="new-period">
          <SimpleForm
            locale={locale}
            idPrefix="period"
            action={createPeriodAction.bind(null, locale, companyId)}
            submitLabel={t('common.create')}
            columns={3}
            fields={[
              { name: 'name', label: t('common.name'), required: true, maxLength: 64, dir: 'ltr' },
              { name: 'startDate', label: t('period.start'), type: 'date', required: true },
              { name: 'endDate', label: t('period.end'), type: 'date', required: true },
            ]}
          />
        </Card>
      ) : null}
      {!periods.ok ? (
        <ProblemNotice result={periods} locale={locale} />
      ) : periods.data.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarRange aria-hidden size={18} />}>{t('period.empty')}</EmptyState>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {periods.data.map((p) => (
            <li
              key={p.id}
              className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  <Ltr>{p.name}</Ltr>
                </h2>
                <span className={`erp-badge ${p.status === 'open' ? 'erp-badge--up' : 'erp-badge--unknown'}`}>
                  {t(p.status === 'open' ? 'period.open' : 'period.closed')}
                </span>
              </div>
              <p className="mt-1 text-[var(--color-text-muted)]">
                <Ltr>
                  {p.startDate} → {p.endDate}
                </Ltr>
                {p.closedAt ? <> · {formatDateTime(locale, p.closedAt, company.timezone)}</> : null}
              </p>
              {manage && p.status === 'open' ? (
                <details className="mt-3">
                  <summary className="cursor-pointer font-semibold">{t('period.close')}</summary>
                  <p className="my-2 text-sm text-[var(--color-warning)]">{t('period.closeConfirm')}</p>
                  <SimpleForm
                    locale={locale}
                    idPrefix={`close-${p.id}`}
                    action={closePeriodAction.bind(null, locale, companyId, p.id)}
                    submitLabel={t('period.close')}
                    hidden={{ version: String(p.version) }}
                    columns={1}
                    fields={[{ name: 'reason', label: t('common.reason'), required: true, maxLength: 500 }]}
                  />
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
