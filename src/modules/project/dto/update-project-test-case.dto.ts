import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { ProjectTestCaseStatus } from '../entities/project-test-sheet-case.entity';

export class UpdateProjectTestCaseDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  caseCode?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 250)
  title?: string;

  @IsOptional()
  @IsString()
  steps?: string | null;

  @IsOptional()
  @IsString()
  expectedResult?: string | null;

  @IsOptional()
  @IsString()
  actualResult?: string | null;

  @IsOptional()
  @IsUUID()
  qaUserId?: string | null;

  @IsOptional()
  @IsUUID()
  developerUserId?: string | null;

  @IsOptional()
  @IsIn(['pending', 'resolved'])
  status?: ProjectTestCaseStatus;
}
