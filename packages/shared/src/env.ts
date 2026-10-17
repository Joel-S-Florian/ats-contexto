import { z } from "zod";

export const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().positive().default(4000),
    API_HOST: z.string().default("0.0.0.0"),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    S3_ENDPOINT: z.string().url(),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    SESSION_SECRET: z.string().min(32),
    SMTP_URL: z.string().min(1),
    WEB_ORIGIN: z.string().url(),
    CAPTCHA_PROVIDER: z.enum(["none", "turnstile"]).default("none"),
    TURNSTILE_SECRET: z.string().optional(),
    AV_PROVIDER: z.enum(["none", "clamav"]).default("none"),
    CLAMD_HOST: z.string().default("localhost"),
    FILE_STORAGE_DIR: z.string().default(".data/files"),
  })
  .superRefine((env, ctx) => {
    if (env.CAPTCHA_PROVIDER === "turnstile" && !env.TURNSTILE_SECRET)
      ctx.addIssue({
        code: "custom",
        path: ["TURNSTILE_SECRET"],
        message: "requerido con turnstile",
      });
    // En produccion no se admiten los adaptadores de desarrollo (captcha de prueba, antivirus EICAR).
    if (env.NODE_ENV === "production") {
      if (env.CAPTCHA_PROVIDER === "none")
        ctx.addIssue({
          code: "custom",
          path: ["CAPTCHA_PROVIDER"],
          message: "turnstile obligatorio en produccion",
        });
      if (env.AV_PROVIDER === "none")
        ctx.addIssue({
          code: "custom",
          path: ["AV_PROVIDER"],
          message: "clamav obligatorio en produccion",
        });
    }
  });
export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Falla al arrancar, listando las variables faltantes sin imprimir sus valores. */
export function parseEnv<T extends z.ZodTypeAny>(schema: T, source: NodeJS.ProcessEnv): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const keys = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Variables de entorno invalidas o faltantes: ${keys}`);
  }
  return result.data;
}
