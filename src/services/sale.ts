import { fromCents, itbisBreakdown, mulPriceQty, toCents, toMilli } from "@/lib/decimal";

/**
 * Modelo de la venta en curso. Las líneas tienen la MISMA forma que las del
 * evento sale.completed (eventos-sync §4.1): al cobrar (4.4) se firman tal
 * cual, sin transformación — lo que se ve es lo que viaja.
 */

export type TaxCategory = "ITBIS18" | "ITBIS16" | "ITBIS0" | "EXENTO";

export const TAX_RATES: Record<TaxCategory, "18.00" | "16.00" | "0.00"> = {
  ITBIS18: "18.00",
  ITBIS16: "16.00",
  ITBIS0: "0.00",
  EXENTO: "0.00",
};

export interface SaleLine {
  product_id: number | null; // null = venta por departamento (M5)
  department_id: number;
  description: string;
  quantity: string; // "2.000" — 3 decimales
  unit_price: string; // "75.00"
  discount_amount: string; // "0.00" — monto absoluto por línea
  tax_category: TaxCategory;
  unit_cost: string; // "61.5000" — 4 decimales ("0.0000" si departamento)
  is_weighable: boolean; // solo UI (no viaja en el evento)
}

/** Cliente de la venta: registrado (id) o creado al vuelo (inline, §9.3) */
export interface SaleCustomer {
  id: number | null;
  name: string;
  document_type: "rnc" | "cedula" | null;
  document_number: string | null;
  phone: string | null;
}

export interface CurrentSale {
  lines: SaleLine[];
  customer: SaleCustomer | null;
  supervisor_user_id: number | null; // quién autorizó descuentos (PIN)
}

export const emptySale = (): CurrentSale => ({
  lines: [],
  customer: null,
  supervisor_user_id: null,
});

/** Total de línea: cantidad × precio − descuento (half-up, sin floats) */
export function lineTotalCents(line: SaleLine): bigint {
  const gross = mulPriceQty(toCents(line.unit_price), toMilli(line.quantity));
  return gross - toCents(line.discount_amount);
}

export function lineTotal(line: SaleLine): string {
  return fromCents(lineTotalCents(line));
}

/** Desglose fiscal por línea (el precio INCLUYE el ITBIS — modelo del catálogo) */
export function lineBreakdown(line: SaleLine): { taxable_base: string; tax_amount: string } {
  const total = lineTotalCents(line);
  if (line.tax_category === "ITBIS18" || line.tax_category === "ITBIS16") {
    const rate = line.tax_category === "ITBIS18" ? 18 : 16;
    const { base, tax } = itbisBreakdown(total, rate);
    return { taxable_base: fromCents(base), tax_amount: fromCents(tax) };
  }
  // ITBIS0 y EXENTO: base completa, impuesto cero (categorías DISTINTAS ante DGII)
  return { taxable_base: fromCents(total), tax_amount: "0.00" };
}

/** Misma forma que `totals` del evento sale.completed (eventos-sync §4.1) */
export interface SaleTotals {
  taxed18_base: string;
  taxed18_itbis: string;
  taxed16_base: string;
  taxed16_itbis: string;
  taxed0_base: string;
  exempt_base: string;
  discount_total: string;
  total: string;
}

export function computeTotals(lines: SaleLine[]): SaleTotals {
  let taxed18Base = 0n;
  let taxed18Itbis = 0n;
  let taxed16Base = 0n;
  let taxed16Itbis = 0n;
  let taxed0Base = 0n;
  let exemptBase = 0n;
  let discount = 0n;
  let total = 0n;

  for (const line of lines) {
    const cents = lineTotalCents(line);
    total += cents;
    discount += toCents(line.discount_amount);

    switch (line.tax_category) {
      case "ITBIS18": {
        const { base, tax } = itbisBreakdown(cents, 18);
        taxed18Base += base;
        taxed18Itbis += tax;
        break;
      }
      case "ITBIS16": {
        const { base, tax } = itbisBreakdown(cents, 16);
        taxed16Base += base;
        taxed16Itbis += tax;
        break;
      }
      case "ITBIS0":
        taxed0Base += cents;
        break;
      case "EXENTO":
        exemptBase += cents;
        break;
    }
  }

  return {
    taxed18_base: fromCents(taxed18Base),
    taxed18_itbis: fromCents(taxed18Itbis),
    taxed16_base: fromCents(taxed16Base),
    taxed16_itbis: fromCents(taxed16Itbis),
    taxed0_base: fromCents(taxed0Base),
    exempt_base: fromCents(exemptBase),
    discount_total: fromCents(discount),
    total: fromCents(total),
  };
}

/**
 * ¿El descuento excede el umbral del negocio? (→ PIN de supervisor).
 * `maxDiscountPercent` viene del bootstrap (settings curados, @3a8fb67) y
 * se compara contra el bruto de la línea (cantidad × precio), sin floats.
 */
export function discountRequiresAuth(
  line: Pick<SaleLine, "quantity" | "unit_price">,
  discountAmount: string,
  maxDiscountPercent: number,
): boolean {
  const discount = toCents(discountAmount);
  if (discount === 0n) return false;
  const gross = mulPriceQty(toCents(line.unit_price), toMilli(line.quantity));
  const basisPoints = BigInt(Math.round(maxDiscountPercent * 100));
  return discount * 10_000n > gross * basisPoints;
}

/** Subtotal visible (wireframe §5): suma de bases = total − ITBIS */
export function subtotal(totals: SaleTotals): string {
  return fromCents(
    toCents(totals.taxed18_base) +
      toCents(totals.taxed16_base) +
      toCents(totals.taxed0_base) +
      toCents(totals.exempt_base),
  );
}

/** Items totales (cantidades sumadas): "7.345" como el contador del wireframe */
export function totalItems(lines: SaleLine[]): string {
  let milli = 0n;
  for (const line of lines) {
    milli += toMilli(line.quantity);
  }
  const s = milli.toString().padStart(4, "0");
  const dec = s.slice(-3);
  return dec === "000" ? s.slice(0, -3) : `${s.slice(0, -3)}.${dec}`;
}
