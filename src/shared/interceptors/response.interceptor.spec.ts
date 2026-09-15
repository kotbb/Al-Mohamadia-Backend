import { Reflector } from '@nestjs/core';
import { of, firstValueFrom } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';
import { SKIP_RESPONSE_ENVELOPE_KEY } from './skip-response-envelope.decorator';

describe('ResponseInterceptor', () => {
  it('wraps JSON responses in the success envelope', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const interceptor = new ResponseInterceptor(reflector);
    const result = await firstValueFrom(
      interceptor.intercept({ getHandler: () => ({}), getClass: () => ({}) } as never, {
        handle: () => of({ ok: true }),
      }),
    );
    expect(result).toEqual({ success: true, data: { ok: true } });
  });

  it('skips envelope when SkipResponseEnvelope metadata is set', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => {
        return key === SKIP_RESPONSE_ENVELOPE_KEY;
      }),
    } as unknown as Reflector;
    const interceptor = new ResponseInterceptor(reflector);
    const payload = Buffer.from('%PDF');
    const result = await firstValueFrom(
      interceptor.intercept({ getHandler: () => ({}), getClass: () => ({}) } as never, {
        handle: () => of(payload),
      }),
    );
    expect(result).toBe(payload);
  });
});
