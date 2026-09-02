import { PipeTransform } from '@nestjs/common';
import { checkMongoId } from '../../utils/check-mongo-id/check-mongo-id.util';

export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    checkMongoId(value);
    return value;
  }
}
