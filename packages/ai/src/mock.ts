import type { AIProvider } from "./provider";
import { aiOutputSchema, type AiOutput } from "./harness";
import { norm } from "./rules";

/**
 * Proveedor determinístico para pruebas y desarrollo. Solo cuenta coincidencias de palabras clave entre el CV y la
 * vacante: ignora por completo cualquier instrucción escrita en el CV (así las pruebas de inyección verifican
 * que el arnés tampoco altera el resultado).
 */
export function mockProvider(
  opts: { failWith?: "invalid" | "provider"; calls?: { n: number } } = {},
): AIProvider {
  return {
    name: "mock",
    async generateStructured<T>(
      args: Parameters<AIProvider["generateStructured"]>[0] & {
        schema: { parse: (v: unknown) => T };
      },
    ) {
      if (opts.calls) opts.calls.n++;
      if (opts.failWith === "provider") {
        const { ProviderError } = await import("./provider");
        throw new ProviderError("mock: proveedor caído");
      }
      if (opts.failWith === "invalid")
        return {
          data: { total: 100 } as unknown as T,
          usage: { inputTokens: 10, outputTokens: 5 },
          model: "mock-1",
        };

      const vac = JSON.parse(/<vacante>\n([\s\S]*?)\n<\/vacante>/.exec(args.input)![1]!) as Record<
        string,
        unknown
      >;
      const cv = norm(/<cv>\n[^\n]*\n([\s\S]*)\n<\/cv>/.exec(args.input)![1]!);
      const req = (vac.habilidades_requeridas as string[]) ?? [];
      const nice = (vac.habilidades_deseables as string[]) ?? [];
      const found = (list: string[]) => list.filter((s) => cv.includes(norm(s)));
      const frac = (a: number, b: number) => (b === 0 ? 100 : Math.round((a / b) * 100));
      const fr = found(req);
      const dims: AiOutput["dimensions"] = [
        {
          key: "req_skills",
          score: frac(fr.length, req.length),
          justification: `El CV menciona ${fr.length} de ${req.length} habilidades requeridas.`,
          evidence: [],
        },
        {
          key: "experience",
          score: /(\d+)\s*(anos|years)/.test(cv) ? 70 : 40,
          justification: "Experiencia estimada a partir de los años mencionados.",
          evidence: [],
        },
        {
          key: "evidence",
          score: /(proyecto|certificacion|logro|implement|lidere)/.test(cv) ? 70 : 30,
          justification: "Se buscan proyectos, certificaciones o logros.",
          evidence: [],
        },
      ];
      if (nice.length)
        dims.push({
          key: "nice_skills",
          score: frac(found(nice).length, nice.length),
          justification: "Habilidades deseables mencionadas en el CV.",
          evidence: [],
        });
      const data: AiOutput = {
        schema_version: "1.0",
        dimensions: dims,
        matched_requirements: fr,
        missing_requirements: req.filter((s) => !fr.includes(s)),
        reasons: [
          fr.length === req.length
            ? "Menciona todas las habilidades requeridas."
            : "Faltan habilidades requeridas en el CV.",
        ],
        confidence: "medium",
        data_quality_notes: [],
      };
      return {
        data: aiOutputSchema.parse(data) as unknown as T,
        usage: { inputTokens: Math.ceil(args.input.length / 4), outputTokens: 200 },
        model: "mock-1",
      };
    },
  };
}
