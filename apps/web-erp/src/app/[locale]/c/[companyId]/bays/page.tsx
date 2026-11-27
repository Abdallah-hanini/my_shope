import { unwrap, type BayBoard } from '@erp/api-client';
import { createTranslator, isLocale, type Locale } from '@erp/localization';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import {
  Badge,
  buttonPrimary,
  buttonSecondary,
  Card,
  EmptyState,
  inputClass,
  Ltr,
  PageHeader,
  fieldLabel,
} from '@/components/ui';
import { InlineForm } from '@/components/workshop/InlineForm';
import { JobStatus } from '@/components/workshop/JobStatus';
import { attempt } from '@/lib/api';
import { loadCompany, localName } from '@/lib/context';
import { createBayAction, placeBayAction, updateBayAction } from '../bay-actions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** WEB-022 bay board: the car on each bay, the jobs waiting for one, and (managers) the bays. */
export default async function BaysPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const { locale, companyId } = await params;
  const sp = await searchParams;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, me } = ctx.data;
  const branches = await attempt(async () =>
    unwrap(await api.GET('/api/v1/companies/{companyId}/branches', { params: { path: { companyId } } })),
  );
  const mine = me.companies.find((c) => c.companyId === companyId)?.assignments ?? [];
  const wide = mine.some((a) => a.branchId === null);
  const list = branches.ok
    ? branches.data.filter((b) => b.status === 'active' && (wide || mine.some((a) => a.branchId === b.id)))
    : [];
  const branchId =
    sp.branch && UUID.test(sp.branch) && list.some((b) => b.id === sp.branch) ? sp.branch : list[0]?.id;
  if (!branchId) return <ProblemNotice result={{ status: 403 }} locale={locale} />;
  const board = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/branches/{branchId}/bays', {
        params: { path: { companyId, branchId } },
      }),
    ),
  );
  const base = `/${locale}/c/${companyId}`;
  return (
    <>
      <PageHeader title={t('bay.title')}>{t('bay.help')}</PageHeader>
      {list.length > 1 ? (
        <Card className="mb-6">
          <form method="get" className="flex flex-wrap items-end gap-3" aria-label={t('job.branch')}>
            <label className={fieldLabel} htmlFor="bay-branch">
              {t('job.branch')}
              <select id="bay-branch" name="branch" defaultValue={branchId} className={`${inputClass} w-52`}>
                {list.map((b) => (
                  <option key={b.id} value={b.id}>{`${b.code} — ${localName(b, locale)}`}</option>
                ))}
              </select>
            </label>
            <button type="submit" className={buttonPrimary}>
              {t('ledger.apply')}
            </button>
          </form>
        </Card>
      ) : null}
      {!board.ok ? (
        <ProblemNotice result={board} locale={locale} />
      ) : (
        <BoardBody b={board.data} locale={locale} companyId={companyId} base={base} branchId={branchId} />
      )}
    </>
  );
}

