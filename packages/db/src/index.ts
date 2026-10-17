import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.js";

export * from "./generated/client.js";
export { startEmbedded } from "./embedded.js";
export { migrateAndGrant } from "./setup.js";
export { createPipeline, ensureDefaultPipeline } from "./pipelines.js";

export function createPrisma(connectionString: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Unico camino de acceso a tablas de negocio: fija app.tenant_id en la transaccion,
 * de modo que RLS filtra aunque el codigo olvide el where.
 */
export function withTenant<T>(prisma: PrismaClient, tenantId: string, fn: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

/** Camino de plataforma (super administrador, login, alta de tenants). Quien lo llama debe auditar. */
export function withPlatform<T>(prisma: PrismaClient, fn: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.platform', 'on', true)`;
    return fn(tx);
  });
}
