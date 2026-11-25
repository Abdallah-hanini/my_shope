import { createTranslator, getDirection, resolveLocale, type Locale } from '@erp/localization';
import { getLocales } from 'expo-localization';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface LocaleState {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t: ReturnType<typeof createTranslator>;
  toggle: () => void;
}

const Ctx = createContext<LocaleState | null>(null);

export function LocaleProvider({ children, initial }: { children: ReactNode; initial?: Locale }) {
  const [locale, setLocale] = useState<Locale>(() => initial ?? resolveLocale(getLocales()[0]?.languageTag));
  const value = useMemo<LocaleState>(
    () => ({
      locale,
      dir: getDirection(locale),
      t: createTranslator(locale),
      toggle: () => setLocale((l) => (l === 'ar' ? 'en' : 'ar')),
    }),
    [locale],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLocale must be used inside LocaleProvider');
  return v;
}
