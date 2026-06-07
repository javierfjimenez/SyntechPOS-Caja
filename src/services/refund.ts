import { fromMilli, toMilli } from "@/lib/decimal";
import type { Envelope } from "@/services/event-signing";
import {
  computeTotals,
  lineBreakdown,
  lineTotal,
  TAX_RATES,
  type SaleLine,
  type TaxCategory,
} from "@/services/sale";

/**
 * Devoluciones (tarea 4.8): NC tipo 34 contra una venta PROPIA (la caja solo
 * conoce sus ventas — devolución cruzada entre cajas exige internet, v2).
 * Las cantidades viajan POSITIVAS; type "credit_note" da la dirección.
 * supervisor_user_id SIEMPRE (PinAutorizacion).
 */

export interface OriginalSale {
  sale_ulid: string;
  ticket_number: number;
  occurred_at: string;
  cashier_user_id: number;
  customer_id: number | null;
  lines: {
    product_id: number | null;
    department_id: number;
    description: string;
    quantity: string;
    unit_price: string;
    discount_amount: string;
    tax_category: TaxCategory;
    unit_cost: string;
  }[];
  total: string;
}

/** La venta más reciente con ese número de ticket (releída del outbox) */
export function findSaleByTicket(envelopes: Envelope[], ticketNumber: number): OriginalSale | null {
  for (let i = envelopes.length - 1; i >= 0; i--) {
    const envelope = envelopes[i]!;
    if (envelope.type !== "sale.completed") continue;
    const p = envelope.payload as Record<string, unknown>;
    if (p.type !== "sale" || p.ticket_number !== ticketNumber) continue;
    return {
      sale_ulid: p.sale_ulid as string,
      ticket_number: ticketNumber,
      occurred_at: envelope.occurred_at,
      cashier_user_id: p.cashier_user_id as number,
      customer_id: (p.customer_id as number | null) ?? null,
      lines: p.lines as OriginalSale["lines"],
      total: (p.totals as { total: string }).total,
    };
  }
  return null;
}

/**
 * Cuánto queda por devolver de cada línea: vendido − ya devuelto en NCs
 * previas contra la misma venta. Lo devuelto se agrega por producto+precio
 * y se descuenta de las líneas originales en orden.
 */
export function returnableQuantities(envelopes: Envelope[], original: OriginalSale): string[] {
  const key = (l: { product_id: number | null; unit_price: string; description: string }) =>
    `${l.product_id}|${l.unit_price}|${l.description}`;

  const returnedByKey = new Map<string, bigint>();
  for (const envelope of envelopes) {
    if (envelope.type !== "sale.completed") continue;
    const p = envelope.payload as Record<string, unknown>;
    if (p.type !== "credit_note" || p.ref_sale_ulid !== original.sale_ulid) continue;
    for (const ncLine of p.lines as OriginalSale["lines"]) {
      const k = key(ncLine);
      returnedByKey.set(k, (returnedByKey.get(k) ?? 0n) + toMilli(ncLine.quantity));
    }
  }

  return original.lines.map((line) => {
    const k = key(line);
    const pending = returnedByKey.get(k) ?? 0n;
    const sold = toMilli(line.quantity);
    const applied = pending > sold ? sold : pending;
    returnedByKey.set(k, pending - applied);
    return fromMilli(sold - applied);
  });
}

export interface RefundSelection {
  lineIndex: number;
  quantity: string; // a devolver (≤ returnable)
}

/** payload sale.completed con type credit_note (eventos-sync §4.1 reglas) */
export function buildCreditNotePayload(input: {
  original: OriginalSale;
  selections: RefundSelection[];
  returnable: string[];
  saleUlid: string;
  ticketNumber: number;
  cashSessionUlid: string;
  cashierUserId: number;
  supervisorUserId: number;
}): Record<string, unknown> {
  const lines: SaleLine[] = input.selections.map((s) => {
    const original = input.original.lines[s.lineIndex];
    if (original === undefined) throw new Error(`Línea ${s.lineIndex} no existe en la venta original.`);
    if (toMilli(s.quantity) <= 0n) throw new Error("La cantidad a devolver debe ser mayor que cero.");
    if (toMilli(s.quantity) > toMilli(input.returnable[s.lineIndex]!)) {
      throw new Error(`No puedes devolver más de ${input.returnable[s.lineIndex]} de ${original.description}.`);
    }
    return {
      product_id: original.product_id,
      department_id: original.department_id,
      description: original.description,
      quantity: s.quantity, // POSITIVA: el type da la dirección
      unit_price: original.unit_price,
      discount_amount: "0.00", // el descuento original no se re-prorratea en v1
      tax_category: original.tax_category,
      unit_cost: original.unit_cost,
      is_weighable: false,
    };
  });
  if (lines.length === 0) throw new Error("Selecciona al menos una línea a devolver.");

  const totals = computeTotals(lines);

  return {
    sale_ulid: input.saleUlid,
    ticket_number: input.ticketNumber,
    cash_session_ulid: input.cashSessionUlid,
    cashier_user_id: input.cashierUserId,
    type: "credit_note",
    ref_sale_ulid: input.original.sale_ulid,
    is_credit: false,
    customer_id: input.original.customer_id,
    customer: null,
    lines: lines.map((line) => {
      const breakdown = lineBreakdown(line);
      return {
        product_id: line.product_id,
        department_id: line.department_id,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        discount_amount: line.discount_amount,
        tax_category: line.tax_category,
        tax_rate: TAX_RATES[line.tax_category],
        taxable_base: breakdown.taxable_base,
        tax_amount: breakdown.tax_amount,
        total: lineTotal(line),
        unit_cost: line.unit_cost,
      };
    }),
    // reembolso en efectivo (ui-caja §7)
    payments: [{ method_code: "cash", amount: totals.total, amount_tendered: null, reference: null }],
    totals: { ...totals },
    supervisor_user_id: input.supervisorUserId,
  };
}
