import { Module } from '@nestjs/common';
import { Common } from './common.service';
import { CommonController } from './common.controller';

@Module({
  controllers: [CommonController],
  providers: [Common],
  exports: [Common],
})
export class CommonModule {}