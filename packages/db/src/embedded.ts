// Postgres embebido para desarrollo y pruebas cuando no hay Docker (puerto propio, nunca el 5432).
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";

export async function startEmbedded(dataDir: string, port = 5433) {
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "ats", password: "ats", port, persistent: true });
  if (!existsSync(`${dataDir}/PG_VERSION`)) await pg.initialise();
  await pg.start();
  return {
    adminUrl: (db: string) => `postgresql://ats:ats@localhost:${port}/${db}`,
    appUrl: (db: string) => `postgresql://ats_app:ats_app@localhost:${port}/${db}`,
    createDb: (name: string) => pg.createDatabase(name),
    stop: () => stopServer(pg),
  };
}

// pg.stop() llama a `taskkill` por nombre y falla con ENOENT en algunos entornos Windows: ruta absoluta.
async function stopServer(pg: EmbeddedPostgres) {
  const pid = (pg as unknown as { process?: { pid?: number } }).process?.pid;
  if (process.platform !== "win32" || !pid) return pg.stop();
  const taskkill = `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\taskkill.exe`;
  await new Promise<void>((resolve) => execFile(taskkill, ["/pid", String(pid), "/f", "/t"], () => resolve()));
}
