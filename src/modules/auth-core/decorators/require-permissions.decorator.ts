import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'auth:permissions';

// Grants access if the user holds ANY of the given permission names.
export const RequirePermissions = (...permissionNames: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissionNames);
