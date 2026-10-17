export { createPipeline, ensureDefaultPipeline } from "@ats/db";

export const pipelineSelect = {
  id: true,
  name: true,
  isDefault: true,
  stages: {
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      name: true,
      type: true,
      position: true,
      enabled: true,
      config: true,
      transition: true,
    },
  },
};
