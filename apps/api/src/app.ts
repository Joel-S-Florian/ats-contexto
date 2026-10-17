import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import type { PrismaClient } from "@ats/db";
import { loggerOptions } from "./logger.js";
import { HttpError } from "./auth/plugin.js";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { pipelineRoutes } from "./routes/pipelines.js";
import { vacancyRoutes } from "./routes/vacancies.js";
import { publicRoutes } from "./routes/public.js";
import type { Mailer } from "./mailer.js";

export type HealthCheck = () => Promise<void>;
export interface AppDeps {
  webOrigin: string;
  checks: Record<string, HealthCheck>;
  prisma: PrismaClient;
  mailer: Mailer;
  logger?: boolean;
  loginRateLimit?: number;
}

export function buildApp({
  webOrigin,
  checks,
  prisma,
  mailer,
  logger = true,
  loginRateLimit = 10,
}: AppDeps) {
  const app = Fastify({ logger: logger ? loggerOptions : false });
  app.register(cors, {
    // Datos publicos (solo lectura, sin credenciales) para cualquier origen; el resto, solo el panel.
    delegator: (req, cb) =>
      cb(
        null,
        req.url.startsWith("/public/")
          ? { origin: "*" }
          : {
              origin: webOrigin,
              credentials: true,
              methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
            },
      ),
  });
  app.register(cookie);
  app.register(rateLimit, { global: false });

  app.setErrorHandler((err: Error, _req, reply) => {
    if (err instanceof ZodError)
      return reply
        .code(400)
        .send({ error: "Datos inválidos", issues: err.issues.map((i) => i.message) });
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
    if ((err as { statusCode?: number }).statusCode === 429)
      return reply.code(429).send({ error: "Demasiados intentos, espera un momento" });
    app.log.error({ err: err.message }, "error no controlado");
    return reply.code(500).send({ error: "Error interno" });
  });

  app.get("/health", async (_req, reply) => {
    const entries = await Promise.all(
      Object.entries(checks).map(async ([name, check]) => {
        try {
          await check();
          return [name, "ok"] as const;
        } catch {
          return [name, "down"] as const;
        }
      }),
    );
    const services = Object.fromEntries(entries);
    const ok = entries.every(([, s]) => s === "ok");
    return reply.code(ok ? 200 : 503).send({ status: ok ? "ok" : "degraded", services });
  });

  // Los plugins se registran de forma asincrona: las rutas van dentro de un plugin que espera a cookie y rate-limit.
  app.register(async (scope) => {
    const authenticate = authRoutes(scope, { prisma, mailer, webOrigin, loginRateLimit });
    adminRoutes(scope, { prisma, mailer, webOrigin, authenticate });
    pipelineRoutes(scope, { prisma, authenticate });
    vacancyRoutes(scope, { prisma, authenticate });
    publicRoutes(scope, { prisma });
  });

  return app;
}
