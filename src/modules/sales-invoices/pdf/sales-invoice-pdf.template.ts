import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { SalesInvoiceStatus } from '../../../shared/enums/sales-invoice-status.enum';
import { formatCairoDate } from '../../../shared/utils/period/cairo-period.util';
import { InvoicePdfInput } from '../types/invoice-pdf-input.type';

function resolveAsset(...parts: string[]): string {
  const candidates = [join(process.cwd(), ...parts), join(__dirname, '..', '..', '..', '..', ...parts)];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Asset not found: ${parts.join('/')}`);
}

function fileDataUri(filePath: string, mime: string): string {
  return `data:${mime};base64,${readFileSync(filePath).toString('base64')}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value: number): string {
  const amount = value.toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
  return `${amount} ج.م`;
}

function formatDate(date: Date): string {
  const iso = formatCairoDate(date);
  const [year, month, day] = iso.split('-');
  return `${year}/${month}/${day}`;
}

/**
 * Builds the A4 Card HTML for Puppeteer PDF rendering with AkhshabZ branding (Arabic RTL).
 */
export function buildSalesInvoiceHtml(input: InvoicePdfInput): string {
  const logoUri = fileDataUri(resolveAsset('assets', 'images', 'icon-mark.png'), 'image/png');
  const fontRegularUri = fileDataUri(resolveAsset('assets', 'fonts', 'Cairo-Regular.ttf'), 'font/ttf');
  const fontBoldUri = fileDataUri(resolveAsset('assets', 'fonts', 'Cairo-Bold.ttf'), 'font/ttf');

  const customerName = input.customerName?.trim() ? input.customerName.trim() : 'نقدي';

  const hasDimensions = input.lines.some((l) => l.thickness != null || l.width != null || l.length != null);

  const lineRows = input.lines
    .map((line) => {
      const note = line.note?.trim() ? `<div class="line-note">${escapeHtml(line.note.trim())}</div>` : '';
      if (hasDimensions) {
        return `
          <tr>
            <td class="col-item">
              <div class="item-label">${escapeHtml(line.itemLabel)}</div>
              ${note}
            </td>
            <td class="col-dim">${line.thickness != null ? escapeHtml(String(line.thickness)) : '—'}</td>
            <td class="col-dim">${line.width != null ? escapeHtml(String(line.width)) : '—'}</td>
            <td class="col-dim">${line.length != null ? escapeHtml(String(line.length)) : '—'}</td>
            <td class="col-qty">${escapeHtml(String(line.quantity))}</td>
            <td class="col-price">${escapeHtml(money(line.piecePrice))}</td>
            <td class="col-total">${escapeHtml(money(line.lineTotal))}</td>
          </tr>`;
      }
      return `
        <tr>
          <td class="col-item">
            <div class="item-label">${escapeHtml(line.itemLabel)}</div>
            ${note}
          </td>
          <td class="col-qty">${escapeHtml(String(line.quantity))}</td>
          <td class="col-price">${escapeHtml(money(line.piecePrice))}</td>
          <td class="col-total">${escapeHtml(money(line.lineTotal))}</td>
        </tr>`;
    })
    .join('');

  const cancelledBanner =
    input.status === SalesInvoiceStatus.CANCELLED ? `<div class="cancelled">${escapeHtml('فاتورة ملغاة')}</div>` : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <style>
    @font-face {
      font-family: 'Cairo';
      src: url('${fontRegularUri}') format('truetype');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Cairo';
      src: url('${fontBoldUri}') format('truetype');
      font-weight: 700;
      font-style: normal;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      width: 210mm;
      min-height: 297mm;
      background: #fff;
      color: #1a1a1a;
      font-family: 'Cairo', sans-serif;
      font-weight: 400;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      padding: 16mm 16mm;
      direction: rtl;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .header-invoice {
      text-align: right;
    }

    .invoice-title {
      font-size: 20px;
      font-weight: 700;
      color: #b85d19;
      line-height: 1.2;
    }

    .invoice-date {
      margin-top: 4px;
      font-size: 12px;
      color: #666;
    }

    .header-brand {
      text-align: left;
      direction: ltr;
    }

    .brand-row {
      display: flex;
      align-items: center;
      gap: 10px;
      justify-content: flex-end;
    }

    .brand-row img {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      object-fit: contain;
    }

    .brand-name {
      font-size: 22px;
      font-weight: 700;
      color: #1a1a1a;
      letter-spacing: -0.5px;
    }

    .brand-accent {
      color: #b85d19;
    }

    .brand-tagline {
      margin-top: 2px;
      font-size: 11px;
      color: #777;
      text-align: right;
      direction: rtl;
    }

    .rule-thick {
      border: none;
      border-top: 2px solid #222;
      margin: 0 0 14px;
    }

    .customer-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      margin-bottom: 16px;
    }

    .customer-label {
      font-weight: 700;
      color: #444;
    }

    .customer-name {
      font-weight: 700;
      color: #111;
    }

    table.items {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-bottom: 20px;
    }

    table.items thead th {
      font-size: 13px;
      font-weight: 700;
      padding: 8px 6px;
      color: #333;
      border-bottom: 1.5px solid #222;
    }

    table.items tbody td {
      font-size: 12px;
      padding: 10px 6px;
      vertical-align: top;
      border-bottom: 1px solid #e0e0e0;
    }

    .col-item { text-align: right; }
    .col-dim { width: 10%; text-align: center; }
    .col-qty { width: 11%; text-align: center; font-weight: 700; }
    .col-price { width: 15%; text-align: center; }
    .col-total { width: 16%; text-align: center; font-weight: 700; }

    .item-label { font-weight: 700; color: #111; font-size: 13px; }
    .line-note {
      margin-top: 2px;
      font-size: 10px;
      color: #666;
      font-style: italic;
    }

    .totals-wrap {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;
    }

    .totals {
      width: 240px;
    }

    .totals .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 16px;
      font-size: 13px;
      margin-bottom: 8px;
    }

    .totals .row .label { font-weight: 700; color: #555; }
    .totals .row .value { font-weight: 700; color: #111; white-space: nowrap; }

    .totals .divider {
      border: none;
      border-top: 1.5px solid #222;
      margin: 6px 0 10px;
    }

    .totals .row.remaining {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 0;
    }

    .totals .row.remaining .label {
      font-weight: 700;
      color: #111;
    }

    .totals .row.remaining .value {
      font-weight: 700;
      color: #b85d19;
      font-size: 17px;
    }

    .footer {
      margin-top: 40px;
      padding-top: 14px;
      border-top: 1px dashed #ccc;
      text-align: center;
      font-size: 12px;
      color: #777;
    }

    .cancelled {
      margin-top: 24px;
      padding: 8px;
      background: #fee2e2;
      color: #b91c1c;
      border-radius: 6px;
      text-align: center;
      font-size: 15px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div class="header-invoice">
        <div class="invoice-title">فاتورة #${escapeHtml(input.invoiceNumber)}</div>
        <div class="invoice-date">${escapeHtml(formatDate(input.createdAt))}</div>
      </div>
      <div class="header-brand">
        <div class="brand-row">
          <span class="brand-name">المحمدية</span>
          <img src="${logoUri}" alt="" />
        </div>
        <div class="brand-tagline">تجارة الأخشاب والألواح</div>
      </div>
    </header>

    <hr class="rule-thick" />

    <div class="customer-row">
      <span class="customer-label">العميل:</span>
      <span class="customer-name">${escapeHtml(customerName)}</span>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th class="col-item">الصنف</th>
          ${
            hasDimensions
              ? `
          <th class="col-dim">التخانة</th>
          <th class="col-dim">العرض</th>
          <th class="col-dim">الطول</th>`
              : ''
          }
          <th class="col-qty">العدد</th>
          <th class="col-price">سعر الوحدة</th>
          <th class="col-total">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
    </table>

    <div class="totals-wrap">
      <div class="totals">
        <div class="row">
          <span class="label">المطلوب:</span>
          <span class="value">${escapeHtml(money(input.total))}</span>
        </div>
        ${
          input.discount > 0
            ? `
        <div class="row">
          <span class="label">الخصم:</span>
          <span class="value">${escapeHtml(money(input.discount))}</span>
        </div>`
            : ''
        }
        <div class="row">
          <span class="label">المدفوع:</span>
          <span class="value">${escapeHtml(money(input.paid))}</span>
        </div>
        <hr class="divider" />
        <div class="row remaining">
          <span class="label">المتبقي:</span>
          <span class="value">${escapeHtml(money(input.remaining))}</span>
        </div>
      </div>
    </div>

    ${cancelledBanner}
  </div>
</body>
</html>`;
}
