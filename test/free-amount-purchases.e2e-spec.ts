import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { PurchaseInvoiceDocument } from '../src/modules/purchases/schemas/purchase-invoice.schema';
import { ItemDocument } from '../src/modules/items/schemas/item.schema';
import { cairoPeriodRange, formatCairoDate } from '../src/shared/utils/period/cairo-period.util';
import { SalesInvoicePeriod } from '../src/shared/enums/sales-invoice-period.enum';
import { closeE2eApp, createE2eApp, E2eApp, insertAdmin } from './create-e2e-app';

jest.setTimeout(60_000);

describe('Free-amount purchases and profit (temporary replica e2e)', () => {
  let e2e: E2eApp;
  let app: INestApplication<App>;
  let auth: { Authorization: string };
  let freeId: string;
  let pieceId: string;
  let cubicId: string;
  let supplierId: string;
  let otherSupplierId: string;
  let purchases: Model<PurchaseInvoiceDocument>;
  let items: Model<ItemDocument>;

  beforeAll(async () => {
    process.env.THROTTLE_DISABLED = 'true';
    e2e = await createE2eApp();
    app = e2e.app;
    await insertAdmin(app, 'free-purchases', 'e2e-password');
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'free-purchases', password: 'e2e-password' })
      .expect(201);
    auth = { Authorization: `Bearer ${login.body.data.accessToken}` };
    const category = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(auth)
      .send({ name: 'Purchase tests' })
      .expect(201);
    for (const mode of ['free_amount', 'per_piece', 'per_cubic_meter']) {
      const result = await request(app.getHttpServer())
        .post('/api/v1/items')
        .set(auth)
        .send({
          name: mode,
          categoryId: category.body.data.id,
          pricingMode: mode,
          ...(mode === 'free_amount' ? {} : { unitPrice: 100, cost: 20, stockQuantity: 100 }),
        })
        .expect(201);
      if (mode === 'free_amount') freeId = result.body.data.id as string;
      if (mode === 'per_piece') pieceId = result.body.data.id as string;
      if (mode === 'per_cubic_meter') cubicId = result.body.data.id as string;
    }
    for (const name of ['first supplier', 'second supplier']) {
      const result = await request(app.getHttpServer()).post('/api/v1/suppliers').set(auth).send({ name }).expect(201);
      if (name === 'first supplier') supplierId = result.body.data.id as string;
      else otherSupplierId = result.body.data.id as string;
    }
    purchases = app.get(getModelToken('PurchaseInvoice'));
    items = app.get(getModelToken('Item'));
  }, 180_000);

  afterAll(async () => {
    await closeE2eApp(e2e);
  });

  const freeLine = (unitCost = 100.25) => ({ itemId: freeId, quantity: 1, unitCost, note: ' transport ' });
  const balance = async (id: string) => {
    const result = await request(app.getHttpServer()).get(`/api/v1/suppliers/${id}`).set(auth).expect(200);
    return result.body.data.amountOwed as number;
  };
  const dashboard = async (query = {}) => {
    const result = await request(app.getHttpServer()).get('/api/v1/dashboard').query(query).set(auth).expect(200);
    return result.body.data as {
      today: { estimatedProfit: number };
      periodFinancials: { sales: number; estimatedGrossProfit: number };
    };
  };

  it('preserves stock timestamps, debt, payments, snapshots and audits through edit/reassignment/cancel', async () => {
    const before = await items.findById(freeId).lean().exec();
    const stockWrite = jest.spyOn(items, 'updateOne');
    try {
      const created = await request(app.getHttpServer())
        .post('/api/v1/purchases')
        .set(auth)
        .send({ supplierId, lines: [freeLine()], paid: 20.25, accountPaymentAmount: 120 })
        .expect(201);
      const id = created.body.data.id as string;
      expect(created.body.data).toMatchObject({ total: 100.25, paid: 20.25, remaining: 80, accountPaymentAmount: 120 });
      expect(created.body.data.lines[0]).toMatchObject({
        quantity: 1,
        unitCost: 100.25,
        lineTotal: 100.25,
        note: 'transport',
        pricingModeSnapshot: 'free_amount',
        thickness: null,
        width: null,
        length: null,
      });
      expect(await balance(supplierId)).toBe(-40);
      expect((await dashboard()).today.estimatedProfit).toBe(-100.25);
      const edited = await request(app.getHttpServer())
        .patch(`/api/v1/purchases/${id}`)
        .set(auth)
        .send({ supplierId: otherSupplierId, lines: [freeLine(200.5)], paid: 50.5 })
        .expect(200);
      expect(edited.body.data.createdAt).toBe(created.body.data.createdAt);
      expect(edited.body.data.invoiceNumber).toBe(created.body.data.invoiceNumber);
      expect(await balance(supplierId)).toBe(-120);
      expect(await balance(otherSupplierId)).toBe(150);
      expect((await dashboard()).today.estimatedProfit).toBe(-200.5);
      await request(app.getHttpServer())
        .post('/api/v1/supplier-payments')
        .set(auth)
        .send({ supplierId: otherSupplierId, amount: 25 })
        .expect(201);
      expect((await dashboard()).today.estimatedProfit).toBe(-200.5);
      await request(app.getHttpServer()).post(`/api/v1/purchases/${id}/cancel`).set(auth).expect(201);
      expect(await balance(otherSupplierId)).toBe(-25);
      expect((await dashboard()).today.estimatedProfit).toBe(0);
      expect(stockWrite).not.toHaveBeenCalled();
      expect((await items.findById(freeId).lean().exec())?.updatedAt).toEqual(before?.updatedAt);
      const paymentModel = app.get<
        Model<{ purchaseInvoiceId: string; supplierId: string; amount: number; reversedAt: Date | null }>
      >(getModelToken('SupplierPayment'));
      expect(await paymentModel.findOne({ purchaseInvoiceId: id }).lean().exec()).toMatchObject({
        amount: 50.5,
        reversedAt: expect.any(Date),
      });
      expect(await paymentModel.countDocuments({ purchaseInvoiceId: null, reversedAt: null })).toBe(2);
      const audit = app.get<Model<{ entityId: string; action: string }>>(getModelToken('AuditLog'));
      const rows = await audit.find({ entityId: id }).lean().exec();
      expect(rows.map((row) => row.action)).toEqual(
        expect.arrayContaining(['purchase_created', 'purchase_updated', 'purchase_cancelled']),
      );
    } finally {
      stockWrite.mockRestore();
    }
  });

  it('handles mixed physical/free purchases and physical sales COGS without expensing restock', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set(auth)
      .send({
        supplierId,
        paid: 0,
        lines: [
          freeLine(40),
          { itemId: pieceId, quantity: 2, unitCost: 50 },
          { itemId: cubicId, quantity: 3, unitCost: 1000, thickness: 0.1, width: 0.2, length: 0.5 },
        ],
      })
      .expect(201);
    expect(result.body.data.total).toBe(170);
    expect((await items.findById(pieceId).exec())?.stockQuantity).toBe(102);
    expect((await items.findById(cubicId).exec())?.stockQuantity).toBe(100.03);
    const sale = await request(app.getHttpServer())
      .post('/api/v1/sales-invoices')
      .set(auth)
      .send({ type: 'cash_sale', paid: 100, lines: [{ itemId: pieceId, quantity: 1, piecePrice: 100 }] })
      .expect(201);
    expect((await dashboard()).today.estimatedProfit).toBe(40);
    await request(app.getHttpServer())
      .patch(`/api/v1/purchases/${result.body.data.id}`)
      .set(auth)
      .send({ supplierId, lines: [freeLine(60)], paid: 0 })
      .expect(200);
    expect((await items.findById(pieceId).exec())?.stockQuantity).toBe(99);
    expect((await items.findById(cubicId).exec())?.stockQuantity).toBe(100);
    expect((await dashboard()).today.estimatedProfit).toBe(20);
    await request(app.getHttpServer()).post(`/api/v1/purchases/${result.body.data.id}/cancel`).set(auth).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/sales-invoices/${sale.body.data.id}/cancel`).set(auth).expect(201);
  });

  it.each([
    { quantity: 2 },
    { quantity: 0 },
    { width: 1 },
    { length: null },
    { thickness: 1 },
    { unitCost: 0 },
    { unitCost: -1 },
    { unitCost: 1.234 },
    { unitCost: null },
    { unitCost: '100' },
  ])('rejects invalid create and edit %j', async (override) => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/api/v1/purchases')
      .set(auth)
      .send({ supplierId, lines: [freeLine()] })
      .expect(201);
    const body = { supplierId, paid: 0, lines: [{ ...freeLine(), ...override }] };
    await request(server).post('/api/v1/purchases').set(auth).send(body).expect(400);
    await request(server).patch(`/api/v1/purchases/${created.body.data.id}`).set(auth).send(body).expect(400);
    expect((await purchases.findById(created.body.data.id).exec())?.total).toBe(100.25);
    await request(server).post(`/api/v1/purchases/${created.body.data.id}/cancel`).set(auth).expect(201);
  });

  it('rolls back invoice, supplier, linked/independent payments, stock and audit when auditing fails', async () => {
    const { AuditService: RuntimeAuditService } = jest.requireActual<
      typeof import('../src/modules/audit/audit.service')
    >('../src/modules/audit/audit.service');
    const audit = app.get<AuditService>(RuntimeAuditService);
    const originalBalance = await balance(supplierId);
    const originalStock = (await items.findById(pieceId).exec())?.stockQuantity;
    const payments = app.get<Model<object>>(getModelToken('SupplierPayment'));
    const initialPayments = await payments.countDocuments();
    const initialPurchases = await purchases.countDocuments();
    const auditModel = app.get<Model<object>>(getModelToken('AuditLog'));
    const initialAudits = await auditModel.countDocuments();
    const spy = jest.spyOn(audit, 'log').mockRejectedValueOnce(new Error('forced audit failure'));
    try {
      await request(app.getHttpServer())
        .post('/api/v1/purchases')
        .set(auth)
        .send({
          supplierId,
          paid: 20,
          accountPaymentAmount: 30,
          lines: [freeLine(), { itemId: pieceId, quantity: 2, unitCost: 10 }],
        })
        .expect(500);
    } finally {
      spy.mockRestore();
    }
    expect(await balance(supplierId)).toBe(originalBalance);
    expect(await purchases.countDocuments()).toBe(initialPurchases);
    expect(await payments.countDocuments()).toBe(initialPayments);
    expect(await auditModel.countDocuments()).toBe(initialAudits);
    expect((await items.findById(pieceId).exec())?.stockQuantity).toBe(originalStock);
  });

  it('reports 3000 free-amount sales minus 2000 unpaid free-amount purchases as 1000 profit', async () => {
    const sale = await request(app.getHttpServer())
      .post('/api/v1/sales-invoices')
      .set(auth)
      .send({ type: 'cash_sale', paid: 3000, lines: [{ itemId: freeId, quantity: 1, piecePrice: 3000 }] })
      .expect(201);
    const purchase = await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set(auth)
      .send({ supplierId, lines: [freeLine(2000)], paid: 0 })
      .expect(201);
    expect(purchase.body.data.remaining).toBe(2000);
    const result = await dashboard();
    expect(result.today.estimatedProfit).toBe(1000);
    expect(result.periodFinancials).toEqual({ sales: 3000, estimatedGrossProfit: 1000 });
    await request(app.getHttpServer()).post(`/api/v1/purchases/${purchase.body.data.id}/cancel`).set(auth).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/sales-invoices/${sale.body.data.id}/cancel`).set(auth).expect(201);
  });

  it('attributes expenses to half-open Cairo invoice dates, including inclusive custom ranges', async () => {
    const { from, to } = cairoPeriodRange(SalesInvoicePeriod.DAY, '2026-10-29');
    const dates = [new Date(from.getTime() - 1), from, new Date(to.getTime() - 1), to];
    const ids: string[] = [];
    for (let index = 0; index < dates.length; index++) {
      const created = await request(app.getHttpServer())
        .post('/api/v1/purchases')
        .set(auth)
        .send({ supplierId, lines: [freeLine((index + 1) * 10)] })
        .expect(201);
      const id = created.body.data.id as string;
      ids.push(id);
      await purchases.collection.updateOne(
        { _id: (await purchases.findById(id).exec())!._id },
        { $set: { createdAt: dates[index] } },
      );
    }
    expect((await dashboard({ period: 'day', date: '2026-10-29' })).periodFinancials.estimatedGrossProfit).toBe(-50);
    expect((await dashboard({ from: '2026-10-29', to: '2026-10-29' })).periodFinancials.estimatedGrossProfit).toBe(-50);
    expect((await dashboard({ period: 'month', date: '2026-10-29' })).periodFinancials.estimatedGrossProfit).toBe(-100);
    expect((await dashboard()).today.estimatedProfit).toBe(formatCairoDate(new Date()) === '2026-10-29' ? -50 : 0);
    for (const id of ids)
      await request(app.getHttpServer()).post(`/api/v1/purchases/${id}/cancel`).set(auth).expect(201);
    expect((await dashboard({ period: 'day', date: '2026-10-29' })).periodFinancials.estimatedGrossProfit).toBe(0);
  });
});
