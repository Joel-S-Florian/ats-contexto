import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const key = (secret: string) =>
  createHash("sha256").update(`ats-webhook-secrets:${secret}`).digest();

/** Cifra el secreto de firma de un webhook (AES-256-GCM) para guardarlo en reposo. */
export function encryptSecret(plain: string, appSecret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(appSecret), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${iv.toString("base64url")}:${c.getAuthTag().toString("base64url")}:${ct.toString("base64url")}`;
}

export function decryptSecret(stored: string, appSecret: string): string {
  // `plain:` solo existe para datos de desarrollo del seed (clave conocida del sitio de pruebas); nunca en producción.
  if (stored.startsWith("plain:")) {
    if (process.env.NODE_ENV === "production")
      throw new Error("Secreto sin cifrar no permitido en producción");
    return stored.slice(6);
  }
  const [v, iv, tag, ct] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Secreto con formato inválido");
  const d = createDecipheriv("aes-256-gcm", key(appSecret), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

export const newWebhookSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;
