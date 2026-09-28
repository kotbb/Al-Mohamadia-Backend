import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { roundMoney } from './round-money.util';

/**
 * Client-supplied EGP amounts must already be finite and equal to a 2-decimal value.
 * Computed totals still round inside services.
 */
export function IsMoneyAmount(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isMoneyAmount',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null) {
            return true;
          }
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return false;
          }
          return value === roundMoney(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a finite amount with at most 2 decimal places`;
        },
      },
    });
  };
}
