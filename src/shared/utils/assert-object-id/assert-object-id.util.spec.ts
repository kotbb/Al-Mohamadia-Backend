import { BadRequestException } from '@nestjs/common';
import { assertObjectId } from './assert-object-id.util';

describe('assertObjectId', () => {
  it('allows a valid ObjectId', () => {
    expect(() => assertObjectId('507f1f77bcf86cd799439011')).not.toThrow();
  });

  it('throws BadRequestException for an invalid id', () => {
    expect(() => assertObjectId('not-an-id')).toThrow(BadRequestException);
    expect(() => assertObjectId('not-an-id')).toThrow(`Invalid id: 'not-an-id'`);
  });

  it('uses a custom field name in the error message', () => {
    expect(() => assertObjectId('bad', 'userId')).toThrow(`Invalid userId: 'bad'`);
  });
});
