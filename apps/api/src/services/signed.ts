import { createHmac, timingSafeEqual } from "node:crypto";

/** Token firmado de corta duración para descargar un archivo: lleva el tenant y el documento, no requiere sesión. */
export interface FileClaim {
  doc: string;
  tenant: string;
  exp: number;
}

export function signClaim(claim: FileClaim, secret: string): string {
  const body = Buffer.from(JSON.stringify(claim)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

export function verifyClaim(token: string, secret: string, now = Date.now()): FileClaim | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claim = JSON.parse(Buffer.from(body, "base64url").toString()) as FileClaim;
    return claim.exp > now ? claim : null;
  } catch {
    return null;
  }
}
