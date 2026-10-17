import type { PrismaClient } from "@ats/db";
import { NOTICE_VERSION, noticeText } from "@ats/shared";

export interface Notice {
  version: string;
  title: string;
  body: string[];
}

/** Aviso vigente: la última versión publicada por el super administrador; si no hay ninguna, el texto base del código. */
export function createNoticeService(prisma: PrismaClient) {
  async function current(): Promise<Notice> {
    // Tabla de plataforma (sin tenant): no requiere contexto de tenant.
    const last = await prisma.noticeVersion.findFirst({ orderBy: { createdAt: "desc" } });
    if (!last) return { version: NOTICE_VERSION, title: noticeText.title, body: noticeText.body };
    return { version: last.label, title: last.title, body: last.body as string[] };
  }
  return { current };
}
export type NoticeService = ReturnType<typeof createNoticeService>;
