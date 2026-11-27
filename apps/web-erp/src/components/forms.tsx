'use client';

import { createTranslator, type Locale } from '@erp/localization';
import { useFormStatus } from 'react-dom';
import { buttonPrimary } from './ui';

export function SubmitButton({
  label,
  locale,
  className,
}: {
  label: string;
  locale: Locale;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const t = createTranslator(locale);
  return (
    <button type="submit" className={className ?? buttonPrimary} disabled={pending} aria-disabled={pending}>
      {pending ? t('common.saving') : label}
    </button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-[var(--radius-control)] bg-[var(--color-danger-bg)] p-3 text-[var(--color-danger)]"
    >
      {message}
    </p>
  );
}
