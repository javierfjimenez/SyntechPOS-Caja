<script setup lang="ts">
import { ref } from "vue";

import ModalPro from "@/components/ui/ModalPro.vue";
import PinAutorizacion from "@/components/ui/PinAutorizacion.vue";
import { formatMoney } from "@/lib/format";
import type { UserRow } from "@/services/auth";
import type { TransactionSummary } from "@/services/transactions";

/**
 * Anulación de venta (sale.voided, eventos-sync §4.2): motivo obligatorio +
 * PIN de supervisor. Solo dentro de la sesión abierta; la elegibilidad
 * (sin e-CF resuelto) la verifica el llamador antes de abrir este modal.
 */
const props = defineProps<{ sale: TransactionSummary }>();

const emit = defineEmits<{
  anular: [reason: string, supervisor: UserRow];
  cerrar: [];
}>();

const MOTIVOS = ["Cobro equivocado", "Error de producto", "Cliente desistió", "Otro"];
const motivo = ref(MOTIVOS[0]!);
const detalle = ref("");
const error = ref<string | null>(null);
const askingPin = ref(false);

function razonFinal(): string {
  const base = motivo.value === "Otro" ? detalle.value.trim() : motivo.value;
  return base;
}

function continuar() {
  const r = razonFinal();
  if (r.length < 3) {
    error.value = "Escribe el motivo de la anulación.";
    return;
  }
  askingPin.value = true;
}

function autorizada(supervisor: UserRow) {
  askingPin.value = false;
  emit("anular", razonFinal(), supervisor);
}

void props;
</script>

<template>
  <ModalPro v-if="!askingPin" title="Anular venta" size="sm" @cerrar="emit('cerrar')">
    <p class="text-[13px] text-text-dim">
      Venta <span class="font-semibold text-text">#{{ sale.ticket_number }}</span> ·
      <span class="monto font-semibold text-text">{{ formatMoney(sale.total) }}</span>
    </p>

    <label class="mt-3.5 mb-1.5 block text-[12.5px] font-semibold">Motivo</label>
    <select v-model="motivo" class="h-11 w-full rounded-lg border border-border px-3 text-sm focus:border-primary focus:outline-none">
      <option v-for="m in MOTIVOS" :key="m">{{ m }}</option>
    </select>

    <input
      v-if="motivo === 'Otro'"
      v-model="detalle"
      type="text"
      maxlength="255"
      placeholder="Describe el motivo"
      class="mt-2.5 h-11 w-full rounded-lg border border-border px-3 text-sm focus:border-primary focus:outline-none"
      @keydown.enter.prevent="continuar"
    />

    <p v-if="error" class="mt-2 text-sm font-medium text-danger">{{ error }}</p>

    <template #footer>
      <button type="button" tabindex="-1" class="h-[46px] flex-1 rounded-lg border border-border font-bold text-text-dim" @mousedown.prevent @click="emit('cerrar')">Cancelar</button>
      <button type="button" tabindex="-1" class="h-[46px] flex-1 rounded-lg bg-danger font-bold text-white" @mousedown.prevent @click="continuar">Continuar → PIN</button>
    </template>
  </ModalPro>

  <PinAutorizacion
    v-else
    accion="Anular venta"
    :detalle="`#${sale.ticket_number} — ${formatMoney(sale.total)} (${razonFinal()})`"
    @autorizado="autorizada"
    @cancelar="askingPin = false"
  />
</template>
