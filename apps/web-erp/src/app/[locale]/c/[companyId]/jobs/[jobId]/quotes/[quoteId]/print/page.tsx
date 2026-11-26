import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type MessageKey } from '@erp/localization';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { PrintButton } from '@/components/PrintButton';
import { Letterhead } from '@/components/print/Letterhead';
import { ProblemNotice } from '@/components/ProblemNotice';
import { buttonGhost, Ltr } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { fill } from '@/lib/notifications';

const UUID = /^[0-9a-f-]{36}$/i;

/** Printable quote (A4, the page's language) of an issued revision, from the API's figures. */
export default async function QuotePrintPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string; jobId: string; quoteId: string }>;
}) {
  const { locale, companyId, jobId, quoteId } = await params;
  if (!isLocale(locale) || !UUID.test(jobId) || !UUID.test(quoteId)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, company } = ctx.data;
  const path = { params: { path: { companyId, jobId } } };
  const [job, quotes, profile] = await Promise.all([
    attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/jobs/{jobId}', path))),
    attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/jobs/{jobId}/quotes', path))),
    attempt(async () =>
      unwrap(await api.GET('/api/v1/companies/{companyId}/profile', { params: { path: { companyId } } })),
    ),
  ]);
  if (!job.ok) return job.status === 404 ? notFound() : <ProblemNotice result={job} locale={locale} />;
  if (!quotes.ok) return <ProblemNotice result={quotes} locale={locale} />;
  const q = quotes.data.quotes.find((x) => x.id === quoteId);
  if (!q || !q.number) notFound();
  const j = job.data;
  const money = (v: string) => <Ltr>{v}</Ltr>;
  const cell = 'py-1 border-b border-[#e2e8f0]';
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/${locale}/c/${companyId}/jobs/${j.id}`} className={buttonGhost}>
          ← {j.number}
        </Link>
        <span className="ms-auto">
          <PrintButton label={t('print.print')} />
        </span>
      </div>
      <article
        aria-label={t('quote.document')}
        data-sheet="quote"
        className="mx-auto max-w-[210mm] bg-white p-8 text-[13px] leading-relaxed text-[#101828] shadow-[var(--shadow-card)] print:max-w-none print:p-0 print:shadow-none"
      >
        <header className="mb-5 flex items-start justify-between gap-4 border-b-2 border-[#101828] pb-3">
          <Letterhead
            company={company}
            profile={profile.ok ? profile.data : null}
            locale={locale}
            companyId={companyId}
            branchCode={j.branchCode}
          />
          <div className="text-end">
            <h1 className="text-lg font-bold">{t('quote.document')}</h1>
            <p className="font-semibold">
              <Ltr>{q.number}</Ltr>
            </p>
            <p className="text-xs">
              {t('print.date')}: <Ltr>{q.quoteDate}</Ltr> ·{' '}
              {fill(t('quote.revision'), { n: String(q.revision) })}
            </p>
            <p className="text-xs">
              {t('quote.jobCard')}: <Ltr>{j.number}</Ltr>
            </p>
          </div>
        </header>
        <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
          <Box title={t('job.customer')}>
            <p>{locale === 'ar' && j.customer.nameAr ? j.customer.nameAr : j.customer.name}</p>
            <p>
              <Ltr>{j.customer.phone}</Ltr>
            </p>
          </Box>
          <Box title={t('job.vehicle')}>
            <p>
              <Ltr>{j.vehicle.plate}</Ltr>
            </p>
            <p>
              {j.vehicle.make} {j.vehicle.model} {j.vehicle.year ?? ''}
            </p>
          </Box>
        </div>
        <table className="mb-4 w-full border-collapse">
          <thead>
            <tr className="border-b border-[#101828] text-xs">
              <th scope="col" className="py-1 text-start">
                #
              </th>
              <th scope="col" className="py-1 text-start">
                {t('job.task')}
              </th>
              <th scope="col" className="py-1 text-end">
                {t('quote.hours')}
              </th>
              <th scope="col" className="py-1 text-end">
                {t('quote.rate')}
              </th>
              <th scope="col" className="py-1 text-end">{`${t('quote.amount')} (${q.currency})`}</th>
            </tr>
          </thead>
          <tbody>
            {q.lines.map((l) => (
              <tr key={l.lineNo} data-print-quote-line={l.lineNo}>
                <td className={`${cell} pe-2`}>{l.lineNo}</td>
                <td className={cell}>{l.description}</td>
                <td className={`${cell} text-end`}>
                  <Ltr>{l.hours}</Ltr>
                </td>
                <td className={`${cell} text-end`}>{l.overrideAmount ? '—' : <Ltr>{l.rate}</Ltr>}</td>
                <td className={`${cell} text-end`}>{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ms-auto mb-6 grid max-w-xs grid-cols-2 gap-x-4 gap-y-1" data-print-totals>
          <dt>{t('quote.subtotal')}</dt>
          <dd className="text-end">{money(q.subtotal)}</dd>
          {Number(q.discountAmount) > 0 ? (
            <>
              <dt>{`${t('quote.discount')} ${Number(q.discountPct)} %`}</dt>
              <dd className="text-end">−{money(q.discountAmount)}</dd>
            </>
          ) : null}
          <dt>
            {q.taxCode
              ? `${t('quote.tax')} ${Number(q.taxPct)} %${q.pricesIncludeTax ? ` (${t('quote.included')})` : ''}`
              : t('quote.noTax')}
          </dt>
          <dd className="text-end">{money(q.taxAmount)}</dd>
          <dt className="border-t border-[#101828] pt-1 font-bold">{`${t('quote.total')} (${q.currency})`}</dt>
          <dd className="border-t border-[#101828] pt-1 text-end font-bold">{money(q.total)}</dd>
        </dl>
        {q.status === 'approved' ? (
          <p className="mb-4 text-xs">
            {t('quote.status.approved')}: {q.authorizedByName} ·{' '}
            {t(`job.via.${q.authorizedVia}` as MessageKey)} ·{' '}
            {q.decidedAt ? formatDateTime(locale, q.decidedAt, company.timezone) : ''}
          </p>
        ) : null}
        <section className="mb-4 break-inside-avoid">
          <h2 className="mb-1 border-b border-[#cbd5e1] text-sm font-bold">{t('print.signatures')}</h2>
          <p className="mb-4 text-xs">{t('quote.acceptStatement')}</p>
          <div className="grid grid-cols-2 gap-8">
            {[t('print.customerSignature'), t('print.staffSignature')].map((who) => (
              <div key={who}>
                <div className="h-12 border-b border-[#101828]" />
                <p className="mt-1 text-xs">{who}</p>
              </div>
            ))}
          </div>
        </section>
        <footer className="mt-6 border-t border-[#cbd5e1] pt-2 text-[11px] text-[#475569]">
          {q.number} · {t('print.printedAt')} {formatDateTime(locale, new Date(), company.timezone)} ·{' '}
          {t('quote.footer')}
        </footer>
      </article>
    </>
  );
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded border border-[#cbd5e1] p-3">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}
