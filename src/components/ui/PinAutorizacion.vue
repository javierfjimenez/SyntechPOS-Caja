<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

import ModalBase from "@/components/ui/ModalBase.vue";
import TecladoNumerico from "@/components/ui/TecladoNumerico.vue";
import { useCashierStore } from "@/stores/cashier";
import type { UserRow } from "@/services/auth";

/**
 * Autorización de supervisor (ui-caja.md §9.1) — componente ÚNICO en toda la
 * app (DISENO §6): kiosk-exit, descuentos, crédito excedido, devoluciones.
 * Registra QUIÉN autorizó (el evento llevará supervisor_user_id).
 */
const props = defineProps<{
  accion: string; // p. ej. "Salir de la caja"
  detalle?: string; // p. ej. "Caja 1 · Sucursal Centro"
}>();

const emit = defineEmits<{
  autorizado: [supervisor: UserRow];
  cancelar: [];
}>();

const cashier = useCashierStore();
const pin = ref("");
const error = ref<string | null>(null);
const MAX_PIN = 6;

function digito(d: string) {
  if (pin.value.length >= MAX_PIN) return;
  error.value = null;
  pin.value += d;
}

function borrar() {
  pin.value = pin.value.slice(0, -1);
}

async function confirmar() {
  if (pin.value.length < 4) return;
  const supervisor = await cashier.verifySupervisorPin(pin.value);
  pin.value = "";
  if (supervisor === null) {
    error.value = "PIN incorrecto o sin permiso para autorizar.";
    return;
  }
  emit("autorizado", supervisor);
}

// Teclado físico: dígitos + Backspace + Enter (ESC lo maneja ModalBase)
function onKeydown(e: KeyboardEvent) {
  if (/^[0-9]$/.test(e.key)) {
    digito(e.key);
  } else if (e.key === "Backspace") {
    borrar();
  } else if (e.key === "Enter") {
    void confirmar();
  } else {
    return;
  }
  e.preventDefault();
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));

void props; // usados solo en template
</script>

<template>
  <ModalBase @cerrar="emit('cancelar')">
    <div class="flex flex-col items-center gap-4">
      <h2 class="text-xl font-bold text-text">Autorización de supervisor</h2>
      <p class="text-text-dim">
        {{ accion }}<template v-if="detalle"> — {{ detalle }}</template>
      </p>

      <div class="flex gap-2 py-2" aria-label="PIN">
        <span
          v-for="i in MAX_PIN"
          :key="i"
          class="text-2xl"
          :class="i <= pin.length ? 'text-text' : 'text-border'"
          >●</span
        >
      </div>

      <p v-if="error" class="text-sm font-medium text-danger">{{ error }}</p>

      <TecladoNumerico @digito="digito" @borrar="borrar" @confirmar="confirmar" />

      <button
        type="button"
        class="text-sm text-text-dim underline-offset-2 hover:underline"
        @click="emit('cancelar')"
      >
        Cancelar (ESC)
      </button>
    </div>
  </ModalBase>
</template>
