import type { FastifyReply, FastifyRequest } from "fastify";
import { withPlatform, type PrismaClient, type Role } from "@ats/db";
import { can, type Permission } from "./rbac.js";
import { sha256 } from "./crypto.js";

export const SESSION_COOKIE = "sid";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export interface AuthCtx {
  userId: string;
  isSuperAdmin: boolean;
  /** shortcut: un usuario opera en un solo tenant (su primera membresia); selector de tenant cuando haga falta. */
  tenantId?: string;
  role?: Role;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthCtx;
  }
}

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    /** Código estable para que el panel distinga, p. ej., un límite de plan de un error de validación. */
    public code?: string,
  ) {
    super(message);
  }
}

export async function resolveSession(
  prisma: PrismaClient,
  token: string | undefined,
): Promise<AuthCtx | undefined> {
  if (!token) return undefined;
  return withPlatform(prisma, async (tx) => {
    const session = await tx.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { include: { memberships: { orderBy: { createdAt: "asc" }, take: 1 } } } },
    });
    if (!session || session.expiresAt < new Date()) return undefined;
    const m = session.user.memberships[0];
    return {
      userId: session.userId,
      isSuperAdmin: session.user.isSuperAdmin,
      tenantId: m?.tenantId,
      role: m?.role,
    };
  });
}

export const authenticate = (prisma: PrismaClient) => async (req: FastifyRequest) => {
  req.auth = await resolveSession(prisma, req.cookies[SESSION_COOKIE]);
  if (!req.auth) throw new HttpError(401, "Sesión no válida");
};

export const requireSuperAdmin = async (req: FastifyRequest) => {
  if (!req.auth?.isSuperAdmin) throw new HttpError(403, "No autorizado");
};

/** Devuelve el tenant del solicitante, nunca uno recibido del cliente. */
export function requirePermission(req: FastifyRequest, permission: Permission) {
  const a = req.auth;
  if (!a?.tenantId || !can(a.role, permission)) throw new HttpError(403, "No autorizado");
  return { ...a, tenantId: a.tenantId };
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}
