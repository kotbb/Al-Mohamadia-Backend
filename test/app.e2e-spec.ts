import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { closeE2eApp, createE2eApp, E2eApp } from './create-e2e-app';

describe('Health (e2e)', () => {
  let e2e: E2eApp;
  let app: INestApplication<App>;

  beforeAll(async () => {
    e2e = await createE2eApp();
    app = e2e.app;
  }, 180_000);

  afterAll(async () => {
    await closeE2eApp(e2e);
  });

  it('GET /api/v1/health', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({
        success: true,
        data: { status: 'ok' },
      });
  });
});
