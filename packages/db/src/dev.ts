// Base de datos de desarrollo sin Docker: Postgres embebido en el puerto 5433 con datos de ejemplo.
// Uso: pnpm db:dev   (deja el proceso corriendo; Ctrl+C para detener)
import { join } from "node:path";
import { createPrisma, migrateAndGrant, startEmbedded } from "./index.js";
import { seed } from "./seed.js";

const dir = join(process.cwd(), ".data", "pg");
const e = await startEmbedded(dir, 5433);
try {
  await e.createDb("ats");
  await migrateAndGrant(e.adminUrl("ats"));
} catch {
  // la base ya existe de una ejecucion anterior: las migraciones solo se aplican la primera vez
}
const prisma = createPrisma(e.appUrl("ats"));
await seed(prisma);
console.log(`DATABASE_URL=${e.appUrl("ats")}`);
console.log(
  "Listo. Usuarios de ejemplo: root@demo.test, admin@demo.test, recruiter@demo.test (contraseña demo-demo-1234)",
);

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  await e.stop();
  process.exit(0);
});
setInterval(() => {}, 1 << 30);
