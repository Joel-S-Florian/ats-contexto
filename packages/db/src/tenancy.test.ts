import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrisma, migrateAndGrant, startEmbedded, withPlatform, withTenant } from "./index.js";
import { seed } from "./seed.js";

let stop: () => Promise<void>;
let prisma: ReturnType<typeof createPrisma>;
let a: string;
let b: string;

beforeAll(async () => {
  const e = await startEmbedded(join(tmpdir(), `ats-pg-test-${process.pid}`), 5444);
  stop = e.stop;
  await e.createDb("t");
  await migrateAndGrant(e.adminUrl("t"));
  prisma = createPrisma(e.appUrl("t"));
  await withPlatform(prisma, async (tx) => {
    a = (await tx.tenant.create({ data: { name: "A", slug: "a" } })).id;
    b = (await tx.tenant.create({ data: { name: "B", slug: "b" } })).id;
    await tx.auditLog.create({ data: { tenantId: a, action: "x" } });
    await tx.auditLog.create({ data: { tenantId: b, action: "y" } });
  });
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await stop?.();
});

describe("RLS", () => {
  it("un tenant solo ve sus filas", async () => {
    const logs = await withTenant(prisma, a, (tx) => tx.auditLog.findMany());
    expect(logs.map((l) => l.action)).toEqual(["x"]);
  });
  it("sin contexto no se ve nada", async () => {
    expect(await prisma.auditLog.findMany()).toHaveLength(0);
  });
  it("no se puede escribir en otro tenant", async () => {
    await expect(
      withTenant(prisma, a, (tx) => tx.auditLog.create({ data: { tenantId: b, action: "z" } })),
    ).rejects.toThrow();
  });
  it("no se puede leer ni modificar el tenant ajeno", async () => {
    const t = await withTenant(prisma, a, (tx) => tx.tenant.findMany());
    expect(t.map((x) => x.slug)).toEqual(["a"]);
    const r = await withTenant(prisma, a, (tx) =>
      tx.tenant.updateMany({ where: { id: b }, data: { name: "hack" } }),
    );
    expect(r.count).toBe(0);
  });

  it("el seed crea dos tenants aislados con vacantes solo en la empresa demo", async () => {
    await seed(prisma);
    await seed(prisma); // idempotente
    const ids = await withPlatform(prisma, (tx) =>
      tx.tenant.findMany({ where: { slug: { in: ["demo", "norte"] } } }),
    );
    const count = (slug: string) =>
      withTenant(prisma, ids.find((t) => t.slug === slug)!.id, (tx) => tx.vacancy.count());
    expect(await count("demo")).toBe(5);
    expect(await count("norte")).toBe(0);
  });
});
