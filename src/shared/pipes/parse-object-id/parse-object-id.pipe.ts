import { PipeTransform } from '@nestjs/common';
import { assertObjectId } from '../../utils/assert-object-id/assert-object-id.util';

export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    assertObjectId(value);
    return value;
  }
}
