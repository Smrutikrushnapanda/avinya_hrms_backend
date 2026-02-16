export class CreateHolidayDto {
  organizationId: string;
  name: string;
  date: string | Date;
  description?: string;
  isOptional?: boolean;
}

export class UpdateHolidayDto {
  name?: string;
  date?: string | Date;
  description?: string;
  isOptional?: boolean;
}
