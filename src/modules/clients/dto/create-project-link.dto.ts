import { IsString, IsUrl, Length } from 'class-validator';

export class CreateProjectLinkDto {
  @IsString()
  @Length(1, 255)
  title: string;

  @IsUrl()
  url: string;
}
