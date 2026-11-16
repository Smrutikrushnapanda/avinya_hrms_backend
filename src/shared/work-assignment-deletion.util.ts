import { ForbiddenException } from '@nestjs/common';

export function isAssignmentDeletionOpen(
  createdAt: Date,
  now = Date.now(),
): boolean {
  const age = now - createdAt?.getTime();
  return Number.isFinite(age) && age >= 0 && age < 48 * 60 * 60 * 1000;
}

export function assertAssignmentDeletionOpen(createdAt: Date): void {
  if (!isAssignmentDeletionOpen(createdAt)) {
    throw new ForbiddenException(
      'Assignments can only be deleted within 48 hours of creation',
    );
  }
}
