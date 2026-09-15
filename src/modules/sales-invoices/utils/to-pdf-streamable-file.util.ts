import { StreamableFile } from '@nestjs/common';

export function toPdfStreamableFile(
  buffer: Buffer,
  invoiceNumber: string,
): StreamableFile {
  return new StreamableFile(buffer, {
    type: 'application/pdf',
    disposition: `inline; filename="invoice-${invoiceNumber}.pdf"`,
  });
}
