import { createRouter, createWebHistory } from "vue-router";

import { seedDevUsers } from "@/db/seed-dev";
import { useCashierStore } from "@/stores/cashier";
import { useTerminalStore } from "@/stores/terminal";

/**
 * Mapa de navegación (ui-caja.md §1): Vinculación (una vez) → Login PIN →
 * Venta. La pantalla de Apertura de sesión se intercala en la tarea 4.6.
 */
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: { name: "venta" } },
    { path: "/vincular", name: "vincular", component: () => import("@/views/VinculacionView.vue") },
    { path: "/login", name: "login", component: () => import("@/views/LoginView.vue") },
    { path: "/venta", name: "venta", component: () => import("@/views/VentaView.vue") },
  ],
});

router.beforeEach(async (to) => {
  const terminal = useTerminalStore();
  if (!terminal.loaded) {
    await terminal.load();
    await seedDevUsers(); // no-op fuera de desarrollo
  }

  if (!terminal.linked) {
    return to.name === "vincular" ? true : { name: "vincular" };
  }
  if (to.name === "vincular") {
    return { name: "login" }; // ya vinculada: la pantalla 1 no se repite
  }

  const cashier = useCashierStore();
  if (to.name !== "login" && cashier.current === null) {
    return { name: "login" };
  }
  return true;
});

export default router;
