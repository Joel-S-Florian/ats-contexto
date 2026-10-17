import dns from "node:dns/promises";
import { isIP } from "node:net";

/** Direcciones que un webhook nunca debe alcanzar: redes privadas, loopback, enlace local, metadatos de nube (docs/04 sección 6). */
export function isBlockedIp(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return isBlockedIp(mapped[1]!);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // enlace local y metadatos 169.254.169.254
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast y reservadas
    );
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe8") ||
    v6.startsWith("fe9") ||
    v6.startsWith("fea") ||
    v6.startsWith("feb") ||
    v6.startsWith("ff")
  );
}

export class UnsafeUrlError extends Error {}

/** `allowLocalhost` solo para desarrollo y demostraciones: permite loopback (el sitio de pruebas), nunca redes privadas. */
export interface SsrfOptions {
  allowLocalhost: boolean;
}

const loopback = (ip: string) => ip === "::1" || ip.startsWith("127.");

/** Valida la URL de un destino: https (http solo a localhost en desarrollo), sin credenciales y con IP pública. */
export async function assertSafeUrl(raw: string, opts: SsrfOptions): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError("La URL no es válida.");
  }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const isLocal = host === "localhost" || loopback(host);
  if (u.username || u.password)
    throw new UnsafeUrlError("La URL no puede incluir usuario ni contraseña.");
  if (u.protocol !== "https:" && !(opts.allowLocalhost && isLocal && u.protocol === "http:"))
    throw new UnsafeUrlError("El destino debe usar https.");
  if (isLocal) {
    if (!opts.allowLocalhost) throw new UnsafeUrlError("No se permiten direcciones internas.");
    return u;
  }
  const addrs = isIP(host)
    ? [host]
    : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addrs.length === 0) throw new UnsafeUrlError("No se pudo resolver el dominio del destino.");
  if (addrs.some(isBlockedIp))
    throw new UnsafeUrlError("No se permiten direcciones internas ni redes privadas.");
  return u;
}

/**
 * `lookup` para el cliente HTTP: valida la IP en el momento de conectar, así un dominio que cambie de dirección
 * entre el registro y el envío (DNS rebinding) tampoco llega a una red interna.
 */
export function safeLookup(opts: SsrfOptions) {
  return (
    hostname: string,
    options: { all?: boolean },
    cb: (err: Error | null, address?: unknown, family?: number) => void,
  ) => {
    dns.lookup(hostname, { all: true }).then(
      (addrs) => {
        const ok = addrs.filter(
          (a) => (opts.allowLocalhost && loopback(a.address)) || !isBlockedIp(a.address),
        );
        if (ok.length === 0) return cb(new UnsafeUrlError("Destino no permitido"));
        if (options.all) return cb(null, ok);
        cb(null, ok[0]!.address, ok[0]!.family);
      },
      (e) => cb(e as Error),
    );
  };
}
