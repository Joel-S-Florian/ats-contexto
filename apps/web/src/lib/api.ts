const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type Role = "admin" | "recruiter" | "area_manager";
export interface Me {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  tenantId?: string;
  role?: Role;
}

export const roleLabels: Record<Role, string> = {
  admin: "Administrador",
  recruiter: "Reclutador",
  area_manager: "Responsable de área",
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = void>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    credentials: "include",
    headers: init.body ? { "content-type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Error inesperado");
  return data as T;
}
