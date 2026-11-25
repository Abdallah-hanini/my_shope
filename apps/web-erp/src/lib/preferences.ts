import 'server-only';
import { cookies } from 'next/headers';

export type ThemePreference = 'light' | 'dark' | 'system';
export const THEME_COOKIE = 'erp_theme';
export const SIDEBAR_COOKIE = 'erp_sidebar';

/** UI preferences only (not sensitive); read on the server so pages render without a flash. */
export async function themePreference(): Promise<ThemePreference> {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return v === 'light' || v === 'dark' ? v : 'system';
}

export async function sidebarCollapsed(): Promise<boolean> {
  return (await cookies()).get(SIDEBAR_COOKIE)?.value === 'collapsed';
}
