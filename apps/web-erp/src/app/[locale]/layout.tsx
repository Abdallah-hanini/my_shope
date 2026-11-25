import { getDirection, isLocale, SUPPORTED_LOCALES, translate } from '@erp/localization';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? translate(locale, 'app.erp.name') : 'Automotive ERP' };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} dir={getDirection(locale)}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
