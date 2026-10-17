import { withPlatform, withTenant, type PrismaClient, type Tx } from "@ats/db";
import { ALERT_THRESHOLD, limitLabels, plans, type LimitKey, type Plan } from "@ats/shared";
import { HttpError } from "../auth/plugin.js";
import type { Mailer } from "../mailer.js";

export interface UsageItem {
  key: LimitKey;
  label: string;
  used: number;
  /** null = ilimitado */
  limit: number | null;
  percent: number | null;
}

const month = (d = new Date()) => d.toISOString().slice(0, 7);

/**
 * Límites por plan (docs/05). Las vacantes activas y los usuarios se cuentan en vivo; las postulaciones y los análisis
 * de IA se acumulan por mes calendario en UsageCounter. Al 80 % se avisa a los administradores; al 100 % los límites duros
 * rechazan con un mensaje claro y el de IA cae al modo reglas.
 */
export function createPlanService(deps: {
  prisma: PrismaClient;
  mailer: Mailer;
  clock?: () => Date;
}) {
  const { prisma, mailer } = deps;
  const clock = deps.clock ?? (() => new Date());

  async function planOf(tx: Tx, tenantId: string): Promise<{ plan: Plan; extraAi: number }> {
    const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const sub = await tx.subscription.findUnique({ where: { tenantId } });
    return { plan: plans[t.planKey], extraAi: sub?.extraAiAnalyses ?? 0 };
  }

  async function usage(tx: Tx, tenantId: string): Promise<{ plan: Plan; items: UsageItem[] }> {
    const { plan, extraAi } = await planOf(tx, tenantId);
    const [vacancies, members, pending, counter] = await Promise.all([
      tx.vacancy.count({ where: { tenantId, status: { in: ["published", "paused"] } } }),
      tx.membership.count({ where: { tenantId } }),
      tx.invitation.count({ where: { tenantId, acceptedAt: null, expiresAt: { gt: clock() } } }),
      tx.usageCounter.findUnique({
        where: { tenantId_month: { tenantId, month: month(clock()) } },
      }),
    ]);
    const mk = (key: LimitKey, used: number, limit: number | null): UsageItem => ({
      key,
      label: limitLabels[key],
      used,
      limit,
      percent:
        limit === null
          ? null
          : limit === 0
            ? used > 0
              ? 100
              : 0
            : Math.min(100, Math.round((used / limit) * 100)),
    });
    return {
      plan,
      items: [
        mk("activeVacancies", vacancies, plan.limits.activeVacancies),
        mk("applicationsPerMonth", counter?.applications ?? 0, plan.limits.applicationsPerMonth),
        mk("users", members + pending, plan.limits.users),
        mk(
          "aiAnalysesPerMonth",
          counter?.aiAnalyses ?? 0,
          plan.limits.aiAnalysesPerMonth + (plan.features.ai ? extraAi : 0),
        ),
      ],
    };
  }

  const limitError = (item: UsageItem, plan: Plan, message: string) =>
    new HttpError(
      403,
      `${message} Tu plan ${plan.name} permite ${item.limit}. Pide un cambio de plan para continuar.`,
      "plan_limit",
    );

  async function assertCanPublish(tx: Tx, tenantId: string) {
    const { plan, items } = await usage(tx, tenantId);
    const v = items.find((i) => i.key === "activeVacancies")!;
    if (v.limit !== null && v.used >= v.limit)
      throw limitError(v, plan, "Alcanzaste el máximo de vacantes activas.");
  }

  async function assertCanAddUser(tx: Tx, tenantId: string) {
    const { plan, items } = await usage(tx, tenantId);
    const u = items.find((i) => i.key === "users")!;
    if (u.limit !== null && u.used >= u.limit)
      throw limitError(
        u,
        plan,
        "Alcanzaste el máximo de usuarios (incluye invitaciones pendientes).",
      );
  }

  /** Para la API pública: el mensaje es para el candidato, sin detalles del plan. */
  async function assertCanReceiveApplication(tx: Tx, tenantId: string) {
    const { items } = await usage(tx, tenantId);
    const a = items.find((i) => i.key === "applicationsPerMonth")!;
    if (a.limit !== null && a.used >= a.limit)
      throw new HttpError(
        403,
        "Esta empresa no está recibiendo postulaciones por el momento. Inténtalo más adelante.",
        "applications_closed",
      );
  }

  async function assertFeature(tx: Tx, tenantId: string, check: (p: Plan) => string | null) {
    const { plan } = await planOf(tx, tenantId);
    const problem = check(plan);
    if (problem) throw new HttpError(403, problem, "plan_feature");
  }

  async function countApplication(tx: Tx, tenantId: string) {
    await tx.usageCounter.upsert({
      where: { tenantId_month: { tenantId, month: month(clock()) } },
      create: { tenantId, month: month(clock()), applications: 1 },
      update: { applications: { increment: 1 } },
    });
  }

  /** Avisa a los administradores una sola vez por mes al llegar al 80 % y al 100 % de cada límite. */
  async function checkAlerts(tenantId: string): Promise<string[]> {
    const m = month(clock());
    const { info, admins, sent } = await withTenant(prisma, tenantId, async (tx) => {
      const u = await usage(tx, tenantId);
      const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const counter = await tx.usageCounter.findUnique({
        where: { tenantId_month: { tenantId, month: m } },
      });
      const mem = await tx.membership.findMany({
        where: { tenantId, role: "admin" },
        include: { user: { select: { email: true } } },
      });
      return {
        info: { ...u, tenantName: t.name },
        admins: mem.map((x) => x.user.email),
        sent: counter?.alertsSent ?? [],
      };
    });
    const fresh: string[] = [];
    for (const i of info.items) {
      if (i.percent === null || !i.limit) continue;
      for (const level of [100, ALERT_THRESHOLD]) {
        const key = `${m}:${i.key}:${level}`;
        if (i.percent >= level && !sent.includes(key)) {
          fresh.push(key);
          const body =
            level === 100
              ? `${i.label}: llegaste al límite de tu plan ${info.plan.name} (${i.used} de ${i.limit}).${i.key === "aiAnalysesPerMonth" ? " La preselección seguirá funcionando con reglas, sin IA, hasta el próximo mes." : ""}`
              : `${i.label}: llevas ${i.percent}% de tu plan ${info.plan.name} (${i.used} de ${i.limit}).`;
          for (const to of admins)
            await mailer
              .send(
                to,
                `Uso del plan: ${i.label} al ${level}%`,
                `${info.tenantName}\n\n${body}\n\nPuedes pedir un cambio de plan al operador de la plataforma.`,
              )
              .catch(() => undefined);
          break; // si ya pasó el 100 no hace falta avisar también el 80
        }
      }
    }
    if (fresh.length)
      await withTenant(prisma, tenantId, (tx) =>
        tx.usageCounter.upsert({
          where: { tenantId_month: { tenantId, month: m } },
          create: { tenantId, month: m, alertsSent: fresh },
          update: { alertsSent: { push: fresh } },
        }),
      );
    return fresh;
  }

  async function allTenantsUsage() {
    const tenants = await withPlatform(prisma, (tx) =>
      tx.tenant.findMany({
        select: { id: true, name: true, slug: true, planKey: true },
        orderBy: { createdAt: "desc" },
      }),
    );
    return Promise.all(
      tenants.map(async (t) => ({
        ...t,
        ...(await withTenant(prisma, t.id, async (tx) => {
          const u = await usage(tx, t.id);
          return { plan: u.plan.name, items: u.items };
        })),
      })),
    );
  }

  return {
    planOf,
    usage,
    assertCanPublish,
    assertCanAddUser,
    assertCanReceiveApplication,
    assertFeature,
    countApplication,
    checkAlerts,
    allTenantsUsage,
  };
}
export type PlanService = ReturnType<typeof createPlanService>;
