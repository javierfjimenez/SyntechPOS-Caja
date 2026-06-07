/**
 * Parser de EAN-13 de balanza, prefijo 2X — réplica TS de la implementación
 * CANÓNICA del servidor (ScaleBarcodeParser.php). DEBE pasar todos los casos
 * de docs/fixtures/scale-barcodes.json.
 *
 * Estructura (posiciones 1-13):
 *   [1]    '2'           — prefijo de uso interno (balanzas)
 *   [2]    0-9           — variante del prefijo (depende de la balanza)
 *   [3-7]  producto      — código BASE de 5 dígitos (réplica barcodes)
 *   [8-12] valor         — peso en GRAMOS o precio en CENTAVOS (config negocio)
 *   [13]   dígito verificador EAN-13
 */

export type ScaleFormat = "weight" | "price";

export interface ScaleBarcode {
  productCode: string;
  weight: string | null; // "0.345" (kg, 3 decimales)
  price: string | null; // "125.50" (2 decimales)
}

/** ¿Parece un código de balanza? (13 dígitos, empieza con 2) */
export function isScaleCode(code: string): boolean {
  return /^2\d{12}$/.test(code);
}

export function parseScaleBarcode(code: string, format: ScaleFormat): ScaleBarcode | null {
  if (!isScaleCode(code) || !validChecksum(code)) {
    return null;
  }

  const productCode = code.slice(2, 7);
  const value = BigInt(code.slice(7, 12));

  if (format === "weight") {
    // 00345 gramos → 0.345 kg
    return { productCode, weight: fixed(value, 3), price: null };
  }
  // 12550 centavos → RD$ 125.50
  return { productCode, weight: null, price: fixed(value, 2) };
}

/** Dígito verificador EAN-13: impares ×1, pares ×3, módulo 10 */
export function validChecksum(code: string): boolean {
  return Number(code[12]) === checksum(code.slice(0, 12));
}

export function checksum(first12: string): number {
  let sum = 0;
  for (let i = 0; i < first12.length; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

function fixed(value: bigint, decimals: number): string {
  const factor = 10n ** BigInt(decimals);
  return `${value / factor}.${(value % factor).toString().padStart(decimals, "0")}`;
}
