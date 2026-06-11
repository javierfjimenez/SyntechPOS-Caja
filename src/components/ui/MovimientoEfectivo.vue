<script setup lang="ts">
import { computed, ref } from "vue";

import ModalPro from "@/components/ui/ModalPro.vue";
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
  <ModalPro title="Movimiento de efectivo" size="sm" @cerrar="emit('cerrar')">
    <div class="flex flex-col gap-2">
      <label v-for="t in TIPOS" :key="t.value" class="flex items-center gap-2 text-[13px] font-semibold">
        <input v-model="tipo" type="radio" :value="t.value" class="h-4 w-4 accent-primary" />
        {{ t.label }}
      </label>
    </div>

    <label class="mt-3.5 mb-1.5 block text-[12.5px] font-semibold">Monto</label>
    <input
      :value="formatMoney(amount)"
      type="text"
      inputmode="numeric"
      class="monto h-11 w-full rounded-lg border border-border px-3 text-lg font-bold focus:border-primary focus:outline-none"
      @keydown="onAmountKeydown"
    />

    <label class="mt-3.5 mb-1.5 block text-[12.5px] font-semibold">Motivo</label>
    <input
      v-model="reason"
      type="text"
      maxlength="255"
      placeholder="Ej.: depósito al banco"
      class="h-11 w-full rounded-lg border border-border px-3 text-sm focus:border-primary focus:outline-none"
      @keydown.enter.prevent="registrar"
    />

    <p v-if="error" class="mt-2 text-sm font-medium text-danger">{{ error }}</p>

    <template #footer>
      <button type="button" tabindex="-1" class="h-[46px] flex-1 rounded-lg border border-border font-bold text-text-dim" @mousedown.prevent @click="emit('cerrar')">Cancelar</button>
      <button type="button" tabindex="-1" class="h-[46px] flex-1 rounded-lg bg-primary font-bold text-white" @mousedown.prevent @click="registrar">Registrar</button>
    </template>
  </ModalPro>
</template>
