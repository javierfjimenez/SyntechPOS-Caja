import { describe, expect, it } from "vitest";

import { avatarFor, colorFor, initials } from "@/lib/avatar";

describe("initials (iniciales del nombre del producto)", () => {
  it("dos palabras → una inicial de cada una", () => {
    expect(initials("Arroz Selecto")).toBe("AS");
    expect(initials("Pollo fresco")).toBe("PF");
  });

  it("una sola palabra → dos primeras letras", () => {
    expect(initials("Banana")).toBe("BA");
  });

  it("ignora palabras vacías / símbolos y nunca falla", () => {
    expect(initials("   ")).toBe("?");
    expect(initials("Leche  Rica 1L")).toBe("LR");
  });
});

describe("colorFor (color determinista)", () => {
  it("el MISMO nombre da SIEMPRE el mismo color", () => {
    expect(colorFor("Arroz Selecto")).toBe(colorFor("Arroz Selecto"));
  });

  it("siempre devuelve un color de la paleta (hex)", () => {
    for (const n of ["Arroz", "Pollo", "Banana", "Aceite Crisol", "Sal molida"]) {
      expect(colorFor(n)).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("nombres distintos tienden a colores distintos (distribución)", () => {
    const names = ["Arroz", "Pollo", "Banana", "Aceite", "Sal", "Azúcar", "Leche", "Pan"];
    const colors = new Set(names.map(colorFor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe("avatarFor", () => {
  it("combina iniciales + color", () => {
    const a = avatarFor("Arroz Selecto");
    expect(a.initials).toBe("AS");
    expect(a.color).toMatch(/^#/);
  });
});
