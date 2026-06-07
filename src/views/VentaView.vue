<script setup lang="ts">
import { useRouter } from "vue-router";

import BarraEstado from "@/components/ui/BarraEstado.vue";
import BotonAccion from "@/components/ui/BotonAccion.vue";
import PieAtajos from "@/components/ui/PieAtajos.vue";
import { useCashierStore } from "@/stores/cashier";

/**
 * Pantalla 4 — VENTA. Aquí solo el armazón: la pantalla real (input de
 * escaneo dueño del foco, líneas, panel total) se construye en la tarea 4.3.
 */
const router = useRouter();
const cashier = useCashierStore();

async function cambiarCajero() {
  cashier.logout();
  await router.replace({ name: "login" });
}
</script>

<template>
  <div class="flex h-screen flex-col bg-bg">
    <BarraEstado />

    <main class="flex flex-1 flex-col items-center justify-center gap-6">
      <p class="text-xl text-text-dim">
        La pantalla de venta se construye en la tarea 4.3
      </p>
      <BotonAccion variante="secundario" @click="cambiarCajero">
        Cambiar de cajero
      </BotonAccion>
    </main>

    <PieAtajos :atajos="[{ tecla: 'F12', label: 'Cobrar' }, { tecla: 'F10', label: 'Menú' }]" />
  </div>
</template>
