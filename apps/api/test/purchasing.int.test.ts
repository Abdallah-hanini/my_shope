import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { localTime } from '../src/workshop/scheduling';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// T-76 supplier bills: suppliers; receipts name their supplier; a bill matches unbilled receipts
// and posts Dr goods received / price variance / input tax, Cr payables; each receipt and each
// supplier invoice is billed once (also under concurrency); payments never exceed what is owed and
// are not made by the person who entered the bill (unless the owner); unpaid bills cancel by
// reversal; payables and goods received reconcile to the ledger; database guarantees; branch scope.

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let companyId: string;
let today: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const base = () => `/companies/${companyId}`;
type Bill = {
  id: string;
  number: string;
  status: string;
  total: string;
  balance: string;
  dueDate: string;
  varianceAmount: string;
  taxAmount: string;
  journalNumber: string;
  actions: string[];
  payBlockedReason: string | null;
  lines: { movementNumber: string; receiptValue: string; amount: string }[];
  payments: { number: string; amount: string }[];
};

async function person(name: string, permissions: string[], branch: string | null) {
  const role = (
    await api(app, tok.admin)
      .post(`${base()}/roles`, { code: `r-${uid()}`, name, permissions })
      .expect(201)
  ).body.id;
  const u = await createUser(prisma);
  await prisma.user.update({ where: { id: u.id }, data: { displayName: name } });
  await api(app, tok.admin)
    .post(`${base()}/role-assignments`, { userId: u.id, roleId: role, branchId: branch })
    .expect(201);
  tok[name] = await auth.sign(u.sub);
}
const a = (t: string) => api(app, tok[t]);
async function receipt(
  part: string,
  branch: string,
  quantity: string,
  unitCost: string,
  supplierId: string | null,
) {
  const p = (
    await a('admin')
      .post(`${base()}/parts/${part}/receipts`, {
        branchId: ids[branch],
        supplierId,
        quantity,
        unitCost,
        reference: `DN-${uid()}`,
        idempotencyKey: randomUUID(),
      })
      .expect(201)
  ).body as { movements: { id: string; number: string; value: string }[] };
  return p.movements[0]!;
}
const bill = (t: string, body: object) =>
  a(t).post(`${base()}/supplier-bills`, {
    supplierId: ids.gulf,
    branchId: ids.DOH,
    billDate: today,
    taxCodeId: null,
    idempotencyKey: randomUUID(),
    ...body,
  });
const pay = (t: string, billId: string, body: object) =>
  a(t).post(`${base()}/supplier-bills/${billId}/payments`, {
    method: 'bank',
    reference: 'TRX-1',
    idempotencyKey: randomUUID(),
    ...body,
  });
