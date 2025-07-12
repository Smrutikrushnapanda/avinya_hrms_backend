import { Module } from '@nestjs/common';
import { Common } from './common.service';

@Module({
  providers: [Common],
  exports: [Common],
})
export class CommonModule {}
