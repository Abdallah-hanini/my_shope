'use client';

import { createTranslator, type Locale } from '@erp/localization';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

/** Sets the theme cookie and applies it immediately (no reload). */
export function ThemeMenu({ locale, initial }: { locale: Locale; initial: Theme }) {
  const t = createTranslator(locale);
  const [theme, setTheme] = useState<Theme>(initial);
  const choose = (next: Theme) => {
    setTheme(next);
    document.cookie = `erp_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    const dark =
      next === 'dark' || (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  };
  const options: { value: Theme; label: string; Icon: typeof Sun }[] = [
    { value: 'light', label: t('theme.light'), Icon: Sun },
    { value: 'dark', label: t('theme.dark'), Icon: Moon },
    { value: 'system', label: t('theme.system'), Icon: Monitor },
  ];
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 px-2 text-xs font-semibold text-[var(--color-text-muted)]">
        {t('theme.label')}
      </legend>
      <div className="flex gap-1 px-1">
        {options.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => choose(value)}
            className={`flex min-h-10 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-xs ${
              theme === value
                ? 'bg-[var(--color-surface-muted)] font-semibold text-[var(--color-primary)]'
                : ''
            }`}
          >
            <Icon aria-hidden size={16} />
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
