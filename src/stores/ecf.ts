import { defineStore } from "pinia";

import { getEcfResults } from "@/api/sync";
import { getDb, getMeta, setMeta } from "@/db";
import { saleEnvelopes } from "@/db/outbox";
import { useTerminalStore } from "@/stores/terminal";

/**
 * Contingencia (4.9, D9): la caja consulta qué ventas suyas ya tienen e-CF
 * resuelto → reimpresión timbrada. Polling cada 30 s SOLO cuando hay ventas
 * sin QR (§7.2) y el negocio tiene facturación electrónica (D21).
 */

const POLL_INTERVAL_MS = 30_000;
const CURSOR_KEY = "ecf_cursor";

export interface PendingQrSale {
  sale_ulid: string;
  ticket_number: number;
  resolved: boolean;
}

interface EcfState {
  pending: PendingQrSale[];
  started: boolean;
  polling: boolean;
}

export const useEcfStore = defineStore("ecf", {
  state: (): EcfState => ({ pending: [], started: false, polling: false }),

  getters: {
    pendingCount: (s) => s.pending.filter((p) => !p.resolved).length,
  },

  actions: {
    /** Ventas (no NC) y si su e-CF ya está resuelto en la réplica local */
    async refresh() {
      const terminal = useTerminalStore();
      if (!terminal.ecfEnabled) {
        this.pending = [];
        return;
      }
      const db = await getDb();
      const resolved = new Set(
        (await db.select<{ sale_ulid: string }[]>("SELECT sale_ulid FROM ecf_results")).map((r) => r.sale_ulid),
      );
      const envelopes = await saleEnvelopes();
      this.pending = envelopes
        .filter((e) => (e.payload as { type: string }).type === "sale")
        .map((e) => {
          const p = e.payload as { sale_ulid: string; ticket_number: number };
          return { sale_ulid: p.sale_ulid, ticket_number: p.ticket_number, resolved: resolved.has(p.sale_ulid) };
        });
    },

    /** Baja los e-CF resueltos nuevos a la tabla ecf_results */
    async poll() {
      if (this.polling) return;
      const terminal = useTerminalStore();
      if (!terminal.token || !terminal.ecfEnabled) return;

      this.polling = true;
      try {
        let cursor = Number((await getMeta(CURSOR_KEY)) ?? "0");
        const db = await getDb();
        for (;;) {
          const page = await getEcfResults(cursor, {
            baseUrl: terminal.apiUrl,
            appVersion: terminal.appVersion,
            token: terminal.token,
          });
          for (const r of page.results) {
            await db.execute(
              `INSERT INTO ecf_results (sale_ulid, encf, security_code, dgii_url, qr_image, status, cursor)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (sale_ulid) DO UPDATE SET encf = $2, security_code = $3, dgii_url = $4, qr_image = $5, status = $6, cursor = $7`,
              [r.sale_ulid, r.encf, r.security_code, r.dgii_url, r.qr_image, r.status, r.cursor],
            );
            cursor = Math.max(cursor, r.cursor);
          }
          await setMeta(CURSOR_KEY, String(cursor));
          if (page.next_cursor === null) break;
          cursor = page.next_cursor;
        }
        await this.refresh();
      } catch {
        // sin red: el próximo tick lo intenta — la caja nunca se bloquea
      } finally {
        this.polling = false;
      }
    },

    start() {
      if (this.started) return;
      this.started = true;
      void this.refresh().then(() => {
        if (this.pendingCount > 0) void this.poll();
      });
      setInterval(() => {
        if (this.pendingCount > 0) void this.poll(); // §7.2: solo con ventas sin QR
      }, POLL_INTERVAL_MS);
    },
  },
});
