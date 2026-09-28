import request from 'supertest';
import { closeE2eApp, createE2eApp, E2eApp } from './create-e2e-app';

describe('Auth rate limit (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    process.env.THROTTLE_DISABLED = 'false';
    process.env.THROTTLE_AUTH_LIMIT = '2';
    e2e = await createE2eApp();
  }, 180_000);

  afterAll(async () => {
    await closeE2eApp(e2e);
  });

  it('returns 429 when login exceeds the auth limit', async () => {
    const server = e2e.app.getHttpServer();
    const body = { username: 'nobody', password: 'wrong-password' };

    await request(server).post('/api/v1/auth/login').send(body).expect(401);
    await request(server).post('/api/v1/auth/login').send(body).expect(401);

    const blocked = await request(server).post('/api/v1/auth/login').send(body).expect(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.statusCode).toBe(429);
  });
});
