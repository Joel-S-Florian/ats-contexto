// Postgres embebido para desarrollo y pruebas cuando no hay Docker (puerto propio, nunca el 5432).
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

export async function startEmbedded(dataDir: string, port = 5433) {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "ats",
    password: "ats",
    port,
    persistent: true,
  });
  if (!existsSync(`${dataDir}/PG_VERSION`)) await pg.initialise();
  await pg.start();
  return {
    adminUrl: (db: string) => `postgresql://ats:ats@localhost:${port}/${db}`,
    appUrl: (db: string) => `postgresql://ats_app:ats_app@localhost:${port}/${db}`,
    createDb: (name: string) => pg.createDatabase(name),
    stop: () => stopServer(pg, dataDir),
  };
}

const run = (file: string, args: string[]) =>
  new Promise<boolean>((resolve) => execFile(file, args, (err) => resolve(!err)));

// pg.stop() llama a `taskkill` por nombre (ENOENT en algunos entornos Windows) y un kill del arbol deja
// huerfanos los procesos hijos de PG 18. Se detiene con pg_ctl por ruta absoluta; taskkill es el respaldo.
async function stopServer(pg: EmbeddedPostgres, dataDir: string) {
  const proc = (pg as unknown as { process?: { pid?: number; spawnfile?: string } }).process;
  if (process.platform !== "win32" || !proc?.pid || !proc.spawnfile) return pg.stop();
  const stopped = await run(join(dirname(proc.spawnfile), "pg_ctl.exe"), [
    "stop",
    "-D",
    dataDir,
    "-m",
    "fast",
    "-w",
  ]);
  if (stopped) return;
  const taskkill = `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\taskkill.exe`;
  await run(taskkill, ["/pid", String(proc.pid), "/f", "/t"]);
}
