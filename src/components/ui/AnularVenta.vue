<script setup lang="ts">
import { ref } from "vue";

import BotonAccion from "@/components/ui/BotonAccion.vue";
import ModalBase from "@/components/ui/ModalBase.vue";
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
  <ModalBase v-if="!askingPin" @cerrar="emit('cerrar')">
    <div class="flex w-96 flex-col gap-4">
      <h2 class="text-xl font-bold text-text">Anular venta</h2>
      <p class="text-text-dim">
        Venta <span class="font-semibold text-text">#{{ sale.ticket_number }}</span> ·
        <span class="monto font-semibold text-text">{{ formatMoney(sale.total) }}</span>
      </p>

      <label class="flex flex-col gap-1 text-sm font-medium text-text-dim">
        Motivo
        <select
          v-model="motivo"
          class="h-12 rounded-lg border border-border bg-surface px-3 text-base text-text outline-none focus:border-primary"
        >
          <option v-for="m in MOTIVOS" :key="m">{{ m }}</option>
        </select>
      </label>

      <input
        v-if="motivo === 'Otro'"
        v-model="detalle"
        type="text"
        maxlength="255"
        placeholder="Describe el motivo"
        class="h-12 rounded-lg border border-border bg-surface px-3 text-base text-text outline-none focus:border-primary"
        @keydown.enter.prevent="continuar"
      />

      <p v-if="error" class="text-sm font-medium text-danger">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <BotonAccion variante="secundario" @click="emit('cerrar')">Cancelar</BotonAccion>
        <BotonAccion variante="peligro" @click="continuar">Continuar → PIN</BotonAccion>
      </div>
    </div>
  </ModalBase>

  <PinAutorizacion
    v-else
    accion="Anular venta"
    :detalle="`#${sale.ticket_number} — ${formatMoney(sale.total)} (${razonFinal()})`"
    @autorizado="autorizada"
    @cancelar="askingPin = false"
  />
</template>
