import type { ExportTable } from './table';

const NUMBER = /^-?\d+(\.\d+)?$/;
/** Cells a spreadsheet would treat as a formula (CSV/formula injection, OWASP). */
const FORMULA = /^[=+\-@\t\r]/;

/** One CSV field: numbers stay as typed; text that looks like a formula is neutralised with "'". */
export function csvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (!NUMBER.test(s) && FORMULA.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * RFC 4180 CSV of the table (header row + data rows only, so it imports cleanly), UTF-8 with BOM
 * so spreadsheet programs read Arabic correctly, CRLF line endings.
 */
export function toCsv(table: ExportTable): Buffer {
  const lines = [table.columns.map((c) => csvField(c.header)).join(',')];
  for (const row of table.rows) lines.push(table.columns.map((c) => csvField(row[c.key])).join(','));
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(`${lines.join('\r\n')}\r\n`, 'utf8')]);
}
