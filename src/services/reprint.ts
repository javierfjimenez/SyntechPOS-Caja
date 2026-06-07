import { getDb } from "@/db";
import { saleEnvelopes } from "@/db/outbox";
import { ecfForSale, printSaleTicket, ticketBusinessData } from "@/services/printer";
import type { SaleLine } from "@/services/sale";
import type { TicketData } from "@/services/ticket";

/**
 * Reimpresión timbrada post-contingencia (4.9, D9): el ticket se reconstruye
 * desde el SOBRE del outbox (el hecho legal) + el QR que bajó ecf_results.
 */
export async function reprintStamped(saleUlid: string): Promise<void> {
  const envelope = (await saleEnvelopes()).find(
    (e) => (e.payload as { sale_ulid: string }).sale_ulid === saleUlid,
  );
  if (envelope === undefined) throw new Error("La venta no está en esta caja.");

  const p = envelope.payload as Record<string, unknown>;
  const ecf = await ecfForSale(saleUlid);

  const db = await getDb();
  const cashierName =
    (await db.select<{ name: string }[]>("SELECT name FROM users WHERE id = $1", [p.cashier_user_id]))[0]?.name ?? "—";

  const business = await ticketBusinessData();
  const data: TicketData = {
    business,
    branch_name: business.branch_name,
    terminal_name: business.terminal_name,
    ticket_number: p.ticket_number as number,
    occurred_at: new Date(envelope.occurred_at),
    cashier_name: cashierName,
    customer_name: (p.customer as { name?: string } | null)?.name ?? null,
    customer_document: (p.customer as { document_number?: string } | null)?.document_number ?? null,
    lines: (p.lines as (SaleLine & Record<string, unknown>)[]).map((l) => ({ ...l, is_weighable: false })),
    totals: p.totals as TicketData["totals"],
    payments: p.payments as TicketData["payments"],
    change: "0.00", // la reimpresión no repite el cambio original
    ecf_enabled: true,
    ecf,
    credit_note: p.type === "credit_note" ? { ref_ticket_number: 0 } : null,
  };

  await printSaleTicket(data, false); // reimprimir JAMÁS abre la gaveta
}
