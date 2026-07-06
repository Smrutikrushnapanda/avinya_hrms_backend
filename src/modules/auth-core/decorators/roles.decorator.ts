import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'auth:roles';

// Grants access if the user holds ANY of the given role names.
export const Roles = (...roleNames: string[]) =>
  SetMetadata(ROLES_KEY, roleNames);
