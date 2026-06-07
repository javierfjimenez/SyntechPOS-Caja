<script setup lang="ts">
import { computed, ref } from "vue";

import BotonAccion from "@/components/ui/BotonAccion.vue";
import ModalBase from "@/components/ui/ModalBase.vue";
import { formatMoney } from "@/lib/format";

/**
 * Movimiento de efectivo (menú F10 — eventos-sync §4.5): retiro a bóveda/
 * banco, gasto pagado de la gaveta o depósito de cambio. El evento registra
 * quién lo hizo; el Z lo descuenta del esperado.
 */
const emit = defineEmits<{
  registrar: [tipo: "withdrawal" | "deposit" | "expense", amount: string, reason: string];
  cerrar: [];
}>();

const tipo = ref<"withdrawal" | "deposit" | "expense">("withdrawal");
const digits = ref("");
const reason = ref("");
const error = ref<string | null>(null);

const TIPOS = [
  { value: "withdrawal" as const, label: "Retiro (a bóveda/banco)" },
  { value: "deposit" as const, label: "Depósito (entra cambio)" },
  { value: "expense" as const, label: "Gasto (pagado de la gaveta)" },
];

const amount = computed(() => {
  const padded = digits.value.padStart(3, "0");
  return `${BigInt(padded.slice(0, -2))}.${padded.slice(-2)}`;
});

function onAmountKeydown(e: KeyboardEvent) {
  if (/^[0-9]$/.test(e.key)) {
    if (digits.value.length < 10) digits.value += e.key;
  } else if (e.key === "Backspace") {
    digits.value = digits.value.slice(0, -1);
  } else if (e.key === "Enter" || e.key === "Tab") {
    return; // navegación normal
  } else if (e.key.length === 1) {
    // solo dígitos en el monto
  } else {
    return;
  }
  e.preventDefault();
}

function registrar() {
  if (amount.value === "0.00") {
    error.value = "Escribe el monto.";
    return;
  }
  if (reason.value.trim().length < 3) {
    error.value = "El motivo es obligatorio (mínimo 3 letras).";
    return;
  }
  emit("registrar", tipo.value, amount.value, reason.value.trim());
}
</script>

<template>
  <ModalBase @cerrar="emit('cerrar')">
    <div class="flex w-96 flex-col gap-4">
      <h2 class="text-xl font-bold text-text">Movimiento de efectivo</h2>

      <div class="flex flex-col gap-2">
        <label v-for="t in TIPOS" :key="t.value" class="flex items-center gap-2 text-text">
          <input v-model="tipo" type="radio" :value="t.value" class="accent-primary" />
          {{ t.label }}
        </label>
      </div>

      <label class="flex flex-col gap-1 text-sm font-medium text-text-dim">
        Monto
        <input
          :value="formatMoney(amount)"
          type="text"
          inputmode="numeric"
          class="monto h-12 rounded-lg border border-border bg-surface px-3 text-xl font-bold text-text outline-none focus:border-primary"
          @keydown="onAmountKeydown"
        />
      </label>

      <label class="flex flex-col gap-1 text-sm font-medium text-text-dim">
        Motivo
        <input
          v-model="reason"
          type="text"
          maxlength="255"
          placeholder="Ej.: depósito al banco"
          class="h-12 rounded-lg border border-border bg-surface px-3 text-base text-text outline-none focus:border-primary"
          @keydown.enter.prevent="registrar"
        />
      </label>

      <p v-if="error" class="text-sm font-medium text-danger">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <BotonAccion variante="secundario" @click="emit('cerrar')">Cancelar</BotonAccion>
        <BotonAccion @click="registrar">Registrar</BotonAccion>
      </div>
    </div>
  </ModalBase>
</template>
