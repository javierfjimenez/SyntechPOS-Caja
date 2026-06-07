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

/** Número de ticket local por terminal (uq terminal+ticket_number server-side) */
export async function nextTicketNumber(): Promise<number> {
  const current = Number((await getMeta("next_ticket_number")) ?? "1");
  await setMeta("next_ticket_number", String(current + 1));
  return current;
}
