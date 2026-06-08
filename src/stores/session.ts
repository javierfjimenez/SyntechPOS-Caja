import { defineStore } from "pinia";

import { getDb, getMeta, setMeta } from "@/db";
import { enqueue } from "@/db/outbox";
import { toIsoWithOffset } from "@/lib/datetime";
import { ulid } from "@/lib/ulid";
import { buildEnvelope, type Envelope } from "@/services/event-signing";
import { buildSessionOpenedPayload } from "@/services/sale-event";
import {
  buildCashMovementPayload,
  buildSessionClosedPayload,
  differences,
  expectedAmounts,
  sessionActivity,
  type CountMethod,
  type SessionActivity,
} from "@/services/session-report";

/**
 * Sesión de caja (4.6): apertura → venta → retiros/gastos → cierre con
 * arqueo CIEGO + reporte Z. Todo lo que pasa en la sesión son eventos
 * firmados en el outbox — la actividad local se relee de ahí.
 */

export interface LastClosedInfo {
  closed_at: string;
  closed_by_name: string | null;
  difference: string | null;
}

interface SessionState {
  loaded: boolean;
  ulid: string | null;
  openedBy: number | null;
  openedAt: string | null;
  openingAmount: string | null;
}

async function signedEnvelope(
  type: "cash_session.opened" | "cash_session.closed" | "cash_movement.created",
  payload: Record<string, unknown>,
): Promise<Envelope> {
  const secret = await getMeta("hmac_secret");
  if (secret === null) throw new Error("Terminal sin hmac_secret: re-vincular.");
  return buildEnvelope(secret, {
    ulid: ulid(),
    type,
    occurred_at: toIsoWithOffset(new Date()),
    payload,
  });
}

export const useSessionStore = defineStore("session", {
  state: (): SessionState => ({
    loaded: false,
    ulid: null,
    openedBy: null,
    openedAt: null,
    openingAmount: null,
  }),

  getters: {
    isOpen: (s) => s.ulid !== null,
  },

  actions: {
    async load() {
      if (this.loaded) return;
      const db = await getDb();
      const rows = await db.select<
        { ulid: string; opened_by: number; opened_at: string; opening_amount: string }[]
      >("SELECT ulid, opened_by, opened_at, opening_amount FROM local_sessions WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1");
      if (rows[0] !== undefined) {
        this.ulid = rows[0].ulid;
        this.openedBy = rows[0].opened_by;
        this.openedAt = rows[0].opened_at;
        this.openingAmount = rows[0].opening_amount;
      }
      this.loaded = true;
    },

    /** Apertura (pantalla 3): fondo declarado + Enter y a vender (< 5 seg) */
    async open(openingAmount: string, userId: number) {
      const sessionUlid = ulid();
      const occurredAt = toIsoWithOffset(new Date());

      const db = await getDb();
      await db.execute(
        "INSERT INTO local_sessions (ulid, opened_by, opening_amount, opened_at, status) VALUES ($1, $2, $3, $4, 'open')",
        [sessionUlid, userId, openingAmount, occurredAt],
      );

      await enqueue(
        await signedEnvelope(
          "cash_session.opened",
          buildSessionOpenedPayload({ sessionUlid, openedBy: userId, openingAmount }),
        ),
      );

      this.ulid = sessionUlid;
      this.openedBy = userId;
      this.openedAt = occurredAt;
      this.openingAmount = openingAmount;
    },

    /** Eventos de ESTA sesión releídos del outbox (ventas + movimientos) */
    async activity(): Promise<SessionActivity> {
      if (this.ulid === null) throw new Error("No hay sesión abierta.");
      const db = await getDb();
      const rows = await db.select<{ payload: string }[]>(
        "SELECT payload FROM outbox WHERE type IN ('sale.completed', 'cash_movement.created', 'sale.voided') ORDER BY ulid",
      );
      const envelopes = rows.map((r) => JSON.parse(r.payload) as Envelope);
      return sessionActivity(envelopes, this.ulid);
    },

    /** Lo esperado por método (expected_local del Z) */
    async expected(): Promise<Record<CountMethod, string>> {
      return expectedAmounts(this.openingAmount ?? "0.00", await this.activity());
    },

    /** Retiro / gasto / depósito de efectivo (menú F10) */
    async addMovement(type: "withdrawal" | "deposit" | "expense", amount: string, reason: string, userId: number) {
      if (this.ulid === null) throw new Error("No hay sesión abierta.");
      await enqueue(
        await signedEnvelope(
          "cash_movement.created",
          buildCashMovementPayload({
            movementUlid: ulid(),
            sessionUlid: this.ulid,
            type,
            amount,
            reason,
            userId,
          }),
        ),
      );
    },

    /**
     * Cierre con arqueo ciego: lo DECLARADO viaja en counted_amounts; el
     * esperado autoritativo lo calcula el servidor. El z_number es local.
     * @returns el número Z asignado
     */
    async close(input: {
      counted: Record<CountMethod, string>;
      closedBy: number;
      note: string | null;
    }): Promise<{ zNumber: number; expected: Record<CountMethod, string> }> {
      if (this.ulid === null) throw new Error("No hay sesión abierta.");

      const expected = await this.expected();
      const diff = differences(input.counted, expected);

      const zNumber = Number((await getMeta("next_z_number")) ?? "1");
      await setMeta("next_z_number", String(zNumber + 1));

      await enqueue(
        await signedEnvelope(
          "cash_session.closed",
          buildSessionClosedPayload({
            sessionUlid: this.ulid,
            closedBy: input.closedBy,
            zNumber,
            counted: input.counted,
            expectedLocal: expected,
            note: input.note,
          }),
        ),
      );

      const db = await getDb();
      await db.execute(
        `UPDATE local_sessions SET status = 'closed', closed_at = $1, closed_by = $2,
         z_number = $3, difference = $4, closing_data = $5 WHERE ulid = $6`,
        [
          toIsoWithOffset(new Date()),
          input.closedBy,
          zNumber,
          diff.total,
          JSON.stringify({ counted: input.counted, expected, note: input.note }),
          this.ulid,
        ],
      );

      this.ulid = null;
      this.openedBy = null;
      this.openedAt = null;
      this.openingAmount = null;

      return { zNumber, expected };
    },

    /** Para la pantalla de Apertura: "Última sesión: cerrada … Diferencia: …" */
    async lastClosed(): Promise<LastClosedInfo | null> {
      const db = await getDb();
      const rows = await db.select<{ closed_at: string; closed_by: number | null; difference: string | null }[]>(
        "SELECT closed_at, closed_by, difference FROM local_sessions WHERE status = 'closed' ORDER BY closed_at DESC LIMIT 1",
      );
      if (rows[0] === undefined) return null;
      const names = await db.select<{ name: string }[]>("SELECT name FROM users WHERE id = $1", [rows[0].closed_by]);
      return {
        closed_at: rows[0].closed_at,
        closed_by_name: names[0]?.name ?? null,
        difference: rows[0].difference,
      };
    },
  },
});
