import net from "node:net";
import { createPrisma } from "@ats/db";
import { apiEnvSchema, parseEnv } from "@ats/shared";
import { buildApp, type HealthCheck } from "./app.js";
import { consoleMailer } from "./mailer.js";

const env = parseEnv(apiEnvSchema, process.env);

const tcp =
  (url: string): HealthCheck =>
  () =>
    new Promise((resolve, reject) => {
      const { hostname, port, protocol } = new URL(url);
      const sock = net.connect({ host: hostname, port: Number(port) || (protocol === "redis:" ? 6379 : 5432), timeout: 1500 });
      sock.once("connect", () => (sock.destroy(), resolve()));
      sock.once("timeout", () => (sock.destroy(), reject(new Error("timeout"))));
      sock.once("error", reject);
    });

const prisma = createPrisma(env.DATABASE_URL);

// shortcut: Redis solo se comprueba por TCP hasta que lleguen las colas (Fase 3).
const app = buildApp({
  webOrigin: env.WEB_ORIGIN,
  prisma,
  mailer: consoleMailer,
  checks: {
    database: async () => void (await prisma.$queryRaw`select 1`),
    redis: tcp(env.REDIS_URL),
  },
});
await app.listen({ port: env.API_PORT, host: env.API_HOST });
