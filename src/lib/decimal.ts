/**
 * Aritmética decimal exacta para lo fiscal (regla del repo: JAMÁS floats).
 * Dinero = BigInt de CENTAVOS (2 dec) · Cantidad = BigInt de MILÉSIMAS (3 dec).
 * Redondeo half-up, igual que el servidor PHP.
 */

/** "75.00" | "75.5" | "75" → 7500n centavos */
export function toCents(amount: string): bigint {
  return parseFixed(amount, 2);
}

/** 7500n → "75.00" */
export function fromCents(cents: bigint): string {
  return formatFixed(cents, 2);
}

/** "2.000" | "2" → 2000n milésimas */
export function toMilli(quantity: string): bigint {
  return parseFixed(quantity, 3);
}

/** 2000n → "2.000" */
export function fromMilli(milli: bigint): string {
  return formatFixed(milli, 3);
}

/** precio × cantidad → centavos (half-up): 7500¢ × 0.345 = 2588¢ */
export function mulPriceQty(priceCents: bigint, qtyMilli: bigint): bigint {
  return divHalfUp(priceCents * qtyMilli, 1000n);
}

/**
 * Desglose hacia atrás del ITBIS INCLUIDO en el precio (modelo del catálogo):
 * base = total × 100 / (100 + tasa), half-up; el impuesto es la diferencia.
 * Fixture del contrato: 150.00 con ITBIS18 → base 127.12, itbis 22.88.
 */
export function itbisBreakdown(totalCents: bigint, ratePercent: 18 | 16): { base: bigint; tax: bigint } {
  const base = divHalfUp(totalCents * 100n, BigInt(100 + ratePercent));
  return { base, tax: totalCents - base };
}

// ── internos ──────────────────────────────────────────────────────────────────

function divHalfUp(numerator: bigint, denominator: bigint): bigint {
  // solo se usa con operandos no negativos (precios/cantidades de venta)
  return (numerator + denominator / 2n) / denominator;
}

function parseFixed(value: string, decimals: number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(value.trim());
  if (match === null) {
    throw new Error(`Monto inválido: "${value}"`);
  }
  const [, sign, intPart, decPart = ""] = match;
  if (decPart.length > decimals) {
    throw new Error(`"${value}" excede ${decimals} decimales`);
  }
  const scaled = BigInt(intPart!) * 10n ** BigInt(decimals) + BigInt(decPart!.padEnd(decimals, "0") || "0");
  return sign === "-" ? -scaled : scaled;
}

function formatFixed(scaled: bigint, decimals: number): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const factor = 10n ** BigInt(decimals);
  const intPart = abs / factor;
  const decPart = (abs % factor).toString().padStart(decimals, "0");
  return `${negative ? "-" : ""}${intPart}.${decPart}`;
}
