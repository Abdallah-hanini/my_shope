import { createTranslator, isLocale, type MessageKey } from '@erp/localization';
import {
  ArrowLeftRight,
  Banknote,
  Coins,
  Percent,
  Gauge,
  RefreshCw,
  Users,
  BookOpen,
  Boxes,
  CalendarClock,
  FileDown,
  HandCoins,
  LayoutDashboard,
  Landmark,
  PackageSearch,
  ReceiptText,
  Scale,
  Timer,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState, PageHeader } from '@/components/ui';
import { loadCompany } from '@/lib/context';

type Entry = { key: string; href: string; icon: LucideIcon; perm: string };
/**
 * The report catalog (docs/REPORTING_PLAN.md §3): every report that exists, grouped by business
 * area. Only reports the person may open are listed; the server checks again on each report.
 */
const CATALOG: { group: string; entries: Entry[] }[] = [
  {
    group: 'finance',
    entries: [
      { key: 'executive', href: '', icon: LayoutDashboard, perm: 'reports.financial.read' },
      { key: 'pl', href: 'reports/profit-and-loss', icon: TrendingUp, perm: 'reports.financial.read' },
      { key: 'bs', href: 'reports/balance-sheet', icon: Landmark, perm: 'reports.financial.read' },
      { key: 'tb', href: 'trial-balance', icon: Scale, perm: 'reports.financial.read' },
      { key: 'gl', href: 'ledger', icon: BookOpen, perm: 'accounting.journal.read' },
      { key: 'cashFlow', href: 'reports/cash-flow', icon: Coins, perm: 'reports.financial.read' },
      { key: 'tax', href: 'reports/tax', icon: Percent, perm: 'reports.financial.read' },
      { key: 'ar', href: 'reports/receivables', icon: HandCoins, perm: 'reports.financial.read' },
      { key: 'ap', href: 'reports/payables', icon: Wallet, perm: 'reports.financial.read' },
      { key: 'exports', href: 'exports', icon: FileDown, perm: 'reports.financial.read' },
    ],
  },
  {
    group: 'sales',
    entries: [
      { key: 'sales', href: 'reports/sales', icon: Banknote, perm: 'reports.financial.read' },
      { key: 'customers', href: 'reports/customers', icon: Users, perm: 'reports.financial.read' },
    ],
  },
  {
    group: 'inventory',
    entries: [
      { key: 'stockMovement', href: 'reports/stock-movement', icon: RefreshCw, perm: 'inventory.read' },
      { key: 'stock', href: 'stock', icon: Boxes, perm: 'inventory.read' },
      {
        key: 'specialOrders',
        href: 'special-orders?status=all',
        icon: PackageSearch,
        perm: 'inventory.read',
      },
      { key: 'transfers', href: 'transfers?status=all', icon: ArrowLeftRight, perm: 'inventory.read' },
    ],
  },
  {
    group: 'purchasing',
    entries: [
      { key: 'supplierBills', href: 'supplier-bills?status=all', icon: ReceiptText, perm: 'purchasing.read' },
    ],
  },
  {
    group: 'workshop',
    entries: [
      { key: 'operations', href: 'reports/operations', icon: Gauge, perm: 'workshop.job.read' },
      { key: 'labour', href: 'labour-time', icon: Timer, perm: 'workshop.job.manage' },
      { key: 'appointments', href: 'appointments', icon: CalendarClock, perm: 'workshop.job.read' },
    ],
  },
];

export default async function ReportsCenterPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { can } = ctx.data;
  const base = `/${locale}/c/${companyId}`;
  const groups = CATALOG.map((g) => ({ ...g, entries: g.entries.filter((e) => can(e.perm)) })).filter(
    (g) => g.entries.length,
  );
  return (
    <>
      <PageHeader title={t('rpt.center')}>{t('rpt.centerHelp')}</PageHeader>
      {groups.length === 0 ? (
        <EmptyState>{t('rpt.noneForYou')}</EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.group} aria-labelledby={`rg-${g.group}`} className="mb-8">
            <h2
              id={`rg-${g.group}`}
              className="mb-3 text-[13px] font-semibold tracking-wide text-[var(--color-text-muted)] uppercase"
            >
              {t(`rpt.group.${g.group}` as MessageKey)}
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.entries.map((e) => (
                <li key={e.key}>
                  <Link
                    href={e.href ? `${base}/${e.href}` : base}
                    data-report={e.key}
                    className="group flex h-full items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-[var(--color-primary)]/50 hover:shadow-[var(--shadow-raised)]"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                      <e.icon aria-hidden size={17} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold group-hover:text-[var(--color-primary)]">
                        {t(`rpt.cat.${e.key}` as MessageKey)}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-5 text-[var(--color-text-muted)]">
                        {t(`rpt.cat.${e.key}.help` as MessageKey)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
