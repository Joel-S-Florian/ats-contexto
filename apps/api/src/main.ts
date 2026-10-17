import net from "node:net";
import { createPrisma } from "@ats/db";
import { apiEnvSchema, parseEnv } from "@ats/shared";
import { buildApp, type HealthCheck } from "./app.js";
import { consoleMailer, smtpMailer } from "./mailer.js";
import { googleCalendar, noCalendar } from "./ports/calendar.js";
import { devCaptcha, turnstileVerifier } from "./ports/captcha.js";
import { clamdScanner, eicarScanner } from "./ports/scanner.js";
import { localBlobStore } from "./ports/storage.js";
import {
  claudeProvider,
  geminiProvider,
  mockProvider,
  openaiProvider,
  type AIProvider,
} from "@ats/ai";

const env = parseEnv(apiEnvSchema, process.env);

const tcp =
  (url: string): HealthCheck =>
  () =>
    new Promise((resolve, reject) => {
      const { hostname, port, protocol } = new URL(url);
      const sock = net.connect({
        host: hostname,
        port: Number(port) || (protocol === "redis:" ? 6379 : 5432),
        timeout: 1500,
      });
      sock.once("connect", () => (sock.destroy(), resolve()));
      sock.once("timeout", () => (sock.destroy(), reject(new Error("timeout"))));
      sock.once("error", reject);
    });

const prisma = createPrisma(env.DATABASE_URL);

// Los nombres de modelo y la clave vienen de configuracion, nunca del codigo (docs/03 sec. 8).
const providerCfg = {
  apiKey: env.AI_API_KEY ?? "",
  models: { fast: env.AI_MODEL_FAST ?? "", strong: env.AI_MODEL_STRONG ?? "" },
};
const aiProvider: AIProvider | null = {
  none: null,
  mock: mockProvider(),
  claude: claudeProvider(providerCfg),
  openai: openaiProvider(providerCfg),
  gemini: geminiProvider(providerCfg),
}[env.AI_PROVIDER];

// shortcut: Redis solo se comprueba por TCP hasta que lleguen las colas (Fase 3).
const app = buildApp({
  webOrigin: env.WEB_ORIGIN,
  prisma,
  mailer: env.EMAIL_PROVIDER === "smtp" ? smtpMailer(env.SMTP_URL, env.MAIL_FROM) : consoleMailer,
  calendar:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN
      ? googleCalendar({
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          refreshToken: env.GOOGLE_REFRESH_TOKEN,
        })
      : noCalendar,
  ai: {
    provider: aiProvider,
    globalDailyCap: env.AI_GLOBAL_DAILY_CAP,
    globalMonthlyCap: env.AI_GLOBAL_MONTHLY_CAP,
    priceInMicrosPerM: env.AI_PRICE_IN_MICROS_PER_M,
    priceOutMicrosPerM: env.AI_PRICE_OUT_MICROS_PER_M,
  },
  store: localBlobStore(env.FILE_STORAGE_DIR),
  signingSecret: env.SESSION_SECRET,
  allowLocalWebhooks: env.ALLOW_LOCAL_WEBHOOKS,
  landingOrigin: env.LANDING_ORIGIN,
  operatorEmail: env.OPERATOR_EMAIL,
  captcha:
    env.CAPTCHA_PROVIDER === "turnstile" ? turnstileVerifier(env.TURNSTILE_SECRET!) : devCaptcha,
  scanner: env.AV_PROVIDER === "clamav" ? clamdScanner(env.CLAMD_HOST) : eicarScanner,
  checks: {
    database: async () => void (await prisma.$queryRaw`select 1`),
    redis: tcp(env.REDIS_URL),
  },
});
// Avisos de rechazo diferidos: revisa los vencidos cada minuto. shortcut: temporizador en proceso; con varias instancias va a una cola (BullMQ).
setInterval(() => void app.notifications.processDue().catch(() => undefined), 60_000).unref();
// Entregas de webhook pendientes y reintentos: cada 15 s. shortcut: temporizador en proceso; con varias instancias va a una cola (BullMQ).
setInterval(() => void app.webhooks.processDue().catch(() => undefined), 15_000).unref();
// Retención de datos: una pasada diaria (anonimiza lo vencido según el plazo de cada empresa).
setInterval(
  () => void app.privacy.processRetention().catch(() => undefined),
  24 * 3600_000,
).unref();
await app.listen({ port: env.API_PORT, host: env.API_HOST });
