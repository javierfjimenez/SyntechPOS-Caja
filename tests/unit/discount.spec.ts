import { describe, expect, it } from "vitest";

import { discountRequiresAuth } from "@/services/sale";

/**
 * Umbral de descuento del negocio (settings.max_discount_percent del
 * bootstrap @3a8fb67): por debajo la cajera lo aplica sola; por encima,
 * PIN de supervisor.
 */

const linea = { quantity: "2.000", unit_price: "75.00" }; // bruto 150.00

describe("discountRequiresAuth (umbral % del negocio)", () => {
  it("dentro del umbral (10%): 15.00 de 150.00 NO pide PIN", () => {
    expect(discountRequiresAuth(linea, "15.00", 10)).toBe(false);
  });

  it("sobre el umbral: 15.01 de 150.00 pide PIN", () => {
    expect(discountRequiresAuth(linea, "15.01", 10)).toBe(true);
  });

  it("sin descuento jamás pide PIN", () => {
    expect(discountRequiresAuth(linea, "0.00", 0)).toBe(false);
  });

  it("umbral 0%: cualquier descuento pide PIN", () => {
    expect(discountRequiresAuth(linea, "0.01", 0)).toBe(true);
  });

  it("umbral con decimales (12.5%) — sin floats en la comparación", () => {
    expect(discountRequiresAuth(linea, "18.75", 12.5)).toBe(false); // exacto al límite
    expect(discountRequiresAuth(linea, "18.76", 12.5)).toBe(true);
  });

  it("pesables: el bruto se calcula con la cantidad real", () => {
    const pesable = { quantity: "0.345", unit_price: "65.00" }; // bruto 22.43
    expect(discountRequiresAuth(pesable, "2.24", 10)).toBe(false);
    expect(discountRequiresAuth(pesable, "2.25", 10)).toBe(true);
  });
});
