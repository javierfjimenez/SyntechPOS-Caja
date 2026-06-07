<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import { formatTime } from "@/lib/format";
import { useCashierStore } from "@/stores/cashier";
import { useTerminalStore } from "@/stores/terminal";

/**
 * Barra de estado persistente (ui-caja.md §1): ● conexión, caja·sucursal,
 * ⏶ pendientes del outbox, cajero y hora. Altura fija 40px.
 * `pendientes` queda en 0 hasta que el outbox llegue (4.7).
 */
const terminal = useTerminalStore();
const cashier = useCashierStore();

const pendientes = 0; // outbox: tarea 4.7

const ahora = ref(new Date());
let timer: ReturnType<typeof setInterval> | undefined;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => (ahora.value = new Date()), 1000);
  void terminal.heartbeat();
  heartbeatTimer = setInterval(() => void terminal.heartbeat(), 30_000);
});
onUnmounted(() => {
  clearInterval(timer);
  clearInterval(heartbeatTimer);
});

const conexion = computed(() =>
  terminal.online
    ? { color: "text-success", label: "En línea" }
    : { color: "text-warning", label: `Sin conexión — ${pendientes} pendientes de envío` },
);

const ubicacion = computed(() =>
  [terminal.terminalName, terminal.branchName].filter(Boolean).join(" · "),
);
</script>

<template>
  <header
    class="flex h-10 shrink-0 items-center gap-4 border-b border-border bg-surface px-4 text-sm text-text"
  >
    <span class="flex items-center gap-1.5 font-medium" :class="conexion.color">
      <span aria-hidden="true">●</span> {{ conexion.label }}
    </span>

    <span class="text-text-dim">{{ ubicacion }}</span>

    <span class="ml-auto flex items-center gap-4">
      <span v-if="cashier.current" class="text-text-dim">⏶ {{ pendientes }} pendientes</span>
      <span v-if="cashier.current" class="font-medium">{{ cashier.current.name }}</span>
      <span class="monto text-text-dim">{{ formatTime(ahora) }}</span>
    </span>
  </header>
</template>
