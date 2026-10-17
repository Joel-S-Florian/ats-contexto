import { unzipSync } from "fflate";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export type CvType = "pdf" | "docx";
export const mimeOf: Record<CvType, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * Tipo real por firma, ignorando extensión y MIME declarados (docs/04 sección 4).
 * PDF: cabecera %PDF-. DOCX: contenedor ZIP que incluye word/document.xml.
 */
export function detectCvType(data: Buffer): CvType | null {
  if (data.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04) {
    try {
      // Solo se descomprime la entrada necesaria; un zip corrupto o una bomba de descompresión no llega al resto.
      const files = unzipSync(data, {
        filter: (f) => f.name === "word/document.xml" && f.originalSize < 50 * 1024 * 1024,
      });
      return files["word/document.xml"] ? "docx" : null;
    } catch {
      return null;
    }
  }
  return null;
}

const MAX_TEXT = 200_000;
const MIN_READABLE = 40;

/** Texto plano del CV. Es dato no confiable: nunca se interpreta como HTML (regla 3). */
export async function extractCvText(data: Buffer, type: CvType): Promise<string> {
  const raw =
    type === "pdf"
      ? (await extractText(await getDocumentProxy(new Uint8Array(data)), { mergePages: true })).text
      : (await mammoth.extractRawText({ buffer: data })).value;
  return raw
    .replaceAll("\0", "")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, MAX_TEXT);
}

/** PDF escaneado (sin capa de texto): en el MVP queda "no legible" y pasa a revisión manual. */
export const isReadable = (text: string) => text.replace(/\s/g, "").length >= MIN_READABLE;
