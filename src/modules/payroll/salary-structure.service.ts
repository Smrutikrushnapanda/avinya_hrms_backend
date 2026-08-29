import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalaryStructure } from './entities/salary-structure.entity';
import {
  CreateSalaryStructureDto,
  UpdateSalaryStructureDto,
} from './dto/salary-structure.dto';
import { Employee } from '../employee/entities/employee.entity';

@Injectable()
export class SalaryStructureService {
  private readonly logger = new Logger(SalaryStructureService.name);

  constructor(
    @InjectRepository(SalaryStructure)
    private readonly salaryStructureRepo: Repository<SalaryStructure>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  private computeTotals(values: {
    basic?: number;
    hra?: number;
    conveyance?: number;
    otherAllowances?: number;
    pf?: number;
    tds?: number;
  }) {
    const basic = Number(values.basic || 0);
    const hra = Number(values.hra || 0);
    const conveyance = Number(values.conveyance || 0);
    const otherAllowances = Number(values.otherAllowances || 0);
    const pf = Number(values.pf || 0);
    const tds = Number(values.tds || 0);
    const grossSalary = basic + hra + conveyance + otherAllowances;
    const totalDeductions = pf + tds;
    const netSalary = grossSalary - totalDeductions;
    return { grossSalary, totalDeductions, netSalary };
  }

  private async validateNoConflictingOpenEnded(
    employeeId: string,
    effectiveFrom: string,
    effectiveTo: string | null | undefined,
    excludeId?: string,
  ): Promise<void> {
    // Only need to check when the new structure has no end date (open-ended)
    if (effectiveTo) return;

    const qb = this.salaryStructureRepo
      .createQueryBuilder('ss')
      .where('ss.employeeId = :employeeId', { employeeId })
      .andWhere('ss.status = :status', { status: 'active' })
      .andWhere('ss.effectiveTo IS NULL');

    if (excludeId) {
      qb.andWhere('ss.id != :excludeId', { excludeId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        'An active open-ended salary structure already exists for this employee. Set an effective end date before creating a new one.',
      );
    }
  }

  async create(dto: CreateSalaryStructureDto): Promise<SalaryStructure> {
    const employee = await this.employeeRepo.findOne({
      where: { id: dto.employeeId },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const totals = this.computeTotals(dto);

    // Validate no conflicting open-ended structure
    await this.validateNoConflictingOpenEnded(
      dto.employeeId,
      dto.effectiveFrom,
      dto.effectiveTo,
    );

    // If creating an active structure, deactivate any existing active structure
    // for the same employee that overlaps with the effective period
    if (!dto.status || dto.status === 'active') {
      await this.deactivateOverlapping(
        dto.employeeId,
        dto.effectiveFrom,
        dto.effectiveTo,
      );
    }

    const structure = this.salaryStructureRepo.create({
      organizationId: dto.organizationId,
      employeeId: dto.employeeId,
      name: dto.name,
      basic: dto.basic,
      hra: dto.hra,
      conveyance: dto.conveyance,
      otherAllowances: dto.otherAllowances,
      pf: dto.pf,
      tds: dto.tds,
      grossSalary: totals.grossSalary,
      totalDeductions: totals.totalDeductions,
      netSalary: totals.netSalary,
      effectiveFrom: new Date(dto.effectiveFrom),
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      status: dto.status || 'active',
      notes: dto.notes,
    });

    return this.salaryStructureRepo.save(structure);
  }

  async update(
    id: string,
    dto: UpdateSalaryStructureDto,
  ): Promise<SalaryStructure> {
    const structure = await this.salaryStructureRepo.findOne({
      where: { id },
    });
    if (!structure) {
      throw new NotFoundException('Salary structure not found');
    }

    // Apply partial updates
    if (dto.name !== undefined) structure.name = dto.name;
    if (dto.basic !== undefined) structure.basic = dto.basic;
    if (dto.hra !== undefined) structure.hra = dto.hra;
    if (dto.conveyance !== undefined) structure.conveyance = dto.conveyance;
    if (dto.otherAllowances !== undefined)
      structure.otherAllowances = dto.otherAllowances;
    if (dto.pf !== undefined) structure.pf = dto.pf;
    if (dto.tds !== undefined) structure.tds = dto.tds;
    if (dto.effectiveFrom !== undefined)
      structure.effectiveFrom = new Date(dto.effectiveFrom);
    if (dto.effectiveTo !== undefined)
      structure.effectiveTo = dto.effectiveTo
        ? new Date(dto.effectiveTo)
        : null;
    if (dto.status !== undefined) structure.status = dto.status;
    if (dto.notes !== undefined) structure.notes = dto.notes;

    // Recompute totals
    const totals = this.computeTotals(structure);
    structure.grossSalary = totals.grossSalary;
    structure.totalDeductions = totals.totalDeductions;
    structure.netSalary = totals.netSalary;

    // If setting active, validate no conflicting open-ended structure and deactivate overlapping
    if (structure.status === 'active') {
      await this.validateNoConflictingOpenEnded(
        structure.employeeId,
        structure.effectiveFrom.toISOString().slice(0, 10),
        structure.effectiveTo
          ? structure.effectiveTo.toISOString().slice(0, 10)
          : null,
        structure.id,
      );

      await this.deactivateOverlapping(
        structure.employeeId,
        structure.effectiveFrom.toISOString().slice(0, 10),
        structure.effectiveTo
          ? structure.effectiveTo.toISOString().slice(0, 10)
          : undefined,
        structure.id,
      );
    }

    return this.salaryStructureRepo.save(structure);
  }

  private async deactivateOverlapping(
    employeeId: string,
    effectiveFrom: string,
    effectiveTo?: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.salaryStructureRepo
      .createQueryBuilder('ss')
      .update(SalaryStructure)
      .set({ status: 'inactive' })
      .where('ss.employeeId = :employeeId', { employeeId })
      .andWhere('ss.status = :status', { status: 'active' });

    if (excludeId) {
      qb.andWhere('ss.id != :excludeId', { excludeId });
    }

    // Overlap condition: existing.effectiveFrom <= new.effectiveTo
    // AND (existing.effectiveTo IS NULL OR existing.effectiveTo >= new.effectiveFrom)
    if (effectiveTo) {
      qb.andWhere(
        '(ss.effectiveFrom <= :effectiveTo AND (ss.effectiveTo IS NULL OR ss.effectiveTo >= :effectiveFrom))',
        { effectiveFrom, effectiveTo },
      );
    } else {
      // New structure has no end date — overlaps with any existing structure
      // whose effectiveTo is null OR whose effectiveTo >= new effectiveFrom
      qb.andWhere(
        '(ss.effectiveTo IS NULL OR ss.effectiveTo >= :effectiveFrom)',
        { effectiveFrom },
      );
    }

    await qb.execute();
  }

  async findAll(organizationId: string) {
    return this.salaryStructureRepo.find({
      where: { organizationId },
      relations: ['employee'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByEmployee(employeeId: string) {
    return this.salaryStructureRepo.find({
      where: { employeeId },
      order: { effectiveFrom: 'DESC' },
    });
  }

  async findActiveByEmployee(
    employeeId: string,
  ): Promise<SalaryStructure | null> {
    const today = new Date().toISOString().slice(0, 10);
    return this.salaryStructureRepo
      .createQueryBuilder('ss')
      .where('ss.employeeId = :employeeId', { employeeId })
      .andWhere('ss.status = :status', { status: 'active' })
      .andWhere('ss.effectiveFrom <= :today', { today })
      .andWhere('(ss.effectiveTo IS NULL OR ss.effectiveTo >= :today)', {
        today,
      })
      .orderBy('ss.effectiveFrom', 'DESC')
      .getOne();
  }

  async findOne(id: string): Promise<SalaryStructure> {
    const structure = await this.salaryStructureRepo.findOne({
      where: { id },
      relations: ['employee'],
    });
    if (!structure) {
      throw new NotFoundException('Salary structure not found');
    }
    return structure;
  }

  async remove(id: string): Promise<{ message: string }> {
    const structure = await this.salaryStructureRepo.findOne({
      where: { id },
    });
    if (!structure) {
      throw new NotFoundException('Salary structure not found');
    }
    await this.salaryStructureRepo.remove(structure);
    return { message: 'Salary structure deleted successfully' };
  }
}
