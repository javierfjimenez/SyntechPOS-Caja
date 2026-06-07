import { describe, expect, it } from "vitest";

import fixture from "../../docs/fixtures/scale-barcodes.json";
import { checksum, isScaleCode, parseScaleBarcode, type ScaleFormat } from "@/services/scale-barcode";

/**
 * Cobertura INNEGOCIABLE (CLAUDE.md): el parser TS debe pasar los MISMOS
 * casos canónicos que pasa el servidor PHP — docs/fixtures/scale-barcodes.json.
 */

describe("parser de balanza contra el fixture canónico", () => {
  for (const caso of fixture.valid) {
    it(`válido: ${caso.code} (${caso.format})`, () => {
      const result = parseScaleBarcode(caso.code, caso.format as ScaleFormat);
      expect(result).toEqual(caso.expect);
    });
  }

  for (const caso of fixture.invalid) {
    it(`inválido: ${caso.code} — ${caso.motivo}`, () => {
      expect(parseScaleBarcode(caso.code, caso.format as ScaleFormat)).toBeNull();
    });
  }
});

describe("detalles del algoritmo", () => {
  it("isScaleCode: solo 13 dígitos que empiezan con 2", () => {
    expect(isScaleCode("2000123003450")).toBe(true);
    expect(isScaleCode("7461234567890")).toBe(false);
    expect(isScaleCode("200012300345")).toBe(false); // 12 dígitos
  });

  it("checksum EAN-13 (impares ×1, pares ×3, módulo 10)", () => {
    expect(checksum("200012300345")).toBe(0);
    expect(checksum("250077701500")).toBe(2);
  });

  it("el peso/precio conserva los ceros (string decimal, no float)", () => {
    expect(parseScaleBarcode("2145678000506", "price")?.price).toBe("0.50");
    expect(parseScaleBarcode("2900001999991", "weight")?.weight).toBe("99.999");
  });
});
