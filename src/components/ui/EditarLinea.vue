<script setup lang="ts">
import { computed, ref } from "vue";

import BotonAccion from "@/components/ui/BotonAccion.vue";
import ModalBase from "@/components/ui/ModalBase.vue";
import PinAutorizacion from "@/components/ui/PinAutorizacion.vue";
import { formatMoney } from "@/lib/format";
import type { SaleLine } from "@/services/sale";
import type { UserRow } from "@/services/auth";

/**
 * F6 — editar cantidad/descuento de la línea (modal mini, ui-caja §5).
 * TODO descuento exige PIN de supervisor: sin réplica de settings aún, el
 * umbral local es 0 (decisión D-caja-4; el evento registra quién autorizó).
 */
const props = defineProps<{ line: SaleLine }>();

const emit = defineEmits<{
  guardar: [changes: { quantity: string; discount_amount: string }, supervisor: UserRow | null];
  cerrar: [];
}>();

const quantity = ref(props.line.quantity.endsWith(".000") ? props.line.quantity.slice(0, -4) : props.line.quantity);
const discount = ref(props.line.discount_amount === "0.00" ? "" : props.line.discount_amount);
const error = ref<string | null>(null);
const askingPin = ref(false);

const needsPin = computed(() => normalizedDiscount() !== props.line.discount_amount && normalizedDiscount() !== "0.00");

function normalizedQty(): string | null {
  const t = quantity.value.trim();
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(t) || Number(t) === 0) return null;
  const [i, d = ""] = t.split(".");
  return `${i}.${d.padEnd(3, "0")}`;
}

function normalizedDiscount(): string {
  const t = discount.value.trim();
  if (t === "") return "0.00";
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(t)) return "!";
  const [i, d = ""] = t.split(".");
  return `${i}.${d.padEnd(2, "0")}`;
}

function guardar() {
  const qty = normalizedQty();
  const disc = normalizedDiscount();
  if (qty === null) {
    error.value = "Cantidad inválida (hasta 3 decimales).";
    return;
  }
  if (disc === "!") {
    error.value = "Descuento inválido (monto en RD$).";
    return;
  }
  if (needsPin.value) {
    askingPin.value = true; // descuento nuevo → autorización
    return;
  }
  emit("guardar", { quantity: qty, discount_amount: disc }, null);
}

function autorizado(supervisor: UserRow) {
  askingPin.value = false;
  emit("guardar", { quantity: normalizedQty()!, discount_amount: normalizedDiscount() }, supervisor);
}
</script>

<template>
  <ModalBase v-if="!askingPin" @cerrar="emit('cerrar')">
    <div class="flex w-80 flex-col gap-4">
      <h2 class="text-lg font-bold text-text">{{ line.description }}</h2>

      <label class="flex flex-col gap-1 text-sm font-medium text-text-dim">
        Cantidad
        <input
          v-model="quantity"
          type="text"
          inputmode="decimal"
          class="monto h-12 rounded-lg border border-border bg-surface px-3 text-lg text-text outline-none focus:border-primary"
          @keydown.enter.prevent="guardar"
        />
      </label>

      <label class="flex flex-col gap-1 text-sm font-medium text-text-dim">
        Descuento (RD$, pide PIN de supervisor)
        <input
          v-model="discount"
          type="text"
          inputmode="decimal"
          placeholder="0.00"
          class="monto h-12 rounded-lg border border-border bg-surface px-3 text-lg text-text outline-none focus:border-primary"
          @keydown.enter.prevent="guardar"
        />
      </label>

      <p v-if="error" class="text-sm font-medium text-danger">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <BotonAccion variante="secundario" @click="emit('cerrar')">Cancelar</BotonAccion>
        <BotonAccion @click="guardar">Guardar</BotonAccion>
      </div>
    </div>
  </ModalBase>

  <PinAutorizacion
    v-else
    accion="Aplicar descuento"
    :detalle="`${line.description} — descuento ${formatMoney(normalizedDiscount())}`"
    @autorizado="autorizado"
    @cancelar="askingPin = false"
  />
</template>
