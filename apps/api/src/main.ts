import net from "node:net";
import { apiEnvSchema, parseEnv } from "@ats/shared";
import { buildApp, type HealthCheck } from "./app.js";

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

// shortcut: comprobacion TCP, no consulta real; reemplazar por Prisma/ioredis en Fase 1.
const app = buildApp({
  webOrigin: env.WEB_ORIGIN,
  checks: { database: tcp(env.DATABASE_URL), redis: tcp(env.REDIS_URL) },
});
await app.listen({ port: env.API_PORT, host: env.API_HOST });
