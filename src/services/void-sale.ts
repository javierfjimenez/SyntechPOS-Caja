import { getDb, getMeta } from "@/db";
import { enqueue, voidedSaleUlids } from "@/db/outbox";
import { toIsoWithOffset } from "@/lib/datetime";
import { ulid } from "@/lib/ulid";
import { buildEnvelope } from "@/services/event-signing";
import { buildSaleVoidedPayload } from "@/services/sale-event";

/**
 * Anulación de venta (sale.voided, eventos-sync §4.2): dentro de la sesión
 * abierta. SALVEDAD normativa (tarea 0.7, pregunta abierta): NO se ofrece
 * anular una venta con e-CF ya resuelto — ahí procede una Devolución (NC 34).
 */

export interface VoidEligibility {
  ok: boolean;
  message?: string;
}

export async function canVoidSale(saleUlid: string): Promise<VoidEligibility> {
  if ((await voidedSaleUlids()).has(saleUlid)) {
    return { ok: false, message: "Esta venta ya fue anulada." };
  }
  // Con comprobante fiscal resuelto, la anulación es asunto normativo abierto:
  // la caja redirige a Devolución (NC tipo 34).
  const db = await getDb();
  const ecf = await db.select<{ sale_ulid: string }[]>(
    "SELECT sale_ulid FROM ecf_results WHERE sale_ulid = $1 LIMIT 1",
    [saleUlid],
  );
  if (ecf[0] !== undefined) {
    return {
      ok: false,
      message: "Esta venta ya tiene comprobante fiscal. Usa Devolución (NC tipo 34).",
    };
  }
  return { ok: true };
}

export async function voidSale(saleUlid: string, reason: string, supervisorUserId: number): Promise<void> {
  const secret = await getMeta("hmac_secret");
  if (secret === null) throw new Error("Terminal sin hmac_secret.");

  const envelope = await buildEnvelope(secret, {
    ulid: ulid(),
    type: "sale.voided",
    occurred_at: toIsoWithOffset(new Date()),
    payload: buildSaleVoidedPayload({ saleUlid, reason, supervisorUserId }),
  });
  await enqueue(envelope);
}