function BoardBody({
  b,
  locale,
  companyId,
  base,
  branchId,
}: {
  b: BayBoard;
  locale: Locale;
  companyId: string;
  base: string;
  branchId: string;
}) {
  const t = createTranslator(locale);
  const back = `${base}/bays?branch=${branchId}`;
  const active = b.bays.filter((x) => x.active);
  const free = active.filter((x) => !x.job);
  return (
    <>
      {active.length === 0 ? (
        <EmptyState>{b.canManage ? t('bay.noneManager') : t('bay.none')}</EmptyState>
      ) : (
        <ul className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('bay.title')}>
          {active.map((bay) => (
            <li
              key={bay.id}
              data-bay={bay.code}
              className="flex min-h-36 flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">
                  <Ltr>{bay.code}</Ltr> · {bay.name}
                </h2>
                {bay.job ? (
                  <Badge tone="info">{t('bay.occupied')}</Badge>
                ) : (
                  <Badge tone="success">{t('bay.free')}</Badge>
                )}
              </div>
              {bay.job ? (
                <>
                  <Link
                    href={`${base}/jobs/${bay.job.id}`}
                    className="font-medium text-[var(--color-primary)] hover:underline"
                  >
                    {bay.job.number}
                  </Link>
                  <p className="text-sm">
                    <Ltr>{bay.job.plate}</Ltr> · {bay.job.vehicleName}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {bay.job.technicianNames.join(', ') || t('job.unassigned')}
                  </p>
                  <span className="self-start">
                    <JobStatus status={bay.job.status} locale={locale} />
                  </span>
                  {bay.job.canPlace ? (
                    <InlineForm
                      action={placeBayAction.bind(null, locale, companyId, bay.job.id, back)}
                      locale={locale}
                      submitLabel={t('bay.release')}
                      submitClassName={buttonSecondary}
                      ariaLabel={`${t('bay.release')} ${bay.code}`}
                    >
                      <input type="hidden" name="version" value={bay.job.version} />
                      <input type="hidden" name="bayId" value="" />
                    </InlineForm>
                  ) : null}
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Card title={`${t('bay.waiting')} (${b.waiting.length})`} id="waiting">
        {b.waiting.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('bay.nobodyWaiting')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--color-border)]">
            {b.waiting.map((j) => (
              <li
                key={j.id}
                data-waiting={j.number}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <Link
                    href={`${base}/jobs/${j.id}`}
                    className="font-medium text-[var(--color-primary)] hover:underline"
                  >
                    {j.number}
                  </Link>{' '}
                  · <Ltr>{j.plate}</Ltr> · {j.vehicleName} · {j.customerName}
                  <span className="ms-2">
                    <JobStatus status={j.status} locale={locale} />
                  </span>
                </div>
                {j.canPlace && free.length ? (
                  <InlineForm
                    action={placeBayAction.bind(null, locale, companyId, j.id, back)}
                    locale={locale}
                    submitLabel={t('bay.place')}
                    submitClassName={buttonSecondary}
                    ariaLabel={`${t('bay.place')} ${j.number}`}
                  >
                    <input type="hidden" name="version" value={j.version} />
                    <label className="sr-only" htmlFor={`place-${j.id}`}>
                      {t('bay.bay')} {j.number}
                    </label>
                    <select id={`place-${j.id}`} name="bayId" className={`${inputClass} w-44`}>
                      {free.map((x) => (
                        <option key={x.id} value={x.id}>{`${x.code} · ${x.name}`}</option>
                      ))}
                    </select>
                  </InlineForm>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {b.canManage ? (
        <Card title={t('bay.setup')} id="setup">
          <ul className="mb-4 flex flex-col gap-3">
            {b.bays.map((bay) => (
              <li key={bay.id} data-setup={bay.code}>
                <InlineForm
                  action={updateBayAction.bind(null, locale, companyId, branchId, bay.id)}
                  locale={locale}
                  submitLabel={t('cust.save')}
                  submitClassName={buttonSecondary}
                  ariaLabel={`${t('bay.edit')} ${bay.code}`}
                >
                  <input type="hidden" name="version" value={bay.version} />
                  <span className="min-w-16 self-center font-semibold">
                    <Ltr>{bay.code}</Ltr>
                  </span>
                  <label className={fieldLabel}>
                    {t('bay.name')}
                    <input
                      name="name"
                      defaultValue={bay.name}
                      maxLength={60}
                      className={`${inputClass} w-48`}
                    />
                  </label>
                  <label className={fieldLabel}>
                    {t('common.status')}
                    <select name="active" defaultValue={String(bay.active)} className={`${inputClass} w-36`}>
                      <option value="true">{t('bay.active')}</option>
                      <option value="false">{t('bay.inactive')}</option>
                    </select>
                  </label>
                </InlineForm>
              </li>
            ))}
          </ul>
          <InlineForm
            action={createBayAction.bind(null, locale, companyId, branchId)}
            locale={locale}
            submitLabel={t('bay.add')}
            ariaLabel={t('bay.add')}
          >
            <label className={fieldLabel}>
              {t('bay.code')}
              <input name="code" maxLength={10} dir="ltr" className={`${inputClass} w-28`} />
            </label>
            <label className={fieldLabel}>
              {t('bay.name')}
              <input name="name" maxLength={60} className={`${inputClass} w-48`} />
            </label>
          </InlineForm>
        </Card>
      ) : null}
    </>
  );
}
