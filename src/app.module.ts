import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import dataSource from './config/typeorm.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { join } from 'path';
import { ServeStaticModule } from '@nestjs/serve-static';
import { GlobalCacheModule } from './shared/cache.module';
import { AuthCoreModule } from './modules/auth-core/auth-core.module';
import { AttendanceModule } from './modules/attendance/attendance.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(dataSource.options),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/static', // makes your files accessible at /static/*
    }),
    GlobalCacheModule,
    AuthCoreModule,
    AttendanceModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
  ],
})
export class AppModule {}