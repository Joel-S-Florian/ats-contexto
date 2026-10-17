import { describe, expect, it } from "vitest";
import { defaultStages, validateStages, type StageInput } from "./pipeline.js";

const s = (type: StageInput["type"], extra: Partial<StageInput> = {}): StageInput => ({
  name: type,
  type,
  enabled: true,
  config: {},
  transition: { mode: "manual" },
  ...extra,
});

describe("validateStages", () => {
  it("acepta la plantilla por defecto", () => {
    expect(validateStages(defaultStages)).toEqual([]);
  });
  it("permite dos entrevistas y omitir la evaluación", () => {
    expect(
      validateStages([s("screening"), s("interview"), s("interview"), s("selection"), s("hiring")]),
    ).toEqual([]);
  });
  it("rechaza Evaluación antes de Entrevista", () => {
    expect(validateStages([s("assessment"), s("interview"), s("hiring")])[0]).toMatch(
      /no puede ir después/,
    );
  });
  it("exige una sola Contratación y al final", () => {
    expect(validateStages([s("screening")])).toHaveLength(1);
    expect(validateStages([s("hiring"), s("hiring")])[0]).toMatch(/exactamente una/);
    expect(validateStages([s("hiring"), s("custom")])[0]).toMatch(/última/);
  });
  it("ignora etapas desactivadas", () => {
    expect(
      validateStages([s("screening"), s("assessment", { enabled: false }), s("hiring")]),
    ).toEqual([]);
  });
  it("restringe el tipo de transición automática", () => {
    const bad = s("interview", { transition: { mode: "assessment_result", minScore: 60 } });
    expect(validateStages([bad, s("hiring")])[0]).toMatch(/solo aplica a etapas de Evaluación/);
  });
});
