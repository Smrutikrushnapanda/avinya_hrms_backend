import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OfficeTripController } from './office-trip.controller';
import { OfficeTripService } from './office-trip.service';
import { OfficeTripRequest } from './entities/office-trip-request.entity';
import { Employee } from '../employee/entities/employee.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OfficeTripRequest, Employee])],
  controllers: [OfficeTripController],
  providers: [OfficeTripService],
  exports: [OfficeTripService, TypeOrmModule],
})
export class OfficeTripModule {}
