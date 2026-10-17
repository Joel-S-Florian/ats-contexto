import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import multipart from "@fastify/multipart";
import { MAX_CV_BYTES } from "@ats/shared";
import type { PrismaClient } from "@ats/db";
import { loggerOptions } from "./logger.js";
import { HttpError } from "./auth/plugin.js";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { pipelineRoutes } from "./routes/pipelines.js";
import { vacancyRoutes } from "./routes/vacancies.js";
import { publicRoutes } from "./routes/public.js";
import { candidateRoutes } from "./routes/candidates.js";
import { randomBytes } from "node:crypto";
import { apiKeyRoutes, panelApplicationRoutes } from "./routes/panel-applications.js";
import { publicApplicationRoutes } from "./routes/applications-public.js";
import { originAllowed } from "./services/keys.js";
import { createIngestHandler } from "./services/ingest.js";
import { devCaptcha, type CaptchaVerifier } from "./ports/captcha.js";
import { memoryQueue, type JobQueue } from "./ports/queue.js";
import { eicarScanner, type VirusScanner } from "./ports/scanner.js";
import { localBlobStore, type BlobStore } from "./ports/storage.js";
import {
  createScreeningService,
  defaultAiConfig,
  type AiConfig,
  type ScreeningService,
} from "./services/screening.js";
import type { Mailer } from "./mailer.js";
import { hiringRoutes } from "./routes/hiring.js";
import { metricsRoutes } from "./routes/metrics.js";
import { createSelectionService } from "./services/selection.js";
import { createWebhookService, type WebhookService } from "./services/webhooks.js";
import { assessmentRoutes } from "./routes/assessments.js";
import { communicationRoutes } from "./routes/communication.js";
import { noCalendar, type CalendarProvider } from "./ports/calendar.js";
import { createEmailService } from "./services/email.js";
import { createNotificationService, type NotificationService } from "./services/notifications.js";

export type HealthCheck = () => Promise<void>;
export interface AppDeps {
  webOrigin: string;
  checks: Record<string, HealthCheck>;
  prisma: PrismaClient;
  mailer: Mailer;
  logger?: boolean;
  loginRateLimit?: number;
  publicRateLimit?: number;
  store?: BlobStore;
  scanner?: VirusScanner;
  captcha?: CaptchaVerifier;
  queue?: JobQueue;
  email?: ReturnType<typeof createEmailService>;
  ai?: Partial<AiConfig>;
  /** Secreto para firmar URLs de descarga (SESSION_SECRET en produccion). */
  signingSecret?: string;
  screening?: ScreeningService;
  calendar?: CalendarProvider;
  /** Reloj inyectable: las pruebas controlan el tiempo del examen. */
  clock?: () => Date;
  examRateLimit?: number;
  /** Permite webhooks hacia localhost (sitio de pruebas). Nunca en produccion. */
  allowLocalWebhooks?: boolean;
  webhookFetch?: typeof fetch;
  webhooks?: WebhookService;
}

export function buildApp({
  webOrigin,
  checks,
  prisma,
  mailer,
  logger = true,
  loginRateLimit = 10,
  publicRateLimit = 10,
  store = localBlobStore(".data/files"),
  scanner = eicarScanner,
  captcha = devCaptcha,
  ai,
  signingSecret = randomBytes(32).toString("hex"),
  calendar = noCalendar,
  clock = () => new Date(),
  examRateLimit = 60,
  allowLocalWebhooks = false,
  webhookFetch,
  email = createEmailService({ prisma, mailer }),
  screening = createScreeningService({ prisma, ai: { ...defaultAiConfig, ...ai } }),
  queue = memoryQueue(
    createIngestHandler({ prisma, store, email, screen: (a, t) => screening.screen(a, t) }),
  ),
}: AppDeps) {
  const notifications = createNotificationService({ prisma, email });
  const ssrf = { allowLocalhost: allowLocalWebhooks };
  const webhooks = createWebhookService({
    prisma,
    appSecret: signingSecret,
    ssrf,
    clock,
    fetch: webhookFetch,
  });
  const selection = createSelectionService({ webhooks });
  const app = Fastify({ logger: logger ? loggerOptions : false, maxParamLength: 1000 });
  app.register(cors, {
    // Widget: se refleja el origen solo si alguna clave publica activa lo permite. Panel: solo webOrigin con credenciales.
    delegator: (req, cb) => {
      if (!req.url.startsWith("/public/")) {
        return cb(null, {
          origin: webOrigin,
          credentials: true,
          methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        });
      }
      const origin = req.headers.origin;
      const base = {
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["content-type", "x-public-key"],
      };
      if (!origin) return cb(null, { ...base, origin: false });
      originAllowed(prisma, origin).then(
        (ok) => cb(null, { ...base, origin: ok ? origin : false }),
        (err) => cb(err, { ...base, origin: false }),
      );
    },
  });
  app.register(cookie);
  app.register(multipart, {
    limits: { fileSize: MAX_CV_BYTES, files: 1, fields: 30, fieldSize: 10_000 },
  });
  app.register(rateLimit, { global: false });

  app.setErrorHandler((err: Error, _req, reply) => {
    if (err instanceof ZodError)
      return reply
        .code(400)
        .send({ error: "Datos inválidos", issues: err.issues.map((i) => i.message) });
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
    if ((err as { statusCode?: number }).statusCode === 429)
      return reply.code(429).send({ error: "Demasiados intentos, espera un momento" });
    const code = (err as { code?: string }).code;
    if (code === "FST_REQ_FILE_TOO_LARGE")
      return reply.code(413).send({ error: "El CV supera el tamaño máximo de 5 MB" });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500)
      return reply.code(status).send({ error: "Solicitud inválida" });
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
    publicApplicationRoutes(scope, {
      prisma,
      store,
      scanner,
      captcha,
      queue: () => queue,
      rateLimit: publicRateLimit,
    });
    apiKeyRoutes(scope, { prisma, authenticate });
    candidateRoutes(scope, { prisma, authenticate, store, secret: signingSecret, notifications });
    communicationRoutes(scope, { prisma, authenticate, email, calendar });
    assessmentRoutes(scope, {
      prisma,
      authenticate,
      email,
      webOrigin,
      clock,
      examRateLimit,
      selection,
    });
    hiringRoutes(scope, {
      prisma,
      authenticate,
      selection,
      webhooks,
      notifications,
      appSecret: signingSecret,
      ssrf,
    });
    metricsRoutes(scope, { prisma, authenticate });
    panelApplicationRoutes(scope, { prisma, authenticate, screening });
  });

  app.decorate("queue", queue);
  app.decorate("notifications", notifications);
  app.decorate("webhooks", webhooks);
  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    queue: JobQueue;
    notifications: NotificationService;
    webhooks: WebhookService;
  }
}
