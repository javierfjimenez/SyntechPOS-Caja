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
  calculadora: [];
  preferencias: [];
  pantallaCompleta: [];
  cambiarCajero: [];
}>();

const terminal = useTerminalStore();
const cashier = useCashierStore();
const outbox = useOutboxStore();

const menuOpen = ref(false);
type Accion =
  | "recientes"
  | "estado"
  | "impresora"
  | "calculadora"
  | "preferencias"
  | "pantallaCompleta"
  | "cambiarCajero";
function elegir(accion: Accion) {
  menuOpen.value = false;
  if (accion === "recientes") emit("recientes");
  else if (accion === "estado") emit("estado");
  else if (accion === "impresora") emit("impresora");
  else if (accion === "calculadora") emit("calculadora");
  else if (accion === "preferencias") emit("preferencias");
  else if (accion === "pantallaCompleta") emit("pantallaCompleta");
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
          <button type="button" tabindex="-1" class="av-item" @mousedown.prevent @click="elegir('calculadora')">
            <svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M6 2.25A2.25 2.25 0 0 0 3.75 4.5v15A2.25 2.25 0 0 0 6 21.75h12A2.25 2.25 0 0 0 20.25 19.5v-15A2.25 2.25 0 0 0 18 2.25H6Zm1.5 3a.75.75 0 0 0-.75.75v.75c0 .414.336.75.75.75h9a.75.75 0 0 0 .75-.75V6a.75.75 0 0 0-.75-.75h-9Zm0 5.25a.75.75 0 0 0 0 1.5h.008a.75.75 0 0 0 0-1.5H7.5Zm3.75 0a.75.75 0 0 0 0 1.5h.008a.75.75 0 0 0 0-1.5h-.008Z" clip-rule="evenodd" /></svg>
            Calculadora
          </button>
          <button type="button" tabindex="-1" class="av-item" @mousedown.prevent @click="elegir('pantallaCompleta')">
            <svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M3.22 3.22a.75.75 0 0 1 1.06 0l3.97 3.97V4.5a.75.75 0 0 1 1.5 0V9a.75.75 0 0 1-.75.75H4.5a.75.75 0 0 1 0-1.5h2.69L3.22 4.28a.75.75 0 0 1 0-1.06Zm17.56 0a.75.75 0 0 1 0 1.06l-3.97 3.97h2.69a.75.75 0 0 1 0 1.5H15a.75.75 0 0 1-.75-.75V4.5a.75.75 0 0 1 1.5 0v2.69l3.97-3.97a.75.75 0 0 1 1.06 0ZM3.75 15a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-2.69l-3.97 3.97a.75.75 0 0 1-1.06-1.06l3.97-3.97H4.5a.75.75 0 0 1-.75-.75Zm10.5 0a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-2.69l3.97 3.97a.75.75 0 1 1-1.06 1.06l-3.97-3.97v2.69a.75.75 0 0 1-1.5 0V15Z" clip-rule="evenodd" /></svg>
            Pantalla completa
          </button>
          <button type="button" tabindex="-1" class="av-item" @mousedown.prevent @click="elegir('impresora')">
            <svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M7.875 1.5C6.839 1.5 6 2.34 6 3.375v2.99c-.426.053-.851.11-1.274.174-1.454.218-2.476 1.483-2.476 2.917v6.294a3 3 0 0 0 3 3h.27l-.155 1.705A1.875 1.875 0 0 0 7.232 22.5h9.536a1.875 1.875 0 0 0 1.867-2.045l-.155-1.705h.27a3 3 0 0 0 3-3V9.456c0-1.434-1.022-2.7-2.476-2.917A48.716 48.716 0 0 0 18 6.366V3.375c0-1.036-.84-1.875-1.875-1.875h-8.25ZM16.5 6.205v-2.83A.375.375 0 0 0 16.125 3h-8.25a.375.375 0 0 0-.375.375v2.83a49.353 49.353 0 0 1 9 0Z" clip-rule="evenodd" /></svg>
            Impresora
          </button>
          <button type="button" tabindex="-1" class="av-item" @mousedown.prevent @click="elegir('preferencias')">
            <svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 6.07a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.45-.082a7.49 7.49 0 0 0-.985-.57c-.182-.088-.277-.228-.297-.35l-.178-1.071a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" clip-rule="evenodd" /></svg>
            Preferencias
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
