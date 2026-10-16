import { Transform } from 'class-transformer';

/** Trim transport text before validators run; preserve invalid types for rejection. */
export function TrimText(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
}
