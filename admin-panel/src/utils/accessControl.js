export const ADMIN_ROLES = ['Super Admin', 'Admin']
export const SECURITY_ROLES = ['Super Admin', 'Admin', 'Security Staff', 'Staff']

export function getStoredAdmin() {
  try {
    return JSON.parse(localStorage.getItem('admin') || 'null')
  } catch (error) {
    return null
  }
}

export function normalizeRole(role) {
  return role === 'Staff' ? 'Security Staff' : role
}

export function hasRole(allowedRoles, role) {
  return allowedRoles.includes(normalizeRole(role))
}

export function getDefaultPath(admin) {
  const role = normalizeRole(admin?.role)

  if (role === 'Security Staff') {
    return '/security-gate'
  }

  return '/'
}
