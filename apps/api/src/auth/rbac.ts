import type { Role } from "@ats/db";

// Matriz de docs/04-seguridad-y-privacidad.md sección 2. Se amplía con cada módulo.
export const permissions = {
  "tenants:manage": [],
  "users:manage": ["admin"],
  "vacancies:write": ["admin", "recruiter"],
  "vacancies:read": ["admin", "recruiter", "area_manager"],
  "pipelines:manage": ["admin"],
  "candidates:read": ["admin", "recruiter", "area_manager"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof permissions;

export const can = (role: Role | undefined, permission: Permission) =>
  role !== undefined && (permissions[permission] as readonly Role[]).includes(role);
