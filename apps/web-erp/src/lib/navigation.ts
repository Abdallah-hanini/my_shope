import { createTranslator, type Locale } from '@erp/localization';
import type { SidebarGroup } from '@/components/shell/Sidebar';

/** Role-filtered navigation for a company (docs/NAVIGATION_MAP.md). Server enforces access anyway. */
export function companyNavigation(
  locale: Locale,
  companyId: string,
  can: (p: string) => boolean,
): SidebarGroup[] {
  const t = createTranslator(locale);
  const base = `/${locale}/c/${companyId}`;
  const groups: SidebarGroup[] = [
    {
      items: [
        {
          href: base,
          label: can('reports.financial.read') ? t('nav.dashboard') : t('nav.overview'),
          icon: 'LayoutDashboard',
        },
      ],
    },
    {
      label: t('nav.groupWorkshop'),
      items: [
        ...(can('workshop.job.read')
          ? [
              { href: `${base}/jobs`, label: t('nav.jobs'), icon: 'Wrench' as const },
              { href: `${base}/appointments`, label: t('nav.appointments'), icon: 'CalendarClock' as const },
              { href: `${base}/bays`, label: t('nav.bays'), icon: 'LayoutGrid' as const },
            ]
          : []),
        ...(can('workshop.job.manage')
          ? [{ href: `${base}/labour-time`, label: t('nav.labour'), icon: 'Timer' as const }]
          : []),
        ...(can('crm.customer.read')
          ? [
              { href: `${base}/vehicles`, label: t('nav.vehicles'), icon: 'Car' as const },
              { href: `${base}/customers`, label: t('nav.customers'), icon: 'Contact' as const },
            ]
          : []),
      ],
    },
    {
      label: t('nav.groupFinance'),
      items: [
        ...(can('accounting.journal.read')
          ? [{ href: `${base}/journals`, label: t('nav.journals'), icon: 'BookText' as const }]
          : []),
        ...(can('accounting.account.read')
          ? [{ href: `${base}/accounts`, label: t('nav.accounts'), icon: 'ListTree' as const }]
          : []),
        ...(can('accounting.journal.read')
          ? [{ href: `${base}/ledger`, label: t('nav.generalLedger'), icon: 'BookOpen' as const }]
          : []),
        ...(can('reports.financial.read')
          ? [{ href: `${base}/trial-balance`, label: t('nav.trialBalance'), icon: 'Scale' as const }]
          : []),
        ...(can('reports.financial.read') || can('accounting.journal.read')
          ? [{ href: `${base}/exports`, label: t('nav.exports'), icon: 'FileDown' as const }]
          : []),
        ...(can('accounting.period.read')
          ? [{ href: `${base}/periods`, label: t('nav.periods'), icon: 'CalendarRange' as const }]
          : []),
      ],
    },
    {
      label: t('nav.groupOrganization'),
      items: [
        ...(can('org.branch.read')
          ? [{ href: `${base}/branches`, label: t('nav.branches'), icon: 'Building2' as const }]
          : []),
        ...(can('org.company.read')
          ? [
              {
                href: `${base}/settings/company`,
                label: t('nav.companyProfile'),
                icon: 'Building2' as const,
              },
              { href: `${base}/settings/tax`, label: t('nav.tax'), icon: 'Percent' as const },
            ]
          : []),
        ...(can('workshop.job.read')
          ? [{ href: `${base}/settings/pricing`, label: t('nav.pricing'), icon: 'Tags' as const }]
          : []),
      ],
    },
    {
      label: t('nav.groupAdministration'),
      items: [
        ...(can('iam.assignment.read')
          ? [{ href: `${base}/users`, label: t('nav.users'), icon: 'Users' as const }]
          : []),
        ...(can('iam.role.read')
          ? [
              { href: `${base}/roles`, label: t('nav.roles'), icon: 'KeyRound' as const },
              { href: `${base}/permissions`, label: t('nav.permissions'), icon: 'Grid3x3' as const },
            ]
          : []),
        ...(can('audit.read')
          ? [{ href: `${base}/audit`, label: t('nav.audit'), icon: 'ShieldCheck' as const }]
          : []),
      ],
    },
  ];
  return groups.filter((g) => g.items.length);
}

/**
 * Section crumb for the current path (longest matching navigation item). `homeHref` (the company
 * home) only matches itself, so pages outside the menu do not borrow the dashboard's name.
 */
export function sectionFor(
  groups: SidebarGroup[],
  path: string,
  homeHref?: string,
): { href: string; label: string } | undefined {
  const items = groups.flatMap((g) => g.items);
  return items
    .filter((i) => path === i.href || (i.href !== homeHref && path.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
