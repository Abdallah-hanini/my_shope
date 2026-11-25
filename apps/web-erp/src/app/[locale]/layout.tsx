import { getDirection, isLocale, SUPPORTED_LOCALES, translate } from '@erp/localization';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { themePreference } from '@/lib/preferences';

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const name = isLocale(locale) ? translate(locale, 'app.brand') : 'AUTO360';
  return { title: { default: name, template: `%s · ${name}` } };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

/** Resolves "system" before first paint so the page never flashes the wrong theme. */
const themeScript = `(function(){try{var d=document.documentElement;if(!d.dataset.theme){d.dataset.theme=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}}catch(e){}})();`;

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const theme = await themePreference();
  return (
    <html
      lang={locale}
      dir={getDirection(locale)}
      data-theme={theme === 'system' ? undefined : theme}
      suppressHydrationWarning
    >
      <head>{theme === 'system' ? <script dangerouslySetInnerHTML={{ __html: themeScript }} /> : null}</head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
