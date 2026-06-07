import { defineStore } from "pinia";

/**
 * Estado transversal de UI: modales abiertos (gobierna la política de foco —
 * el InputEscaneo solo re-captura cuando NO hay modal) y los toasts
 * (DISENO §6: éxito verde 3 seg; error rojo persistente con acción).
 */

export interface Toast {
  id: number;
  kind: "exito" | "error";
  text: string;
  action?: { label: string; run: () => void };
}

let nextToastId = 1;

interface UiState {
  modalCount: number;
  toasts: Toast[];
}

export const useUiStore = defineStore("ui", {
  state: (): UiState => ({
    modalCount: 0,
    toasts: [],
  }),

  getters: {
    modalOpen: (s) => s.modalCount > 0,
  },

  actions: {
    modalOpened() {
      this.modalCount += 1;
    },
    modalClosed() {
      this.modalCount = Math.max(0, this.modalCount - 1);
    },

    toast(kind: Toast["kind"], text: string, opts?: { action?: Toast["action"]; timeoutMs?: number }) {
      const id = nextToastId++;
      this.toasts.push({ id, kind, text, action: opts?.action });
      const timeout = opts?.timeoutMs ?? (kind === "exito" ? 3000 : null);
      if (timeout !== null) {
        setTimeout(() => this.dismiss(id), timeout);
      }
      return id;
    },

    dismiss(id: number) {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    },
  },
});
