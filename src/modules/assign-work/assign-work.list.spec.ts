import {
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { AssignWorkService } from './assign-work.service';

describe('Assign Work list validation', () => {
  const service = Object.create(
    AssignWorkService.prototype,
  ) as AssignWorkService;
  const load = jest.fn().mockResolvedValue([]);
  Object.assign(service, { loadAssignments: load, logger: new Logger('test') });
  beforeEach(() => load.mockClear());

  it.each([
    [0, 2026],
    [13, 2026],
    [1.5, 2026],
    [10, 0],
    [10, 2026.5],
    [10, undefined],
    [undefined, 2026],
    [10, 10000],
  ])(
    'rejects invalid month/year %s/%s before querying',
    async (month, year) => {
      await expect(
        service.getMy('org', 'user', month, year),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.getByMe('org', 'user', month, year),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(load).not.toHaveBeenCalled();
    },
  );
  it('rejects absent authenticated context before querying', async () => {
    await expect(service.getMy('', 'user')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.getByMe('org', undefined)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(load).not.toHaveBeenCalled();
  });
});
