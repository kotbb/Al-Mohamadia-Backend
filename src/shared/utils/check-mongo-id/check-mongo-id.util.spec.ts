import { BadRequestException } from '@nestjs/common';
import { checkMongoId } from './check-mongo-id.util';

describe('checkMongoId', () => {
  it('allows a valid ObjectId', () => {
    expect(() => checkMongoId('507f1f77bcf86cd799439011')).not.toThrow();
  });

  it('throws BadRequestException for an invalid id', () => {
    expect(() => checkMongoId('not-an-id')).toThrow(BadRequestException);
    expect(() => checkMongoId('not-an-id')).toThrow(`Invalid id: 'not-an-id'`);
  });

  it('uses a custom field name in the error message', () => {
    expect(() => checkMongoId('bad', 'userId')).toThrow(`Invalid userId: 'bad'`);
  });
});
