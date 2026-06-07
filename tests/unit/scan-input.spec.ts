import { describe, expect, it } from "vitest";

import { classifyScanInput, isSearchable } from "@/services/scan-input";

describe("classifyScanInput (el input único de la venta — ui-caja §5)", () => {
  it("vacío + Enter = COBRAR", () => {
    expect(classifyScanInput("")).toEqual({ kind: "empty" });
    expect(classifyScanInput("   ")).toEqual({ kind: "empty" });
  });

  it("multiplicador n*: 3* y 12*", () => {
    expect(classifyScanInput("3*")).toEqual({ kind: "multiplier", times: "3" });
    expect(classifyScanInput("12*")).toEqual({ kind: "multiplier", times: "12" });
  });

  it("0* NO es multiplicador (cantidad sin sentido)", () => {
    expect(classifyScanInput("0*").kind).not.toBe("multiplier");
  });

  it("EAN-13 de balanza (prefijo 2, 13 dígitos)", () => {
    expect(classifyScanInput("2000123003450")).toEqual({ kind: "scale", code: "2000123003450" });
  });

  it("código de barras normal", () => {
    expect(classifyScanInput("7461234567890")).toEqual({ kind: "code", code: "7461234567890" });
    expect(classifyScanInput("20011")).toEqual({ kind: "code", code: "20011" });
  });

  it("texto = búsqueda", () => {
    expect(classifyScanInput("arroz")).toEqual({ kind: "search", term: "arroz" });
  });
});

describe("isSearchable (búsqueda en vivo mientras teclea)", () => {
  it("2+ caracteres con letras", () => {
    expect(isSearchable("ar")).toBe(true);
    expect(isSearchable("a")).toBe(false);
    expect(isSearchable("746")).toBe(false); // dígitos puros: es un código
    expect(isSearchable("ñame")).toBe(true);
  });
});
