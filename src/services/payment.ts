import { fromCents, toCents } from "@/lib/decimal";

/**
 * Lógica pura del COBRO (ui-caja §6): pagos agregados, "Falta: RD$ X",
 * cambio en vivo. Misma forma que payments del evento (eventos-sync §4.1).
 */

export type MethodCode = "cash" | "card" | "transfer" | "credit";

export interface PaymentDraft {
  method_code: MethodCode;
  amount: string; // lo que aplica a la venta
  amount_tendered: string | null; // solo efectivo: lo entregado físicamente
  reference: string | null; // tarjeta/transferencia (registro manual v1)
}

export const METHOD_LABELS: Record<MethodCode, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  credit: "Crédito",
};

/** Lo que falta por cubrir: total − suma de pagos (nunca negativo) */
export function remaining(total: string, payments: PaymentDraft[]): string {
  let paid = 0n;
  for (const p of payments) {
    paid += toCents(p.amount);
  }
  const rest = toCents(total) - paid;
  return fromCents(rest > 0n ? rest : 0n);
}

/** CAMBIO a devolver: efectivo entregado − efectivo aplicado */
export function changeDue(payments: PaymentDraft[]): string {
  let change = 0n;
  for (const p of payments) {
    if (p.method_code === "cash" && p.amount_tendered !== null) {
      change += toCents(p.amount_tendered) - toCents(p.amount);
    }
  }
  return fromCents(change > 0n ? change : 0n);
}

export function canConfirm(total: string, payments: PaymentDraft[]): boolean {
  return payments.length > 0 && remaining(total, payments) === "0.00";
}

export function isCreditSale(payments: PaymentDraft[]): boolean {
  return payments.some((p) => p.method_code === "credit");
}

/**
 * El caso común (90%): UN pago en efectivo por el total, con lo entregado.
 * Entregado < total → pago parcial (mixto); entregado ≥ total → completo.
 */
export function cashPayment(total: string, tendered: string): PaymentDraft {
  const totalCents = toCents(total);
  const tenderedCents = toCents(tendered);
  return {
    method_code: "cash",
    amount: tenderedCents >= totalCents ? total : tendered,
    amount_tendered: tendered,
    reference: null,
  };
}

/**
 * Recalcula un pago al editar su monto. `typed` es lo que tecleó la cajera:
 * para EFECTIVO = lo RECIBIDO (puede exceder lo que falta → genera vuelta);
 * para los demás métodos = lo aplicado. `needBefore` = total − suma de los
 * OTROS pagos ya aplicados (lo que falta cubrir sin contar esta línea).
 *
 * Invariantes: el aplicado (`amount`) nunca excede lo que falta cubrir; el
 * efectivo guarda lo recibido en `amount_tendered` para calcular la vuelta.
 * Así un "recibido 2000" sobre una venta de 1500 aplica 1500 y devuelve 500.
 */
export function recomputePayment(method: MethodCode, typed: string, needBefore: string): PaymentDraft {
  const need = toCents(needBefore);
  const cap = need > 0n ? need : 0n;
  const tendered = toCents(typed);
  const applied = tendered > cap ? cap : tendered;
  return {
    method_code: method,
    amount: fromCents(applied),
    amount_tendered: method === "cash" ? typed : null,
    reference: null,
  };
}

/** Crédito disponible del cliente: límite − balance (puede ser negativo) */
export function availableCredit(creditLimit: string, creditBalance: string): string {
  return fromCents(toCents(creditLimit) - toCents(creditBalance));
}

/** ¿El monto a crédito excede el disponible? (→ PIN supervisor) */
export function exceedsCredit(amount: string, available: string): boolean {
  const avail = toCents(available);
  return toCents(amount) > (avail > 0n ? avail : 0n);
}
