import { unwrap, type JobCard } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type Locale, type MessageKey } from '@erp/localization';
import { INSPECTION_ITEMS } from '@erp/validation';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { PrintButton } from '@/components/PrintButton';
import { ProblemNotice } from '@/components/ProblemNotice';
import { buttonGhost, Ltr } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { handoverFacts } from '@/lib/job-print';
import { fill } from '@/lib/notifications';

const UUID = /^[0-9a-f-]{36}$/i;
type Doc = 'checkin' | 'handover';

/**
 * Printable job card sheets (A4, the page's language): the check-in sheet the customer signs when
 * leaving the car, and the handover sheet at delivery. Built only from the job card the API returns.
 */
export default async function JobPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string; jobId: string }>;
  searchParams: Promise<{ doc?: string }>;
}) {
  const { locale, companyId, jobId } = await params;
  if (!isLocale(locale) || !UUID.test(jobId)) notFound();
  const doc: Doc = (await searchParams).doc === 'handover' ? 'handover' : 'checkin';
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, company } = ctx.data;
  const res = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/jobs/{jobId}', {
        params: { path: { companyId, jobId } },
      }),
    ),
  );
  if (!res.ok) {
    if (res.status === 404) notFound();
    return <ProblemNotice result={res} locale={locale} />;
  }
  const j = res.data;
  const profile = await attempt(async () =>
    unwrap(await api.GET('/api/v1/companies/{companyId}/profile', { params: { path: { companyId } } })),
  );
  const letter = profile.ok ? profile.data : null;
  const address = letter ? (locale === 'ar' && letter.addressAr ? letter.addressAr : letter.address) : null;
  const base = `/${locale}/c/${companyId}/jobs/${j.id}`;
  const tz = company.timezone;
  const when = (iso: string | null | undefined) => (iso ? formatDateTime(locale, iso, tz) : '—');
  const handoverReady = handoverFacts(j).available;
  const companyName = locale === 'ar' && company.legalNameAr ? company.legalNameAr : company.legalName;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={base} className={buttonGhost}>
          ← {j.number}
        </Link>
        <nav aria-label={t('print.documents')} className="flex gap-2">
          <Link
            href={`${base}/print`}
            aria-current={doc === 'checkin' ? 'page' : undefined}
            className={buttonGhost}
          >
            {t('print.checkinTitle')}
          </Link>
          {handoverReady ? (
            <Link
              href={`${base}/print?doc=handover`}
              aria-current={doc === 'handover' ? 'page' : undefined}
              className={buttonGhost}
            >
              {t('print.handoverTitle')}
            </Link>
          ) : null}
        </nav>
        <span className="ms-auto">
          <PrintButton label={t('print.print')} />
        </span>
      </div>
      {doc === 'handover' && !handoverReady ? (
        <p role="note" className="rounded-xl border border-[var(--color-border)] p-4 text-sm">
          {t('print.handoverNotYet')}
        </p>
      ) : (
        <article
          aria-label={doc === 'checkin' ? t('print.checkinTitle') : t('print.handoverTitle')}
          data-sheet={doc}
          className="mx-auto max-w-[210mm] bg-white p-8 text-[13px] leading-relaxed text-[#101828] shadow-[var(--shadow-card)] print:max-w-none print:p-0 print:shadow-none"
        >
          <header className="mb-5 flex items-start justify-between gap-4 border-b-2 border-[#101828] pb-3">
            <div className="flex items-start gap-3" data-letterhead>
              {letter?.logoVersion ? (
                // eslint-disable-next-line @next/next/no-img-element -- served by our own route with the session
                <img
                  src={`/${locale}/c/${companyId}/settings/logo?v=${letter.logoVersion}`}
                  alt=""
                  className="max-h-16 w-auto"
                />
              ) : null}
              <div className="text-xs">
                <p className="text-base font-bold">{companyName}</p>
                {address ? <p className="whitespace-pre-line">{address}</p> : null}
                {letter?.phone ? (
                  <p>
                    {t('cust.phone')}: <Ltr>{letter.phone}</Ltr>
                  </p>
                ) : null}
                {letter?.crNumber ? (
                  <p>
                    {t('settings.crNumber')}: <Ltr>{letter.crNumber}</Ltr>
                  </p>
                ) : null}
                <p>
                  {t('job.branch')}: {j.branchCode}
                </p>
              </div>
            </div>
            <div className="text-end">
              <h1 className="text-lg font-bold">
                {doc === 'checkin' ? t('print.checkinTitle') : t('print.handoverTitle')}
              </h1>
              <p className="font-semibold">
                <Ltr>{j.number}</Ltr>
              </p>
              <p className="text-xs">{when(doc === 'checkin' ? j.createdAt : (j.deliveredAt ?? null))}</p>
            </div>
          </header>

          <Grid>
            <Box title={t('job.customer')}>
              <Line label={t('cust.name')}>
                {locale === 'ar' && j.customer.nameAr ? j.customer.nameAr : j.customer.name}
              </Line>
              <Line label={t('cust.phone')}>
                <Ltr>{j.customer.phone}</Ltr>
              </Line>
            </Box>
            <Box title={t('job.vehicle')}>
              <Line label={t('veh.plate')}>
                <Ltr>{j.vehicle.plate}</Ltr>
              </Line>
              <Line label={t('job.vehicle')}>
                {j.vehicle.make} {j.vehicle.model} {j.vehicle.year ?? ''}
              </Line>
              <Line label={t('job.odometerIn')}>
                <Ltr>{j.odometerIn.toLocaleString('en')}</Ltr>
              </Line>
              {doc === 'checkin' ? (
                <Line label={t('job.fuelLevel')}>{t(`job.fuel.${j.fuelLevel}` as MessageKey)}</Line>
              ) : j.odometerOut !== null && j.odometerOut !== undefined ? (
                <Line label={t('job.odometerOut')}>
                  <Ltr>{j.odometerOut.toLocaleString('en')}</Ltr>
                </Line>
              ) : null}
            </Box>
          </Grid>

          <Section title={t('job.complaint')}>
            <p className="whitespace-pre-line">{j.complaint}</p>
          </Section>

          {doc === 'checkin' ? <CheckIn j={j} locale={locale} when={when} base={base} /> : null}
          <Tasks j={j} locale={locale} doc={doc} />
          {doc === 'handover' ? <Handover j={j} locale={locale} when={when} /> : null}

          <Section title={t('print.signatures')}>
            <p className="mb-4 text-xs">
              {doc === 'checkin' ? t('print.checkinStatement') : t('print.handoverStatement')}
            </p>
            <div className="grid grid-cols-2 gap-8">
              {[t('print.customerSignature'), t('print.staffSignature')].map((who) => (
                <div key={who}>
                  <div className="h-14 border-b border-[#101828]" />
                  <p className="mt-1 text-xs">{who}</p>
                  <p className="mt-3 text-xs">
                    {t('cust.name')}: ________________ · {t('print.date')}: ____________
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <footer className="mt-6 border-t border-[#cbd5e1] pt-2 text-[11px] text-[#475569]">
            {j.number} · {t('print.printedAt')} {formatDateTime(locale, new Date(), tz)} ·{' '}
            {t('print.noPrices')}
          </footer>
        </article>
      )}
    </>
  );
}

function CheckIn({
  j,
  locale,
  when,
  base,
}: {
  j: JobCard;
  locale: Locale;
  when: (iso: string | null | undefined) => string;
  base: string;
}) {
  const t = createTranslator(locale);
  return (
    <>
      <Section title={t('insp.title')}>
        {j.inspection ? (
          <>
            <p className="mb-2 text-xs">
              {t('insp.recordedBy')}: {j.inspection.recordedByName} · {when(j.inspection.recordedAt)}
            </p>
            <table className="w-full border-collapse text-xs">
              <tbody>
                {INSPECTION_ITEMS.map((def) => {
                  const it = j.inspection!.items.find((i) => i.key === def.key);
                  return (
                    <tr key={def.key} data-print-item={def.key} className="border-b border-[#e2e8f0]">
                      <th scope="row" className="w-1/3 py-1 text-start font-normal">
                        {t(`insp.item.${def.key}` as MessageKey)}
                      </th>
                      <td className={`w-1/4 py-1 ${it?.status === 'attention' ? 'font-bold' : ''}`}>
                        {it ? t(`insp.status.${it.status}` as MessageKey) : '—'}
                      </td>
                      <td className="py-1">{it?.note ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        ) : (
          <p>{t('print.noInspection')}</p>
        )}
      </Section>
      {j.photos.length ? (
        <Section title={`${t('photo.title')} (${j.photos.length})`}>
          <ul className="grid grid-cols-4 gap-2">
            {j.photos.map((p) => (
              <li key={p.id} className="break-inside-avoid text-[11px]">
                {/* eslint-disable-next-line @next/next/no-img-element -- served by our own route with the session */}
                <img
                  src={`${base}/photos/${p.id}?size=thumb`}
                  alt={`${t(`photo.area.${p.area}` as MessageKey)}${p.caption ? `: ${p.caption}` : ''}`}
                  className="aspect-[4/3] w-full border border-[#cbd5e1] object-cover"
                />
                {t(`photo.area.${p.area}` as MessageKey)}
                {p.caption ? ` — ${p.caption}` : ''}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section title={t('job.authorization')}>
        {j.authorizedAt ? (
          <p>
            {j.authorizedByName} · {t(`job.via.${j.authorizedVia}` as MessageKey)} · {when(j.authorizedAt)}
          </p>
        ) : (
          <p>{t('print.notAuthorised')}</p>
        )}
        {j.promisedAt ? (
          <p>
            {t('job.promised')}: {when(j.promisedAt)}
          </p>
        ) : null}
      </Section>
    </>
  );
}

function Tasks({ j, locale, doc }: { j: JobCard; locale: Locale; doc: Doc }) {
  const t = createTranslator(locale);
  const th = 'border-b border-[#101828] py-1 text-start text-xs font-semibold';
  return (
    <Section title={doc === 'checkin' ? t('print.tasksAgreed') : t('print.tasksDone')}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={th}>
              #
            </th>
            <th scope="col" className={th}>
              {t('job.task')}
            </th>
            <th scope="col" className={`${th} text-end`}>
              {t('job.hours')}
            </th>
            {doc === 'handover' ? (
              <th scope="col" className={th}>
                {t('common.status')}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {j.tasks.map((task) => (
            <tr key={task.id} data-print-task={task.lineNo} className="border-b border-[#e2e8f0]">
              <td className="py-1 pe-2">{task.lineNo}</td>
              <td className="py-1">
                {task.description}
                {task.additionSeq ? (
                  <span className="text-[11px]">
                    {' '}
                    ({fill(t('add.fromAddition'), { seq: String(task.additionSeq) })})
                  </span>
                ) : null}
              </td>
              <td className="py-1 text-end">
                <Ltr>{task.estimatedHours}</Ltr>
              </td>
              {doc === 'handover' ? (
                <td className="py-1 ps-2">{task.status === 'done' ? t('job.done') : t('job.openTask')}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td />
            <th scope="row" className="py-1 text-start font-semibold">
              {t('job.estimate')}
            </th>
            <td className="py-1 text-end font-semibold">
              <Ltr>{j.estimatedHours}</Ltr>
            </td>
            {doc === 'handover' ? <td /> : null}
          </tr>
        </tfoot>
      </table>
    </Section>
  );
}

function Handover({
  j,
  locale,
  when,
}: {
  j: JobCard;
  locale: Locale;
  when: (iso: string | null | undefined) => string;
}) {
  const t = createTranslator(locale);
  const { qc, declined } = handoverFacts(j);
  return (
    <>
      <Section title={t('print.quality')}>
        <p>{qc ? `${t('print.qcPassed')} · ${qc.actorName} · ${when(qc.occurredAt)}` : '—'}</p>
        {j.reworkCount ? (
          <p>
            {t('job.reworkCount')}: {j.reworkCount}
          </p>
        ) : null}
      </Section>
      {declined.length ? (
        <Section title={t('print.declinedWork')}>
          <ul className="list-disc ps-5">
            {declined.map((a) => (
              <li key={a.id}>
                {a.finding} — {a.tasks.map((x) => x.description).join(', ')}
                {a.closeReason ? ` (${a.closeReason})` : ''}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {j.deliveredAt ? (
        <Section title={t('job.deliveredTo')}>
          <p>
            {j.deliveredToName} · {when(j.deliveredAt)}
          </p>
        </Section>
      ) : null}
    </>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="mb-4 grid grid-cols-2 gap-4">{children}</div>;
}
function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded border border-[#cbd5e1] p-3">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}
function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p>
      <span className="text-[#475569]">{label}: </span>
      {children}
    </p>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4 break-inside-avoid">
      <h2 className="mb-1 border-b border-[#cbd5e1] text-sm font-bold">{title}</h2>
      {children}
    </section>
  );
}
