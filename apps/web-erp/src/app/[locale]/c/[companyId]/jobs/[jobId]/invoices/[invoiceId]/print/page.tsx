import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type MessageKey } from '@erp/localization';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/PrintButton';
import { Letterhead } from '@/components/print/Letterhead';
import { ProblemNotice } from '@/components/ProblemNotice';
import { buttonGhost, Ltr } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { fill } from '@/lib/notifications';

const UUID = /^[0-9a-f-]{36}$/i;

/** Printable invoice or credit note (A4, the page's language), from the posted document. */
export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string; jobId: string; invoiceId: string }>;
}) {
  const { locale, companyId, jobId, invoiceId } = await params;
  if (!isLocale(locale) || !UUID.test(jobId) || !UUID.test(invoiceId)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, company } = ctx.data;
  const [job, inv, profile] = await Promise.all([
    attempt(async () =>
      unwrap(
        await api.GET('/api/v1/companies/{companyId}/jobs/{jobId}', {
          params: { path: { companyId, jobId } },
        }),
      ),
    ),
    attempt(async () =>
      unwrap(
        await api.GET('/api/v1/companies/{companyId}/invoices/{invoiceId}', {
          params: { path: { companyId, invoiceId } },
        }),
      ),
    ),
    attempt(async () =>
      unwrap(await api.GET('/api/v1/companies/{companyId}/profile', { params: { path: { companyId } } })),
    ),
  ]);
  if (!inv.ok) return inv.status === 404 ? notFound() : <ProblemNotice result={inv} locale={locale} />;
  if (!job.ok) return <ProblemNotice result={job} locale={locale} />;
  const d = inv.data;
  const j = job.data;
  const credit = d.kind === 'credit_note';
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
        aria-label={credit ? t('bill.creditNote') : t('bill.invoice')}
        data-sheet="invoice"
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
            <h1 className="text-lg font-bold">{credit ? t('bill.creditNote') : t('bill.invoice')}</h1>
            <p className="font-semibold">
              <Ltr>{d.number}</Ltr>
            </p>
            <p className="text-xs">
              {t('print.date')}: <Ltr>{d.invoiceDate}</Ltr>
            </p>
            <p className="text-xs">
              {t('quote.jobCard')}: <Ltr>{j.number}</Ltr>
              {d.quoteNumber ? (
                <>
                  {' '}
                  · <Ltr>{d.quoteNumber}</Ltr>
                </>
              ) : null}
            </p>
          </div>
        </header>
        {credit ? (
          <p className="mb-3 font-semibold">
            {fill(t('bill.cancels'), { number: d.creditOfNumber ?? '' })} — {d.reason}
          </p>
        ) : null}
        <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
          <section className="rounded border border-[#cbd5e1] p-3">
            <h2 className="mb-1 text-xs font-bold uppercase tracking-wide">{t('job.customer')}</h2>
            <p>{d.customerName}</p>
            <p>
              <Ltr>{j.customer.phone}</Ltr>
            </p>
          </section>
          <section className="rounded border border-[#cbd5e1] p-3">
            <h2 className="mb-1 text-xs font-bold uppercase tracking-wide">{t('job.vehicle')}</h2>
            <p>
              <Ltr>{j.vehicle.plate}</Ltr>
            </p>
            <p>
              {j.vehicle.make} {j.vehicle.model} {j.vehicle.year ?? ''}
            </p>
          </section>
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
              <th scope="col" className="py-1 text-end">{`${t('quote.amount')} (${d.currency})`}</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l) => (
              <tr key={l.lineNo}>
                <td className={`${cell} pe-2`}>{l.lineNo}</td>
                <td className={cell}>{l.description}</td>
                <td className={`${cell} text-end`}>
                  <Ltr>{l.hours}</Ltr>
                </td>
                <td className={`${cell} text-end`}>
                  <Ltr>{l.amount}</Ltr>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ms-auto mb-6 grid max-w-xs grid-cols-2 gap-x-4 gap-y-1" data-print-totals>
          <dt>{t('quote.subtotal')}</dt>
          <dd className="text-end">
            <Ltr>{d.subtotal}</Ltr>
          </dd>
          {Number(d.discountAmount) > 0 ? (
            <>
              <dt>{t('quote.discount')}</dt>
              <dd className="text-end">
                −<Ltr>{d.discountAmount}</Ltr>
              </dd>
            </>
          ) : null}
          <dt>
            {d.taxCode
              ? `${t('quote.tax')} ${Number(d.taxPct)} %${d.pricesIncludeTax ? ` (${t('quote.included')})` : ''}`
              : t('quote.noTax')}
          </dt>
          <dd className="text-end">
            <Ltr>{d.taxAmount}</Ltr>
          </dd>
          <dt className="border-t border-[#101828] pt-1 font-bold">{`${t('quote.total')} (${d.currency})`}</dt>
          <dd className="border-t border-[#101828] pt-1 text-end font-bold">
            <Ltr>{d.total}</Ltr>
          </dd>
          {!credit ? (
            <>
              {d.payments.map((p) => (
                <div key={p.id} className="contents">
                  <dt className="text-xs">{`${p.number} · ${t(`bill.method.${p.method}` as MessageKey)}`}</dt>
                  <dd className="text-end text-xs">
                    −<Ltr>{p.amount}</Ltr>
                  </dd>
                </div>
              ))}
              <dt className="font-semibold">{t('bill.balance')}</dt>
              <dd className="text-end font-semibold" data-print-balance>
                <Ltr>{d.balance}</Ltr>
              </dd>
            </>
          ) : null}
        </dl>
        <footer className="mt-6 border-t border-[#cbd5e1] pt-2 text-[11px] text-[#475569]">
          {d.number} · {d.journalNumber} · {t('print.printedAt')}{' '}
          {formatDateTime(locale, new Date(), company.timezone)}
        </footer>
      </article>
    </>
  );
}
