import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { PushTokenPlatform } from '../entities/user-push-token.entity';

export class UpdateFcmTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsIn(['android', 'ios', 'web'])
  platform: PushTokenPlatform;
}
