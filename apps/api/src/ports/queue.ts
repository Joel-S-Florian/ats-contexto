export type JobHandler = (payload: { applicationId: string; tenantId: string }) => Promise<void>;

export interface JobQueue {
  enqueue(payload: { applicationId: string; tenantId: string }): Promise<void>;
  /** Espera a que terminen los trabajos en curso (pruebas y cierre ordenado). */
  drain(): Promise<void>;
}

/**
 * Cola en memoria con reintentos, para desarrollo y pruebas sin Redis.
 * shortcut: no sobrevive a reinicios; en produccion se usa BullMQ sobre Redis con la misma interfaz.
 */
export function memoryQueue(handler: JobHandler, attempts = 3): JobQueue {
  const running = new Set<Promise<void>>();
  const run = async (payload: Parameters<JobHandler>[0]) => {
    for (let i = 1; i <= attempts; i++) {
      try {
        return await handler(payload);
      } catch {
        if (i === attempts) return; // el handler deja la postulacion en `failed` / revision manual
        await new Promise((r) => setTimeout(r, 50 * 2 ** i));
      }
    }
  };
  return {
    async enqueue(payload) {
      const p = run(payload).finally(() => running.delete(p));
      running.add(p);
    },
    async drain() {
      while (running.size) await Promise.all([...running]);
    },
  };
}
