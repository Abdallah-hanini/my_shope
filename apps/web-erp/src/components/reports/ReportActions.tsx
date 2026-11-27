import type { Locale } from '@erp/localization';
import type { FormState } from '@/lib/form-state';
import { PrintButton } from '../PrintButton';
import { ExportForm } from './ExportForm';

type Initial = Parameters<typeof ExportForm>[0]['initial'];

/**
 * Header actions of a report page: print (or save as PDF) and, once the report has loaded, an
 * Excel/CSV export of exactly the filters on screen (RPT R2b2).
 */
export function ReportActions({
  locale,
  printLabel,
  action,
  initial,
}: {
  locale: Locale;
  printLabel: string;
  action?: (state: FormState, form: FormData) => Promise<FormState>;
  initial: Initial;
}) {
  const print = <PrintButton label={printLabel} />;
  return action ? (
    <ExportForm compact locale={locale} action={action} kinds={[initial.kind]} initial={initial}>
      {print}
    </ExportForm>
  ) : (
    print
  );
}
