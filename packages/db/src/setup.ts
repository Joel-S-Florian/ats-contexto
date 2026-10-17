import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../prisma/migrations");

/**
 * Aplica las migraciones pendientes y crea el rol de aplicación sin SUPERUSER (necesario para que RLS aplique).
 * Es idempotente: se puede ejecutar en cada arranque de desarrollo. Solo para dev/pruebas con Postgres embebido;
 * en producción se usa `prisma migrate deploy`.
 */
export async function migrateAndGrant(adminUrl: string, appPassword = "ats_app") {
  const c = new pg.Client({ connectionString: adminUrl });
  await c.connect();
  try {
    await c.query(
      "CREATE TABLE IF NOT EXISTS _dev_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
    );
    const applied = new Set(
      (await c.query<{ name: string }>("SELECT name FROM _dev_migrations")).rows.map((r) => r.name),
    );
    for (const dir of readdirSync(migrationsDir)
      .filter((d) => /^\d/.test(d))
      .sort()) {
      if (applied.has(dir)) continue;
      await c.query("BEGIN");
      try {
        await c.query(readFileSync(join(migrationsDir, dir, "migration.sql"), "utf8"));
        await c.query("INSERT INTO _dev_migrations (name) VALUES ($1)", [dir]);
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
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
