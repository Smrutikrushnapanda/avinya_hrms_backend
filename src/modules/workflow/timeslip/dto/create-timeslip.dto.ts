import {
  IsUUID,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'isNotFutureDate', async: false })
class IsNotFutureDateConstraint implements ValidatorConstraintInterface {
  validate(value: string) {
    const date = new Date(value);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return date <= today;
  }
  defaultMessage(args: ValidationArguments) {
    return `${args.property} must not be a future date`;
  }
}

export enum MissingType {
  IN = 'IN',
  OUT = 'OUT',
  BOTH = 'BOTH',
}

export class CreateTimeslipDto {
  @IsUUID()
  employeeId: string;

  @IsUUID()
  organizationId: string; // Needed for workflow resolution

  @IsDateString()
  @Validate(IsNotFutureDateConstraint)
  date: string;

  @IsEnum(MissingType)
  missingType: MissingType;

  @IsOptional()
  @IsDateString()
  correctedIn?: string;

  @IsOptional()
  @IsDateString()
  correctedOut?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
