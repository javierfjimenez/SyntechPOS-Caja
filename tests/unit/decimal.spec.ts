import { describe, expect, it } from "vitest";

import {
  fromCents,
  fromMilli,
  itbisBreakdown,
  mulPriceQty,
  toCents,
  toMilli,
} from "@/lib/decimal";

describe("toCents/fromCents (dinero exacto, sin floats)", () => {
  it("parsea y formatea ida y vuelta", () => {
    expect(toCents("75.00")).toBe(7500n);
    expect(toCents("0.05")).toBe(5n);
    expect(toCents("75")).toBe(7500n);
    expect(toCents("75.5")).toBe(7550n);
    expect(fromCents(7500n)).toBe("75.00");
    expect(fromCents(5n)).toBe("0.05");
  });

  it("maneja montos más allá del float seguro", () => {
    expect(toCents("9007199254740993.99")).toBe(900719925474099399n);
    expect(fromCents(900719925474099399n)).toBe("9007199254740993.99");
  });

  it("rechaza basura y exceso de decimales", () => {
    expect(() => toCents("12.345")).toThrow();
    expect(() => toCents("abc")).toThrow();
    expect(() => toCents("")).toThrow();
  });
});

describe("mulPriceQty (precio × cantidad, half-up)", () => {
  it("cantidades enteras", () => {
    expect(mulPriceQty(toCents("75.00"), toMilli("2.000"))).toBe(15000n);
  });

  it("pesables: 65.00 × 0.345 = 22.43 (como el wireframe)", () => {
    expect(fromCents(mulPriceQty(toCents("65.00"), toMilli("0.345")))).toBe("22.43");
  });

  it("redondeo half-up en el medio centavo", () => {
    // 1.01 × 0.5 = 0.505 → 0.51
    expect(fromCents(mulPriceQty(toCents("1.01"), toMilli("0.500")))).toBe("0.51");
  });
});

describe("itbisBreakdown (desglose del impuesto incluido en el precio)", () => {
  it("reproduce el fixture del contrato: 150.00 → base 127.12 + ITBIS 22.88", () => {
    const { base, tax } = itbisBreakdown(toCents("150.00"), 18);
    expect(fromCents(base)).toBe("127.12");
    expect(fromCents(tax)).toBe("22.88");
  });

  it("ITBIS 16%", () => {
    const { base, tax } = itbisBreakdown(toCents("116.00"), 16);
    expect(fromCents(base)).toBe("100.00");
    expect(fromCents(tax)).toBe("16.00");
  });

  it("base + impuesto SIEMPRE suman el total exacto", () => {
    for (const total of ["0.01", "1.00", "99.99", "150.00", "1234.56"]) {
      const cents = toCents(total);
      const { base, tax } = itbisBreakdown(cents, 18);
      expect(base + tax).toBe(cents);
    }
  });
});

describe("toMilli/fromMilli (cantidades, 3 decimales)", () => {
  it("ida y vuelta", () => {
    expect(toMilli("2.000")).toBe(2000n);
    expect(toMilli("0.345")).toBe(345n);
    expect(fromMilli(345n)).toBe("0.345");
    expect(fromMilli(7345n)).toBe("7.345");
  });
});
