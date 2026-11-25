'use client';

import { createTranslator, resolveLocale } from '@erp/localization';
import { useParams } from 'next/navigation';

/** Unexpected failures (expected API problems are rendered inline by each page). */
export default function CompanyError({ reset }: { error: Error; reset: () => void }) {
  const params = useParams<{ locale: string }>();
  const t = createTranslator(resolveLocale(params?.locale));
  return (
    <div role="alert" className="rounded-xl bg-[var(--color-danger-bg)] p-4 text-[var(--color-danger)]">
      <p className="font-semibold">{t('error.title')}</p>
      <button type="button" onClick={reset} className="mt-3 underline">
        {t('common.retry')}
      </button>
    </div>
  );
}
