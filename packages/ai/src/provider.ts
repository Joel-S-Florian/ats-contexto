import type { ZodType } from "zod";

/** Contrato único de proveedor (docs/03 sección 8). El código de negocio nunca importa un SDK concreto. */
export interface AIProvider {
  name: string;
  generateStructured<T>(args: {
    system: string;
    input: string;
    schema: ZodType<T>;
    maxOutputTokens: number;
    timeoutMs: number;
    modelTier: "fast" | "strong";
  }): Promise<{ data: T; usage: { inputTokens: number; outputTokens: number }; model: string }>;
}

/** Fallo del proveedor (red, tiempo, 5xx). Distinto de "salida inválida", que lo detecta el arnés. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public retryable = true,
  ) {
    super(message);
  }
}
/** El modelo respondió algo que no cumple el esquema. */
export class InvalidOutputError extends Error {}

export interface ProviderConfig {
  apiKey: string;
  /** Los nombres de modelo vienen de configuración, nunca del código. */
  models: { fast: string; strong: string };
  fetch?: typeof fetch;
}

type Call = {
  system: string;
  input: string;
  maxOutputTokens: number;
  timeoutMs: number;
  modelTier: "fast" | "strong";
};

/** Núcleo común: llama al endpoint, extrae el texto y lo valida contra el esquema zod. */
function adapter(
  name: string,
  cfg: ProviderConfig,
  build: (
    c: Call,
    model: string,
  ) => { url: string; headers: Record<string, string>; body: unknown },
  read: (json: unknown) => { text: string; inputTokens: number; outputTokens: number },
): AIProvider {
  const doFetch = cfg.fetch ?? fetch;
  return {
    name,
    async generateStructured(args) {
      const model = cfg.models[args.modelTier];
      const req = build(args, model);
      let res: Response;
      try {
        res = await doFetch(req.url, {
          method: "POST",
          headers: { "content-type": "application/json", ...req.headers },
          body: JSON.stringify(req.body),
          signal: AbortSignal.timeout(args.timeoutMs),
        });
      } catch (e) {
        throw new ProviderError(
          `${name}: ${(e as Error).name === "TimeoutError" ? "tiempo agotado" : "error de red"}`,
        );
      }
      if (!res.ok)
        throw new ProviderError(
          `${name}: HTTP ${res.status}`,
          res.status >= 500 || res.status === 429,
        );
      const { text, inputTokens, outputTokens } = read(await res.json());
      let parsed: unknown;
      try {
        parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
      } catch {
        throw new InvalidOutputError("La salida no es JSON");
      }
      const checked = args.schema.safeParse(parsed);
      if (!checked.success) throw new InvalidOutputError("La salida no cumple el esquema");
      return { data: checked.data, usage: { inputTokens, outputTokens }, model };
    },
  };
}

// shortcut: los tres adaptadores se verificaron contra la documentacion publica de cada API pero NO contra el servicio real
// (no hay claves en desarrollo). Probar con una clave real antes de activar el modo `ai` en un tenant.

export const claudeProvider = (cfg: ProviderConfig) =>
  adapter(
    "claude",
    cfg,
    (c, model) => ({
      url: "https://api.anthropic.com/v1/messages",
      headers: { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
      body: {
        model,
        max_tokens: c.maxOutputTokens,
        system: c.system,
        messages: [{ role: "user", content: c.input }],
      },
    }),
    (j) => {
      const r = j as {
        content?: { type: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      return {
        text: r.content?.find((b) => b.type === "text")?.text ?? "",
        inputTokens: r.usage?.input_tokens ?? 0,
        outputTokens: r.usage?.output_tokens ?? 0,
      };
    },
  );

export const openaiProvider = (cfg: ProviderConfig) =>
  adapter(
    "openai",
    cfg,
    (c, model) => ({
      url: "https://api.openai.com/v1/chat/completions",
      headers: { authorization: `Bearer ${cfg.apiKey}` },
      body: {
        model,
        max_completion_tokens: c.maxOutputTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: c.system },
          { role: "user", content: c.input },
        ],
      },
    }),
    (j) => {
      const r = j as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        text: r.choices?.[0]?.message?.content ?? "",
        inputTokens: r.usage?.prompt_tokens ?? 0,
        outputTokens: r.usage?.completion_tokens ?? 0,
      };
    },
  );

export const geminiProvider = (cfg: ProviderConfig) =>
  adapter(
    "gemini",
    cfg,
    (c, model) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { "x-goog-api-key": cfg.apiKey },
      body: {
        systemInstruction: { parts: [{ text: c.system }] },
        contents: [{ role: "user", parts: [{ text: c.input }] }],
        generationConfig: {
          maxOutputTokens: c.maxOutputTokens,
          responseMimeType: "application/json",
        },
      },
    }),
    (j) => {
      const r = j as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      return {
        text: r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "",
        inputTokens: r.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: r.usageMetadata?.candidatesTokenCount ?? 0,
      };
    },
  );
