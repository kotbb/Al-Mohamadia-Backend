import { HttpException, HttpStatus } from '@nestjs/common';
import type { Browser } from 'puppeteer-core';
import puppeteer from 'puppeteer';
import puppeteerCore from 'puppeteer-core';
import { InvoicePdfInput } from '../types/invoice-pdf-input.type';
import { buildSalesInvoiceHtml } from './sales-invoice-pdf.template';

const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--font-render-hinting=none',
];

let browserPromise: Promise<Browser> | null = null;
let printInFlight = false;

async function launchBrowser(): Promise<Browser> {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (executablePath) {
    return puppeteerCore.launch({
      executablePath,
      headless: true,
      args: CHROMIUM_ARGS,
    });
  }

  if (process.env.VERCEL) {
    const chromium = (await import('@sparticuz/chromium')).default;
    chromium.setGraphicsMode = false;
    return puppeteerCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  return puppeteer.launch({
    headless: true,
    args: CHROMIUM_ARGS,
  }) as unknown as Browser;
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing?.connected) {
      return existing;
    }
    if (existing) {
      await existing.close().catch(() => undefined);
    }
    browserPromise = null;
  }

  browserPromise = launchBrowser();
  return browserPromise;
}

/** Closes the shared Chromium instance (tests / graceful shutdown). */
export async function closeSalesInvoicePdfBrowser(): Promise<void> {
  if (!browserPromise) {
    return;
  }
  const pending = browserPromise;
  browserPromise = null;
  const browser = await pending.catch(() => null);
  if (browser) {
    await browser.close().catch(() => undefined);
  }
}

/**
 * Builds an Arabic-primary sales invoice PDF matching the A4 Card layout
 * via HTML → Puppeteer (correct RTL shaping).
 * One print at a time in this process; a second call returns HTTP 429.
 */
export async function buildSalesInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  if (printInFlight) {
    throw new HttpException(
      'A PDF is already being generated',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  printInFlight = true;
  try {
    const html = buildSalesInvoiceHtml(input);
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'load' });
      // Data-URI fonts/images are inlined; brief settle for layout/fonts.
      await page.evaluate(async () => {
        if ('fonts' in document) {
          await document.fonts.ready;
        }
      });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  } finally {
    printInFlight = false;
  }
}
