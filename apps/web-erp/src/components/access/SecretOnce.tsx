'use client';

import { createTranslator, type Locale } from '@erp/localization';
import { Check, Copy, KeyRound } from 'lucide-react';
import { useState } from 'react';

/** Displays a one-time secret (temporary password) with a copy button. Never persisted. */
export function SecretOnce({
  locale,
  title,
  secret,
  children,
}: {
  locale: Locale;
  title: string;
  secret: string;
  children?: React.ReactNode;
}) {
  const t = createTranslator(locale);
  const [copied, setCopied] = useState(false);
  return (
    <div
      role="status"
      className="rounded-xl border border-[var(--color-success-brand)] bg-[var(--color-success-bg)] p-4"
    >
      <p className="flex items-center gap-2 font-semibold text-[var(--color-success)]">
        <KeyRound aria-hidden size={16} />
        {title}
      </p>
      {children}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm">{t('users.tempPassword')}:</span>
        <code
          dir="ltr"
          data-testid="temporary-password"
          className="rounded-md bg-[var(--color-surface)] px-3 py-1.5 font-mono text-base tracking-wider select-all"
        >
          {secret}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(secret).then(() => setCopied(true));
          }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold"
        >
          {copied ? <Check aria-hidden size={14} /> : <Copy aria-hidden size={14} />}
          {copied ? t('users.copied') : t('users.copy')}
        </button>
      </div>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t('users.tempPasswordHelp')}</p>
    </div>
  );
}
