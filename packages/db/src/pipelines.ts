import type { Tx } from "./index.js";
import { defaultStages, type StageInput } from "@ats/shared";

export async function createPipeline(
  tx: Tx,
  tenantId: string,
  name: string,
  stages: StageInput[],
  isDefault = false,
) {
  if (isDefault)
    await tx.pipeline.updateMany({
      where: { tenantId, isDefault: true },
      data: { isDefault: false },
    });
  return tx.pipeline.create({
    data: {
      tenantId,
      name,
      isDefault,
      stages: {
        create: stages.map((s, position) => ({
          tenantId,
          position,
          name: s.name,
          type: s.type,
          enabled: s.enabled,
          config: s.config as object,
          transition: s.transition,
        })),
      },
    },
  });
}

/** Devuelve el embudo por defecto del tenant; lo crea con la plantilla estándar si aún no existe. */
export async function ensureDefaultPipeline(tx: Tx, tenantId: string) {
  const existing = await tx.pipeline.findFirst({ where: { tenantId, isDefault: true } });
  return existing ?? createPipeline(tx, tenantId, "Embudo estándar", defaultStages, true);
}
