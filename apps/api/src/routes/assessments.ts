import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { withPlatform, withTenant, type Prisma, type PrismaClient, type Tx } from "@ats/db";
import {
  assessmentTemplateSchema,
  gradeClosed,
  scoreOf,
  type Answers,
  type SnapshotQuestion,
} from "@ats/shared";
import { newToken, sha256 } from "../auth/crypto.js";
import { HttpError, requirePermission } from "../auth/plugin.js";
import { formatDate, type EmailService } from "../services/email.js";
import { visibleApplication } from "./candidates.js";

type Deps = {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  email: EmailService;
  webOrigin: string;
  clock: () => Date;
  examRateLimit: number;
};
const asSnap = (v: unknown) => (Array.isArray(v) ? (v as SnapshotQuestion[]) : []);
const idParam = z.object({ id: z.string().uuid() });
/** Margen para latencia de red al enviar justo al terminar el tiempo. */
const GRACE_MS = 5_000;
const DEFAULT_LINK_HOURS = 72;

const answerValue = z.union([z.number().int().min(0).max(20), z.boolean(), z.string().max(2000)]);
const answersSchema = z.record(z.string().uuid(), answerValue);

export function assessmentRoutes(
  app: FastifyInstance,
  { prisma, authenticate, email, webOrigin, clock, examRateLimit }: Deps,
) {
  // ------------------------------------------------------------------ plantillas
  const templateSelect = {
    id: true,
    name: true,
    description: true,
    timeLimitMin: true,
    passingScore: true,
    modules: {
      orderBy: { position: "asc" as const },
      select: {
        id: true,
        title: true,
        questions: {
          orderBy: { position: "asc" as const },
          select: {
            id: true,
            type: true,
            prompt: true,
            options: true,
            correctAnswer: true,
            points: true,
          },
        },
      },
    },
  };
  const modulesData = (tenantId: string, t: z.infer<typeof assessmentTemplateSchema>) => ({
    create: t.modules.map((m, mi) => ({
      tenantId,
      title: m.title,
      position: mi,
      questions: {
        create: m.questions.map((q, qi) => ({
          tenantId,
          position: qi,
          type: q.type,
          prompt: q.prompt,
          options: q.type === "multiple_choice" ? q.options : [],
          correctAnswer:
            q.type === "short_answer" ? undefined : (q.correctAnswer as number | boolean),
          points: q.points,
        })),
      },
    })),
  });

  app.get("/assessment-templates", { preHandler: authenticate }, async (req) => {
    const { tenantId } = requirePermission(req, "assessments:manage");
    return withTenant(prisma, tenantId, (tx) =>
      tx.assessmentTemplate.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        select: {
          ...templateSelect,
          modules: { select: { id: true, title: true, questions: { select: { id: true } } } },
        },
      }),
    );
  });

  app.get("/assessment-templates/:id", { preHandler: authenticate }, async (req) => {
    const { tenantId } = requirePermission(req, "assessments:manage");
    const { id } = idParam.parse(req.params);
    const t = await withTenant(prisma, tenantId, (tx) =>
      tx.assessmentTemplate.findFirst({ where: { id, tenantId }, select: templateSelect }),
    );
    if (!t) throw new HttpError(404, "Examen no encontrado");
    return t;
  });

  app.post("/assessment-templates", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId } = requirePermission(req, "assessments:manage");
    const body = assessmentTemplateSchema.parse(req.body);
    const t = await withTenant(prisma, tenantId, async (tx) => {
      const created = await tx.assessmentTemplate.create({
        data: {
          tenantId,
          name: body.name,
          description: body.description,
          timeLimitMin: body.timeLimitMin,
          passingScore: body.passingScore,
          createdBy: userId,
          modules: modulesData(tenantId, body),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: userId,
          action: "assessment_template.created",
          target: created.id,
        },
      });
      return created;
    });
    reply.code(201).send({ id: t.id });
  });

  app.put("/assessment-templates/:id", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId } = requirePermission(req, "assessments:manage");
    const { id } = idParam.parse(req.params);
    const body = assessmentTemplateSchema.parse(req.body);
    return withTenant(prisma, tenantId, async (tx) => {
      if (!(await tx.assessmentTemplate.findFirst({ where: { id, tenantId } })))
        throw new HttpError(404, "Examen no encontrado");
      await tx.assessmentModule.deleteMany({ where: { templateId: id } });
      await tx.assessmentTemplate.update({
        where: { id },
        data: {
          name: body.name,
          description: body.description,
          timeLimitMin: body.timeLimitMin,
          passingScore: body.passingScore,
          modules: modulesData(tenantId, body),
        },
      });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "assessment_template.updated", target: id },
      });
      return { id };
    });
  });

  app.delete("/assessment-templates/:id", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId } = requirePermission(req, "assessments:manage");
    const { id } = idParam.parse(req.params);
    await withTenant(prisma, tenantId, async (tx) => {
      if (!(await tx.assessmentTemplate.findFirst({ where: { id, tenantId } })))
        throw new HttpError(404, "Examen no encontrado");
      if (await tx.assessmentAttempt.count({ where: { templateId: id } }))
        throw new HttpError(409, "El examen ya se envió a candidatos y no se puede eliminar.");
      await tx.assessmentTemplate.delete({ where: { id } });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "assessment_template.deleted", target: id },
      });
    });
    reply.code(204).send();
  });

  // ------------------------------------------------------------------ transición según resultado
  /** Avance automático según el puntaje mínimo configurado en la etapa de Evaluación (docs/01 4.6). */
  async function applyTransition(
    tx: Tx,
    tenantId: string,
    applicationId: string,
    score: number,
    label: string,
  ) {
    const a = await tx.application.findFirst({ where: { id: applicationId, tenantId } });
    if (!a?.vacancyId || a.status !== "assessment") return;
    const v = await tx.vacancy.findFirst({
      where: { id: a.vacancyId },
      select: { pipelineId: true },
    });
    const stage =
      v &&
      (await tx.pipelineStage.findFirst({
        where: { pipelineId: v.pipelineId, type: "assessment", enabled: true },
      }));
    const rule = stage?.transition as { mode?: string; minScore?: number } | undefined;
    if (rule?.mode !== "assessment_result" || rule.minScore === undefined) return; // avance manual
    const pass = score >= rule.minScore;
    const to = pass ? "selection" : "in_review";
    await tx.application.update({ where: { id: applicationId }, data: { status: to } });
    await tx.applicationStageHistory.create({
      data: {
        tenantId,
        applicationId,
        fromStatus: "assessment",
        toStatus: to,
        automatic: true,
        reason: pass
          ? `${label}: puntaje ${score} (mínimo ${rule.minScore}); avanza a Selección.`
          : `${label}: puntaje ${score} por debajo del mínimo ${rule.minScore}; queda en revisión de RRHH (no se descarta).`,
      },
    });
  }

  // ------------------------------------------------------------------ invitación
  app.post("/applications/:id/assessments", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId, role } = requirePermission(req, "assessments:manage");
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        templateId: z.string().uuid(),
        expiresInHours: z.number().int().min(1).max(720).default(DEFAULT_LINK_HOURS),
        message: z.string().trim().max(500).optional(),
      })
      .parse(req.body);
    const token = newToken();
    const now = clock();
    const attempt = await withTenant(prisma, tenantId, async (tx) => {
      const a = await visibleApplication(tx, tenantId, id, role, userId);
      if (!a) throw new HttpError(404, "Postulación no encontrada");
      if (!(await tx.assessmentTemplate.findFirst({ where: { id: body.templateId, tenantId } })))
        throw new HttpError(404, "Examen no encontrado");
      if (a.vacancyId) {
        const v = await tx.vacancy.findFirstOrThrow({ where: { id: a.vacancyId } });
        if (
          !(await tx.pipelineStage.count({
            where: { pipelineId: v.pipelineId, type: "assessment", enabled: true },
          }))
        )
          throw new HttpError(
            422,
            'La etapa "Evaluación" no está activa en el embudo de esta vacante.',
          );
      }
      const open = await tx.assessmentAttempt.findFirst({
        where: {
          applicationId: id,
          templateId: body.templateId,
          status: { in: ["invited", "in_progress"] },
          expiresAt: { gt: now },
        },
      });
      if (open)
        throw new HttpError(409, "Ya hay una invitación vigente de este examen para la persona.");
      const created = await tx.assessmentAttempt.create({
        data: {
          tenantId,
          applicationId: id,
          templateId: body.templateId,
          tokenHash: sha256(token),
          expiresAt: new Date(now.getTime() + body.expiresInHours * 3600_000),
          createdBy: userId,
        },
      });
      if (["received", "screening", "shortlisted", "in_review", "interview"].includes(a.status)) {
        await tx.application.update({ where: { id }, data: { status: "assessment" } });
        await tx.applicationStageHistory.create({
          data: {
            tenantId,
            applicationId: id,
            fromStatus: a.status,
            toStatus: "assessment",
            actorId: userId,
            automatic: false,
            reason: "Evaluación enviada al candidato.",
          },
        });
      }
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "assessment.invited", target: created.id },
      });
      return created;
    });
    const emailed = await email.send({
      tenantId,
      applicationId: id,
      key: "assessment_invite",
      vars: {
        enlace: `${webOrigin}/examen/${token}`,
        mensaje: [body.message, `El enlace vence el ${formatDate(attempt.expiresAt)}.`]
          .filter(Boolean)
          .join(" "),
      },
    });
    reply.code(201).send({ id: attempt.id, expiresAt: attempt.expiresAt, emailed });
  });

  // ------------------------------------------------------------------ resultados y revisión
  app.get("/applications/:id/assessments", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId, role } = requirePermission(req, "candidates:read");
    const { id } = idParam.parse(req.params);
    const canReview = role === "admin" || role === "recruiter";
    return withTenant(prisma, tenantId, async (tx) => {
      if (!(await visibleApplication(tx, tenantId, id, role, userId)))
        throw new HttpError(404, "Postulación no encontrada");
      const [attempts, external] = await Promise.all([
        tx.assessmentAttempt.findMany({
          where: { applicationId: id, tenantId },
          orderBy: { createdAt: "desc" },
        }),
        tx.externalAssessmentRecord.findMany({
          where: { applicationId: id, tenantId },
          orderBy: { performedAt: "desc" },
        }),
      ]);
      const names = new Map(
        (
          await tx.assessmentTemplate.findMany({
            where: { id: { in: attempts.map((a) => a.templateId) } },
            select: { id: true, name: true, passingScore: true },
          })
        ).map((t) => [t.id, t]),
      );
      return {
        attempts: attempts.map((a) => {
          const snap = asSnap(a.snapshot);
          const answers = a.answers as Answers;
          const manual = a.manualPoints as Record<string, number>;
          return {
            id: a.id,
            template: names.get(a.templateId)?.name ?? "",
            passingScore: names.get(a.templateId)?.passingScore ?? 0,
            status: a.status,
            expiresAt: a.expiresAt,
            startedAt: a.startedAt,
            submittedAt: a.submittedAt,
            timedOut: a.timedOut,
            finalScore: a.finalScore,
            needsReview: a.needsReview,
            openAnswers:
              canReview && a.needsReview
                ? snap
                    .filter((q) => q.type === "short_answer" && typeof answers[q.id] === "string")
                    .map((q) => ({
                      questionId: q.id,
                      prompt: q.prompt,
                      answer: String(answers[q.id]),
                      maxPoints: q.points,
                      points: manual[q.id] ?? null,
                    }))
                : [],
          };
        }),
        external,
      };
    });
  });

  app.put("/assessment-attempts/:id/review", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId } = requirePermission(req, "assessments:manage");
    const { id } = idParam.parse(req.params);
    const { grades } = z
      .object({ grades: z.record(z.string().uuid(), z.number().int().min(0)) })
      .parse(req.body);
    return withTenant(prisma, tenantId, async (tx) => {
      const a = await tx.assessmentAttempt.findFirst({ where: { id, tenantId } });
      if (!a) throw new HttpError(404, "Intento no encontrado");
      if (a.status !== "submitted" || !a.needsReview)
        throw new HttpError(409, "Este intento no está pendiente de revisión.");
      const snap = asSnap(a.snapshot);
      const open = new Map(snap.filter((q) => q.type === "short_answer").map((q) => [q.id, q]));
      for (const [qid, pts] of Object.entries(grades)) {
        const q = open.get(qid);
        if (!q) throw new HttpError(422, "Hay una pregunta que no es de respuesta corta.");
        if (pts > q.points)
          throw new HttpError(422, `El máximo para esa pregunta es ${q.points} punto(s).`);
      }
      const answered = [...open.values()].filter(
        (q) =>
          typeof (a.answers as Answers)[q.id] === "string" &&
          String((a.answers as Answers)[q.id]).trim(),
      );
      const missing = answered.filter((q) => grades[q.id] === undefined);
      if (missing.length)
        throw new HttpError(422, "Falta calificar preguntas abiertas respondidas.");
      const score = scoreOf(a.autoPoints ?? 0, grades, a.totalPoints ?? 0);
      await tx.assessmentAttempt.update({
        where: { id },
        data: { manualPoints: grades, needsReview: false, finalScore: score },
      });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "assessment.reviewed", target: id },
      });
      await applyTransition(tx, tenantId, a.applicationId, score, "Evaluación revisada");
      return { id, finalScore: score };
    });
  });

  // Evaluación propia de la empresa: plantilla de registro (docs/01 4.6).
  app.post(
    "/applications/:id/external-assessments",
    { preHandler: authenticate },
    async (req, reply) => {
      const { tenantId, userId, role } = requirePermission(req, "assessments:manage");
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          description: z.string().trim().min(3).max(500),
          performedAt: z.coerce.date(),
          method: z.string().trim().min(2).max(200),
          evaluators: z.array(z.string().trim().min(1).max(120)).min(1).max(10),
          result: z.string().trim().min(1).max(300),
          score: z.number().int().min(0).max(100).optional(),
          observations: z.string().trim().max(2000).default(""),
        })
        .parse(req.body);
      await withTenant(prisma, tenantId, async (tx) => {
        if (!(await visibleApplication(tx, tenantId, id, role, userId)))
          throw new HttpError(404, "Postulación no encontrada");
        await tx.externalAssessmentRecord.create({
          data: { tenantId, applicationId: id, createdBy: userId, ...body },
        });
        if (body.score !== undefined)
          await applyTransition(tx, tenantId, id, body.score, "Evaluación de la empresa");
      });
      reply.code(201).send();
    },
  );

  // ------------------------------------------------------------------ lado del candidato (por enlace)
  const exam = { config: { rateLimit: { max: examRateLimit, timeWindow: "1 minute" } } };

  async function find(token: string) {
    const row = await withPlatform(prisma, (tx) =>
      tx.assessmentAttempt.findUnique({ where: { tokenHash: sha256(token) } }),
    );
    if (!row) throw new HttpError(404, "El enlace no es válido");
    return row;
  }

  async function finalize(
    tenantId: string,
    attemptId: string,
    answers: Answers,
    timedOut: boolean,
  ) {
    return withTenant(prisma, tenantId, async (tx) => {
      const a = await tx.assessmentAttempt.findFirstOrThrow({ where: { id: attemptId, tenantId } });
      if (a.status !== "in_progress") return a; // ya se cerró: no se recalifica
      const snap = asSnap(a.snapshot);
      const g = gradeClosed(snap, answers);
      const finalScore = g.needsReview ? null : scoreOf(g.autoPoints, {}, g.totalPoints);
      const done = await tx.assessmentAttempt.update({
        where: { id: attemptId },
        data: {
          status: "submitted",
          submittedAt: clock(),
          timedOut,
          answers: answers as Prisma.InputJsonValue,
          autoPoints: g.autoPoints,
          totalPoints: g.totalPoints,
          needsReview: g.needsReview,
          finalScore,
        },
      });
      if (finalScore !== null)
        await applyTransition(tx, tenantId, a.applicationId, finalScore, "Evaluación completada");
      return done;
    });
  }

  /** Si se acabó el tiempo, cierra el intento con lo último guardado: el candidato no puede ganar tiempo extra. */
  async function settle(a: Awaited<ReturnType<typeof find>>) {
    const now = clock();
    if (a.status === "invited" && now > a.expiresAt) {
      await withTenant(prisma, a.tenantId, (tx) =>
        tx.assessmentAttempt.update({ where: { id: a.id }, data: { status: "expired" } }),
      );
      return { ...a, status: "expired" as const };
    }
    if (
      a.status === "in_progress" &&
      a.deadlineAt &&
      now.getTime() > a.deadlineAt.getTime() + GRACE_MS
    )
      return finalize(a.tenantId, a.id, a.answers as Answers, true);
    return a;
  }

  const view = async (a: Awaited<ReturnType<typeof find>>) => {
    const info = await withTenant(prisma, a.tenantId, async (tx) => ({
      template: await tx.assessmentTemplate.findFirstOrThrow({ where: { id: a.templateId } }),
      tenant: await tx.tenant.findUniqueOrThrow({ where: { id: a.tenantId } }),
    }));
    const base = {
      company: info.tenant.name,
      title: info.template.name,
      description: info.template.description,
      timeLimitMin: info.template.timeLimitMin,
    };
    if (a.status === "invited") return { status: "invited", ...base, expiresAt: a.expiresAt };
    if (a.status === "in_progress") {
      const snap = asSnap(a.snapshot);
      return {
        status: "in_progress",
        ...base,
        deadlineAt: a.deadlineAt,
        remainingSeconds: Math.max(
          0,
          Math.floor((a.deadlineAt!.getTime() - clock().getTime()) / 1000),
        ),
        answers: a.answers,
        // Sin la clave de respuestas.
        questions: snap.map(({ id, type, prompt, options, points, module }) => ({
          id,
          type,
          prompt,
          options,
          points,
          module,
        })),
      };
    }
    return { status: a.status, company: base.company, title: base.title };
  };

  app.get("/exam/:token", { ...exam }, async (req, reply) => {
    const { token } = z.object({ token: z.string().min(10).max(100) }).parse(req.params);
    const a = await settle(await find(token));
    if (a.status === "expired") reply.code(410);
    return view(a);
  });

  app.post("/exam/:token/start", { ...exam }, async (req, reply) => {
    const { token } = z.object({ token: z.string().min(10).max(100) }).parse(req.params);
    let a = await settle(await find(token));
    if (a.status === "expired") reply.code(410);
    if (a.status === "invited") {
      const now = clock();
      a = await withTenant(prisma, a.tenantId, async (tx) => {
        const t = await tx.assessmentTemplate.findFirstOrThrow({
          where: { id: a!.templateId },
          include: {
            modules: {
              orderBy: { position: "asc" },
              include: { questions: { orderBy: { position: "asc" } } },
            },
          },
        });
        const snapshot: SnapshotQuestion[] = t.modules.flatMap((m) =>
          m.questions.map((q) => ({
            id: q.id,
            type: q.type,
            prompt: q.prompt,
            options: q.options as string[],
            correctAnswer: q.correctAnswer as number | boolean | null,
            points: q.points,
            module: m.title,
          })),
        );
        // update condicional: dos "iniciar" simultáneos no reinician el reloj
        const r = await tx.assessmentAttempt.updateMany({
          where: { id: a!.id, status: "invited" },
          data: {
            status: "in_progress",
            startedAt: now,
            deadlineAt: new Date(now.getTime() + t.timeLimitMin * 60_000),
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
          },
        });
        if (r.count === 0) return tx.assessmentAttempt.findFirstOrThrow({ where: { id: a!.id } });
        return tx.assessmentAttempt.findFirstOrThrow({ where: { id: a!.id } });
      });
    }
    return view(a);
  });

  app.put("/exam/:token/answers", { ...exam }, async (req, reply) => {
    const { token } = z.object({ token: z.string().min(10).max(100) }).parse(req.params);
    const { answers } = z.object({ answers: answersSchema }).parse(req.body);
    const a = await settle(await find(token));
    if (a.status !== "in_progress") {
      reply.code(a.status === "expired" ? 410 : 409);
      return {
        error:
          a.status === "submitted" ? "Este examen ya fue enviado." : "El examen no está en curso.",
      };
    }
    const known = new Set(asSnap(a.snapshot).map((q) => q.id));
    const merged = {
      ...(a.answers as Answers),
      ...Object.fromEntries(Object.entries(answers).filter(([k]) => known.has(k))),
    };
    await withTenant(prisma, a.tenantId, (tx) =>
      tx.assessmentAttempt.update({ where: { id: a.id }, data: { answers: merged } }),
    );
    return {
      saved: true,
      remainingSeconds: Math.max(
        0,
        Math.floor((a.deadlineAt!.getTime() - clock().getTime()) / 1000),
      ),
    };
  });

  app.post("/exam/:token/submit", { ...exam }, async (req, reply) => {
    const { token } = z.object({ token: z.string().min(10).max(100) }).parse(req.params);
    const { answers } = z.object({ answers: answersSchema.default({}) }).parse(req.body ?? {});
    const a = await find(token);
    if (a.status !== "in_progress") {
      reply.code(a.status === "expired" ? 410 : 409);
      return {
        error:
          a.status === "submitted" ? "Este examen ya fue enviado." : "El examen no está en curso.",
      };
    }
    const late = clock().getTime() > a.deadlineAt!.getTime() + GRACE_MS;
    const known = new Set(asSnap(a.snapshot).map((q) => q.id));
    // Fuera de tiempo solo cuenta lo que ya estaba guardado.
    const final = late
      ? (a.answers as Answers)
      : {
          ...(a.answers as Answers),
          ...Object.fromEntries(Object.entries(answers).filter(([k]) => known.has(k))),
        };
    await finalize(a.tenantId, a.id, final, late);
    return { status: "submitted", timedOut: late };
  });
}
