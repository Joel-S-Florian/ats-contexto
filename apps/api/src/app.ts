import Fastify from "fastify";
import cors from "@fastify/cors";
import { loggerOptions } from "./logger.js";

export type HealthCheck = () => Promise<void>;
export interface AppDeps {
  webOrigin: string;
  checks: Record<string, HealthCheck>;
  logger?: boolean;
}

export function buildApp({ webOrigin, checks, logger = true }: AppDeps) {
  const app = Fastify({ logger: logger ? loggerOptions : false });
  app.register(cors, { origin: webOrigin });

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

  return app;
}
