import { getDb, getMeta, setMeta } from "@/db";
import type { Envelope } from "@/services/event-signing";

/**
 * El outbox (esquema.md §11): todo evento firmado entra aquí ANTES de
 * cualquier otra cosa. El worker que lo drena llega en 4.7; reenviar es
 * siempre seguro (idempotencia por ULID server-side).
 */

export async function enqueue(envelope: Envelope): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO outbox (ulid, type, payload, status, attempts, created_at) VALUES ($1, $2, $3, 'pending', 0, $4)",
    [envelope.ulid, envelope.type, JSON.stringify(envelope), new Date().toISOString()],
  );
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM outbox WHERE status <> 'confirmed'",
  );
  return rows[0]?.n ?? 0;
}

export interface OutboxRow {
  ulid: string;
  payload: string; // JSON del sobre firmado
  attempts: number;
}

/** El próximo lote a enviar: en orden ULID (FIFO), respetando next_retry_at */
export async function dueBatch(limit: number, now = new Date()): Promise<OutboxRow[]> {
  const db = await getDb();
  return db.select<OutboxRow[]>(
    `SELECT ulid, payload, attempts FROM outbox
     WHERE status <> 'confirmed' AND (next_retry_at IS NULL OR next_retry_at <= $1)
     ORDER BY ulid LIMIT $2`,
    [now.toISOString(), limit],
  );
}

/** processed/duplicate/quarantined/deferred: TODOS confirman (endpoints.md §3) */
export async function markConfirmed(ulids: string[]): Promise<void> {
  if (ulids.length === 0) return;
  const db = await getDb();
  const placeholders = ulids.map((_, i) => `$${i + 1}`).join(", ");
  await db.execute(
    `UPDATE outbox SET status = 'confirmed', next_retry_at = NULL WHERE ulid IN (${placeholders})`,
    ulids,
  );
}

/** Fallo de red/5xx: el lote entero reintenta con backoff */
export async function markRetry(ulids: string[], nextRetryAt: Date): Promise<void> {
  if (ulids.length === 0) return;
  const db = await getDb();
  const placeholders = ulids.map((_, i) => `$${i + 2}`).join(", ");
  await db.execute(
    `UPDATE outbox SET attempts = attempts + 1, next_retry_at = $1 WHERE ulid IN (${placeholders})`,
    [nextRetryAt.toISOString(), ...ulids],
  );
}

/** Sobres de venta/NC del terminal, en orden (búsquedas locales) */
export async function saleEnvelopes(): Promise<Envelope[]> {
  const db = await getDb();
  const rows = await db.select<{ payload: string }[]>(
    "SELECT payload FROM outbox WHERE type = 'sale.completed' ORDER BY ulid",
  );
  return rows.map((r) => JSON.parse(r.payload) as Envelope);
}

/** Ventas + anulaciones del terminal (para Transacciones recientes, marca anuladas) */
export async function transactionEnvelopes(): Promise<Envelope[]> {
  const db = await getDb();
  const rows = await db.select<{ payload: string }[]>(
    "SELECT payload FROM outbox WHERE type IN ('sale.completed', 'sale.voided') ORDER BY ulid",
  );
  return rows.map((r) => JSON.parse(r.payload) as Envelope);
}

/** sale_ulid de las ventas anuladas (hay un sale.voided que las referencia) */
export async function voidedSaleUlids(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.select<{ payload: string }[]>(
    "SELECT payload FROM outbox WHERE type = 'sale.voided'",
  );
  return new Set(rows.map((r) => (JSON.parse(r.payload) as Envelope).payload.sale_ulid as string));
}

/** Número de ticket local por terminal (uq terminal+ticket_number server-side) */
export async function nextTicketNumber(): Promise<number> {
  const current = Number((await getMeta("next_ticket_number")) ?? "1");
  await setMeta("next_ticket_number", String(current + 1));
  return current;
}
