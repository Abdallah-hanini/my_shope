/** A report flattened for export. Values are exact strings (money as decimal strings). */
export type CellKind = 'text' | 'money' | 'date' | 'int';

export interface ExportColumn {
  key: string;
  header: string;
  kind: CellKind;
  width?: number;
}

/** Column values by key, plus optional styling flags ($bold, $indent) used by the Excel writer. */
export interface ExportRow {
  [key: string]: string | number | boolean | null | undefined;
  $bold?: boolean;
  $indent?: number;
}

export interface ExportTable {
  /** Report name, also used as the sheet name. */
  title: string;
  /** Label/value pairs describing how the file was produced (shown on the "About" sheet). */
  meta: [string, string][];
  columns: ExportColumn[];
  rows: ExportRow[];
  /** Decimal places of the company currency (number format of money cells). */
  moneyScale: number;
  rtl: boolean;
}
