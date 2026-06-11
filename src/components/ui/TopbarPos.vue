<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import { formatTime } from "@/lib/format";
import { useCashierStore } from "@/stores/cashier";
import { useOutboxStore } from "@/stores/outbox";
import { useTerminalStore } from "@/stores/terminal";

/**
 * Topbar de marca (diseño Caja PRO): logo, caja·sucursal, estado de conexión
 * (● En línea · DGII / Contingencia), reloj y avatar del cajero con menú
 * (transacciones, estado, impresora, cambiar cajero). Fondo = color de marca.
 */
const emit = defineEmits<{
  recientes: [];
  estado: [];
  impresora: [];
  cambiarCajero: [];
}>();

const terminal = useTerminalStore();
const cashier = useCashierStore();
const outbox = useOutboxStore();

const menuOpen = ref(false);
function elegir(accion: "recientes" | "estado" | "impresora" | "cambiarCajero") {
  menuOpen.value = false;
  if (accion === "recientes") emit("recientes");
  else if (accion === "estado") emit("estado");
  else if (accion === "impresora") emit("impresora");
  else emit("cambiarCajero");
}

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
      <div class="relative">
        <button
          type="button"
          tabindex="-1"
          aria-label="Menú del cajero"
          class="grid h-[31px] w-[31px] place-items-center rounded-full border-2 border-white/30 bg-zinc-900 text-xs font-bold"
          @mousedown.prevent
          @click="menuOpen = !menuOpen"
        >
          {{ iniciales }}
        </button>

        <!-- click-outside para cerrar -->
        <div v-if="menuOpen" class="fixed inset-0 z-40" @click="menuOpen = false"></div>

        <div
          v-if="menuOpen"
          class="absolute top-[38px] right-0 z-50 w-56 overflow-hidden rounded-lg border border-border bg-surface py-1 text-text shadow-lg"
        >
          <div class="border-b border-border px-3.5 py-2 text-xs text-text-dim">
            {{ cashier.current?.name ?? "—" }}
          </div>
          <button type="button" tabindex="-1" class="av-item" @mousedown.prevent @click="elegir('recientes')">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 3a7 7 0 100 14 7 7 0 000-14zm0 2a5 5 0 110 10A5 5 0 0110 5zm-.75 1.5v4l3 1.8.75-1.23-2.25-1.32V6.5h-1.5z" /></svg>
            Transacciones del turno
          </button>
          <button type="button" tabindex="-1" class="av-item" @mousedown.prevent @click="elegir('estado')">
            <svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M2.25 13.5a8.25 8.25 0 0 1 8.25-8.25.75.75 0 0 1 .75.75v6.75H18a.75.75 0 0 1 .75.75 8.25 8.25 0 0 1-16.5 0Z" clip-rule="evenodd" /><path fill-rule="evenodd" d="M12.75 3a.75.75 0 0 1 .75-.75 8.25 8.25 0 0 1 8.25 8.25.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75V3Z" clip-rule="evenodd" /></svg>
            Estado de la caja
          </button>
          <button type="button" tabindex="-1" class="av-item" @mousedown.prevent @click="elegir('impresora')">
            <svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M7.875 1.5C6.839 1.5 6 2.34 6 3.375v2.99c-.426.053-.851.11-1.274.174-1.454.218-2.476 1.483-2.476 2.917v6.294a3 3 0 0 0 3 3h.27l-.155 1.705A1.875 1.875 0 0 0 7.232 22.5h9.536a1.875 1.875 0 0 0 1.867-2.045l-.155-1.705h.27a3 3 0 0 0 3-3V9.456c0-1.434-1.022-2.7-2.476-2.917A48.716 48.716 0 0 0 18 6.366V3.375c0-1.036-.84-1.875-1.875-1.875h-8.25ZM16.5 6.205v-2.83A.375.375 0 0 0 16.125 3h-8.25a.375.375 0 0 0-.375.375v2.83a49.353 49.353 0 0 1 9 0Z" clip-rule="evenodd" /></svg>
            Impresora
          </button>
          <button type="button" tabindex="-1" class="av-item border-t border-border" @mousedown.prevent @click="elegir('cambiarCajero')">
            <svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M16.5 3.75a1.5 1.5 0 0 1 1.5 1.5v13.5a1.5 1.5 0 0 1-1.5 1.5h-6a1.5 1.5 0 0 1-1.5-1.5V15a.75.75 0 0 0-1.5 0v3.75a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V5.25a3 3 0 0 0-3-3h-6a3 3 0 0 0-3 3V9A.75.75 0 1 0 9 9V5.25a1.5 1.5 0 0 1 1.5-1.5h6ZM5.78 8.47a.75.75 0 0 0-1.06 0l-3 3a.75.75 0 0 0 0 1.06l3 3a.75.75 0 0 0 1.06-1.06l-1.72-1.72H15a.75.75 0 0 0 0-1.5H4.06l1.72-1.72a.75.75 0 0 0 0-1.06Z" clip-rule="evenodd" /></svg>
            Bloquear / cambiar cajero
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.av-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
}
.av-item:hover {
  background: var(--color-zinc-100);
}
.av-item svg {
  width: 17px;
  height: 17px;
  color: var(--color-text-dim);
  flex: none;
}
</style>
