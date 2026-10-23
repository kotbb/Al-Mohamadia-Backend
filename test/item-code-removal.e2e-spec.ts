import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { closeE2eApp, createE2eApp, E2eApp, insertAdmin } from './create-e2e-app';

jest.setTimeout(60_000);

describe('Items without codes (temporary replica e2e)', () => {
  let e2e: E2eApp;
  let app: INestApplication<App>;
  let auth: { Authorization: string };
  let categoryId: string;

  beforeAll(async () => {
    process.env.THROTTLE_DISABLED = 'true';
    e2e = await createE2eApp();
    app = e2e.app;
    await insertAdmin(app, 'items-no-code', 'e2e-password');
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'items-no-code', password: 'e2e-password' })
      .expect(201);
    auth = { Authorization: `Bearer ${login.body.data.accessToken}` };
    const category = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(auth)
      .send({ name: 'Code-free catalog' })
      .expect(201);
    categoryId = category.body.data.id as string;
  }, 180_000);

  afterAll(async () => {
    await closeE2eApp(e2e);
  });

  it.each(['per_piece', 'per_cubic_meter', 'free_amount'])(
    'creates, reads and edits %s items without a code',
    async (pricingMode) => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/items')
        .set(auth)
        .send({ name: 'Same allowed name', categoryId, pricingMode })
        .expect(201);
      const id = created.body.data.id as string;
      expect(created.body.data).not.toHaveProperty('code');
      const detail = await request(app.getHttpServer()).get(`/api/v1/items/${id}`).set(auth).expect(200);
      expect(detail.body.data).not.toHaveProperty('code');
      const updated = await request(app.getHttpServer())
        .patch(`/api/v1/items/${id}`)
        .set(auth)
        .send({ name: `Updated ${pricingMode}` })
        .expect(200);
      expect(updated.body.data.name).toBe(`Updated ${pricingMode}`);
      expect(updated.body.data).not.toHaveProperty('code');
      await request(app.getHttpServer()).patch(`/api/v1/items/${id}`).set(auth).send({ code: 'OBSOLETE' }).expect(400);
      const duplicateName = await request(app.getHttpServer())
        .post('/api/v1/items')
        .set(auth)
        .send({ name: `Updated ${pricingMode}`, categoryId, pricingMode })
        .expect(201);
      expect(duplicateName.body.data.id).not.toBe(id);
    },
  );

  it('rejects obsolete code requests and searches inventory by name only, excluding legacy codes from responses', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/items')
      .set(auth)
      .send({ name: 'Invalid legacy request', code: 'OLD', categoryId, pricingMode: 'per_piece' })
      .expect(400);
    const connection = app.get<Connection>(getConnectionToken());
    const id = new Types.ObjectId();
    await connection.collection('items').insertOne({
      _id: id,
      name: 'Searchable board',
      code: 'LEGACY-ONLY-CODE',
      categoryId: new Types.ObjectId(categoryId),
      pricingMode: 'per_piece',
      isDeleted: false,
      isActive: true,
      stockQuantity: 2,
    });
    const detail = await request(app.getHttpServer()).get(`/api/v1/items/${id.toString()}`).set(auth).expect(200);
    expect(detail.body.data).not.toHaveProperty('code');
    const byCode = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock')
      .set(auth)
      .query({ q: 'LEGACY-ONLY-CODE' })
      .expect(200);
    expect(byCode.body.data.items).toEqual([]);
    const byName = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock')
      .set(auth)
      .query({ q: 'Searchable' })
      .expect(200);
    expect(byName.body.data.items).toHaveLength(1);
    expect(byName.body.data.items[0].id).toBe(id.toString());
    expect(byName.body.data.items[0]).not.toHaveProperty('code');
    const listed = await request(app.getHttpServer()).get('/api/v1/items').set(auth).expect(200);
    for (const item of listed.body.data) expect(item).not.toHaveProperty('code');
  });

  it('removes only legacy code fields and their single-field index, and cleanup can be repeated', async () => {
    const connection = app.get<Connection>(getConnectionToken());
    const collection = connection.collection('legacy_item_code_cleanup');
    const documents = [false, false, true].map((isDeleted, index) => ({
      _id: new Types.ObjectId(),
      code: `OLD-${index}`,
      name: `Item ${index}`,
      categoryId: new Types.ObjectId(categoryId),
      isDeleted,
      isActive: index !== 1,
      stockQuantity: index + 1,
      unitPrice: 10,
      cost: 5,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }));
    await collection.insertMany(documents);
    await collection.createIndex(
      { code: 1 },
      { name: 'custom_legacy_code', unique: true, partialFilterExpression: { isDeleted: false } },
    );
    await collection.createIndex({ categoryId: 1, isDeleted: 1 });
    const cleanup = async () => {
      for (const index of await collection.indexes()) {
        if (Object.keys(index.key).length === 1 && index.key.code === 1) await collection.dropIndex(index.name!);
      }
      return collection.updateMany({ code: { $exists: true } }, { $unset: { code: '' } });
    };
    expect((await cleanup()).modifiedCount).toBe(3);
    expect(await collection.countDocuments({ code: { $exists: true } })).toBe(0);
    const expected = documents.map(({ code: _code, ...rest }) => rest);
    expect(await collection.find().sort({ name: 1 }).toArray()).toEqual(expected);
    expect((await collection.indexes()).map((index) => index.name)).toEqual(
      expect.arrayContaining(['_id_', 'categoryId_1_isDeleted_1']),
    );
    expect((await cleanup()).modifiedCount).toBe(0);
  });
});
