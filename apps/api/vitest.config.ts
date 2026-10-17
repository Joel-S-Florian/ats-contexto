import { defineConfig } from "vitest/config";
// Cada archivo de integracion levanta su propio Postgres embebido y hace hashing Argon2: se limita el paralelismo para no saturar la maquina.
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 120_000, maxWorkers: 3 } });
