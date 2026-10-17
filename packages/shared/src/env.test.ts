import { describe, expect, it } from "vitest";
import { apiEnvSchema, parseEnv } from "./env.js";

const valid = {
  DATABASE_URL: "postgresql://a:b@localhost:5432/x",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "b",
  S3_ACCESS_KEY: "k",
  S3_SECRET_KEY: "s",
  SESSION_SECRET: "x".repeat(32),
  SMTP_URL: "smtp://localhost:1025",
  WEB_ORIGIN: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("aplica valores por defecto", () => {
    expect(parseEnv(apiEnvSchema, valid).API_PORT).toBe(4000);
  });
  it("falla nombrando la variable y sin filtrar su valor", () => {
    const bad = { ...valid, SESSION_SECRET: "corto" };
    expect(() => parseEnv(apiEnvSchema, bad)).toThrow(/SESSION_SECRET/);
    expect(() => parseEnv(apiEnvSchema, bad)).not.toThrow(/corto/);
  });
});
