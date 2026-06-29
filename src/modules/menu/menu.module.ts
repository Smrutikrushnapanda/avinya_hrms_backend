import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { MenuItem } from './entities/menu-item.entity';
import { MenuItemService } from './services/menu-item.service';
import { MenuItemController } from './controllers/menu-item.controller';
import { MenuSeederService } from './services/menu-seeder.service';
import { PerformanceSettings } from '../performance/entities/performance-settings.entity';
import { WfhRequest } from '../wfh/entities/wfh-request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MenuItem, PerformanceSettings, WfhRequest]),
    JwtModule.register({
      secret: process.env.JWT_SECRET_KEY,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [MenuItemService, MenuSeederService],
  controllers: [MenuItemController],
})
export class MenuModule {}
