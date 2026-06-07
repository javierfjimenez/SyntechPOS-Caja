import { defineStore } from "pinia";

import { getDb, getMeta } from "@/db";
import { enqueue } from "@/db/outbox";
import { toIsoWithOffset } from "@/lib/datetime";
import { ulid } from "@/lib/ulid";
import { buildEnvelope } from "@/services/event-signing";
import { buildSessionOpenedPayload } from "@/services/sale-event";

/**
 * Sesión de caja (parte mínima de 4.6, adelantada porque sale.completed
 * EXIGE cash_session_ulid). Apertura → evento cash_session.opened al outbox
 * (FIFO garantiza que llegue antes que las ventas). Cierre/arqueo: 4.6.
 */

interface SessionState {
  loaded: boolean;
  ulid: string | null;
  openedBy: number | null;
  openedAt: string | null;
  openingAmount: string | null;
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

      const secret = await getMeta("hmac_secret");
      if (secret === null) throw new Error("Terminal sin hmac_secret: re-vincular.");

      const envelope = await buildEnvelope(secret, {
        ulid: ulid(),
        type: "cash_session.opened",
        occurred_at: occurredAt,
        payload: buildSessionOpenedPayload({ sessionUlid, openedBy: userId, openingAmount }),
      });
      await enqueue(envelope);

      this.ulid = sessionUlid;
      this.openedBy = userId;
      this.openedAt = occurredAt;
      this.openingAmount = openingAmount;
    },
  },
});
