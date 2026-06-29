/** Roles that may list and edit any job card (not only own). */
export function canViewAllJobCards(role?: string | null): boolean {
  const r = String(role || 'user')
    .trim()
    .toLowerCase()
  return r === 'admin' || r === 'superadmin' || r === 'service' || r === 'manager'
}
