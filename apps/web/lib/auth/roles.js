export function hasRole(session, roleCode) {
  if (!roleCode) return true;
  if (session?.isSuperAdmin) return true;
  return Boolean(session?.roles?.some((role) => role?.code === roleCode));
}

export function hasAnyRole(session, roleCodes = []) {
  if (!Array.isArray(roleCodes) || roleCodes.length === 0) return true;
  if (session?.isSuperAdmin) return true;
  return roleCodes.some((roleCode) => hasRole(session, roleCode));
}

export function hasPermission(session, permission) {
  if (session?.isSuperAdmin) return true;
  return Boolean(session?.permissions?.includes(permission));
}

// Permission checks for role dashboards fail closed. A session with no
// permission list must not unlock sections by accident.
export function canAccess(session, requiredPermissions) {
  const candidates = Array.isArray(requiredPermissions)
    ? requiredPermissions
    : requiredPermissions
      ? [requiredPermissions]
      : [];
  if (candidates.length === 0) return true;
  if (session?.isSuperAdmin) return true;
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  return candidates.some((permission) => permissions.includes(permission));
}
