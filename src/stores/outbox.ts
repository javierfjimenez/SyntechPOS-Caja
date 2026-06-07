import { defineStore } from "pinia";

import { postEvents } from "@/api/events";
import { setMeta } from "@/db";
import { dueBatch, markConfirmed, markRetry, pendingCount } from "@/db/outbox";
import { drainOutbox } from "@/services/outbox-worker";
import { useTerminalStore } from "@/stores/terminal";

/**
 * El worker del outbox en vivo (tarea 4.7): drena tras cada venta y cada
 * 15 seg (el backoff por evento gobierna los reintentos). La cajera solo ve
 * el ⏶ bajar — la caja jamás espera por esto.
 */

const DRAIN_INTERVAL_MS = 15_000;

interface OutboxState {
  pending: number;
  draining: boolean;
  started: boolean;
  lastQuarantined: number;
}

export const useOutboxStore = defineStore("outbox", {
  state: (): OutboxState => ({
    pending: 0,
    draining: false,
    started: false,
    lastQuarantined: 0,
  }),

  actions: {
    async refresh() {
      this.pending = await pendingCount();
    },

    /** Un drenado completo; seguro de llamar en cualquier momento */
    async drainNow() {
      if (this.draining) return;
      const terminal = useTerminalStore();
      if (!terminal.token || terminal.revoked) return;

      this.draining = true;
      try {
        const summary = await drainOutbox({
          dueBatch,
          post: (envelopes) =>
            postEvents(envelopes, {
              baseUrl: terminal.apiUrl,
              appVersion: terminal.appVersion,
              token: terminal.token ?? undefined,
            }),
          markConfirmed,
          markRetry,
          onRevoked: () => terminal.markRevoked(),
          onServerInfo: (info) => {
            void setMeta("min_client_version", info.min_client_version); // 4.12
          },
        });
        if (summary.sent > 0) {
          terminal.online = true;
        }
        this.lastQuarantined = summary.quarantined.length;
      } finally {
        this.draining = false;
        await this.refresh();
      }
    },

    /** Arranca el ciclo (idempotente) */
    start() {
      if (this.started) return;
      this.started = true;
      void this.drainNow();
      setInterval(() => void this.drainNow(), DRAIN_INTERVAL_MS);
    },
  },
});
