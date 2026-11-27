'use client';

import { createTranslator, resolveLocale } from '@erp/localization';
import { TriangleAlert } from 'lucide-react';
import { useParams } from 'next/navigation';
import { buttonSecondary } from '@/components/ui';

/** Unexpected failures (expected API problems are rendered inline by each page). */
export default function CompanyError({ reset }: { error: Error; reset: () => void }) {
  const params = useParams<{ locale: string }>();
  const t = createTranslator(resolveLocale(params?.locale));
  return (
    <div
      role="alert"
      className="mx-auto mt-10 flex max-w-md flex-col items-center rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-10 text-center shadow-[var(--shadow-card)]"
    >
      <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-[var(--color-danger-bg)] text-[var(--color-danger)]">
        <TriangleAlert aria-hidden size={18} />
      </span>
      <p className="font-semibold">{t('error.title')}</p>
      <button type="button" onClick={reset} className={`${buttonSecondary} mt-4`}>
        {t('common.retry')}
      </button>
    </div>
  );
}
