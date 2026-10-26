import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { CategoryDocument } from '../src/modules/categories/schemas/category.schema';
import { ItemDocument } from '../src/modules/items/schemas/item.schema';
import { StockListResponseDto } from '../src/modules/inventory/dto/response/stock-list-response.dto';
import { closeE2eApp, createE2eApp, E2eApp, insertAdmin } from './create-e2e-app';

jest.setTimeout(60_000);

describe('Inventory category pagination (temporary replica e2e)', () => {
  let e2e: E2eApp;
  let app: INestApplication<App>;
  let auth: { Authorization: string };
  let categories: Array<{ id: string; name: string; createdAt: Date }>;
  let largeCategoryId: string;
  let orphanCategoryId: string;

  beforeAll(async () => {
    process.env.THROTTLE_DISABLED = 'true';
    e2e = await createE2eApp();
    app = e2e.app;
    await insertAdmin(app, 'inventory-pagination', 'e2e-password');
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'inventory-pagination', password: 'e2e-password' })
      .expect(201);
    auth = { Authorization: `Bearer ${login.body.data.accessToken}` };
    const categoryModel = app.get<Model<CategoryDocument>>(getModelToken('Category'));
    const itemModel = app.get<Model<ItemDocument>>(getModelToken('Item'));
    const docs = await categoryModel.create(
      ['خشب', 'Alpha', 'alpha', 'Category 2', 'Category 10', 'Zinc', 'Beta'].map((name, index) => ({
        name,
        createdAt: new Date(Date.UTC([2021, 2019, 2021, 2020, 2021, 2022, 2023][index], 0, 1)),
      })),
    );
    categories = docs.map((doc) => ({
      id: doc._id.toString(),
      name: doc.name,
      createdAt: doc.get('createdAt') as Date,
    }));
    largeCategoryId = categories[0].id;
    await itemModel.insertMany(
      categories.flatMap((category, categoryIndex) =>
        Array.from({ length: categoryIndex === 0 ? 30 : 1 }, (_, index) => ({
          name: `match ${categoryIndex}-${index}`,
          categoryId: category.id,
          pricingMode: 'per_piece',
          unitPrice: 10,
          cost: 5,
          stockQuantity: categoryIndex === 0 ? (index === 0 ? 0 : index === 1 ? -1 : 20) : 3,
          reorderThreshold: 5,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        })),
      ),
    );
    await itemModel.insertMany([
      { name: 'match free', categoryId: largeCategoryId, pricingMode: 'free_amount' },
      {
        name: 'match deleted',
        categoryId: largeCategoryId,
        pricingMode: 'per_piece',
        isDeleted: true,
      },
    ]);
    orphanCategoryId = new Types.ObjectId().toString();
  }, 180_000);

  afterAll(async () => closeE2eApp(e2e));

  const stock = async (query: Record<string, string | number> = {}) => {
    const result = await request(app.getHttpServer()).get('/api/v1/inventory/stock').set(auth).query(query).expect(200);
    return result.body.data as StockListResponseDto;
  };

  it('returns full categories oldest first with ID ties, independently of names', async () => {
    const first = await stock({ paginationMode: 'categories' });
    const second = await stock({ paginationMode: 'categories', page: 2 });
    const ordered = [...categories].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
    );
    expect(first.meta).toEqual({
      page: 1,
      limit: 5,
      total: 7,
      paginationMode: 'categories',
      totalItems: 36,
      totalPages: 2,
    });
    expect([...new Set(first.items.map((item) => item.categoryId))]).toEqual(
      ordered.slice(0, 5).map((category) => category.id),
    );
    expect([...new Set(second.items.map((item) => item.categoryId))]).toEqual(
      ordered.slice(5).map((category) => category.id),
    );
    const all = [...first.items, ...second.items];
    expect(all).toHaveLength(36);
    const largePage = first.items.some((item) => item.categoryId === largeCategoryId) ? first : second;
    expect(largePage.items.filter((item) => item.categoryId === largeCategoryId)).toHaveLength(30);
    const largeItems = largePage.items.filter((item) => item.categoryId === largeCategoryId);
    expect(largeItems.map((item) => item.stockQuantity)).toEqual([-1, 0, ...Array<number>(28).fill(20)]);
    expect(largeItems.slice(2).map((item) => item.id)).toEqual(
      largeItems
        .slice(2)
        .map((item) => item.id)
        .sort(),
    );
    expect(first.summary).toEqual({
      totalItems: 36,
      normalStockCount: 28,
      lowStockCount: 6,
      outOfStockCount: 2,
    });
    const categoryModel = app.get<Model<CategoryDocument>>(getModelToken('Category'));
    await categoryModel.updateOne({ _id: ordered[0].id }, { $set: { name: 'ZZZ renamed' } });
    const renamed = await stock({ paginationMode: 'categories' });
    expect([...new Set(renamed.items.map((item) => item.categoryId))]).toEqual(
      ordered.slice(0, 5).map((category) => category.id),
    );
  });

  it('lists categories oldest first and supplies category dates in item responses', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/categories').set(auth).expect(200);
    const ordered = [...categories].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
    );
    expect((response.body.data as Array<{ id: string }>).map((category) => category.id)).toEqual(
      ordered.map((category) => category.id),
    );
    const items = await request(app.getHttpServer()).get('/api/v1/items').set(auth).expect(200);
    for (const item of items.body.data as Array<{ category: { id: string; createdAt: string } }>) {
      expect(item.category.createdAt).toBe(
        categories.find((category) => category.id === item.category.id)?.createdAt.toISOString(),
      );
    }
  });

  it('applies search, category and stock status before category pagination while preserving base KPIs', async () => {
    const filtered = await stock({
      paginationMode: 'categories',
      categoryId: largeCategoryId,
      q: 'match 0-',
      stockStatus: 'out_of_stock',
    });
    expect(filtered.items).toHaveLength(2);
    expect(filtered.items[0].stockQuantity).toBe(-1);
    expect(filtered.items.every((item) => item.isOutOfStock)).toBe(true);
    expect(filtered.items[0]).not.toHaveProperty('isNegativeStock');
    expect(filtered.meta).toMatchObject({ total: 1, totalItems: 2, totalPages: 1 });
    expect(filtered.summary).toEqual({
      totalItems: 30,
      normalStockCount: 28,
      lowStockCount: 0,
      outOfStockCount: 2,
    });
    expect((await stock({ paginationMode: 'categories', q: 'match 1-' })).meta.totalItems).toBe(1);
    expect((await stock({ paginationMode: 'categories', q: 'absent' })).meta).toMatchObject({
      total: 0,
      totalItems: 0,
      totalPages: 1,
    });
    expect((await stock({ paginationMode: 'categories', page: 9 })).items).toEqual([]);
    expect((await stock({ paginationMode: 'categories', limit: 1 })).meta).toMatchObject({ limit: 1, totalPages: 7 });
  });

  it('returns identical stock fields and timestamps from both lean pagination paths', async () => {
    const legacy = await stock({ categoryId: largeCategoryId, limit: 100 });
    const grouped = await stock({ categoryId: largeCategoryId, paginationMode: 'categories' });
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect([...grouped.items].sort(byId)).toEqual([...legacy.items].sort(byId));
    expect(grouped.summary).toEqual(legacy.summary);
    expect(grouped.items[0]).toMatchObject({
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: expect.any(String),
      category: { id: largeCategoryId, name: 'خشب' },
      unitPrice: 10,
      cost: 5,
    });
  });

  it('preserves legacy item defaults and explicit pagination', async () => {
    const legacy = await stock();
    expect(legacy.items).toHaveLength(10);
    expect(legacy.meta).toEqual({ page: 1, limit: 10, total: 36 });
    expect((await stock({ paginationMode: 'items', page: 2, limit: 25 })).meta).toEqual({
      page: 2,
      limit: 25,
      total: 36,
    });
  });

  it.each([
    { paginationMode: 'invalid' },
    { stockStatus: 'negative_stock' },
    { locale: 'ar' },
    { limit: 0 },
    { page: 0 },
  ])('rejects invalid query %j', async (query) => {
    await request(app.getHttpServer()).get('/api/v1/inventory/stock').set(auth).query(query).expect(400);
  });

  it('returns orphan category references safely', async () => {
    const itemModel = app.get<Model<ItemDocument>>(getModelToken('Item'));
    await itemModel.create({ name: 'orphan', categoryId: orphanCategoryId, pricingMode: 'per_piece' });
    const result = await stock({ paginationMode: 'categories', q: 'orphan' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ categoryId: orphanCategoryId, category: null });
  });
});
