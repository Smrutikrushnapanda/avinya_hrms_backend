export function getFullName(
  firstName?: string | null,
  middleName?: string | null,
  lastName?: string | null,
): string {
  return [firstName, middleName, lastName]
    .filter((part) => part && part.trim())
    .join(' ')
    .trim();
}
