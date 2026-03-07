import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResignationController } from './resignation.controller';
import { ResignationService } from './resignation.service';
import { ResignationRequest } from './entities/resignation-request.entity';
import { Employee } from '../employee/entities/employee.entity';
import { Organization } from '../auth-core/entities/organization.entity';
import { User } from '../auth-core/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ResignationRequest, Employee, Organization, User])],
  controllers: [ResignationController],
  providers: [ResignationService],
  exports: [ResignationService],
})
export class ResignationModule {}

