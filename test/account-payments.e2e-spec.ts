import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { closeE2eApp, createE2eApp, E2eApp, insertAdmin } from './create-e2e-app';

describe('Independent account payments (e2e)', () => {
  let e2e: E2eApp;
  let app: INestApplication<App>;
  let auth: { Authorization: string };
  let itemId: string;
  beforeAll(async () => {
    process.env.THROTTLE_DISABLED = 'true';
    e2e = await createE2eApp();
    app = e2e.app;
    await insertAdmin(app, 'accounts', 'e2e-password');
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'accounts', password: 'e2e-password' })
      .expect(201);
    auth = { Authorization: `Bearer ${login.body.data.accessToken}` };
    const category = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(auth)
      .send({ name: 'Accounts wood' })
      .expect(201);
    const item = await request(app.getHttpServer())
      .post('/api/v1/items')
      .set(auth)
      .send({
        name: 'Plank',
        categoryId: category.body.data.id,
        pricingMode: 'per_piece',
        unitPrice: 100,
        cost: 50,
        stockQuantity: 100,
      })
      .expect(201);
    itemId = item.body.data.id as string;
  }, 180_000);
  afterAll(async () => {
    await closeE2eApp(e2e);
  });
  it.each(['sales', 'purchases'])('%s preserves independent payments through edits and cancellation', async (kind) => {
    const sales = kind === 'sales';
    const parties = sales ? 'customers' : 'suppliers';
    const invoices = sales ? 'sales-invoices' : 'purchases';
    const balance = sales ? 'balance' : 'amountOwed';
    const partyKey = sales ? 'customerId' : 'supplierId';
    const server = app.getHttpServer();
    const first = await request(server)
      .post(`/api/v1/${parties}`)
      .set(auth)
      .send({ name: `${kind} original` })
      .expect(201);
    const second = await request(server)
      .post(`/api/v1/${parties}`)
      .set(auth)
      .send({ name: `${kind} new` })
      .expect(201);
    const partyId = first.body.data.id as string;
    const nextId = second.body.data.id as string;
    const body = {
      ...(sales ? { type: 'customer_sale' } : {}),
      [partyKey]: partyId,
      lines: [{ itemId, quantity: 1, [sales ? 'piecePrice' : 'unitCost']: 100 }],
      paid: 20,
    };
    const created = await request(server)
      .post(`/api/v1/${invoices}`)
      .set(auth)
      .send({ ...body, accountPaymentAmount: 120 })
      .expect(201);
    const invoiceId = created.body.data.id as string;
    expect(created.body.data).toMatchObject({ paid: 20, remaining: 80, accountPaymentAmount: 120 });
    expect((await request(server).get(`/api/v1/${parties}/${partyId}`).set(auth)).body.data[balance]).toBe(-40);
    const unchanged = await request(server).patch(`/api/v1/${invoices}/${invoiceId}`).set(auth).send(body).expect(200);
    expect(unchanged.body.data.accountPaymentAmount).toBe(120);
    expect((await request(server).get(`/api/v1/${parties}/${partyId}`).set(auth)).body.data[balance]).toBe(-40);
    const reassignedWithoutExtra = await request(server)
      .patch(`/api/v1/${invoices}/${invoiceId}`)
      .set(auth)
      .send({ ...body, [partyKey]: nextId })
      .expect(200);
    expect(reassignedWithoutExtra.body.data.accountPaymentAmount).toBe(0);
    const reassigned = await request(server)
      .patch(`/api/v1/${invoices}/${invoiceId}`)
      .set(auth)
      .send({ ...body, [partyKey]: nextId, accountPaymentAmount: 100 })
      .expect(200);
    expect(reassigned.body.data.accountPaymentAmount).toBe(100);
    expect(
      (await request(server).get(`/api/v1/${invoices}/${invoiceId}`).set(auth)).body.data.accountPaymentAmount,
    ).toBe(100);
    const listed = await request(server)
      .get(`/api/v1/${invoices}`)
      .query({ q: created.body.data.invoiceNumber })
      .set(auth)
      .expect(200);
    expect(listed.body.data.items[0].accountPaymentAmount).toBe(100);
    expect((await request(server).get(`/api/v1/${parties}/${partyId}`).set(auth)).body.data[balance]).toBe(-120);
    expect((await request(server).get(`/api/v1/${parties}/${nextId}`).set(auth)).body.data[balance]).toBe(-20);
    const cancelledInvoice = await request(server)
      .post(`/api/v1/${invoices}/${invoiceId}/cancel`)
      .set(auth)
      .expect(201);
    expect(cancelledInvoice.body.data.accountPaymentAmount).toBe(100);
    expect((await request(server).get(`/api/v1/${parties}/${nextId}`).set(auth)).body.data[balance]).toBe(-100);
    const rows = await app
      .get<Model<{ amount: number; reversedAt: Date | null }>>(getModelToken(sales ? 'Payment' : 'SupplierPayment'))
      .find({ [partyKey]: partyId, [sales ? 'invoiceId' : 'purchaseInvoiceId']: null })
      .lean()
      .exec();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 120, reversedAt: null });
    const paymentRoute = sales ? 'payments' : 'supplier-payments';
    const sourceField = sales ? 'sourceInvoiceId' : 'sourcePurchaseInvoiceId';
    const paymentDetail = await request(server)
      .get(`/api/v1/${paymentRoute}/${rows[0]._id.toString()}`)
      .set(auth)
      .expect(200);
    expect(paymentDetail.body.data).toMatchObject({ [sourceField]: invoiceId, amount: 120 });
    expect(
      String((rows[0] as unknown as Record<string, unknown>)[sales ? 'sourceInvoiceId' : 'sourcePurchaseInvoiceId']),
    ).toBe(invoiceId);
    await request(server)
      .post(`/api/v1/${sales ? 'payments' : 'supplier-payments'}/${rows[0]._id.toString()}/cancel`)
      .set(auth)
      .expect(201);
    expect((await request(server).get(`/api/v1/${parties}/${partyId}`).set(auth)).body.data[balance]).toBe(0);

    // Existing credit offsets account debt without allocating invoice payment.
    const future = await request(server)
      .post(`/api/v1/${invoices}`)
      .set(auth)
      .send({ ...body, [partyKey]: nextId, paid: 0 })
      .expect(201);
    expect(future.body.data).toMatchObject({ paid: 0, remaining: 100 });
    const detail = await request(server).get(`/api/v1/${parties}/${nextId}`).set(auth).expect(200);
    expect(detail.body.data).toMatchObject({
      [balance]: 0,
      financialSummary: { totalInvoiced: 100, totalPaid: 100 },
    });
    expect(future.body.data.accountPaymentAmount).toBe(0);
    const currentExtra = await app
      .get<Model<{ amount: number }>>(getModelToken(sales ? 'Payment' : 'SupplierPayment'))
      .findOne({ [partyKey]: nextId, [sales ? 'sourceInvoiceId' : 'sourcePurchaseInvoiceId']: invoiceId })
      .exec();
    expect(currentExtra).not.toBeNull();
    await request(server)
      .post(`/api/v1/${sales ? 'payments' : 'supplier-payments'}/${currentExtra!._id.toString()}/cancel`)
      .set(auth)
      .expect(201);
    expect(
      (await request(server).get(`/api/v1/${invoices}/${invoiceId}`).set(auth)).body.data.accountPaymentAmount,
    ).toBe(0);
  });
  it.each(['sales', 'purchases'])(
    '%s sums active origin payments, excludes unrelated and legacy rows',
    async (kind) => {
      const sales = kind === 'sales';
      const parties = sales ? 'customers' : 'suppliers';
      const invoices = sales ? 'sales-invoices' : 'purchases';
      const payments = sales ? 'payments' : 'supplier-payments';
      const partyKey = sales ? 'customerId' : 'supplierId';
      const server = app.getHttpServer();
      const party = await request(server)
        .post(`/api/v1/${parties}`)
        .set(auth)
        .send({ name: `${kind} sum extras` })
        .expect(201);
      const partyId = party.body.data.id as string;
      const body = {
        ...(sales ? { type: 'customer_sale' } : {}),
        [partyKey]: partyId,
        lines: [{ itemId, quantity: 1, [sales ? 'piecePrice' : 'unitCost']: 100 }],
        paid: 20,
      };
      const created = await request(server)
        .post(`/api/v1/${invoices}`)
        .set(auth)
        .send({ ...body, accountPaymentAmount: 20 })
        .expect(201);
      const id = created.body.data.id as string;
      // An ordinary standalone payment has no provenance and cannot be attributed to this invoice.
      await request(server)
        .post(`/api/v1/${payments}`)
        .set(auth)
        .send({ [partyKey]: partyId, amount: 7 })
        .expect(201);
      const edited = await request(server)
        .patch(`/api/v1/${invoices}/${id}`)
        .set(auth)
        .send({ ...body, accountPaymentAmount: 30 })
        .expect(200);
      expect(edited.body.data.accountPaymentAmount).toBe(50);
      const extraInvoice = await request(server).post(`/api/v1/${invoices}`).set(auth).send(body).expect(201);
      const extras = app.get<Model<{ amount: number; reversedAt: Date | null }>>(
        getModelToken(sales ? 'Payment' : 'SupplierPayment'),
      );
      const aggregation = jest.spyOn(extras, 'aggregate');
      try {
        const page = await request(server).get(`/api/v1/${invoices}`).query({ limit: 100 }).set(auth).expect(200);
        expect(page.body.data.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id, accountPaymentAmount: 50 }),
            expect.objectContaining({ id: extraInvoice.body.data.id, accountPaymentAmount: 0 }),
          ]),
        );
        expect(aggregation).toHaveBeenCalledTimes(1);
      } finally {
        aggregation.mockRestore();
      }
      const first = await extras
        .findOne({ [sales ? 'sourceInvoiceId' : 'sourcePurchaseInvoiceId']: id, amount: 20 })
        .exec();
      expect(first).not.toBeNull();
      await request(server).post(`/api/v1/${payments}/${first!._id.toString()}/cancel`).set(auth).expect(201);
      expect((await request(server).get(`/api/v1/${invoices}/${id}`).set(auth)).body.data.accountPaymentAmount).toBe(
        30,
      );
      if (sales) {
        const receipt = await request(server).get(`/api/v1/sales-invoices/${id}/receipt`).set(auth).expect(200);
        expect(receipt.body.data).toMatchObject({ paid: 20, accountPaymentAmount: 30 });
        await request(server).get(`/api/v1/sales-invoices/${id}/share`).set(auth).expect(200);
        const invoice = await app
          .get<Model<{ pdfShareToken: string }>>(getModelToken('SalesInvoice'))
          .findById(id)
          .exec();
        const publicReceipt = await request(server)
          .get(`/api/v1/public/sales-invoices/${invoice!.pdfShareToken}`)
          .expect(200);
        expect(publicReceipt.body.data).toMatchObject({ paid: 20, accountPaymentAmount: 30 });
      }
      // Historical extra rows without a source marker are never inferred from timing or account.
      await extras.updateMany(
        { [sales ? 'sourceInvoiceId' : 'sourcePurchaseInvoiceId']: id },
        { $unset: { [sales ? 'sourceInvoiceId' : 'sourcePurchaseInvoiceId']: '' } },
      );
      expect((await request(server).get(`/api/v1/${invoices}/${id}`).set(auth)).body.data.accountPaymentAmount).toBe(0);
    },
  );
  it('cash invoice response and receipt have zero account payment', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/api/v1/sales-invoices')
      .set(auth)
      .send({ type: 'cash_sale', lines: [{ itemId, quantity: 1, piecePrice: 100 }], paid: 100 })
      .expect(201);
    expect(created.body.data.accountPaymentAmount).toBe(0);
    expect(
      (await request(server).get(`/api/v1/sales-invoices/${created.body.data.id}/receipt`).set(auth)).body.data
        .accountPaymentAmount,
    ).toBe(0);
  });
  it.each(['customers', 'suppliers'])(
    '%s accepts standalone prepayments on zero and credit accounts',
    async (parties) => {
      const sales = parties === 'customers';
      const server = app.getHttpServer();
      const party = await request(server)
        .post(`/api/v1/${parties}`)
        .set(auth)
        .send({ name: `${parties} prepay` })
        .expect(201);
      const id = party.body.data.id as string;
      for (let i = 0; i < 2; i++)
        await request(server)
          .post(`/api/v1/${sales ? 'payments' : 'supplier-payments'}`)
          .set(auth)
          .send({ [sales ? 'customerId' : 'supplierId']: id, amount: 25 })
          .expect(201);
      expect(
        (await request(server).get(`/api/v1/${parties}/${id}`).set(auth)).body.data[sales ? 'balance' : 'amountOwed'],
      ).toBe(-50);
    },
  );
  it('rejects positive cash-sale extras and invalid account money', async () => {
    for (const accountPaymentAmount of [1, -1, 0.001, null])
      await request(app.getHttpServer())
        .post('/api/v1/sales-invoices')
        .set(auth)
        .send({ type: 'cash_sale', lines: [{ itemId, quantity: 1, piecePrice: 100 }], paid: 100, accountPaymentAmount })
        .expect(400);
    await request(app.getHttpServer()).get('/api/v1/sales-invoices?customerId=invalid').set(auth).expect(400);
  });
  it('rolls back invoice, stock, balance and payments if payment audit fails', async () => {
    const server = app.getHttpServer();
    const party = await request(server)
      .post('/api/v1/customers')
      .set(auth)
      .send({ name: 'Rollback account' })
      .expect(201);
    const customerId = party.body.data.id as string;
    const { AuditService } = jest.requireActual<typeof import('../src/modules/audit/audit.service')>(
      '../src/modules/audit/audit.service',
    );
    const audit = app.get(AuditService);
    const original = audit.log.bind(audit);
    const spy = jest.spyOn(audit, 'log').mockImplementation(async (dto, session) => {
      if (dto.action === 'payment_recorded') throw new Error('Injected account audit failure');
      return await original(dto, session);
    });
    const before = await request(server).get(`/api/v1/items/${itemId}`).set(auth);
    try {
      await request(server)
        .post('/api/v1/sales-invoices')
        .set(auth)
        .send({
          type: 'customer_sale',
          customerId,
          lines: [{ itemId, quantity: 1, piecePrice: 100 }],
          paid: 20,
          accountPaymentAmount: 120,
        })
        .expect(500);
    } finally {
      spy.mockRestore();
    }
    expect((await request(server).get(`/api/v1/items/${itemId}`).set(auth)).body.data.stockQuantity).toBe(
      before.body.data.stockQuantity,
    );
    expect((await request(server).get(`/api/v1/customers/${customerId}`).set(auth)).body.data.balance).toBe(0);
    for (const model of ['Payment', 'SalesInvoice'])
      expect(await app.get<Model<object>>(getModelToken(model)).countDocuments({ customerId })).toBe(0);
  });
});
