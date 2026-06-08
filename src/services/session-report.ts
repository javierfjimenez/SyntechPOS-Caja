import { fromCents, toCents } from "@/lib/decimal";
import type { Envelope } from "@/services/event-signing";

/**
 * Matemática de la sesión de caja (tarea 4.6). La fuente de verdad LOCAL es
 * el outbox: los eventos de la sesión (ventas y movimientos) se releen de
 * ahí — sobrevive crash y nunca diverge de lo que viajó al servidor.
 *
 * El esperado AUTORITATIVO lo calcula el servidor (eventos-sync §4.4);
 * este es el `expected_local` que se imprime en el Z y viaja para auditoría.
 */

export type CountMethod = "cash" | "card" | "transfer";

export interface SessionActivity {
  /** ventas aplicadas por método (el cambio NO entra: amount ≤ total) */
  sales: Record<CountMethod, string>;
  creditSales: string; // informativo: no cuenta en gaveta
  withdrawals: string;
  deposits: string;
  expenses: string;
  salesCount: number;
  salesTotal: string;
}

/**
 * Recorre los sobres de la sesión (sale.completed + cash_movement.created +
 * sale.voided). Las ventas ANULADAS (con un sale.voided que las referencia)
 * NO cuentan en el arqueo — su efectivo no está en la gaveta.
 */
export function sessionActivity(envelopes: Envelope[], sessionUlid: string): SessionActivity {
  // primero: qué ventas quedaron anuladas (el void puede llegar en cualquier orden)
  const voided = new Set<string>();
  for (const envelope of envelopes) {
    if (envelope.type === "sale.voided") {
      voided.add((envelope.payload as { sale_ulid: string }).sale_ulid);
    }
  }

  let cash = 0n;
  let card = 0n;
  let transfer = 0n;
  let credit = 0n;
  let withdrawals = 0n;
  let deposits = 0n;
  let expenses = 0n;
  let salesCount = 0;
  let salesTotal = 0n;

  for (const envelope of envelopes) {
    const p = envelope.payload as Record<string, unknown>;

    if (
      envelope.type === "sale.completed" &&
      p.cash_session_ulid === sessionUlid &&
      !voided.has(p.sale_ulid as string)
    ) {
      salesCount += 1;
      salesTotal += toCents((p.totals as { total: string }).total);
      for (const payment of p.payments as { method_code: string; amount: string }[]) {
        const amount = toCents(payment.amount);
        if (payment.method_code === "cash") cash += amount;
        else if (payment.method_code === "card") card += amount;
        else if (payment.method_code === "transfer") transfer += amount;
        else if (payment.method_code === "credit") credit += amount;
      }
    }

    if (envelope.type === "cash_movement.created" && p.session_ulid === sessionUlid) {
      const amount = toCents(p.amount as string);
      if (p.type === "withdrawal") withdrawals += amount;
      else if (p.type === "deposit") deposits += amount;
      else if (p.type === "expense") expenses += amount;
    }
  }

  return {
    sales: { cash: fromCents(cash), card: fromCents(card), transfer: fromCents(transfer) },
    creditSales: fromCents(credit),
    withdrawals: fromCents(withdrawals),
    deposits: fromCents(deposits),
    expenses: fromCents(expenses),
    salesCount,
    salesTotal: fromCents(salesTotal),
  };
}

/** Lo que DEBERÍA haber: gaveta = fondo + efectivo − retiros − gastos + depósitos */
export function expectedAmounts(
  openingAmount: string,
  activity: SessionActivity,
): Record<CountMethod, string> {
  const cash =
    toCents(openingAmount) +
    toCents(activity.sales.cash) -
    toCents(activity.withdrawals) -
    toCents(activity.expenses) +
    toCents(activity.deposits);
  return {
    cash: fromCents(cash),
    card: activity.sales.card,
    transfer: activity.sales.transfer,
  };
}

/** declarado − esperado, por método (positivo = sobra) */
export function differences(
  counted: Record<CountMethod, string>,
  expected: Record<CountMethod, string>,
): Record<CountMethod, string> & { total: string } {
  const diff = (m: CountMethod) => toCents(counted[m]) - toCents(expected[m]);
  const total = diff("cash") + diff("card") + diff("transfer");
  return {
    cash: fromCents(diff("cash")),
    card: fromCents(diff("card")),
    transfer: fromCents(diff("transfer")),
    total: fromCents(total),
  };
}

// ── Payloads del contrato ─────────────────────────────────────────────────────

/** cash_session.closed (eventos-sync §4.4) */
export function buildSessionClosedPayload(input: {
  sessionUlid: string;
  closedBy: number;
  zNumber: number;
  counted: Record<CountMethod, string>;
  expectedLocal: Record<CountMethod, string> | null;
  note: string | null;
}): Record<string, unknown> {
  return {
    session_ulid: input.sessionUlid,
    closed_by: input.closedBy,
    z_number: input.zNumber,
    counted_amounts: { ...input.counted },
    expected_local: input.expectedLocal === null ? null : { ...input.expectedLocal },
    note: input.note,
  };
}

/** cash_movement.created (eventos-sync §4.5) */
export function buildCashMovementPayload(input: {
  movementUlid: string;
  sessionUlid: string;
  type: "withdrawal" | "deposit" | "expense";
  amount: string;
  reason: string;
  userId: number;
}): Record<string, unknown> {
  return {
    movement_ulid: input.movementUlid,
    session_ulid: input.sessionUlid,
    type: input.type,
    amount: input.amount,
    reason: input.reason,
    user_id: input.userId,
  };
}
