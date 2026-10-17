import { createHmac, timingSafeEqual } from "node:crypto";

// Entrada aparte (`@ats/shared/webhook`): usa node:crypto y no debe entrar al bundle del navegador.
// Firma de la API de contratados (docs/02 sección 8): HMAC SHA-256 de `${timestamp}.${cuerpo}` con el secreto del endpoint.

export const WEBHOOK_SCHEMA_VERSION = "1.0";
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function signWebhook(secret: string, timestamp: number, body: string): string {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export type VerifyResult =
  { ok: true } | { ok: false; reason: "missing_headers" | "stale_timestamp" | "bad_signature" };

/**
 * Para receptores (el sitio de pruebas lo usa de referencia): valida la firma con comparación de tiempo constante
 * y rechaza marcas de tiempo fuera de la tolerancia, lo que impide reproducir un envío viejo (replay).
 */
export function verifyWebhook(args: {
  secret: string;
  body: string;
  signature?: string | null;
  timestamp?: string | null;
  toleranceSeconds?: number;
  nowSeconds?: number;
}): VerifyResult {
  const { secret, body, signature, timestamp } = args;
  if (!signature || !timestamp || !/^\d{9,11}$/.test(timestamp))
    return { ok: false, reason: "missing_headers" };
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > (args.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS))
    return { ok: false, reason: "stale_timestamp" };
  const expected = Buffer.from(signWebhook(secret, Number(timestamp), body));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected)
    ? { ok: true }
    : { ok: false, reason: "bad_signature" };
}

/** Evento candidate.hired, versión 1.0 de la carga. */
export interface HiredEventData {
  hire_id: string;
  internal_reference: string;
  hired_at: string;
  start_date: string | null;
  candidate: { full_name: string; email: string; phone: string };
  position: {
    vacancy_id: string | null;
    title: string | null;
    department: string | null;
    employment_type: string | null;
    work_mode: string | null;
    location: string | null;
  };
}
export interface WebhookEnvelope<T = HiredEventData> {
  schema_version: string;
  id: string;
  event: string;
  occurred_at: string;
  data: T;
}
