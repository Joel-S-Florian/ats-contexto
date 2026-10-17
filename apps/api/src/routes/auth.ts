import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withPlatform, type PrismaClient } from "@ats/db";
import { DUMMY_HASH, hashPassword, newToken, sha256, verifyPassword } from "../auth/crypto.js";
import {
  HttpError,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  authenticate,
  resolveSession,
  setSessionCookie,
} from "../auth/plugin.js";
import type { Mailer } from "../mailer.js";

const password = z.string().min(10, "La contraseña debe tener al menos 10 caracteres").max(200);
const email = z.string().email().toLowerCase();

export interface AuthDeps {
  prisma: PrismaClient;
  mailer: Mailer;
  webOrigin: string;
  loginRateLimit: number;
}

export function authRoutes(
  app: FastifyInstance,
  { prisma, mailer, webOrigin, loginRateLimit }: AuthDeps,
) {
  const meOf = async (token?: string) => {
    const a = await resolveSession(prisma, token);
    if (!a) return undefined;
    const user = await withPlatform(prisma, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: a.userId } }),
    );
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      isSuperAdmin: a.isSuperAdmin,
      tenantId: a.tenantId,
      role: a.role,
    };
  };

  app.post(
    "/auth/login",
    { config: { rateLimit: { max: loginRateLimit, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = z.object({ email, password: z.string().min(1) }).parse(req.body);
      const user = await withPlatform(prisma, (tx) =>
        tx.user.findUnique({ where: { email: body.email } }),
      );
      // Verifica siempre un hash para no revelar por tiempo si el correo existe.
      const ok = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, body.password);
      if (!user || !ok) throw new HttpError(401, "Correo o contraseña incorrectos");

      const token = newToken();
      await withPlatform(prisma, (tx) =>
        tx.session.create({
          data: {
            userId: user.id,
            tokenHash: sha256(token),
            expiresAt: new Date(Date.now() + SESSION_TTL_MS),
          },
        }),
      );
      setSessionCookie(reply, token); // sesion nueva en cada login (rotacion)
      return meOf(token);
    },
  );

  app.post("/auth/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token)
      await withPlatform(prisma, (tx) =>
        tx.session.deleteMany({ where: { tokenHash: sha256(token) } }),
      );
    reply.clearCookie(SESSION_COOKIE, { path: "/" }).code(204).send();
  });

  app.get("/auth/me", async (req) => {
    const me = await meOf(req.cookies[SESSION_COOKIE]);
    if (!me) throw new HttpError(401, "Sesión no válida");
    return me;
  });

  app.post(
    "/auth/password/forgot",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { email: to } = z.object({ email }).parse(req.body);
      const user = await withPlatform(prisma, (tx) => tx.user.findUnique({ where: { email: to } }));
      if (user) {
        const token = newToken();
        await withPlatform(prisma, (tx) =>
          tx.passwordReset.create({
            data: {
              userId: user.id,
              tokenHash: sha256(token),
              expiresAt: new Date(Date.now() + 3600_000),
            },
          }),
        );
        await mailer.send(
          to,
          "Recuperación de contraseña",
          `${webOrigin}/restablecer?token=${token}`,
        );
      }
      reply.code(204).send(); // misma respuesta exista o no el correo
    },
  );

  app.post("/auth/password/reset", async (req, reply) => {
    const body = z.object({ token: z.string().min(1), password }).parse(req.body);
    const passwordHash = await hashPassword(body.password);
    await withPlatform(prisma, async (tx) => {
      const reset = await tx.passwordReset.findUnique({ where: { tokenHash: sha256(body.token) } });
      if (!reset || reset.usedAt || reset.expiresAt < new Date())
        throw new HttpError(400, "Enlace inválido o vencido");
      await tx.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: reset.userId } }); // cierra todas las sesiones
    });
    reply.code(204).send();
  });

  app.post("/auth/invitations/accept", async (req, reply) => {
    const body = z
      .object({ token: z.string().min(1), name: z.string().min(1).max(120), password })
      .parse(req.body);
    const passwordHash = await hashPassword(body.password);
    await withPlatform(prisma, async (tx) => {
      const inv = await tx.invitation.findUnique({ where: { tokenHash: sha256(body.token) } });
      if (!inv || inv.acceptedAt || inv.expiresAt < new Date())
        throw new HttpError(400, "Invitación inválida o vencida");
      if (await tx.user.findUnique({ where: { email: inv.email } }))
        throw new HttpError(409, "El correo ya tiene cuenta");
      const user = await tx.user.create({
        data: { email: inv.email, name: body.name, passwordHash },
      });
      await tx.membership.create({
        data: { tenantId: inv.tenantId, userId: user.id, role: inv.role },
      });
      await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          tenantId: inv.tenantId,
          actorId: user.id,
          action: "invitation.accepted",
          target: inv.role,
        },
      });
    });
    reply.code(204).send();
  });

  return authenticate(prisma);
}
