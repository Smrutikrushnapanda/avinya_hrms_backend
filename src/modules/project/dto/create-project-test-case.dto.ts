import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { ProjectTestCaseStatus } from '../entities/project-test-sheet-case.entity';

export class CreateProjectTestCaseDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  caseCode?: string;

  @IsString()
  @Length(1, 250)
  title: string;

  @IsOptional()
  @IsString()
  steps?: string;

  @IsOptional()
  @IsString()
  expectedResult?: string;

  @IsOptional()
  @IsString()
  actualResult?: string;

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
