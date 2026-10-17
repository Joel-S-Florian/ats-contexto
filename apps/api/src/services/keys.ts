import { randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { withPlatform, type PrismaClient } from "@ats/db";
import { HttpError } from "../auth/plugin.js";

export const newPublicKey = () => `pk_live_${randomBytes(18).toString("base64url")}`;

/** Orígenes exactos (sin comodines). https obligatorio salvo localhost, para desarrollo. */
export function normalizeOrigin(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new HttpError(400, `Origen inválido: ${raw}`);
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(local && u.protocol === "http:"))
    throw new HttpError(400, `El origen debe usar https: ${raw}`);
  return u.origin;
}

export interface PublicTenant {
  id: string;
  name: string;
  allowedOrigins: string[];
}

/** Resuelve el tenant a partir de la clave pública (cabecera x-public-key o ?key=). */
export async function resolvePublicKey(
  prisma: PrismaClient,
  req: FastifyRequest,
  opts: { requireOrigin?: boolean } = {},
): Promise<PublicTenant> {
  const key =
    (req.headers["x-public-key"] as string | undefined) ??
    (req.query as { key?: string } | undefined)?.key;
  if (!key?.startsWith("pk_")) throw new HttpError(401, "Falta la clave pública");
  const row = await withPlatform(prisma, (tx) =>
    tx.apiKey.findFirst({ where: { publicKey: key, kind: "public", revokedAt: null } }),
  );
  const tenant =
    row &&
    (await withPlatform(prisma, (tx) =>
      tx.tenant.findFirst({ where: { id: row.tenantId, status: "active" } }),
    ));
  if (!row || !tenant) throw new HttpError(401, "Clave pública inválida");
  const origin = req.headers.origin;
  if (origin ? !row.allowedOrigins.includes(origin) : opts.requireOrigin)
    throw new HttpError(403, "Origen no permitido para esta clave");
  return { id: tenant.id, name: tenant.name, allowedOrigins: row.allowedOrigins };
}

/** CORS del widget: se refleja el origen solo si alguna clave activa lo permite. */
export async function originAllowed(prisma: PrismaClient, origin: string): Promise<boolean> {
  const row = await withPlatform(prisma, (tx) =>
    tx.apiKey.findFirst({
      where: { kind: "public", revokedAt: null, allowedOrigins: { has: origin } },
      select: { id: true },
    }),
  );
  return Boolean(row);
}
