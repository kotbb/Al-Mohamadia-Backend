import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * Throws BadRequestException if `id` is not a valid Mongo ObjectId.
 * @param id - The id to check.
 * @param field - The field name to use in the error message. Defaults to 'id'.
 */
export function assertObjectId(id: string, field = 'id'): asserts id is string {
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestException(`Invalid ${field}: '${id}'`);
  }
}
