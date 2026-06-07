import { createRouter, createWebHistory } from "vue-router";

import { useCashierStore } from "@/stores/cashier";
import { useEcfStore } from "@/stores/ecf";
import { useOutboxStore } from "@/stores/outbox";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";
import { useTerminalStore } from "@/stores/terminal";

/**
 * Mapa de navegación (ui-caja.md §1): Vinculación (una vez) → Login PIN →
 * ¿sesión abierta? → Apertura | Venta ⇄ Cobro.
 */
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: { name: "venta" } },
    { path: "/vincular", name: "vincular", component: () => import("@/views/VinculacionView.vue") },
    { path: "/login", name: "login", component: () => import("@/views/LoginView.vue") },
    { path: "/apertura", name: "apertura", component: () => import("@/views/AperturaView.vue") },
    { path: "/venta", name: "venta", component: () => import("@/views/VentaView.vue") },
    { path: "/cobro", name: "cobro", component: () => import("@/views/CobroView.vue") },
    { path: "/cierre", name: "cierre", component: () => import("@/views/CierreView.vue") },
    { path: "/devolucion", name: "devolucion", component: () => import("@/views/DevolucionView.vue") },
    { path: "/estado", name: "estado", component: () => import("@/views/EstadoView.vue") },
  ],
});

router.beforeEach(async (to) => {
  const terminal = useTerminalStore();
  const sync = useSyncStore();
  if (!terminal.loaded) {
    await terminal.load();
    await sync.load();
  }

  if (!terminal.linked) {
    return to.name === "vincular" ? true : { name: "vincular" };
  }

  // Vinculada pero el primer pull nunca cerró (descarga interrumpida): retomar
  if (!sync.hasSynced) {
    return to.name === "vincular" ? true : { name: "vincular" };
  }
  if (to.name === "vincular") {
    return { name: "login" }; // ya vinculada: la pantalla 1 no se repite
  }

  sync.start(); // pull al abrir + cada 5 min (idempotente)
  useOutboxStore().start(); // worker del outbox: drena al abrir + cada 15 seg
  useEcfStore().start(); // e-CF resueltos: poll 30 seg SOLO con ventas sin QR

  const cashier = useCashierStore();
  if (to.name !== "login" && cashier.current === null) {
    return { name: "login" };
  }

  // Cajero dentro: ¿hay sesión de caja abierta? (ui-caja §1)
  if (cashier.current !== null) {
    const session = useSessionStore();
    await session.load();
    if (!session.isOpen && to.name !== "apertura" && to.name !== "login") {
      return { name: "apertura" };
    }
    if (session.isOpen && to.name === "apertura") {
      return { name: "venta" };
    }
  }
  return true;
});

export default router;
