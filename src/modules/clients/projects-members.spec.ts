import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ClientProject } from './entities/project.entity';
import { ClientProjectMember } from './entities/client-project-member.entity';
import { Employee } from '../employee/entities/employee.entity';
import { ProjectTask } from './entities/project-task.entity';
import { ClientProjectDocument } from './entities/client-project-document.entity';
import { ClientProjectLink } from './entities/client-project-link.entity';
import { ProjectTestSheetTab } from '../project/entities/project-test-sheet-tab.entity';
import { ProjectTestSheetCase } from '../project/entities/project-test-sheet-case.entity';
import { ProjectTestSheetChangeLog } from '../project/entities/project-test-sheet-log.entity';
import { User } from '../auth-core/entities/user.entity';
import { Timesheet } from '../workflow/timesheet/entities/timesheet.entity';
import { MessageService } from '../message/message.service';
import { LogReportService } from '../log-report/log-report.service';

describe('Client project team members', () => {
  let service: ProjectsService;
  const projectRepo = { findOne: jest.fn() };
  const memberRepo = { find: jest.fn() };
  const employeeRepo = { findOne: jest.fn() };
  const manager = {
    id: 'employee-manager',
    userId: 'user-manager',
    firstName: 'Rahul',
    lastName: 'Patro',
    designation: { name: 'Project Manager' },
    user: { email: 'manager@example.test' },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    projectRepo.findOne.mockResolvedValue({
      id: 'project',
      organizationId: 'organization',
      manager,
      createdAt: new Date('2026-10-15T09:00:00Z'),
    });
    memberRepo.find.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getRepositoryToken(ClientProject), useValue: projectRepo },
        {
          provide: getRepositoryToken(ClientProjectMember),
          useValue: memberRepo,
        },
        { provide: getRepositoryToken(Employee), useValue: employeeRepo },
        ...[
          ProjectTask,
          ClientProjectDocument,
          ClientProjectLink,
          ProjectTestSheetTab,
          ProjectTestSheetCase,
          ProjectTestSheetChangeLog,
          User,
          Timesheet,
        ].map((entity) => ({
          provide: getRepositoryToken(entity),
          useValue: {},
        })),
        { provide: MessageService, useValue: {} },
        { provide: LogReportService, useValue: {} },
      ],
    }).compile();
    service = module.get(ProjectsService);
  });

  it('returns manager designation and employee ID without a member row', async () => {
    const result = await service.getProjectEmployees('project', 'organization');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      employeeId: 'employee-manager',
      userId: 'user-manager',
      designation: 'Project Manager',
      role: 'manager',
    });
    expect(projectRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'project' },
      relations: ['manager', 'manager.user', 'manager.designation'],
    });
  });

  it('preserves manager designation when also present in member records', async () => {
    memberRepo.find.mockResolvedValue([
      { userId: 'user-manager', role: 'member', user: manager.user },
    ]);
    employeeRepo.findOne.mockResolvedValue(manager);

    const result = await service.getProjectEmployees('project', 'organization');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      employeeId: 'employee-manager',
      designation: 'Project Manager',
      role: 'manager',
    });
  });

  it('rejects access to another organization before loading team members', async () => {
    await expect(
      service.getProjectEmployees('project', 'another-organization'),
    ).rejects.toThrow(ForbiddenException);
    expect(memberRepo.find).not.toHaveBeenCalled();
    expect(employeeRepo.findOne).not.toHaveBeenCalled();
  });
});
