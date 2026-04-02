import { IsIn, IsOptional, IsString, IsUrl, Length } from 'class-validator';
import { ProjectIssueStatus } from '../entities/project-issue.entity';

export class UpdateProjectIssueDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  pageName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 250)
  issueTitle?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsIn(['pending', 'resolved'])
  status?: ProjectIssueStatus;
}
