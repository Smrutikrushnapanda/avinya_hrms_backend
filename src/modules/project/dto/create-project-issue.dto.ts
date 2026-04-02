import { IsIn, IsOptional, IsString, IsUrl, IsUUID, Length } from 'class-validator';
import { ProjectIssueStatus } from '../entities/project-issue.entity';

export class CreateProjectIssueDto {
  @IsString()
  @Length(1, 200)
  pageName: string;

  @IsString()
  @Length(1, 250)
  issueTitle: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsIn(['pending', 'resolved'])
  status?: ProjectIssueStatus;

  @IsOptional()
  @IsUUID()
  assigneeUserId?: string | null;
}
