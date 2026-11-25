import { Transform } from 'class-transformer';
import { IsBoolean, Matches } from 'class-validator';

export class ApproveLeaveDto {
  @IsBoolean()
  approve: boolean;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/\S/, {
    message: ({ object }) =>
      (object as ApproveLeaveDto).approve === false
        ? 'Rejection reason is required.'
        : 'Remarks are required.',
  })
  remarks: string;
}
