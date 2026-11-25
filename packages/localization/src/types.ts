import type { en } from './messages/en';

export type MessageKey = keyof typeof en;
export const SUPPORTED_LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type Direction = 'ltr' | 'rtl';
