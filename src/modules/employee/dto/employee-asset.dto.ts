import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { AssetStatus } from '../entities/employee-asset.entity';

export class CreateEmployeeAssetDto {
  @IsString()
  @IsNotEmpty()
  assetType: string;

  @IsString()
  @IsNotEmpty()
  assetName: string;

  @IsString()
  @IsNotEmpty()
  assetId: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsString()
  @IsOptional()
  condition?: string;

  @IsDateString()
  @IsNotEmpty()
  issueDate: string;

  @IsDateString()
  @IsOptional()
  expectedReturnDate?: string;

  @IsEnum(AssetStatus)
  @IsOptional()
  status?: AssetStatus;

  @IsBoolean()
  @IsOptional()
  isReturnRequired?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateEmployeeAssetDto {
  @IsString()
  @IsOptional()
  assetType?: string;

  @IsString()
  @IsOptional()
  assetName?: string;

  @IsString()
  @IsOptional()
  assetId?: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsString()
  @IsOptional()
  condition?: string;

  @IsDateString()
  @IsOptional()
  issueDate?: string;

  @IsDateString()
  @IsOptional()
  expectedReturnDate?: string;

  @IsDateString()
  @IsOptional()
  actualReturnDate?: string;

  @IsEnum(AssetStatus)
  @IsOptional()
  status?: AssetStatus;

  @IsBoolean()
  @IsOptional()
  isReturnRequired?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class ReturnAssetDto {
  @IsDateString()
  @IsOptional()
  actualReturnDate?: string;

  @IsString()
  @IsOptional()
  condition?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
