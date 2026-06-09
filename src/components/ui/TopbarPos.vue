<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import { formatTime } from "@/lib/format";
import { useCashierStore } from "@/stores/cashier";
import { useOutboxStore } from "@/stores/outbox";
import { useTerminalStore } from "@/stores/terminal";

/**
 * Topbar de marca (diseño Caja PRO): logo, caja·sucursal, estado de conexión
 * (● En línea · DGII / Contingencia), reloj y avatar del cajero. Fondo = color
 * de marca del negocio (--color-primary, tematizable D26).
 */
const terminal = useTerminalStore();
const cashier = useCashierStore();
const outbox = useOutboxStore();

const ahora = ref(new Date());
let timer: ReturnType<typeof setInterval> | undefined;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => (ahora.value = new Date()), 1000);
  void terminal.heartbeat();
  void outbox.refresh();
  heartbeatTimer = setInterval(() => {
    void terminal.heartbeat();
    void outbox.refresh();
  }, 30_000);
});
onUnmounted(() => {
  clearInterval(timer);
  clearInterval(heartbeatTimer);
});

const ubicacion = computed(() =>
  [terminal.terminalName, terminal.branchName].filter(Boolean).join(" · "),
);

const estado = computed(() => {
  if (terminal.revoked) return { off: true, label: "Atención · desvinculada" };
  if (!terminal.online) return { off: true, label: `Contingencia · ${outbox.pending} pend.` };
  return { off: false, label: terminal.ecfEnabled ? "En línea · DGII" : "En línea" };
});

const iniciales = computed(() => {
  const name = cashier.current?.name ?? "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "—";
});
</script>

<template>
  <header
    class="flex h-[54px] flex-none items-center gap-3.5 bg-primary px-4 text-white"
  >
    <div class="flex items-center gap-2 text-base font-extrabold tracking-tight">
      <span class="grid h-7 w-7 place-items-center rounded-lg bg-white/15">
        <svg viewBox="0 0 24 24" fill="#fff" class="h-4 w-4" aria-hidden="true">
          <path d="M11.644 1.59a.75.75 0 0 1 .712 0l9.75 5.25a.75.75 0 0 1 0 1.32l-9.75 5.25a.75.75 0 0 1-.712 0l-9.75-5.25a.75.75 0 0 1 0-1.32l9.75-5.25Z" />
          <path d="m3.265 10.602 7.668 4.129a2.25 2.25 0 0 0 2.134 0l7.668-4.13 1.37.739a.75.75 0 0 1 0 1.32l-9.75 5.25a.75.75 0 0 1-.71 0l-9.75-5.25a.75.75 0 0 1 0-1.32l1.37-.738Z" />
        </svg>
      </span>
      SyntechPOS
    </div>

    <span class="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
      <svg viewBox="0 0 24 24" fill="#fff" class="h-3.5 w-3.5" aria-hidden="true">
        <path fill-rule="evenodd" d="M2.25 5.25a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3V15a3 3 0 0 1-3 3h-3v.257c0 .597.237 1.17.659 1.591l.621.622a.75.75 0 0 1-.53 1.28h-9a.75.75 0 0 1-.53-1.28l.621-.622a2.25 2.25 0 0 0 .659-1.59V18h-3a3 3 0 0 1-3-3V5.25Z" clip-rule="evenodd" />
      </svg>
      {{ ubicacion }}
    </span>

    <span class="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
      <span class="h-2 w-2 rounded-full" :class="estado.off ? 'bg-amber-300' : 'bg-green-400'"></span>
      {{ estado.label }}
    </span>

    <div class="ml-auto flex items-center gap-3">
      <span class="monto text-[13px] opacity-90">{{ formatTime(ahora) }}</span>
      <span
        class="grid h-[31px] w-[31px] place-items-center rounded-full border-2 border-white/30 bg-zinc-900 text-xs font-bold"
      >
        {{ iniciales }}
      </span>
    </div>
  </header>
</template>
