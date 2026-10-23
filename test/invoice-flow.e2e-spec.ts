import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { closeE2eApp, createE2eApp, E2eApp, insertAdmin } from './create-e2e-app';

const PASSWORD = 'e2e-password';
const OPENING_STOCK = 10;

describe('Sales invoice flow (e2e)', () => {
  let e2e: E2eApp;
  let app: INestApplication<App>;
  let token: string;
  let itemId: string;
  let customerId: string;

  beforeAll(async () => {
    process.env.THROTTLE_DISABLED = 'true';
    e2e = await createE2eApp();
    app = e2e.app;
    await insertAdmin(app, 'cashier', PASSWORD);
    const server = app.getHttpServer();
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'cashier', password: PASSWORD })
      .expect(201);
    token = login.body.data.accessToken as string;
    const auth = { Authorization: `Bearer ${token}` };

    const category = await request(server).post('/api/v1/categories').set(auth).send({ name: 'Timber' }).expect(201);
    const item = await request(server)
      .post('/api/v1/items')
      .set(auth)
      .send({
        name: 'Plank',
        categoryId: category.body.data.id,
        pricingMode: 'per_piece',
        unitPrice: 10,
        cost: 4,
        stockQuantity: OPENING_STOCK,
      })
      .expect(201);
    itemId = item.body.data.id as string;

    const customer = await request(server)
      .post('/api/v1/customers')
      .set(auth)
      .send({ name: 'Adel', phone: '01000000001' })
      .expect(201);
    customerId = customer.body.data.id as string;
  }, 180_000);

  afterAll(async () => {
    await closeE2eApp(e2e);
  });

  it('runs the money path: cash sale, customer sale, debt payment, cancel', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };

    expect(customerId).toEqual(expect.any(String));

    const cashSale = await request(server)
      .post('/api/v1/sales-invoices')
      .set(auth)
      .send({
        type: 'cash_sale',
        lines: [{ itemId, quantity: 2, piecePrice: 10 }],
        paid: 20,
      })
      .expect(201);
    expect(cashSale.body.data.remaining).toBe(0);
    expect(cashSale.body.data.paid).toBe(20);

    const afterCashItem = await request(server).get(`/api/v1/items/${itemId}`).set(auth).expect(200);
    const afterCashCustomer = await request(server).get(`/api/v1/customers/${customerId}`).set(auth).expect(200);
    expect(afterCashItem.body.data.stockQuantity).toBe(OPENING_STOCK - 2);
    expect(afterCashCustomer.body.data.balance).toBe(0);

    const customerSale = await request(server)
      .post('/api/v1/sales-invoices')
      .set(auth)
      .send({
        type: 'customer_sale',
        customerId,
        lines: [{ itemId, quantity: 1, piecePrice: 50 }],
        paid: 20,
      })
      .expect(201);
    expect(customerSale.body.data.remaining).toBe(30);
    const customerSaleId = customerSale.body.data.id as string;

    const afterCreditItem = await request(server).get(`/api/v1/items/${itemId}`).set(auth).expect(200);
    const afterCreditCustomer = await request(server).get(`/api/v1/customers/${customerId}`).set(auth).expect(200);
    expect(afterCreditItem.body.data.stockQuantity).toBe(OPENING_STOCK - 3);
    expect(afterCreditCustomer.body.data.balance).toBe(30);

    await request(server).post('/api/v1/payments').set(auth).send({ customerId, amount: 10 }).expect(201);

    const afterPayment = await request(server).get(`/api/v1/customers/${customerId}`).set(auth).expect(200);
    expect(afterPayment.body.data.balance).toBe(20);

    await request(server).post(`/api/v1/sales-invoices/${customerSaleId}/cancel`).set(auth).expect(201);

    const afterCancelItem = await request(server).get(`/api/v1/items/${itemId}`).set(auth).expect(200);
    const afterCancelCustomer = await request(server).get(`/api/v1/customers/${customerId}`).set(auth).expect(200);
    expect(afterCancelItem.body.data.stockQuantity).toBe(OPENING_STOCK - 2);
    // Cancel reverses only the invoice remaining. The standalone payment stays, so balance is 0 - 10.
    expect(afterCancelCustomer.body.data.balance).toBe(-10);
  });

  it('rejects extra decimals, non-finite paid, an overlong note, and an underpaid cash sale', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };

    const extraDecimals = await request(server)
      .post('/api/v1/sales-invoices')
      .set(auth)
      .send({
        type: 'cash_sale',
        lines: [{ itemId, quantity: 1, piecePrice: 10.129 }],
        paid: 10.13,
      })
      .expect(400);
    expect(extraDecimals.body.success).toBe(false);

    const nonFinite = await request(server)
      .post('/api/v1/sales-invoices')
      .set(auth)
      .set('Content-Type', 'application/json')
      .send(`{"type":"cash_sale","lines":[{"itemId":"${itemId}","quantity":1,"piecePrice":10}],"paid":1e309}`)
      .expect(400);
    expect(nonFinite.body.success).toBe(false);

    const overlong = await request(server)
      .post('/api/v1/sales-invoices')
      .set(auth)
      .send({
        type: 'cash_sale',
        lines: [{ itemId, quantity: 1, piecePrice: 10, note: 'n'.repeat(501) }],
        paid: 10,
      })
      .expect(400);
    expect(overlong.body.success).toBe(false);

    const underpaid = await request(server)
      .post('/api/v1/sales-invoices')
      .set(auth)
      .send({
        type: 'cash_sale',
        lines: [{ itemId, quantity: 1, piecePrice: 10 }],
        paid: 5,
      })
      .expect(400);
    expect(underpaid.body.message).toBe('Cash sale must be paid in full');
  });
});
