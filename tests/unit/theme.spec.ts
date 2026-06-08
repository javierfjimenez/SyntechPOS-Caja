import { describe, expect, it } from "vitest";

import { DEFAULT_THEME, resolveTheme } from "@/lib/theme";

describe("resolveTheme (white-label D26)", () => {
  it("usa los hex del bootstrap cuando son válidos (cobalt)", () => {
    expect(resolveTheme({ primary: "#4338CA", primary_hi: "#6366F1" })).toEqual({
      primary: "#4338CA",
      primaryHi: "#6366F1",
    });
  });

  it("servidor viejo sin theme → tema por defecto (teal)", () => {
    expect(resolveTheme(undefined)).toEqual(DEFAULT_THEME);
    expect(resolveTheme(null)).toEqual(DEFAULT_THEME);
  });

  it("hex inválido o faltante → cae al default por campo", () => {
    expect(resolveTheme({ primary: "rojo", primary_hi: "#14B8A6" })).toEqual({
      primary: DEFAULT_THEME.primary,
      primaryHi: "#14B8A6",
    });
    expect(resolveTheme({ primary: "#A21CAF" })).toEqual({
      primary: "#A21CAF",
      primaryHi: DEFAULT_THEME.primaryHi,
    });
  });

  it("no acepta formatos raros (3 dígitos, sin #)", () => {
    expect(resolveTheme({ primary: "#fff", primary_hi: "0F766E" })).toEqual(DEFAULT_THEME);
  });
});
