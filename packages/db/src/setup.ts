import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../prisma/migrations");

/**
 * Aplica las migraciones y crea el rol de aplicacion sin SUPERUSER (necesario para que RLS aplique).
 * Solo para dev/pruebas con Postgres embebido; en produccion se usa `prisma migrate deploy`.
 */
export async function migrateAndGrant(adminUrl: string, appPassword = "ats_app") {
  const c = new pg.Client({ connectionString: adminUrl });
  await c.connect();
  try {
    for (const dir of readdirSync(migrationsDir)
      .filter((d) => /^\d/.test(d))
      .sort()) {
      await c.query(readFileSync(join(migrationsDir, dir, "migration.sql"), "utf8"));
    }
    await c.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ats_app') THEN
        CREATE ROLE ats_app LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOBYPASSRLS;
      END IF; END $$`);
    await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ats_app`);
  } finally {
    await c.end();
  }
}
