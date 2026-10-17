import type { CandidateProfile } from "./rules";

/**
 * Anonimización previa a la IA (docs/03 sección 6). El mapa marcador -> dato real queda solo en el servidor.
 * Reduce el riesgo, no lo elimina: por eso el candidato acepta además el aviso de tratamiento de datos.
 */
export function anonymize(
  text: string,
  c: Pick<CandidateProfile, "fullName" | "email" | "phone" | "portfolioUrl">,
) {
  const map: Record<string, string> = {};
  let out = text;
  const swap = (re: RegExp, marker: string, raw?: string) => {
    out = out.replace(re, (m) => {
      map[marker] = raw ?? m;
      return marker;
    });
  };
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  swap(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[CONTACTO]");
  swap(/https?:\/\/\S+|www\.\S+|\b(?:linkedin|github|gitlab|behance)\.com\/\S*/gi, "[ENLACE]");
  // Teléfonos: formatos con 10+ dígitos. Un rango de años (2019-2023) no coincide.
  swap(/\+?\d{1,3}[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[CONTACTO]");
  swap(/\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, "[CONTACTO]");
  swap(/\b\d{10}\b/g, "[CONTACTO]");
  // Nombre completo y cada parte significativa que el propio candidato escribió en el formulario.
  const parts = c.fullName.split(/\s+/).filter((p) => p.length > 2);
  swap(new RegExp(esc(c.fullName), "gi"), "[NOMBRE]", c.fullName);
  for (const p of parts) swap(new RegExp(`\\b${esc(p)}\\b`, "gi"), "[NOMBRE]", p);
  // Datos personales que no aportan a la evaluación.
  swap(/\b(fecha de nacimiento|nacid[oa] el|edad)\s*[:-]?\s*[^\n,;]{0,30}/gi, "[DATO-PERSONAL]");
  swap(/\b(estado civil|g[eé]nero|sexo|nacionalidad)\s*[:-]?\s*[^\n,;]{0,30}/gi, "[DATO-PERSONAL]");
  swap(/\b\d{3}-?\d{7}-?\d\b/g, "[DOCUMENTO]"); // cédula dominicana
  return { text: out, map };
}

export interface RiskFlag {
  code: "prompt_injection" | "hidden_text" | "score_manipulation";
  detail: string;
}

const patterns: { re: RegExp; flag: RiskFlag }[] = [
  {
    re: /ignor[ae]\s+(todas?\s+)?(las\s+)?(instrucciones|indicaciones|reglas)/i,
    flag: { code: "prompt_injection", detail: "Pide ignorar instrucciones" },
  },
  {
    re: /ignore\s+(all\s+)?(the\s+)?(previous|prior|above)\s+(instructions|rules)/i,
    flag: { code: "prompt_injection", detail: "Pide ignorar instrucciones" },
  },
  {
    re: /(olvida|desestima)\s+(todo|lo anterior|tus instrucciones)/i,
    flag: { code: "prompt_injection", detail: "Pide olvidar instrucciones" },
  },
  {
    re: /(system\s*prompt|mensaje\s+de\s+sistema|eres\s+ahora|you\s+are\s+now|act[uú]a\s+como)/i,
    flag: { code: "prompt_injection", detail: "Intenta redefinir el rol del asistente" },
  },
  {
    re: /(califica|punt[uú]a|asigna|dame|otorga)\b[^.\n]{0,40}\b(100|m[aá]ximo|perfect[oa]|10\/10)/i,
    flag: { code: "score_manipulation", detail: "Pide un puntaje determinado" },
  },
  {
    re: /(score|rate|grade)\b[^.\n]{0,30}\b(100|maximum|perfect)/i,
    flag: { code: "score_manipulation", detail: "Pide un puntaje determinado" },
  },
  {
    re: /(recomienda|recommend)\b[^.\n]{0,30}\b(avanzar|advance|contratar|hire)/i,
    flag: { code: "score_manipulation", detail: "Pide una recomendación determinada" },
  },
  {
    re: /<\/?(cv|vacante|system|instruction)s?>/i,
    flag: { code: "prompt_injection", detail: "Intenta cerrar o imitar los delimitadores" },
  },
];

/** Marca texto sospechoso; el análisis continúa con el mismo arnés (el texto del CV nunca es de confianza). */
// Caracteres de ancho cero y marcas direccionales (se construye con codigos para que no se pierdan al editar).
const HIDDEN_CHARS = new RegExp(
  `[${String.fromCharCode(0x200b)}-${String.fromCharCode(0x200f)}${String.fromCharCode(0x2060)}${String.fromCharCode(0xfeff)}]{3,}`,
);

export function detectRisk(text: string): RiskFlag[] {
  const flags: RiskFlag[] = [];
  for (const { re, flag } of patterns)
    if (re.test(text) && !flags.some((f) => f.detail === flag.detail)) flags.push(flag);
  // Caracteres de ancho cero o de control: se usan para esconder instrucciones.
  if (HIDDEN_CHARS.test(text))
    flags.push({ code: "hidden_text", detail: "Contiene caracteres invisibles" });
  return flags;
}

/** Atributos protegidos que no deben aparecer en las justificaciones del modelo (docs/03 7.4). */
const protectedRe =
  /(?<![p{L}])(g[eé]nero|sexo|hombre|mujer|masculin[oa]|femenin[oa]|edad|embarazad[oa]|estado civil|casad[oa]|solter[oa]|religi[oó]n|cat[oó]lic[oa]|evang[eé]lic[oa]|musulm[aá]n|nacionalidad|raza|etnia|haitian[oa]|venezolan[oa]|discapacidad|orientaci[oó]n sexual)(?![p{L}])/iu;
export const mentionsProtectedAttribute = (s: string) => protectedRe.test(s);

/** Sanea una justificación para mostrarla como texto plano. */
export const plain = (s: string) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_#>]/g, "")
    .slice(0, 400)
    .trim();
