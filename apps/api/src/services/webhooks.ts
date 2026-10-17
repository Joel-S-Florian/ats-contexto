import { randomUUID } from "node:crypto";
import { Agent } from "undici";
import { withPlatform, withTenant, type Prisma, type PrismaClient, type Tx } from "@ats/db";
import { WEBHOOK_SCHEMA_VERSION, signWebhook, type WebhookEnvelope } from "@ats/shared/webhook";
import { decryptSecret } from "./secrets.js";
import { UnsafeUrlError, assertSafeUrl, safeLookup, type SsrfOptions } from "./ssrf.js";

/** Espera entre reintentos (docs/02 sección 8: espera exponencial). Tras agotarlos, la entrega queda en "fallida" y se puede reenviar. */
export const RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 3600_000,
  6 * 3600_000,
  24 * 3600_000,
  24 * 3600_000,
];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export interface WebhookDeps {
  prisma: PrismaClient;
  appSecret: string;
  ssrf: SsrfOptions;
  /** Inyectable para pruebas. */
  fetch?: typeof fetch;
  clock?: () => Date;
  timeoutMs?: number;
}

export function createWebhookService(deps: WebhookDeps) {
  const { prisma, appSecret, ssrf } = deps;
  const clock = deps.clock ?? (() => new Date());
  const agent = new Agent({ connect: { lookup: safeLookup(ssrf) as never } });
  const doFetch: typeof fetch =
    deps.fetch ?? ((url, init) => fetch(url, { ...init, dispatcher: agent } as RequestInit));

  /** Registra una entrega pendiente por cada endpoint activo suscrito al evento. Se llama dentro de la transacción del hecho. */
  async function emit(tx: Tx, tenantId: string, event: string, data: unknown) {
    const endpoints = await tx.webhookEndpoint.findMany({
      where: { tenantId, active: true, events: { has: event } },
    });
    const out: string[] = [];
    for (const ep of endpoints) {
      const eventId = `evt_${randomUUID()}`;
      const envelope: WebhookEnvelope<unknown> = {
        schema_version: WEBHOOK_SCHEMA_VERSION,
        id: eventId,
        event,
        occurred_at: clock().toISOString(),
        data,
      };
      const d = await tx.webhookDelivery.create({
        data: {
          tenantId,
          endpointId: ep.id,
          eventId,
          event,
          payload: envelope as unknown as Prisma.InputJsonValue,
          nextAttemptAt: clock(),
        },
      });
      out.push(d.id);
    }
    return out;
  }

  async function attempt(
    deliveryId: string,
    tenantId: string,
  ): Promise<"success" | "retry" | "failed" | "skipped"> {
    const d = await withTenant(prisma, tenantId, (tx) =>
      tx.webhookDelivery.findFirst({ where: { id: deliveryId, tenantId } }),
    );
    if (!d || d.status !== "pending") return "skipped";
    const ep = await withTenant(prisma, tenantId, (tx) =>
      tx.webhookEndpoint.findFirst({ where: { id: d.endpointId, tenantId } }),
    );
    const finish = (data: Prisma.WebhookDeliveryUpdateInput) =>
      withTenant(prisma, tenantId, (tx) =>
        tx.webhookDelivery.update({ where: { id: d.id }, data }),
      );

    const attempts = d.attempts + 1;
    const fail = async (error: string, status?: number, permanent = false) => {
      const exhausted = permanent || attempts >= MAX_ATTEMPTS;
      await finish({
        attempts,
        lastStatus: status ?? null,
        lastError: error.slice(0, 300),
        status: exhausted ? "failed" : "pending",
        nextAttemptAt: exhausted
          ? null
          : new Date(clock().getTime() + RETRY_DELAYS_MS[attempts - 1]!),
      });
      return exhausted ? ("failed" as const) : ("retry" as const);
    };
    if (!ep || !ep.active) return fail("Endpoint inexistente o desactivado", undefined, true);

    const body = JSON.stringify(d.payload);
    const ts = Math.floor(clock().getTime() / 1000);
    try {
      await assertSafeUrl(ep.url, ssrf); // se vuelve a validar en cada envío
      const res = await doFetch(ep.url, {
        method: "POST",
        redirect: "manual", // una redirección podría apuntar a una red interna
        headers: {
          "content-type": "application/json",
          "user-agent": "ATS-Webhooks/1.0",
          "x-ats-event": d.event,
          "x-ats-delivery": d.id,
          "x-ats-timestamp": String(ts),
          "x-ats-signature": signWebhook(decryptSecret(ep.secretEnc, appSecret), ts, body),
        },
        body,
        signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
      });
      if (res.status >= 200 && res.status < 300) {
        await finish({
          attempts,
          status: "success",
          lastStatus: res.status,
          lastError: null,
          deliveredAt: clock(),
          nextAttemptAt: null,
        });
        return "success";
      }
      return fail(`El receptor respondió HTTP ${res.status}`, res.status);
    } catch (e) {
      if (e instanceof UnsafeUrlError) return fail(e.message, undefined, true);
      return fail(
        (e as Error).name === "TimeoutError"
          ? "Tiempo de espera agotado"
          : "No se pudo conectar con el receptor",
      );
    }
  }

  /** Envía las entregas vencidas. Lo invoca un temporizador del servidor (y las pruebas). */
  async function processDue(now = clock()): Promise<{ attempted: number; delivered: number }> {
    const due = await withPlatform(prisma, (tx) =>
      tx.webhookDelivery.findMany({
        where: { status: "pending", nextAttemptAt: { lte: now } },
        orderBy: { nextAttemptAt: "asc" },
        take: 50,
      }),
    );
    let delivered = 0;
    for (const d of due) if ((await attempt(d.id, d.tenantId)) === "success") delivered++;
    return { attempted: due.length, delivered };
  }

  return { emit, attempt, processDue };
}
export type WebhookService = ReturnType<typeof createWebhookService>;
