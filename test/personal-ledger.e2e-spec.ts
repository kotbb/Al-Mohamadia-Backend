import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { closeE2eApp, createE2eApp, E2eApp, insertAdmin } from './create-e2e-app';

jest.setTimeout(120_000);

describe('Shared personal ledger (temporary replica e2e)', () => {
  let e2e: E2eApp;
  let app: INestApplication<App>;
  let connection: Connection;
  let a: { Authorization: string };
  let b: { Authorization: string };
  let admin: { Authorization: string };
  const base = '/api/v1/personal-ledger';

  beforeAll(async () => {
    process.env.THROTTLE_DISABLED = 'true';
    e2e = await createE2eApp();
    app = e2e.app;
    connection = app.get<Connection>(getConnectionToken());
    const headers = [] as Array<{ Authorization: string }>;
    for (const [index, name] of ['ledger-a', 'ledger-b', 'ledger-admin'].entries()) {
      await insertAdmin(app, name, 'e2e-password');
      if (index < 2)
        await connection.collection('users').updateOne({ username: name }, { $set: { role: 'super_admin' } });
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: name, password: 'e2e-password' })
        .expect(201);
      headers.push({ Authorization: `Bearer ${login.body.data.accessToken}` });
    }
    [a, b, admin] = headers;
  });

  afterAll(async () => closeE2eApp(e2e));

  beforeEach(async () => {
    for (const name of ['personalledgercontacts', 'personalledgermovements', 'personalledgerhistories']) {
      await connection.collection(name).deleteMany({});
    }
  });

  async function contact(name = 'شخص خاص') {
    const response = await request(app.getHttpServer()).post(`${base}/contacts`).set(a).send({ name }).expect(201);
    return response.body.data as { id: string; name: string; customerId: string | null; isActive: boolean };
  }

  async function movement(contactId: string, input: Record<string, unknown> = {}) {
    const response = await request(app.getHttpServer())
      .post(`${base}/movements`)
      .set(a)
      .send({
        contactId,
        type: 'deposit',
        amount: 1000,
        movementDate: '2020-01-15',
        ...input,
      })
      .expect(201);
    return response.body.data as {
      id: string;
      contactId: string;
      amount: number;
      method: string | null;
      notes: string | null;
    };
  }

  it('retires personal history without writing events or changing previously stored history', async () => {
    const legacy = { _id: new Types.ObjectId(), action: 'legacy_event', entityLabel: 'Retained data' };
    await connection.collection('personalledgerhistories').insertOne(legacy);
    const person = await contact();
    await request(app.getHttpServer())
      .patch(`${base}/contacts/${person.id}`)
      .set(b)
      .send({ name: 'Renamed' })
      .expect(200);
    const entry = await movement(person.id);
    await request(app.getHttpServer()).patch(`${base}/movements/${entry.id}`).set(b).send({ amount: 1200 }).expect(200);
    await request(app.getHttpServer()).delete(`${base}/movements/${entry.id}`).set(a).expect(200);
    await request(app.getHttpServer()).get(`${base}/history`).set(a).expect(404);
    expect(await connection.collection('personalledgerhistories').find({}).toArray()).toEqual([legacy]);
  });

  it('rejects unauthenticated users and admins on every resource', async () => {
    const id = new Types.ObjectId().toString();
    for (const path of ['/contacts', `/contacts/${id}`, '/movements', `/movements/${id}`]) {
      await request(app.getHttpServer())
        .get(base + path)
        .expect(401);
      await request(app.getHttpServer())
        .get(base + path)
        .set(admin)
        .expect(403);
    }
    await request(app.getHttpServer()).post(`${base}/contacts`).set(admin).send({ name: 'Hidden' }).expect(403);
    await request(app.getHttpServer()).patch(`${base}/contacts/${id}`).set(admin).send({ name: 'Hidden' }).expect(403);
    await request(app.getHttpServer()).post(`${base}/movements`).set(admin).send({}).expect(403);
    await request(app.getHttpServer()).patch(`${base}/movements/${id}`).set(admin).send({}).expect(403);
    await request(app.getHttpServer()).delete(`${base}/movements/${id}`).set(admin).expect(403);
  });

  it('shares contacts across superadmins without creating store customers', async () => {
    const count = await connection.collection('customers').countDocuments();
    const person = await contact();
    const list = await request(app.getHttpServer()).get(`${base}/contacts`).set(b).expect(200);
    expect(list.body.data.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: person.id })]));
    await request(app.getHttpServer())
      .patch(`${base}/contacts/${person.id}`)
      .set(b)
      .send({ name: 'اسم جديد' })
      .expect(200);
    expect(await connection.collection('customers').countDocuments()).toBe(count);
  });

  it('snapshots customer names, reuses an existing link, and rejects ambiguous contact creation', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set(a)
      .send({ name: 'عميل المتجر' })
      .expect(201);
    const customerId = created.body.data.id as string;
    const firstLink = await request(app.getHttpServer())
      .post(`${base}/contacts`)
      .set(a)
      .send({ customerId })
      .expect(201);
    const reusedLink = await request(app.getHttpServer())
      .post(`${base}/contacts`)
      .set(b)
      .send({ customerId })
      .expect(201);
    expect(reusedLink.body.data.id).toBe(firstLink.body.data.id);
    const personId = firstLink.body.data.id as string;
    await connection
      .collection('customers')
      .updateOne({ _id: new Types.ObjectId(customerId) }, { $set: { name: 'Renamed or merged', isDeleted: true } });
    const saved = await request(app.getHttpServer()).get(`${base}/contacts/${personId}`).set(b).expect(200);
    expect(saved.body.data.name).toBe('عميل المتجر');
    await request(app.getHttpServer())
      .post(`${base}/contacts`)
      .set(a)
      .send({ name: 'Ambiguous', customerId })
      .expect(400);
    await request(app.getHttpServer()).post(`${base}/contacts`).set(a).send({}).expect(400);
    await request(app.getHttpServer()).post(`${base}/contacts`).set(a).send({ name: '   ' }).expect(400);
  });

  it('records and edits movements without writing to the selected contact', async () => {
    const person = await contact();
    const filter = { _id: new Types.ObjectId(person.id) };
    const before = await connection.collection('personalledgercontacts').findOne(filter);
    const entry = await movement(person.id);
    await request(app.getHttpServer()).patch(`${base}/movements/${entry.id}`).set(b).send({ amount: 1200 }).expect(200);
    expect(await connection.collection('personalledgercontacts').findOne(filter)).toEqual(before);
  });

  it('accepts a missing method, clears explicit null, and preserves omitted patch fields', async () => {
    const person = await contact();
    const entry = await movement(person.id);
    expect(entry.method).toBeNull();
    expect(entry.notes).toBeNull();
    await request(app.getHttpServer())
      .patch(`${base}/movements/${entry.id}`)
      .set(b)
      .send({ method: 'cash', notes: 'note' })
      .expect(200);
    const preserved = await request(app.getHttpServer())
      .patch(`${base}/movements/${entry.id}`)
      .set(a)
      .send({ amount: 1200 })
      .expect(200);
    expect(preserved.body.data).toMatchObject({ method: 'cash', notes: 'note', amount: 1200 });
    const cleared = await request(app.getHttpServer())
      .patch(`${base}/movements/${entry.id}`)
      .set(b)
      .send({ method: null, notes: null })
      .expect(200);
    expect(cleared.body.data).toMatchObject({ method: null, notes: null });
  });

  it('rejects invalid money, dates, methods, required nulls, and client actor/ownership fields', async () => {
    const person = await contact();
    const valid = { contactId: person.id, type: 'deposit', amount: 1, movementDate: '2020-01-15' };
    for (const invalid of [
      { amount: 0 },
      { amount: -1 },
      { amount: 1.001 },
      { amount: '1' },
      { amount: null },
      { movementDate: '2020-02-31' },
      { movementDate: '2999-01-01' },
      { movementDate: null },
      { type: 'opening_balance' },
      { method: 'unknown' },
      { contactId: null },
      { createdBy: person.id },
      { ownerId: person.id },
    ]) {
      await request(app.getHttpServer())
        .post(`${base}/movements`)
        .set(a)
        .send({ ...valid, ...invalid })
        .expect(400);
    }
    const entry = await movement(person.id, { amount: 0.01 });
    for (const invalid of [{ amount: null }, { contactId: null }, { type: null }, { movementDate: null }]) {
      await request(app.getHttpServer()).patch(`${base}/movements/${entry.id}`).set(a).send(invalid).expect(400);
    }
    await request(app.getHttpServer()).get(`${base}/movements`).set(a).query({ from: '2020-02-31' }).expect(400);
    await request(app.getHttpServer())
      .get(`${base}/movements`)
      .set(a)
      .query({ from: '2020-02-02', to: '2020-01-01' })
      .expect(400);
  });

  it('summarizes the full filtered range before pagination and searches literal person/notes text', async () => {
    const person = await contact('Person [x]');
    await movement(person.id, { movementDate: '2020-01-01' });
    await movement(person.id, { type: 'withdrawal', amount: 250.25, movementDate: '2020-01-31', notes: 'transport' });
    await movement(person.id, { amount: 50, movementDate: '2020-02-01' });
    const range = await request(app.getHttpServer())
      .get(`${base}/movements`)
      .set(b)
      .query({ from: '2020-01-01', to: '2020-01-31', limit: 1 })
      .expect(200);
    expect(range.body.data.meta).toMatchObject({ total: 2, page: 1, limit: 1 });
    expect(range.body.data.summary).toEqual({ deposits: 1000, withdrawals: 250.25, net: 749.75, count: 2 });
    expect(range.body.data.items).toHaveLength(1);
    const notes = await request(app.getHttpServer())
      .get(`${base}/movements`)
      .set(a)
      .query({ q: 'transport' })
      .expect(200);
    expect(notes.body.data.summary).toEqual({ deposits: 0, withdrawals: 250.25, net: -250.25, count: 1 });
    const name = await request(app.getHttpServer()).get(`${base}/movements`).set(a).query({ q: '[x]' }).expect(200);
    expect(name.body.data.meta.total).toBe(3);
    const empty = await request(app.getHttpServer()).get(`${base}/movements`).set(a).query({ q: 'absent' }).expect(200);
    expect(empty.body.data.summary).toEqual({ deposits: 0, withdrawals: 0, net: 0, count: 0 });
    const lifetime = await request(app.getHttpServer()).get(`${base}/contacts/${person.id}`).set(a).expect(200);
    expect(lifetime.body.data.summary).toEqual({ deposits: 1050, withdrawals: 250.25, net: 799.75, count: 3 });
  });

  it('edits across contacts and dates, permits negative net, and retains soft-deleted records', async () => {
    const first = await contact('First');
    const second = await contact('Second');
    const entry = await movement(first.id, { amount: 100 });
    await request(app.getHttpServer())
      .patch(`${base}/movements/${entry.id}`)
      .set(b)
      .send({ type: 'withdrawal', contactId: second.id, amount: 300, movementDate: '2020-02-01' })
      .expect(200);
    const before = await request(app.getHttpServer()).get(`${base}/contacts/${second.id}`).set(a).expect(200);
    expect(before.body.data.summary.net).toBe(-300);
    await request(app.getHttpServer()).delete(`${base}/movements/${entry.id}`).set(b).expect(200);
    await request(app.getHttpServer()).get(`${base}/movements/${entry.id}`).set(a).expect(404);
    await request(app.getHttpServer()).delete(`${base}/movements/${entry.id}`).set(a).expect(404);
    const after = await request(app.getHttpServer()).get(`${base}/contacts/${second.id}`).set(a).expect(200);
    expect(after.body.data.summary).toEqual({ deposits: 0, withdrawals: 0, net: 0, count: 0 });
    const stored = await connection
      .collection('personalledgermovements')
      .findOne({ _id: new Types.ObjectId(entry.id) });
    expect(stored?.isDeleted).toBe(true);
  });

  it('excludes archived contacts from new choices but permits editing the original movement', async () => {
    const person = await contact();
    const other = await contact('Other');
    const original = await movement(person.id);
    const another = await movement(other.id);
    await request(app.getHttpServer())
      .patch(`${base}/contacts/${person.id}`)
      .set(a)
      .send({ isActive: false })
      .expect(200);
    const active = await request(app.getHttpServer()).get(`${base}/contacts`).set(b).expect(200);
    expect(active.body.data.items.map((row: { id: string }) => row.id)).not.toContain(person.id);
    const all = await request(app.getHttpServer())
      .get(`${base}/contacts`)
      .set(b)
      .query({ includeInactive: true })
      .expect(200);
    expect(all.body.data.meta.total).toBe(2);
    await request(app.getHttpServer())
      .post(`${base}/movements`)
      .set(a)
      .send({ contactId: person.id, type: 'deposit', amount: 1, movementDate: '2020-01-01' })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`${base}/movements/${original.id}`)
      .set(b)
      .send({ amount: 50 })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`${base}/movements/${another.id}`)
      .set(b)
      .send({ contactId: person.id })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`${base}/contacts/${person.id}`)
      .set(b)
      .send({ isActive: true })
      .expect(200);
  });

  it('orders tied dates by creation time then ID', async () => {
    const person = await contact();
    const first = await movement(person.id);
    const second = await movement(person.id);
    await connection
      .collection('personalledgermovements')
      .updateMany({}, { $set: { createdAt: new Date('2020-01-01') } });
    const result = await request(app.getHttpServer()).get(`${base}/movements`).set(b).expect(200);
    expect(result.body.data.items.map((row: { id: string }) => row.id)).toEqual([first.id, second.id].sort().reverse());
  });

  it('does not change dashboard values, operational audit, accounts, stock or payments', async () => {
    const before = await request(app.getHttpServer()).get('/api/v1/dashboard').set(a).expect(200);
    const counts = {} as Record<string, number>;
    const names = ['auditlogs', 'payments', 'supplierpayments', 'salesinvoices', 'purchaseinvoices', 'items'];
    for (const name of names) counts[name] = await connection.collection(name).countDocuments();
    const customers = await connection.collection('customers').find({}).toArray();
    const suppliers = await connection.collection('suppliers').find({}).toArray();
    const person = await contact();
    const entry = await movement(person.id);
    await request(app.getHttpServer()).patch(`${base}/movements/${entry.id}`).set(b).send({ amount: 1200 }).expect(200);
    await request(app.getHttpServer()).delete(`${base}/movements/${entry.id}`).set(a).expect(200);
    const after = await request(app.getHttpServer()).get('/api/v1/dashboard').set(b).expect(200);
    expect(after.body.data).toEqual(before.body.data);
    for (const name of names) expect(await connection.collection(name).countDocuments()).toBe(counts[name]);
    expect(await connection.collection('customers').find({}).toArray()).toEqual(customers);
    expect(await connection.collection('suppliers').find({}).toArray()).toEqual(suppliers);
  });
});
