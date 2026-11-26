'use client';

import { Printer } from 'lucide-react';
import { buttonPrimary } from './ui';

/** Opens the browser's print dialog (print or "Save as PDF"). */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className={`${buttonPrimary} gap-2`} onClick={() => window.print()}>
      <Printer aria-hidden size={16} />
      {label}
    </button>
  );
}
