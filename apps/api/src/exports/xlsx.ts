import ExcelJS from 'exceljs';
import type { ExportTable } from './table';

/**
 * Excel workbook: a data sheet (bold header, frozen first row, filter, number formats, right-to-left
 * for Arabic) and an "About" sheet with how the file was produced. Values are written as values,
 * never formulas, so the workbook shows exactly what the API computed. Money cells are numbers
 * (exact for amounts below 10^12 with up to 3 decimals) formatted with the currency's decimals.
 */
export async function toXlsx(table: ExportTable, aboutTitle: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AUTO360 ERP';
  wb.created = new Date();
  const sheetName = table.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1, rightToLeft: table.rtl }],
  });
  const moneyFmt = table.moneyScale > 0 ? `#,##0.${'0'.repeat(table.moneyScale)}` : '#,##0';
  ws.columns = table.columns.map((c) => ({
    key: c.key,
    header: c.header,
    width: c.width ?? (c.kind === 'money' ? 16 : c.kind === 'date' ? 12 : c.kind === 'int' ? 8 : 28),
    style: c.kind === 'money' ? { numFmt: moneyFmt } : {},
  }));
  ws.getRow(1).font = { bold: true };
  for (const r of table.rows) {
    const values: Record<string, string | number | null> = {};
    for (const c of table.columns) {
      const v = r[c.key];
      values[c.key] =
        v === null || v === undefined || v === ''
          ? null
          : c.kind === 'money' || c.kind === 'int'
            ? Number(v)
            : String(v);
    }
    const row = ws.addRow(values);
    if (r.$bold) row.font = { bold: true };
    if (r.$indent)
      row.getCell(table.columns[1]?.key ?? table.columns[0]!.key).alignment = { indent: r.$indent };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.columns.length } };

  const about = wb.addWorksheet(aboutTitle.slice(0, 31), { views: [{ rightToLeft: table.rtl }] });
  about.columns = [{ width: 28 }, { width: 70 }];
  for (const [k, v] of table.meta) about.addRow([k, v]).getCell(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
