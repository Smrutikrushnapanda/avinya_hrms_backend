import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private clientRepo: Repository<Client>,
  ) {}

  private async generateClientCode(): Promise<string> {
    for (let i = 0; i < 5; i += 1) {
      const code = `CL-${Date.now().toString(36).toUpperCase()}-${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}`;
      const exists = await this.clientRepo.findOne({ where: { clientCode: code } });
      if (!exists) return code;
    }
    return `CL-${Date.now().toString(36).toUpperCase()}`;
  }

  create(dto: CreateClientDto) {
    const saveClient = async () => {
      const clientCode = dto.clientCode?.trim() || (await this.generateClientCode());
      const client = this.clientRepo.create({
        ...dto,
        clientCode,
        isActive: dto.isActive ?? true,
      });
      return this.clientRepo.save(client);
    };

    return saveClient();
  }

  findAll(organizationId: string) {
    return this.clientRepo.find({
      where: { organizationId },
      order: { clientName: 'ASC' },
    });
  }

  async update(id: string, dto: UpdateClientDto) {
    const client = await this.clientRepo.findOne({ where: { id } });
    if (!client) throw new NotFoundException('Client not found');
    Object.assign(client, dto);
    return this.clientRepo.save(client);
  }

  async remove(id: string) {
    const client = await this.clientRepo.findOne({ where: { id } });
    if (!client) throw new NotFoundException('Client not found');
    return this.clientRepo.remove(client);
  }
}
