import { IsString, Length } from 'class-validator';

export class UpdateProjectMemberRoleDto {
  @IsString()
  @Length(2, 30)
  role: string;
}
