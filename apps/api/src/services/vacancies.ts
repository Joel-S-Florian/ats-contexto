import type { Prisma, Tx } from "@ats/db";
import { validateStages, type VacancyInput } from "@ats/shared";
import { HttpError } from "../auth/plugin.js";
import { ensureDefaultPipeline } from "./pipelines.js";

export const vacancyInclude = {
  skills: { select: { name: true, kind: true } },
  evaluators: { select: { userId: true } },
} satisfies Prisma.VacancyInclude;

type VacancyRow = Prisma.VacancyGetPayload<{ include: typeof vacancyInclude }>;

/** Vista completa para el panel. */
export function toVacancyDto(v: VacancyRow) {
  const { skills, evaluators, ...rest } = v;
  return {
    ...rest,
    requiredSkills: skills.filter((s) => s.kind === "required").map((s) => s.name),
    desirableSkills: skills.filter((s) => s.kind === "desirable").map((s) => s.name),
    evaluatorIds: evaluators.map((e) => e.userId),
  };
}

/** Vuelve a la forma de entrada, para mezclar un PATCH parcial y validar el resultado completo. */
export function toInput(v: ReturnType<typeof toVacancyDto>): Record<string, unknown> {
  return {
    ...v,
    knockoutRules: v.knockoutRules ?? [],
    closesAt: v.closesAt,
  };
}

const allowed: Record<string, string[]> = {
  draft: ["published", "closed"],
  published: ["paused", "closed"],
  paused: ["published", "closed"],
  closed: [],
};

export function assertTransition(from: string, to: string) {
  if (from !== to && !allowed[from]?.includes(to))
    throw new HttpError(409, `No se puede pasar de "${from}" a "${to}"`);
}

/** Una vacante solo se publica completa y con un embudo válido. */
export async function assertPublishable(
  tx: Tx,
  v: { pipelineId: string; requirementsRequired: string; closesAt: Date | null },
  skillCount: number,
) {
  const problems: string[] = [];
  if (!v.requirementsRequired.trim() && skillCount === 0)
    problems.push("Define al menos un requisito obligatorio o una skill obligatoria.");
  if (v.closesAt && v.closesAt < new Date()) problems.push("La fecha de cierre ya pasó.");
  const stages = await tx.pipelineStage.findMany({ where: { pipelineId: v.pipelineId } });
  problems.push(
    ...validateStages(
      stages.map((s) => ({ type: s.type, enabled: s.enabled, transition: s.transition as never })),
    ),
  );
  if (problems.length) throw new HttpError(422, problems.join(" "));
}

/** Verifica que las personas asignadas pertenezcan al tenant (nunca confiar en ids del cliente). */
async function assertMembers(tx: Tx, tenantId: string, ids: string[]) {
  if (!ids.length) return;
  const found = await tx.membership.count({ where: { tenantId, userId: { in: ids } } });
  if (found !== new Set(ids).size)
    throw new HttpError(422, "Hay personas asignadas que no pertenecen a la empresa.");
}

export async function writeRelations(
  tx: Tx,
  tenantId: string,
  vacancyId: string,
  input: VacancyInput,
) {
  const evaluatorIds = [
    ...new Set([...input.evaluatorIds, ...(input.ownerId ? [input.ownerId] : [])]),
  ];
  await assertMembers(tx, tenantId, evaluatorIds);
  const required = [...new Set(input.requiredSkills.map((s) => s.trim()))];
  const desirable = [...new Set(input.desirableSkills.map((s) => s.trim()))].filter(
    (s) => !required.some((r) => r.toLowerCase() === s.toLowerCase()),
  );
  await tx.vacancySkill.deleteMany({ where: { vacancyId } });
  await tx.vacancyEvaluator.deleteMany({ where: { vacancyId } });
  await tx.vacancySkill.createMany({
    data: [
      ...required.map((name) => ({ tenantId, vacancyId, name, kind: "required" as const })),
      ...desirable.map((name) => ({ tenantId, vacancyId, name, kind: "desirable" as const })),
    ],
  });
  await tx.vacancyEvaluator.createMany({
    data: evaluatorIds.map((userId) => ({ tenantId, vacancyId, userId })),
  });
}

export async function resolvePipelineId(tx: Tx, tenantId: string, requested?: string) {
  if (!requested) return (await ensureDefaultPipeline(tx, tenantId)).id;
  const p = await tx.pipeline.findFirst({ where: { id: requested, tenantId } });
  if (!p) throw new HttpError(422, "El embudo indicado no existe.");
  return p.id;
}

export function vacancyData(input: VacancyInput) {
  const {
    requiredSkills: _r,
    desirableSkills: _d,
    evaluatorIds: _e,
    pipelineId: _p,
    ...data
  } = input;
  return { ...data, knockoutRules: data.knockoutRules as object };
}
