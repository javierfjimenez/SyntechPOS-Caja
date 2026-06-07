<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";

import BarraEstado from "@/components/ui/BarraEstado.vue";
import BotonAccion from "@/components/ui/BotonAccion.vue";
import PieAtajos from "@/components/ui/PieAtajos.vue";
import PinAutorizacion from "@/components/ui/PinAutorizacion.vue";
import ToastCaja from "@/components/ui/ToastCaja.vue";
import { formatMoney } from "@/lib/format";
import { printSessionReport } from "@/services/session-print";
import {
  differences,
  expectedAmounts,
  type CountMethod,
  type SessionActivity,
} from "@/services/session-report";
import type { UserRow } from "@/services/auth";
import { useCashierStore } from "@/stores/cashier";
import { useOutboxStore } from "@/stores/outbox";
import { useSessionStore } from "@/stores/session";
import { useUiStore } from "@/stores/ui";

/**
 * Pantalla 7 — Cierre de sesión con arqueo CIEGO (ui-caja §8, M8):
 * 1) contar SIN ver lo esperado → 2) declarar (no se puede volver) →
 * 3) resultado. Diferencia ≠ 0 → nota + PIN de supervisor. Imprime Z.
 */
const router = useRouter();
const cashier = useCashierStore();
const session = useSessionStore();
const outbox = useOutboxStore();
const ui = useUiStore();

const paso = ref<1 | 2 | 3>(1);
const metodos: { key: CountMethod; label: string }[] = [
  { key: "cash", label: "Efectivo" },
  { key: "card", label: "Tarjeta" },
  { key: "transfer", label: "Transferencia" },
];

// Paso 2: dígitos-como-centavos por método
const typed = ref<Record<CountMethod, string>>({ cash: "", card: "", transfer: "" });
const activo = ref<CountMethod>("cash");

// Paso 3
const expected = ref<Record<CountMethod, string> | null>(null);
const actividad = ref<SessionActivity | null>(null);
const note = ref("");
const askingPin = ref(false);
const closing = ref(false);

const counted = computed<Record<CountMethod, string>>(() => ({
  cash: centsToAmount(typed.value.cash),
  card: centsToAmount(typed.value.card),
  transfer: centsToAmount(typed.value.transfer),
}));

const diff = computed(() =>
  expected.value === null ? null : differences(counted.value, expected.value),
);

const requiereSupervisor = computed(() => diff.value !== null && diff.value.total !== "0.00");

function centsToAmount(digits: string): string {
  const padded = digits.padStart(3, "0");
  return `${BigInt(padded.slice(0, -2))}.${padded.slice(-2)}`;
}

