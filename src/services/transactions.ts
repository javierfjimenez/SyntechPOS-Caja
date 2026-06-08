import type { Envelope } from "@/services/event-signing";

/**
 * Transacciones del turno (herramienta de UX): se releen del outbox — la
 * misma fuente que ya viajó al servidor. Ventas y notas de crédito de la
 * sesión actual, reciente-primero, para ver/reimprimir.
 */

export interface TransactionSummary {
  sale_ulid: string;
  ticket_number: number;
  kind: "sale" | "credit_note";
  total: string;
  occurred_at: string;
}

export function recentTransactions(
  envelopes: Envelope[],
  sessionUlid: string,
): TransactionSummary[] {
  const result: TransactionSummary[] = [];
  for (const envelope of envelopes) {
    if (envelope.type !== "sale.completed") continue;
    const p = envelope.payload as Record<string, unknown>;
    if (p.cash_session_ulid !== sessionUlid) continue;
    result.push({
      sale_ulid: p.sale_ulid as string,
      ticket_number: p.ticket_number as number,
      kind: p.type === "credit_note" ? "credit_note" : "sale",
      total: (p.totals as { total: string }).total,
      occurred_at: envelope.occurred_at,
    });
  }
  // saleEnvelopes() viene en orden ULID (cronológico) → invertir = reciente primero
  return result.reverse();
}
