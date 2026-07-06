import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../entities/permission.entity';
import { CreatePermissionDto } from '../dto/roles.dto';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  async findAll(): Promise<Permission[]> {
    return this.permissionRepo.find({ order: { permissionName: 'ASC' } });
  }

  async create(dto: CreatePermissionDto): Promise<Permission> {
    const existing = await this.permissionRepo.findOne({
      where: { permissionName: dto.permissionName },
    });
    if (existing) {
      throw new ConflictException('A permission with this name already exists');
    }
    const permission = this.permissionRepo.create(dto);
    return this.permissionRepo.save(permission);
  }

  async delete(id: string): Promise<void> {
    const permission = await this.permissionRepo.findOne({ where: { id } });
    if (!permission) throw new NotFoundException('Permission not found');
    await this.permissionRepo.delete(id);
  }
}
