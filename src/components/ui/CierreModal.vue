<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import ModalPro from "@/components/ui/ModalPro.vue";
import PinAutorizacion from "@/components/ui/PinAutorizacion.vue";
import { formatMoney } from "@/lib/format";
import { printSessionReport } from "@/services/session-print";
import { differences, expectedAmounts, type CountMethod, type SessionActivity } from "@/services/session-report";
import type { UserRow } from "@/services/auth";
import { useCashierStore } from "@/stores/cashier";
import { useOutboxStore } from "@/stores/outbox";
import { useSessionStore } from "@/stores/session";
import { useTerminalStore } from "@/stores/terminal";
import { useUiStore } from "@/stores/ui";

/**
 * Cierre de caja (diseño Caja PRO). Configurable por negocio (settings.blind_count):
 * - CIEGO (default): la cajera declara SIN ver el esperado → luego el resultado.
 * - ABIERTO: muestra el esperado mientras cuenta (estilo mockup).
 * Diferencia ≠ 0 → nota + PIN de supervisor. Imprime reporte Z.
 */
const emit = defineEmits<{ cerrada: []; cerrar: [] }>();

const cashier = useCashierStore();
const session = useSessionStore();
const outbox = useOutboxStore();
const terminal = useTerminalStore();
const ui = useUiStore();

const metodos: { key: CountMethod; label: string }[] = [
  { key: "cash", label: "Efectivo" },
  { key: "card", label: "Tarjeta" },
  { key: "transfer", label: "Transferencia" },
];

const ciego = terminal.blindCount;
// en ciego: "contar" (sin ver esperado) → "resultado". en abierto: directo.
const revelado = ref(!ciego);
const typed = ref<Record<CountMethod, string>>({ cash: "", card: "", transfer: "" });
const activo = ref<CountMethod>("cash");
const note = ref("");
const askingPin = ref(false);
const closing = ref(false);

const actividad = ref<SessionActivity | null>(null);
const expected = ref<Record<CountMethod, string>>({ cash: "0.00", card: "0.00", transfer: "0.00" });

onMounted(async () => {
  actividad.value = await session.activity();
  expected.value = expectedAmounts(session.openingAmount ?? "0.00", actividad.value);
  window.addEventListener("keydown", onKeydown);
});
onUnmounted(() => window.removeEventListener("keydown", onKeydown));

/** Teclado: dígitos al método activo; Tab pasa al siguiente */
function onKeydown(e: KeyboardEvent) {
  if (askingPin.value) return;
  if (/^[0-9]$/.test(e.key)) {
    if (typed.value[activo.value].length < 10) typed.value[activo.value] += e.key;
  } else if (e.key === "Backspace") {
    typed.value[activo.value] = typed.value[activo.value].slice(0, -1);
  } else if (e.key === "Tab") {
    const i = metodos.findIndex((m) => m.key === activo.value);
    activo.value = metodos[(i + 1) % metodos.length]!.key;
  } else {
    return;
  }
  e.preventDefault();
}

const counted = computed<Record<CountMethod, string>>(() => ({
  cash: c(typed.value.cash),
  card: c(typed.value.card),
  transfer: c(typed.value.transfer),
}));
const diff = computed(() => differences(counted.value, expected.value));
const requiereSupervisor = computed(() => diff.value.total !== "0.00");

function c(digits: string): string {
  const p = digits.padStart(3, "0");
  return `${BigInt(p.slice(0, -2))}.${p.slice(-2)}`;
}

function declarar() {
  revelado.value = true; // ciego: revela esperado + diferencia
}

async function cerrar(supervisor: UserRow | null) {
  if (closing.value || cashier.current === null) return;
  if (requiereSupervisor.value && supervisor === null) {
    askingPin.value = true;
    return;
  }
  if (requiereSupervisor.value && note.value.trim().length < 3) {
    ui.toast("error", "La diferencia requiere una nota del supervisor.");
    askingPin.value = false;
    return;
  }
  closing.value = true;
  try {
    const openedAt = new Date(session.openedAt ?? Date.now());
    const openingAmount = session.openingAmount ?? "0.00";
    const result = await session.close({ counted: counted.value, closedBy: cashier.current.id, note: note.value.trim() || null });
    void outbox.drainNow();
    void printSessionReport({
      kind: "Z",
      zNumber: result.zNumber,
      cashierName: cashier.current.name,
      openedAt,
      openingAmount,
      activity: actividad.value!,
      expected: expected.value,
      counted: counted.value,
      note: note.value.trim() || null,
    }).catch((e: unknown) => ui.toast("error", `Reporte Z pendiente: ${e instanceof Error ? e.message : e}`));
    emit("cerrada");
  } catch (e) {
    ui.toast("error", e instanceof Error ? e.message : "No se pudo cerrar la sesión.");
    closing.value = false;
  }
}
</script>

