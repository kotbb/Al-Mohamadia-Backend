import type { Browser } from 'puppeteer';
import puppeteer from 'puppeteer';
import { InvoicePdfInput } from '../types/invoice-pdf-input.type';
import { buildSalesInvoiceHtml } from './sales-invoice-pdf.template';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
    });
  }
  return browserPromise;
}

/** Closes the shared Chromium instance (tests / graceful shutdown). */
export async function closeSalesInvoicePdfBrowser(): Promise<void> {
  if (!browserPromise) {
    return;
  }
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}

/**
 * Builds an Arabic-primary sales invoice PDF matching the A4 Card layout
 * via HTML → Puppeteer (correct RTL shaping).
 */
export async function buildSalesInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
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
}
