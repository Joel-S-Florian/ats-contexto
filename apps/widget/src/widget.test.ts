// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const job = {
  id: "j1",
  title: "<img src=x onerror=alert(1)>Backend",
  department: "TI",
  summary: "s",
  responsibilities: "",
  benefits: "",
  requirementsRequired: "",
  requirementsDesirable: "",
  level: "senior",
  employmentType: "full_time",
  workMode: "remote",
  province: "Santiago",
  requiredSkills: ["<b>Node</b>"],
  desirableSkills: [],
  minYears: 1,
};

describe("widget", () => {
  it("renderiza vacantes en Shadow DOM y escapa el contenido de la API", async () => {
    document.body.innerHTML =
      '<div id="careers-widget"></div><script data-key="pk_x" data-api="http://api.test"></script>';
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          String(url).includes("/notice")
            ? { version: "v1", title: "Aviso", body: ["x"] }
            : { items: [job], total: 1 },
      })),
    );
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    Element.prototype.scrollIntoView = vi.fn();
    await import("./index");
    await vi.waitFor(() => {
      const root = document.getElementById("careers-widget")!.shadowRoot!;
      expect(root.querySelectorAll(".card")).toHaveLength(1);
    });
    const root = document.getElementById("careers-widget")!.shadowRoot!;
    expect(root.querySelector("img")).toBeNull(); // el HTML de la API no se interpreta
    expect(root.querySelector(".card h3")!.textContent).toContain("<img");
    expect(root.querySelector(".tag")!.textContent).toBe("<b>Node</b>");
    (root.querySelector(".card") as HTMLElement).click();
    expect(root.querySelector(".detail h2")).not.toBeNull();
    (root.querySelector('[data-act="apply"]') as HTMLElement).click();
    expect(root.querySelector("form input[name=email]")).not.toBeNull();
    expect(root.querySelector("form input[name=consent]")).not.toBeNull();
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as [
      string,
      RequestInit,
    ][];
    const [url, init] = calls.find(([u]) => u.includes("/public/v1/jobs"))!;
    expect(url).toContain("http://api.test/public/v1/jobs");
    expect(init.headers).toMatchObject({ "x-public-key": "pk_x" });
  });
});
