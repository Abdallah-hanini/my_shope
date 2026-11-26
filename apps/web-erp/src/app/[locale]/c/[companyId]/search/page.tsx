import { unwrap, type SearchResult } from '@erp/api-client';
import { createTranslator, isLocale, type Locale, type MessageKey } from '@erp/localization';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Badge, buttonPrimary, Card, inputClass, Ltr, Notice, PageHeader } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';

const LIMIT = 20;
type Group = SearchResult['groups'][number];
type Hit = Group['items'][number];

/** Marks the first case-insensitive occurrence of the query (exact spelling only). */
function highlight(text: string, q: string): ReactNode {
  const i = text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
  if (i < 0 || !q) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-[var(--color-warning-bg)] px-0.5 text-inherit">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

/** WEB-237 Global search results (docs/SCREEN_CONTRACTS.md). */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale, companyId } = await params;
  const raw = ((await searchParams).q ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can } = ctx.data;
  const base = `/${locale}/c/${companyId}`;
  const result =
    raw.length >= 2
      ? await attempt(async () =>
          unwrap(
            await api.GET('/api/v1/companies/{companyId}/search', {
              params: { path: { companyId }, query: { q: raw, limit: LIMIT } },
            }),
          ),
        )
      : null;

  const href = (type: Group['type'], h: Hit): string => {
    switch (type) {
      case 'job':
        return `${base}/jobs/${h.id}`;
      case 'vehicle':
        return `${base}/vehicles/${h.id}`;
      case 'customer':
        return `${base}/customers/${h.id}`;
      case 'journal':
        return `${base}/journals/${h.id}`;
      case 'account':
        return can('accounting.journal.read') && !h.detail?.endsWith(':header')
          ? `${base}/ledger?account=${h.id}`
          : `${base}/accounts`;
      case 'branch':
        return `${base}/branches`;
      case 'period':
        return `${base}/periods`;
      case 'user':
        return `${base}/users/${h.id}`;
    }
  };
  const total = result?.ok ? result.data.groups.reduce((n, g) => n + g.items.length, 0) : 0;

  return (
    <>
      <PageHeader title={raw.length >= 2 ? t('search.resultsFor').replace('{q}', raw) : t('search.title')} />
      <Card className="mb-6">
        <form role="search" method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="search-q" className="text-[13px] font-medium">
              {t('search.label')}
            </label>
            <input
              id="search-q"
              name="q"
              type="search"
              defaultValue={raw}
              autoFocus={raw.length < 2}
              minLength={2}
              maxLength={100}
              required
              placeholder={t('search.placeholder')}
              className={inputClass}
            />
          </div>
          <button type="submit" className={buttonPrimary}>
            <Search aria-hidden size={16} />
            {t('search.button')}
          </button>
        </form>
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">{t('search.help')}</p>
      </Card>

      {raw.length > 0 && raw.length < 2 ? <Notice>{t('search.tooShort')}</Notice> : null}
      {result && !result.ok ? <ProblemNotice result={result} locale={locale} /> : null}
      {result?.ok ? (
        <div aria-live="polite">
          {total === 0 ? (
            <Card>
              <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">
                {t('search.noResults').replace('{q}', raw)}
              </p>
            </Card>
          ) : (
            result.data.groups
              .filter((g) => g.items.length)
              .map((g) => (
                <Card
                  key={g.type}
                  id={`results-${g.type}`}
                  title={`${t(`search.group.${g.type}` as MessageKey)} (${g.items.length}${g.more ? '+' : ''})`}
                  flush
                >
                  <ul className="divide-y divide-[var(--color-border)]">
                    {g.items.map((h) => (
                      <li key={h.id}>
                        <Link
                          href={href(g.type, h)}
                          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3 hover:bg-[var(--color-surface-muted)] focus-visible:bg-[var(--color-surface-muted)]"
                        >
                          {h.code ? (
                            <Ltr className="font-semibold text-[var(--color-primary)]">
                              {highlight(h.code, raw)}
                            </Ltr>
                          ) : null}
                          <span className={h.code ? '' : 'font-semibold text-[var(--color-primary)]'}>
                            {highlight(locale === 'ar' && h.nameAr ? h.nameAr : h.name, raw)}
                          </span>
                          <HitDetail type={g.type} hit={h} locale={locale} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {g.more ? (
                    <p className="border-t border-[var(--color-border)] px-5 py-2 text-xs text-[var(--color-text-muted)]">
                      {t('search.more').replace('{n}', String(LIMIT))}
                    </p>
                  ) : null}
                </Card>
              ))
          )}
        </div>
      ) : null}
    </>
  );
}

function HitDetail({ type, hit, locale }: { type: Group['type']; hit: Hit; locale: Locale }) {
  const t = createTranslator(locale);
  const muted = 'text-sm text-[var(--color-text-muted)]';
  switch (type) {
    case 'journal':
      return (
        <span className={`${muted} flex flex-wrap items-center gap-2`}>
          <Ltr>{hit.date}</Ltr>·<Ltr>{hit.detail}</Ltr>
          {hit.status === 'reversal' ? <Badge>{t('journal.source.reversal')}</Badge> : null}
        </span>
      );
    case 'account': {
      const [kind, header] = (hit.detail ?? '').split(':');
      return (
        <span className={`${muted} flex flex-wrap items-center gap-2`}>
          {kind ? t(`account.type.${kind}` as MessageKey) : null}
          {header ? <Badge>{t('account.header')}</Badge> : null}
        </span>
      );
    }
    case 'period':
      return (
        <span className={`${muted} flex flex-wrap items-center gap-2`}>
          <Ltr>{`${hit.date} – ${hit.detail}`}</Ltr>
          <Badge tone={hit.status === 'open' ? 'success' : 'neutral'}>
            {hit.status === 'open' ? t('period.open') : t('period.closed')}
          </Badge>
        </span>
      );
    case 'job':
      return (
        <span className={`${muted} flex flex-wrap items-center gap-2`}>
          <Ltr>{hit.detail}</Ltr>
          <Badge>{t(`job.status.${hit.status}` as MessageKey)}</Badge>
        </span>
      );
    case 'vehicle':
    case 'customer':
      return (
        <span className={muted}>
          <Ltr>{hit.detail}</Ltr>
        </span>
      );
    case 'user':
      return (
        <span className={`${muted} flex flex-wrap items-center gap-2`}>
          <Ltr>{hit.detail}</Ltr>
          {hit.status === 'inactive' ? <Badge tone="danger">{t('users.statusInactive')}</Badge> : null}
        </span>
      );
    default:
      return null;
  }
}