<template>
  <ModalPro v-if="!askingPin" title="Cierre de caja · Arqueo" size="lg" @cerrar="emit('cerrar')">
    <!-- Resumen (siempre visible en abierto; en ciego solo tras declarar) -->
    <table v-if="actividad" class="w-full border-collapse text-[13.5px]">
      <tbody>
        <tr class="border-b border-border"><td class="py-2.5">Fondo de apertura</td><td class="monto py-2.5 text-right font-semibold">{{ formatMoney(session.openingAmount ?? "0.00") }}</td></tr>
        <tr class="border-b border-border"><td class="py-2.5">Ventas en efectivo <span class="text-text-dim">({{ actividad.salesCount }} ventas)</span></td><td class="monto py-2.5 text-right font-semibold">{{ formatMoney(actividad.sales.cash) }}</td></tr>
        <tr v-if="actividad.withdrawals !== '0.00'" class="border-b border-border"><td class="py-2.5">Retiros</td><td class="monto py-2.5 text-right font-semibold">−{{ formatMoney(actividad.withdrawals) }}</td></tr>
        <tr v-if="actividad.expenses !== '0.00'" class="border-b border-border"><td class="py-2.5">Gastos</td><td class="monto py-2.5 text-right font-semibold">−{{ formatMoney(actividad.expenses) }}</td></tr>
        <tr v-if="revelado" class="border-b border-border"><td class="py-2.5"><b>Efectivo esperado</b></td><td class="monto py-2.5 text-right font-bold">{{ formatMoney(expected.cash) }}</td></tr>
        <tr class="border-b border-border"><td class="py-2.5 text-text-dim">Ventas con tarjeta</td><td class="monto py-2.5 text-right text-text-dim">{{ formatMoney(actividad.sales.card) }}</td></tr>
        <tr class="border-b border-border"><td class="py-2.5 text-text-dim">Ventas por transferencia</td><td class="monto py-2.5 text-right text-text-dim">{{ formatMoney(actividad.sales.transfer) }}</td></tr>
        <tr><td class="py-2.5"><b>Total vendido</b></td><td class="monto py-2.5 text-right font-bold text-success">{{ formatMoney(actividad.salesTotal) }}</td></tr>
      </tbody>
    </table>

    <p v-if="ciego && !revelado" class="mt-3 rounded-lg bg-zinc-100 px-3 py-2 text-[12.5px] text-text-dim">
      Cuenta el efectivo de la gaveta SIN ver lo esperado, y declara los montos.
    </p>

    <!-- Conteo declarado -->
    <div class="mt-4 space-y-2">
      <div v-for="m in metodos" :key="m.key" class="flex items-center gap-3">
        <span class="w-28 text-[13px] font-semibold">{{ m.label }}</span>
        <button
          type="button"
          tabindex="-1"
          class="monto h-10 flex-1 rounded-lg border px-3 text-right text-[15px] font-bold"
          :class="activo === m.key ? 'border-primary bg-primary/5' : 'border-border'"
          @mousedown.prevent
          @click="activo = m.key"
        >
          {{ formatMoney(counted[m.key]) }}
        </button>
        <span v-if="revelado" class="monto w-24 text-right text-[13px]" :class="diff[m.key] === '0.00' ? 'text-success' : 'text-warning'">
          {{ diff[m.key] === "0.00" ? "✓" : formatMoney(diff[m.key]) }}
        </span>
      </div>
    </div>

    <!-- Diferencia total (revelado) -->
    <div v-if="revelado" class="mt-3 flex items-center justify-between rounded-lg px-3 py-3 font-bold" :class="diff.total === '0.00' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'">
      <span>{{ diff.total === "0.00" ? "Cuadre exacto" : "Diferencia" }}</span>
      <span class="monto text-lg">{{ diff.total === "0.00" ? "✓" : formatMoney(diff.total) }}</span>
    </div>

    <label v-if="revelado && requiereSupervisor" class="mt-3 block">
      <span class="mb-1.5 block text-[12.5px] font-semibold">Nota del supervisor (obligatoria por la diferencia)</span>
      <textarea v-model="note" rows="2" maxlength="500" class="w-full rounded-lg border border-border p-3 text-sm focus:border-primary focus:outline-none"></textarea>
    </label>

    <template #footer>
      <button type="button" tabindex="-1" class="h-[46px] flex-1 rounded-lg border border-border font-bold text-text-dim" @mousedown.prevent @click="emit('cerrar')">Cancelar</button>
      <button v-if="ciego && !revelado" type="button" tabindex="-1" class="h-[46px] flex-1 rounded-lg bg-primary font-bold text-white" @mousedown.prevent @click="declarar">Declarar montos</button>
      <button v-else type="button" tabindex="-1" class="flex h-[46px] flex-1 items-center justify-center gap-2 rounded-lg bg-danger font-bold text-white disabled:opacity-50" :disabled="closing" @mousedown.prevent @click="cerrar(null)">
        Cerrar e imprimir Z
      </button>
    </template>
  </ModalPro>

  <PinAutorizacion
    v-else
    accion="Cerrar con diferencia de arqueo"
    :detalle="`Diferencia: ${formatMoney(diff.total)}`"
    @autorizado="(s) => { askingPin = false; void cerrar(s); }"
    @cancelar="askingPin = false"
  />
</template>