async function journalLines(number: string) {
  const j = await prisma.journal.findFirstOrThrow({
    where: { companyId, number },
    include: { lines: { include: { account: true }, orderBy: { lineNo: 'asc' } } },
  });
  return j.lines.map((l) => [l.account.code, l.debit.toFixed(2), l.credit.toFixed(2)]);
}

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  tok.admin = await auth.sign(admin.sub);
  companyId = (
    await api(app, tok.admin)
      .post('/companies', {
        code: `P${uid()}`,
        legalName: 'Purchasing fixture',
        baseCurrency: 'QAR',
        timezone: 'Asia/Qatar',
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  today = localTime(new Date(), 'Asia/Qatar').date;
  for (const code of ['DOH', 'WAK'])
    ids[code] = (await a('admin').post(`${base()}/branches`, { code, name: code }).expect(201)).body.id;
  await person('buyer', ['purchasing.read', 'purchasing.manage'], ids.DOH!);
  await person('clerk', ['purchasing.read', 'purchasing.manage', 'purchasing.pay'], ids.DOH!);
  await person('payer', ['purchasing.read', 'purchasing.pay'], ids.DOH!);
  await person('viewer', ['purchasing.read'], ids.WAK!);
  const acct = async (code: string, type: string) =>
    (
      await a('admin')
        .post(`${base()}/accounts`, { code, name: `A${code}`, type, isPosting: true })
        .expect(201)
    ).body.id as string;
  for (const [k, code, type] of [
    ['cash', '1000', 'asset'],
    ['bank', '1100', 'asset'],
    ['inv', '1400', 'asset'],
    ['vatIn', '1450', 'asset'],
    ['ap', '2100', 'liability'],
    ['grni', '2200', 'liability'],
    ['vatOut', '2300', 'liability'],
    ['ppv', '5100', 'expense'],
  ] as const)
    ids[k] = await acct(code, type);
  const y = today.slice(0, 4);
  await a('admin')
    .post(`${base()}/fiscal-periods`, { name: `FY${y}`, startDate: `${y}-01-01`, endDate: `${y}-12-31` })
    .expect(201);
  await a('admin')
    .put(`${base()}/posting-settings`, {
      version: 0,
      labourRevenueAccountId: null,
      receivableAccountId: null,
      cashAccountId: ids.cash,
      cardAccountId: null,
      bankAccountId: ids.bank,
      inventoryAccountId: ids.inv,
      goodsReceivedAccountId: ids.grni,
    })
    .expect(200);
  ids.vat = (
    await a('admin')
      .post(`${base()}/tax/codes`, { code: 'VAT', name: 'VAT', outputAccountId: ids.vatOut })
      .expect(201)
  ).body.codes[0].id;
  await a('admin')
    .post(`${base()}/tax/codes/${ids.vat}/rates`, { rate: '5', effectiveFrom: today })
    .expect(201);
  ids.oil = (
    await a('admin').post(`${base()}/parts`, { sku: 'OIL', name: 'Oil', unit: 'litre' }).expect(201)
  ).body.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('suppliers', () => {
  it('company-wide purchasing managers add suppliers; names are unique; everyone with purchasing sees them', async () => {
    const body = { name: 'Gulf Parts', phone: '+974 4000 0000', paymentTermsDays: 30 };
    await a('buyer').post(`${base()}/suppliers`, body).expect(403); // branch-limited
    await a('admin')
      .post(`${base()}/suppliers`, { ...body, email: 'not-an-email' })
      .expect(400);
    await a('admin')
      .post(`${base()}/suppliers`, { ...body, paymentTermsDays: 400 })
      .expect(400);
    const s = (await a('admin').post(`${base()}/suppliers`, body).expect(201)).body;
    expect(s).toMatchObject({ name: 'Gulf Parts', paymentTermsDays: 30, balance: '0.00', canManage: true });
    ids.gulf = s.id;
    await a('admin').post(`${base()}/suppliers`, body).expect(409);
    ids.other = (
      await a('admin').post(`${base()}/suppliers`, { name: 'Other Motors', paymentTermsDays: 0 }).expect(201)
    ).body.id;
    const list = (await a('viewer').get(`${base()}/suppliers`).expect(200)).body;
    expect(list.suppliers.map((x: { name: string }) => x.name)).toEqual(['Gulf Parts', 'Other Motors']);
    expect(list.canManage).toBe(false);
    await expect(prisma.supplier.delete({ where: { id: ids.other } })).rejects.toThrow();
  });

  it('receipts record the supplier; an inactive or unknown supplier is refused', async () => {
    const r = await receipt(ids.oil!, 'DOH', '10', '9.10', ids.gulf!);
    ids.r1 = r.id;
    expect(r.value).toBe('91.00');
    const part = (await a('admin').get(`${base()}/parts/${ids.oil}`).expect(200)).body;
    expect(part.movements[0].supplierName).toBe('Gulf Parts');
    expect(part.suppliers.map((x: { name: string }) => x.name)).toEqual(['Gulf Parts', 'Other Motors']);
    await a('admin')
      .post(`${base()}/parts/${ids.oil}/receipts`, {
        branchId: ids.DOH,
        supplierId: randomUUID(),
        quantity: '1',
        unitCost: '1',
        reference: 'X',
        idempotencyKey: randomUUID(),
      })
      .expect(404);
    ids.r2 = (await receipt(ids.oil!, 'DOH', '5', '10', null)).id; // older style: no supplier
    ids.rOther = (await receipt(ids.oil!, 'DOH', '2', '10', ids.other!)).id;
    ids.rWak = (await receipt(ids.oil!, 'WAK', '3', '10', ids.gulf!)).id;
  });
});

describe('bills', () => {
  it('lists the supplier’s unbilled receipts at the branch (and those without a supplier)', async () => {
    const u = (
      await a('buyer')
        .get(`${base()}/suppliers/${ids.gulf}/unbilled-receipts?branchId=${ids.DOH}`)
        .expect(200)
    ).body;
    expect(
      u.receipts.map((r: { movementId: string; fromThisSupplier: boolean }) => [
        r.movementId,
        r.fromThisSupplier,
      ]),
    ).toEqual([
      [ids.r1, true],
      [ids.r2, false],
    ]);
    expect(u.taxCodes.map((c: { code: string }) => c.code)).toEqual(['VAT']);
    await a('buyer').get(`${base()}/suppliers/${ids.gulf}/unbilled-receipts?branchId=${ids.WAK}`).expect(404);
  });

  it('nothing posts until the accountant chooses payables; differences need a reason and an account', async () => {
    const lines = [{ movementId: ids.r1, amount: '91.00' }];
    expect((await bill('buyer', { supplierInvoiceNo: 'GP-1', lines }).expect(422)).body.detail).toMatch(
      /payables/,
    );
    const s = (await a('admin').get(`${base()}/posting-settings`).expect(200)).body;
    await a('admin')
      .put(`${base()}/posting-settings`, {
        version: s.version,
        labourRevenueAccountId: null,
        receivableAccountId: null,
        cashAccountId: ids.cash,
        cardAccountId: null,
        bankAccountId: ids.bank,
        inventoryAccountId: ids.inv,
        goodsReceivedAccountId: ids.grni,
        payablesAccountId: ids.ap,
        inputTaxAccountId: null,
        priceVarianceAccountId: null,
      })
      .expect(200);
    const two = [...lines, { movementId: ids.r2, amount: '52.35' }];
    expect((await bill('buyer', { supplierInvoiceNo: 'GP-1', lines: two }).expect(422)).body.detail).toMatch(
      /2.35 more .* give the reason/,
    );
    expect(
      (
        await bill('buyer', { supplierInvoiceNo: 'GP-1', lines: two, varianceReason: 'Price rise' }).expect(
          422,
        )
      ).body.detail,
    ).toMatch(/price difference account/);
    expect(
      (await bill('buyer', { supplierInvoiceNo: 'GP-1', lines, taxCodeId: ids.vat }).expect(422)).body.detail,
    ).toMatch(/input tax account/);
    const s2 = (await a('admin').get(`${base()}/posting-settings`).expect(200)).body;
    await a('admin')
      .put(`${base()}/posting-settings`, {
        version: s2.version,
        labourRevenueAccountId: null,
        receivableAccountId: null,
        cashAccountId: ids.cash,
        cardAccountId: null,
        bankAccountId: ids.bank,
        inventoryAccountId: ids.inv,
        goodsReceivedAccountId: ids.grni,
        payablesAccountId: ids.ap,
        inputTaxAccountId: ids.vatIn,
        priceVarianceAccountId: ids.ppv,
      })
      .expect(200);
  });

  it('checks receipts, dates and permissions', async () => {
    const ok = [{ movementId: ids.r1, amount: '91.00' }];
    await bill('payer', { supplierInvoiceNo: 'GP-1', lines: ok }).expect(403);
    await bill('buyer', { supplierInvoiceNo: 'GP-1', lines: ok, branchId: ids.WAK }).expect(404);
    await bill('buyer', {
      supplierInvoiceNo: 'GP-1',
      lines: [{ movementId: ids.rWak, amount: '30' }],
    }).expect(404);
    expect(
      (
        await bill('buyer', {
          supplierInvoiceNo: 'GP-1',
          lines: [{ movementId: ids.rOther, amount: '20' }],
        }).expect(422)
      ).body.detail,
    ).toMatch(/another supplier/);
    await bill('buyer', { supplierInvoiceNo: 'GP-1', lines: [...ok, ...ok] }).expect(400);
    await bill('buyer', { supplierInvoiceNo: 'GP-1', lines: [] }).expect(400);
    const next = new Date(`${today}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    expect(
      (
        await bill('buyer', {
          supplierInvoiceNo: 'GP-1',
          lines: ok,
          billDate: next.toISOString().slice(0, 10),
        }).expect(422)
      ).body.detail,
    ).toMatch(/future/);
  });

  it('posts Dr goods received, Dr variance, Dr input tax, Cr payables; due after the terms; once per form', async () => {
    const key = randomUUID();
    const body = {
      supplierInvoiceNo: 'GP-1',
      taxCodeId: ids.vat,
      varianceReason: 'Price rise on the second delivery',
      idempotencyKey: key,
      lines: [
        { movementId: ids.r1, amount: '91.00' },
        { movementId: ids.r2, amount: '52.35' },
      ],
    };
    const b: Bill = (await bill('buyer', body).expect(201)).body;
    expect(b).toMatchObject({
      status: 'open',
      total: '150.52',
      balance: '150.52',
      varianceAmount: '2.35',
      taxAmount: '7.17',
      actions: ['cancel'], // the buyer cannot pay
    });
    const due = new Date(`${today}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 30);
    expect(b.dueDate).toBe(due.toISOString().slice(0, 10));
    ids.b1 = b.id;
    expect(await journalLines(b.journalNumber)).toEqual([
      ['2200', '141.00', '0.00'],
      ['5100', '2.35', '0.00'],
      ['1450', '7.17', '0.00'],
      ['2100', '0.00', '150.52'],
    ]);
    const again: Bill = (await bill('buyer', body).expect(201)).body;
    expect(again.id).toBe(b.id);
    // The same receipt or the same supplier invoice cannot be billed twice.
    expect(
      (
        await bill('buyer', {
          supplierInvoiceNo: 'GP-2',
          lines: [{ movementId: ids.r1, amount: '91.00' }],
        }).expect(409)
      ).body.detail,
    ).toMatch(/already on a bill/);
    ids.r3 = (await receipt(ids.oil!, 'DOH', '1', '20', ids.gulf!)).id;
    expect(
      (
        await bill('buyer', {
          supplierInvoiceNo: 'gp-1',
          lines: [{ movementId: ids.r3, amount: '20' }],
        }).expect(409)
      ).body.detail,
    ).toMatch(/already entered/);
    const u = (
      await a('buyer')
        .get(`${base()}/suppliers/${ids.gulf}/unbilled-receipts?branchId=${ids.DOH}`)
        .expect(200)
    ).body;
    expect(u.receipts.map((r: { movementId: string }) => r.movementId)).toEqual([ids.r3]);
    await a('viewer').get(`${base()}/supplier-bills/${b.id}`).expect(404); // other branch
    const sup = (await a('buyer').get(`${base()}/suppliers/${ids.gulf}`).expect(200)).body;
    expect(sup).toMatchObject({
      balance: '150.52',
      overdue: '0.00',
      billBranches: [{ id: ids.DOH, code: 'DOH' }],
    });
  });

  it('two bills for the same receipt at once: one posts', async () => {
    const r = await Promise.all(
      ['GP-3', 'GP-4'].map((n) =>
        bill('buyer', { supplierInvoiceNo: n, lines: [{ movementId: ids.r3, amount: '20' }] }),
      ),
    );
    expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
    ids.b3 = r.find((x) => x.status === 201)!.body.id;
  });
});

describe('payments and cancelling', () => {
  it('payments: not by the person who entered the bill (unless the owner); never more than owed', async () => {
    ids.r4 = (await receipt(ids.oil!, 'DOH', '4', '10', ids.gulf!)).id;
    const b: Bill = (
      await bill('clerk', {
        supplierInvoiceNo: 'GP-5',
        lines: [{ movementId: ids.r4, amount: '40' }],
      }).expect(201)
    ).body;
    expect(b.actions).toEqual(['cancel']);
    expect(b.payBlockedReason).toMatch(/You entered this bill/);
    await pay('clerk', b.id, { amount: '10' }).expect(403);
    await pay('buyer', ids.b1!, { amount: '10' }).expect(403); // no pay permission
    await pay('payer', ids.b1!, { amount: '10', reference: null }).expect(400); // transfer needs a reference
    expect((await pay('payer', ids.b1!, { amount: '150.53' }).expect(422)).body.detail).toMatch(
      /150.52 still owed/,
    );
    const key = randomUUID();
    let p: Bill = (await pay('payer', ids.b1!, { amount: '100', idempotencyKey: key }).expect(201)).body;
    p = (await pay('payer', ids.b1!, { amount: '100', idempotencyKey: key }).expect(201)).body;
    expect(p.payments).toHaveLength(1);
    expect(p).toMatchObject({ status: 'open', balance: '50.52' });
    const pv = await prisma.supplierPayment.findFirstOrThrow({ where: { billId: ids.b1 } });
    const pvJournal = await prisma.journal.findUniqueOrThrow({ where: { id: pv.journalId } });
    expect(await journalLines(pvJournal.number)).toEqual([
      ['2100', '100.00', '0.00'],
      ['1100', '0.00', '100.00'],
    ]);
    p = (await pay('payer', ids.b1!, { method: 'cash', reference: null, amount: '50.52' }).expect(201)).body;
    expect(p).toMatchObject({ status: 'paid', balance: '0.00', actions: [] });
    await a('buyer').post(`${base()}/supplier-bills/${ids.b1}/cancel`, { reason: 'Wrong' }).expect(409);
    // The owner may pay a bill they entered.
    await pay('admin', ids.b3!, { amount: '20' }).expect(201);
  });

  it('an unpaid bill is cancelled by reversal; its receipts can be billed again', async () => {
    const b5 = (await a('buyer').get(`${base()}/supplier-bills?status=open`).expect(200)).body.bills.find(
      (x: { supplierInvoiceNo: string }) => x.supplierInvoiceNo === 'GP-5',
    );
    await a('payer').post(`${base()}/supplier-bills/${b5.id}/cancel`, { reason: 'Wrong' }).expect(403);
    await a('buyer').post(`${base()}/supplier-bills/${b5.id}/cancel`, { reason: '' }).expect(400);
    const c = (
      await a('buyer')
        .post(`${base()}/supplier-bills/${b5.id}/cancel`, { reason: 'Entered twice' })
        .expect(201)
    ).body;
    expect(c).toMatchObject({
      status: 'cancelled',
      balance: '0.00',
      cancelReason: 'Entered twice',
      actions: [],
    });
    expect(await journalLines(c.cancelJournalNumber)).toEqual([
      ['2200', '0.00', '40.00'],
      ['2100', '40.00', '0.00'],
    ]);
    await a('buyer').post(`${base()}/supplier-bills/${b5.id}/cancel`, { reason: 'Again' }).expect(409);
    await bill('buyer', { supplierInvoiceNo: 'GP-5', lines: [{ movementId: ids.r4, amount: '40' }] }).expect(
      201,
    );
  });

  it('payables and goods received reconcile to the ledger', async () => {
    const l = (await a('buyer').get(`${base()}/supplier-bills?status=all`).expect(200)).body;
    // Open: GP-5 billed again (40.00); b1 and b3 are paid. Unbilled: the WAK and other-supplier receipts.
    expect(l.reconciliation).toMatchObject({
      openBills: '40.00',
      payablesLedger: '40.00',
      reconciled: true,
    });
    expect(l.reconciliation.unbilledReceipts).toBe(l.reconciliation.goodsReceivedLedger);
    expect(l.bills.map((b: { status: string }) => b.status).sort()).toEqual([
      'cancelled',
      'open',
      'paid',
      'paid',
    ]);
  });
});

describe('database guarantees', () => {
  it('posted bills, lines and payments never change; payments never exceed; a receipt is on one live bill', async () => {
    await expect(
      prisma.supplierBill.update({ where: { id: ids.b1 }, data: { total: '1.00' } }),
    ).rejects.toThrow(/supplier_bill_immutable/);
    await expect(
      prisma.supplierBillLine.updateMany({ where: { billId: ids.b1 }, data: { amount: '1.00' } }),
    ).rejects.toThrow(/supplier_bill_line_immutable/);
    await expect(prisma.supplierPayment.deleteMany({ where: { billId: ids.b1 } })).rejects.toThrow();
    const b = await prisma.supplierBill.findUniqueOrThrow({ where: { id: ids.b1 } });
    await expect(
      prisma.supplierPayment.create({
        data: {
          companyId,
          branchId: b.branchId,
          billId: b.id,
          number: `X-${uid()}`,
          method: 'cash',
          amount: '0.01',
          idempotencyKey: randomUUID(),
          journalId: randomUUID(),
          paidBy: b.createdBy,
        },
      }),
    ).rejects.toThrow(/supplier_payment_exceeds_balance/);
    await expect(
      prisma.supplierBillLine.create({
        data: {
          billId: ids.b1!,
          lineNo: 9,
          companyId,
          movementId: ids.r1!,
          receiptValue: '91.00',
          amount: '91.00',
        },
      }),
    ).rejects.toThrow(/supplier_bill_line_invalid/);
    await expect(
      prisma.stockMovement.findFirstOrThrow({ where: { id: ids.r1 } }).then((m) =>
        prisma.$executeRawUnsafe(
          `INSERT INTO inventory.stock_movement (company_id, branch_id, part_id, number, kind, quantity, unit_cost, value, on_hand_after, value_after, reason, idempotency_key, journal_id, created_by, supplier_id)
           VALUES ('${companyId}', '${m.branchId}', '${m.partId}', 'X-${uid()}', 'adjustment_in', 1, 1, 1, 1, 1, 'x', '${randomUUID()}', '${randomUUID()}', '${m.createdBy}', '${ids.gulf}')`,
        ),
      ),
    ).rejects.toThrow(/stock_movement_supplier/);
  });
});
