import ExcelJS from 'exceljs';
import { csvField, toCsv } from './csv';
import type { ExportTable } from './table';
import { toXlsx } from './xlsx';

const table: ExportTable = {
  title: 'Trial balance',
  meta: [
    ['Company', 'Shop'],
    ['Period', '2026-01-01 – 2026-03-31'],
  ],
  columns: [
    { key: 'code', header: 'Code', kind: 'text' },
    { key: 'name', header: 'Account', kind: 'text' },
    { key: 'amount', header: 'Closing, "Dr"', kind: 'money' },
  ],
  rows: [
    { code: '1100', name: 'الصندوق', amount: '1250.50' },
    { code: '1200', name: '=HYPERLINK("http://evil")', amount: '-50000.00', $bold: true },
  ],
  moneyScale: 2,
  rtl: false,
};

describe('csv', () => {
  it('quotes, neutralises formulas but keeps negative numbers, and starts with a UTF-8 BOM', () => {
    expect(csvField('-50000.00')).toBe('-50000.00');
    expect(csvField('-SUM(A1)')).toBe("'-SUM(A1)");
    expect(csvField('@cmd')).toBe("'@cmd");
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField(null)).toBe('');
    const buf = toCsv(table);
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(buf.subarray(3).toString('utf8')).toBe(
      'Code,Account,"Closing, ""Dr"""\r\n1100,الصندوق,1250.50\r\n1200,"\'=HYPERLINK(""http://evil"")",-50000.00\r\n',
    );
  });
});

describe('xlsx', () => {
  it('writes values (not formulas) with number formats, a frozen header and an About sheet', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await toXlsx({ ...table, rtl: true }, 'About')) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Trial balance')!;
    expect(ws.getRow(1).values).toEqual([undefined, 'Code', 'Account', 'Closing, "Dr"']);
    expect(ws.getCell('C2').value).toBe(1250.5);
    expect(ws.getCell('C2').numFmt).toBe('#,##0.00');
    expect(ws.getCell('B3').value).toBe('=HYPERLINK("http://evil")'); // stored as text
    expect(ws.getCell('B3').formula).toBeUndefined();
    expect(ws.getRow(3).font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1, rightToLeft: true });
    expect(wb.getWorksheet('About')!.getCell('B1').value).toBe('Shop');
  });
});
