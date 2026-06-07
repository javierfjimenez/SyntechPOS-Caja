import { defineStore } from "pinia";

import { pendingCount } from "@/db/outbox";

/**
 * Contador vivo de eventos sin confirmar (⏶ de la barra de estado):
 * la cajera VE que todo está guardado aunque no haya internet (ui-caja §1).
 */
export const useOutboxStore = defineStore("outbox", {
  state: () => ({ pending: 0 }),

  actions: {
    async refresh() {
      this.pending = await pendingCount();
    },
  },
});
