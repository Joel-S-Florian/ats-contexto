import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@ats/db";
import { buildApp } from "./app.js";
import { consoleMailer } from "./mailer.js";

// /health no toca la base: el prisma se sustituye por un valor vacío.
const make = (checks: Parameters<typeof buildApp>[0]["checks"]) =>
  buildApp({
    webOrigin: "http://localhost:3000",
    checks,
    logger: false,
    prisma: {} as PrismaClient,
    mailer: consoleMailer,
  });

describe("GET /health", () => {
  it("200 cuando todo responde", async () => {
    const res = await make({ database: async () => {} }).inject("/health");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", services: { database: "ok" } });
  });
  it("503 si una dependencia cae", async () => {
    const res = await make({
      redis: async () => {
        throw new Error("x");
      },
    }).inject("/health");
    expect(res.statusCode).toBe(503);
    expect(res.json().services.redis).toBe("down");
  });
});
