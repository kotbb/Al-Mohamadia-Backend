import { Logger, NotFoundException } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { AppExceptionsHandler } from './app-exception.filter';

function hostFor(url: string): { host: ArgumentsHost; json: jest.Mock } {
  const json = jest.fn();
  const response = { status: jest.fn().mockReturnValue({ json }) };
  const request = { method: 'GET', url };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, json };
}

describe('AppExceptionsHandler', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not log the public PDF share token', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const token = 'abc123secret';
    const url = `/api/v1/public/sales-invoices/${token}/pdf`;
    const { host, json } = hostFor(url);

    new AppExceptionsHandler().catch(new NotFoundException('Invoice not found'), host);

    const logged = String(warn.mock.calls[0]?.[0]);
    expect(logged).not.toContain(token);
    expect(logged).toContain('[GET] /api/v1/public/sales-invoices/:token/pdf - Invoice not found');
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ path: url, success: false }));
  });

  it('logs other urls unchanged', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const url = '/api/v1/auth/login';
    const { host } = hostFor(url);

    new AppExceptionsHandler().catch(new NotFoundException('missing'), host);

    expect(String(warn.mock.calls[0]?.[0])).toContain(`[GET] ${url} - missing`);
  });
});