async function declarar() {
  // el esperado se calcula AQUÍ — la cajera ya no puede cambiar lo declarado
  actividad.value = await session.activity();
  expected.value = expectedAmounts(session.openingAmount ?? "0.00", actividad.value);
  paso.value = 3;
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
    // capturar ANTES del close (el store se limpia al cerrar)
    const openedAt = new Date(session.openedAt ?? Date.now());
    const openingAmount = session.openingAmount ?? "0.00";

    const result = await session.close({
      counted: counted.value,
      closedBy: cashier.current.id,
      note: note.value.trim() || null,
    });
    void outbox.drainNow();

    // El Z impreso es el respaldo físico del arqueo
    void printSessionReport({
      kind: "Z",
      zNumber: result.zNumber,
      cashierName: cashier.current.name,
      openedAt,
      openingAmount,
      activity: actividad.value!,
      expected: expected.value!,
      counted: counted.value,
      note: note.value.trim() || null,
    }).catch((e: unknown) =>
      ui.toast("error", `Reporte Z pendiente de imprimir: ${e instanceof Error ? e.message : e}`),
    );

    cashier.logout();
    await router.replace({ name: "login" });
  } catch (e) {
    ui.toast("error", e instanceof Error ? e.message : "No se pudo cerrar la sesión.");
    closing.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (ui.modalOpen || paso.value !== 2) {
    if (e.key === "Escape" && paso.value === 1) void router.replace({ name: "venta" });
    return;
  }
  if (/^[0-9]$/.test(e.key)) {
    if (typed.value[activo.value].length < 10) typed.value[activo.value] += e.key;
  } else if (e.key === "Backspace") {
    typed.value[activo.value] = typed.value[activo.value].slice(0, -1);
  } else if (e.key === "Tab" || e.key === "Enter") {
    const index = metodos.findIndex((m) => m.key === activo.value);
    if (index < metodos.length - 1) {
      activo.value = metodos[index + 1]!.key;
    } else if (e.key === "Enter") {
      void declarar();
    }
  } else {
    return;
  }
  e.preventDefault();
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div class="flex h-screen flex-col bg-bg">
    <BarraEstado />

    <main class="flex flex-1 flex-col items-center justify-center gap-6 px-8">
      <!-- Paso 1: contar a ciegas -->
      <template v-if="paso === 1">
        <h1 class="text-2xl font-bold text-text">Cierre de sesión — Arqueo</h1>
        <p class="max-w-md text-center text-lg text-text-dim">
          Cuenta el efectivo de la gaveta <span class="font-semibold text-text">SIN ver lo esperado</span>.
          Ten a mano los vouchers de tarjeta y transferencias.
        </p>
        <BotonAccion grande @click="paso = 2">Empezar arqueo</BotonAccion>
        <button type="button" class="text-sm text-text-dim hover:underline" @click="router.replace({ name: 'venta' })">
          Volver a la venta (ESC)
        </button>
      </template>

      <!-- Paso 2: declarar (ciego, no se puede volver) -->
      <template v-else-if="paso === 2">
        <h1 class="text-2xl font-bold text-text">Declara lo contado</h1>
        <div class="flex flex-col gap-3">
          <button
            v-for="m in metodos"
            :key="m.key"
            type="button"
            class="flex w-96 items-center justify-between rounded-lg border-2 px-4 py-3"
            :class="activo === m.key ? 'border-primary bg-primary/5' : 'border-border bg-surface'"
            @click="activo = m.key"
          >
            <span class="text-lg text-text">{{ m.label }}</span>
            <span class="monto text-2xl font-bold text-text">{{ formatMoney(counted[m.key]) }}</span>
          </button>
        </div>
        <p class="text-sm text-text-dim">Dígitos para el monto · Tab/Enter para el siguiente</p>
        <BotonAccion grande @click="declarar">Declarar montos (no se puede volver)</BotonAccion>
      </template>

      <!-- Paso 3: resultado -->
      <template v-else-if="diff && expected">
        <h1 class="text-2xl font-bold text-text">Resultado del arqueo</h1>
        <table class="w-[28rem] text-lg">
          <thead>
            <tr class="text-sm text-text-dim">
              <th class="pb-1 text-left font-medium">Método</th>
              <th class="pb-1 text-right font-medium">Esperado</th>
              <th class="pb-1 text-right font-medium">Declarado</th>
              <th class="pb-1 text-right font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in metodos" :key="m.key" class="border-t border-border">
              <td class="py-1.5">{{ m.label }}</td>
              <td class="monto py-1.5 text-right">{{ formatMoney(expected[m.key]) }}</td>
              <td class="monto py-1.5 text-right">{{ formatMoney(counted[m.key]) }}</td>
              <td
                class="monto py-1.5 text-right font-semibold"
                :class="diff[m.key] === '0.00' ? 'text-success' : 'text-warning'"
              >
                {{ formatMoney(diff[m.key]) }}
              </td>
            </tr>
            <tr class="border-t-2 border-text">
              <td class="py-2 font-bold" colspan="3">DIFERENCIA TOTAL</td>
              <td class="monto py-2 text-right text-xl font-bold" :class="diff.total === '0.00' ? 'text-success' : 'text-warning'">
                {{ formatMoney(diff.total) }}
              </td>
            </tr>
          </tbody>
        </table>

        <label v-if="requiereSupervisor" class="flex w-[28rem] flex-col gap-1 text-sm font-medium text-text-dim">
          Nota del supervisor (obligatoria por la diferencia)
          <textarea
            v-model="note"
            rows="2"
            maxlength="500"
            class="rounded-lg border border-border bg-surface p-3 text-base text-text outline-none focus:border-primary"
          ></textarea>
        </label>

        <BotonAccion grande :disabled="closing" @click="cerrar(null)">
          {{ closing ? "Cerrando…" : "Cerrar e imprimir Z" }}
        </BotonAccion>
      </template>
    </main>

    <PieAtajos :atajos="paso === 1 ? [{ tecla: 'ESC', label: 'Volver a la venta' }] : []" />
    <ToastCaja />

    <PinAutorizacion
      v-if="askingPin"
      accion="Cerrar con diferencia de arqueo"
      :detalle="`Diferencia total: ${formatMoney(diff?.total ?? '0.00')}`"
      @autorizado="(s) => { askingPin = false; void cerrar(s); }"
      @cancelar="askingPin = false"
    />
  </div>
</template>
