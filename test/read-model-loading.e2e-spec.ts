import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { closeE2eApp, createE2eApp, E2eApp, insertAdmin } from './create-e2e-app';

describe('Page read models and historical payment reversal (e2e)', () => {
  let e2e: E2eApp;
  let app: INestApplication<App>;
  let auth: { Authorization: string };
  let categoryId: string;
  let itemId: string;
  const model = (name: string) => app.get<Model<Record<string, unknown>>>(getModelToken(name));
  const post = (route: string, body: object) =>
    request(app.getHttpServer()).post(`/api/v1/${route}`).set(auth).send(body);
  const get = (route: string) => request(app.getHttpServer()).get(`/api/v1/${route}`).set(auth);
  const invoiceBody = (sales: boolean, partyId: string, ids = [itemId]) => ({
    ...(sales ? { type: 'customer_sale', customerId: partyId } : { supplierId: partyId }),
    lines: ids.map((id) => ({ itemId: id, quantity: 1, [sales ? 'piecePrice' : 'unitCost']: 100 })),
    paid: 0,
  });

  beforeAll(async () => {
    process.env.THROTTLE_DISABLED = 'true';
    e2e = await createE2eApp();
    app = e2e.app;
    await insertAdmin(app, 'read-models', 'e2e-password');
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'read-models', password: 'e2e-password' })
      .expect(201);
    auth = { Authorization: `Bearer ${login.body.data.accessToken}` };
    categoryId = (await post('categories', { name: 'Read model wood' }).expect(201)).body.data.id as string;
    itemId = (
      await post('items', {
        name: 'Read model plank',
        categoryId,
        pricingMode: 'per_piece',
        unitPrice: 100,
        cost: 50,
        stockQuantity: 100,
      }).expect(201)
    ).body.data.id as string;
  }, 180_000);

  afterAll(async () => {
    await closeE2eApp(e2e);
  });

  it.each(['payments', 'supplier-payments', 'purchases', 'sales-invoices'])(
    '%s resolves current names in a bounded batch and preserves filtered pagination',
    async (route) => {
      const sales = route === 'payments' || route === 'sales-invoices';
      const payment = route.endsWith('payments');
      const parties = sales ? 'customers' : 'suppliers';
      const partyModel = model(sales ? 'Customer' : 'Supplier');
      const partyKey = sales ? 'customerId' : 'supplierId';
      const nameKey = sales ? 'customerName' : 'supplierName';
      const partyId = (await post(parties, { name: `${route} original` }).expect(201)).body.data.id as string;
      for (let index = 0; index < 3; index++) {
        await post(route, payment ? { [partyKey]: partyId, amount: 5 } : invoiceBody(sales, partyId)).expect(201);
      }
      await partyModel.updateOne({ _id: partyId }, { $set: { name: `${route} renamed`, isActive: false } });
      const find = jest.spyOn(partyModel, 'find');
      try {
        const page = await get(route)
          .query({ [partyKey]: partyId, limit: 2, page: 1 })
          .expect(200);
        expect(page.body.data.meta).toMatchObject({ total: 3, page: 1, limit: 2 });
        expect(page.body.data.items).toHaveLength(2);
        for (const row of page.body.data.items as Record<string, unknown>[]) {
          expect(row[nameKey]).toBe(`${route} renamed`);
        }
        expect(find).toHaveBeenCalledTimes(1);
        const filter = find.mock.calls[0][0] as unknown as { _id: { $in: unknown[] }; isDeleted: boolean };
        expect(filter.isDeleted).toBe(false);
        expect(filter._id.$in.map(String)).toEqual([partyId]);
        const query = find.mock.results[0].value;
        expect(query.projection()).toEqual({ _id: 1, name: 1 });
        expect(query.mongooseOptions().lean).toBe(true);
        find.mockClear();
        const empty = await get(route)
          .query({ [partyKey]: partyId, page: 3, limit: 2 })
          .expect(200);
        expect(empty.body.data.items).toEqual([]);
        expect(empty.body.data.meta.total).toBe(3);
        expect(find).not.toHaveBeenCalled();
      } finally {
        find.mockRestore();
      }
      await partyModel.updateOne({ _id: partyId }, { $set: { isDeleted: true } });
      const deleted = await get(route)
        .query({ [partyKey]: partyId })
        .expect(200);
      for (const row of deleted.body.data.items as Record<string, unknown>[]) expect(row[nameKey]).toBeNull();
      // A dangling historical reference is simulated only inside this disposable database.
      const rowModel = model(
        route === 'payments'
          ? 'Payment'
          : route === 'supplier-payments'
            ? 'SupplierPayment'
            : sales
              ? 'SalesInvoice'
              : 'PurchaseInvoice',
      );
      const missingId = new Types.ObjectId();
      await rowModel.updateMany({ [partyKey]: partyId }, { $set: { [partyKey]: missingId } });
      const missing = await get(route)
        .query({ [partyKey]: missingId.toString() })
        .expect(200);
      expect(missing.body.data.items).toHaveLength(3);
      for (const row of missing.body.data.items as Record<string, unknown>[]) expect(row[nameKey]).toBeNull();
    },
  );

  it.each(['sales-invoices', 'purchases'])(
    '%s details load only referenced nondeleted items and a basic account',
    async (route) => {
      const sales = route === 'sales-invoices';
      const partyId = (await post(sales ? 'customers' : 'suppliers', { name: `${route} detail party` }).expect(201))
        .body.data.id as string;
      const ids: string[] = [];
      for (const name of ['active reference', 'inactive reference', 'deleted reference', 'unreferenced']) {
        ids.push(
          (
            await post('items', {
              name: `${route} ${name}`,
              categoryId,
              pricingMode: 'per_piece',
              unitPrice: 100,
              cost: 40,
            }).expect(201)
          ).body.data.id as string,
        );
      }
      const invoice = await post(route, invoiceBody(sales, partyId, ids.slice(0, 3))).expect(201);
      expect(invoice.body.data).not.toHaveProperty(sales ? 'customer' : 'supplier');
      expect(invoice.body.data).not.toHaveProperty('items');
      await model('Item').updateOne({ _id: ids[1] }, { $set: { isActive: false } });
      await model('Item').updateOne({ _id: ids[2] }, { $set: { isDeleted: true, isActive: false } });
      const partyModel = model(sales ? 'Customer' : 'Supplier');
      await partyModel.updateOne({ _id: partyId }, { $set: { name: 'Current detail name', isActive: false } });
      const find = jest.spyOn(model('Item'), 'find');
      try {
        const detail = await get(`${route}/${invoice.body.data.id}`).expect(200);
        expect(detail.body.data[sales ? 'customer' : 'supplier']).toMatchObject({
          id: partyId,
          name: 'Current detail name',
          isActive: false,
        });
        expect(detail.body.data[sales ? 'customer' : 'supplier']).not.toHaveProperty('financialSummary');
        expect(detail.body.data.items).toHaveLength(2);
        expect(detail.body.data.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: ids[0],
              unitPrice: 100,
              cost: 40,
              category: expect.objectContaining({ id: categoryId }),
              pricingMode: 'per_piece',
              isActive: true,
            }),
            expect.objectContaining({ id: ids[1], unitPrice: 100, cost: 40, isActive: false }),
          ]),
        );
        expect(find).toHaveBeenCalledTimes(1);
        const filter = find.mock.calls[0][0] as unknown as { _id: { $in: unknown[] }; isDeleted: boolean };
        expect(filter.isDeleted).toBe(false);
        expect(filter._id.$in.map(String).sort()).toEqual(ids.slice(0, 3).sort());
      } finally {
        find.mockRestore();
      }
      await partyModel.updateOne({ _id: partyId }, { $set: { isDeleted: true } });
      expect(
        (await get(`${route}/${invoice.body.data.id}`).expect(200)).body.data[sales ? 'customer' : 'supplier'],
      ).toBeNull();
      await model(sales ? 'SalesInvoice' : 'PurchaseInvoice').updateOne(
        { _id: invoice.body.data.id },
        { $set: { [sales ? 'customerId' : 'supplierId']: new Types.ObjectId() } },
      );
      expect(
        (await get(`${route}/${invoice.body.data.id}`).expect(200)).body.data[sales ? 'customer' : 'supplier'],
      ).toBeNull();
    },
  );

  it.each(['sales-invoices', 'purchases'])('%s details tolerate an orphaned item category', async (route) => {
    const sales = route === 'sales-invoices';
    const category = await post('categories', { name: `${route} orphan category` }).expect(201);
    const item = await post('items', {
      name: `${route} orphan item`,
      categoryId: category.body.data.id,
      pricingMode: 'per_piece',
      unitPrice: 100,
      cost: 40,
    }).expect(201);
    const party = await post(sales ? 'customers' : 'suppliers', { name: `${route} orphan account` }).expect(201);
    const invoice = await post(
      route,
      invoiceBody(sales, party.body.data.id as string, [item.body.data.id as string]),
    ).expect(201);
    // Simulate a legacy dangling reference only in this disposable database.
    await model('Category').deleteOne({ _id: category.body.data.id });

    const detail = await get(`${route}/${invoice.body.data.id}`).expect(200);
    expect(detail.body.data.items[0]).toMatchObject({
      id: item.body.data.id,
      category: { id: category.body.data.id, name: '' },
    });
  });

  it('category counts are opt-in, include inactive/free-amount items, and exclude deleted items', async () => {
    const id = (await post('categories', { name: 'Count fixture' }).expect(201)).body.data.id as string;
    const emptyId = (await post('categories', { name: 'Empty count fixture' }).expect(201)).body.data.id as string;
    for (const [index, pricingMode] of ['per_piece', 'per_piece', 'free_amount', 'per_piece'].entries()) {
      const item = await post('items', {
        name: `Count ${index}`,
        categoryId: id,
        pricingMode,
        ...(pricingMode === 'free_amount' ? {} : { unitPrice: 10, cost: 5 }),
      }).expect(201);
      if (index === 1) await model('Item').updateOne({ _id: item.body.data.id }, { $set: { isActive: false } });
      if (index === 3) await model('Item').updateOne({ _id: item.body.data.id }, { $set: { isDeleted: true } });
    }
    const aggregate = jest.spyOn(model('Item'), 'aggregate');
    try {
      const ordinary = await get('categories').expect(200);
      expect(ordinary.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id })]));
      for (const row of ordinary.body.data as Record<string, unknown>[]) expect(row).not.toHaveProperty('itemCount');
      expect(aggregate).not.toHaveBeenCalled();
      const counted = await get('categories').query({ includeItemCount: true }).expect(200);
      expect(counted.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id, itemCount: 3 }),
          expect.objectContaining({ id: emptyId, itemCount: 0 }),
        ]),
      );
      expect(aggregate).toHaveBeenCalledTimes(1);
    } finally {
      aggregate.mockRestore();
    }
    await get('categories').query({ includeItemCount: 'invalid' }).expect(400);
  });

  it('cash-sale details include a null customer and only the referenced item', async () => {
    const created = await post('sales-invoices', {
      type: 'cash_sale',
      lines: [{ itemId, quantity: 1, piecePrice: 100 }],
      paid: 100,
    }).expect(201);
    const detail = await get(`sales-invoices/${created.body.data.id}`).expect(200);
    expect(detail.body.data.customer).toBeNull();
    expect(detail.body.data.items).toEqual([expect.objectContaining({ id: itemId, pricingMode: 'per_piece' })]);
    const cancelled = await post(`sales-invoices/${created.body.data.id}/cancel`, {}).expect(201);
    expect(cancelled.body.data).not.toHaveProperty('customer');
    expect(cancelled.body.data).not.toHaveProperty('items');
  });

  it('debtor summary uses the same search, active, and debt filters before pagination', async () => {
    for (const [name, balance, isActive] of [
      ['Summary fixture alpha', 100, true],
      ['Summary fixture beta', 50, false],
      ['Summary fixture zero', 0, true],
      ['Summary fixture credit', -20, true],
      ['Other fixture debtor', 300, true],
    ] as const) {
      const created = await post('customers', { name, balance }).expect(201);
      if (!isActive) await model('Customer').updateOne({ _id: created.body.data.id }, { $set: { isActive } });
    }
    const page = await get('customers').query({ q: 'Summary fixture', limit: 1, page: 2 }).expect(200);
    expect(page.body.data.meta).toMatchObject({ total: 4, page: 2, limit: 1 });
    expect(page.body.data.summary).toMatchObject({ totalDebt: 130, debtorCount: 2 });
    expect(
      (await get('customers').query({ q: 'Summary fixture', isActive: true }).expect(200)).body.data.summary,
    ).toMatchObject({ totalDebt: 80, debtorCount: 1 });
    expect(
      (await get('customers').query({ q: 'Summary fixture', hasDebt: false }).expect(200)).body.data.summary,
    ).toMatchObject({ totalDebt: 130, debtorCount: 2 });
    expect(
      (await get('customers').query({ q: 'Summary fixture', hasDebt: true }).expect(200)).body.data.summary,
    ).toMatchObject({ totalDebt: 150, debtorCount: 2 });
    expect(
      (await get('customers').query({ q: 'Summary fixture credit', hasDebt: true }).expect(200)).body.data.summary,
    ).toMatchObject({ totalDebt: 0, debtorCount: 0 });
    expect(
      (await get('customers').query({ q: 'No matching debtor fixture' }).expect(200)).body.data.summary,
    ).toMatchObject({ totalDebt: 0, debtorCount: 0 });
  });

  async function deletedCustomerPayment() {
    const customerId = (await post('customers', { name: 'Historical cancellation', balance: 25 }).expect(201)).body.data
      .id as string;
    const payment = await post('payments', { customerId, amount: 25 }).expect(201);
    await request(app.getHttpServer()).delete(`/api/v1/customers/${customerId}`).set(auth).expect(200);
    return { customerId, paymentId: payment.body.data.id as string };
  }

  it('reverses a standalone payment after customer deletion without restoring the account', async () => {
    const { customerId, paymentId } = await deletedCustomerPayment();
    const cancelled = await post(`payments/${paymentId}/cancel`, {}).expect(201);
    expect(cancelled.body.data.reversedAt).toEqual(expect.any(String));
    expect(cancelled.body.data.reversedBy).toEqual(expect.any(String));
    expect(await model('Customer').findById(customerId).lean()).toMatchObject({
      balance: 25,
      isDeleted: true,
      isActive: false,
    });
    const logs = await model('AuditLog').find({ action: 'payment_cancelled', entityId: paymentId }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0].changes).toMatchObject({ balance: { old: 0, new: 25 } });
    await post(`payments/${paymentId}/cancel`, {}).expect(400);
    expect(await model('Customer').findById(customerId).lean()).toMatchObject({ balance: 25 });
    expect(await model('AuditLog').countDocuments({ action: 'payment_cancelled', entityId: paymentId })).toBe(1);
  });

  it('rolls back cancellation when the account is missing', async () => {
    const { paymentId } = await deletedCustomerPayment();
    await model('Payment').updateOne({ _id: paymentId }, { $set: { customerId: new Types.ObjectId() } });
    await post(`payments/${paymentId}/cancel`, {}).expect(404);
    expect(await model('Payment').findById(paymentId).lean()).toMatchObject({ reversedAt: null, reversedBy: null });
    expect(await model('AuditLog').countDocuments({ action: 'payment_cancelled', entityId: paymentId })).toBe(0);
  });

  it('rolls back historical cancellation balance and reversal when audit fails', async () => {
    const { customerId, paymentId } = await deletedCustomerPayment();
    const { AuditService } = jest.requireActual<typeof import('../src/modules/audit/audit.service')>(
      '../src/modules/audit/audit.service',
    );
    const audit = app.get(AuditService);
    const original = audit.log.bind(audit);
    const spy = jest.spyOn(audit, 'log').mockImplementation(async (dto, session) => {
      if (dto.action === 'payment_cancelled') throw new Error('Injected cancellation audit failure');
      return await original(dto, session);
    });
    try {
      await post(`payments/${paymentId}/cancel`, {}).expect(500);
    } finally {
      spy.mockRestore();
    }
    expect(await model('Customer').findById(customerId).lean()).toMatchObject({
      balance: 0,
      isDeleted: true,
      isActive: false,
    });
    expect(await model('Payment').findById(paymentId).lean()).toMatchObject({ reversedAt: null, reversedBy: null });
    expect(await model('AuditLog').countDocuments({ action: 'payment_cancelled', entityId: paymentId })).toBe(0);
  });

  it('still rejects direct reversal of an invoice-linked customer payment', async () => {
    const customerId = (await post('customers', { name: 'Linked payment fixture' }).expect(201)).body.data.id as string;
    const invoice = await post('sales-invoices', { ...invoiceBody(true, customerId), paid: 20 }).expect(201);
    const linked = await model('Payment').findOne({ invoiceId: invoice.body.data.id }).lean();
    expect(linked).not.toBeNull();
    await post(`payments/${String(linked!._id)}/cancel`, {}).expect(400);
    expect(await model('Customer').findById(customerId).lean()).toMatchObject({ balance: 80 });
    expect(await model('Payment').findById(linked!._id).lean()).toMatchObject({ reversedAt: null });
  });
});
