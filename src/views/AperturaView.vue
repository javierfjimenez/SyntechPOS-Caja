<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";

import BarraEstado from "@/components/ui/BarraEstado.vue";
import BotonAccion from "@/components/ui/BotonAccion.vue";
import TecladoNumerico from "@/components/ui/TecladoNumerico.vue";
import { formatMoney } from "@/lib/format";
import { useCashierStore } from "@/stores/cashier";
import { useSessionStore } from "@/stores/session";

/**
 * Pantalla 3 — Apertura de sesión (ui-caja §4): declarar el fondo de caja
 * y a vender. Genera cash_session.opened al outbox. Sin confirmación extra.
 */
const router = useRouter();
const cashier = useCashierStore();
const session = useSessionStore();

const digits = ref(""); // centavos tecleados: "200000" = RD$ 2,000.00
const opening = ref(false);
const error = ref<string | null>(null);

const amount = computed(() => {
  const padded = digits.value.padStart(3, "0");
  return `${BigInt(padded.slice(0, -2))}.${padded.slice(-2)}`;
});

function digito(d: string) {
  if (digits.value.length >= 9) return;
  digits.value = digits.value === "0" ? d : digits.value + d;
}

function borrar() {
  digits.value = digits.value.slice(0, -1);
}

async function abrir() {
  if (opening.value || cashier.current === null) return;
  opening.value = true;
  try {
    await session.open(amount.value, cashier.current.id);
    await router.replace({ name: "venta" });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "No se pudo abrir la sesión.";
  } finally {
    opening.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (/^[0-9]$/.test(e.key)) {
    digito(e.key);
  } else if (e.key === "Backspace") {
    borrar();
  } else if (e.key === "Enter") {
    void abrir();
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

    <main class="flex flex-1 flex-col items-center justify-center gap-6">
      <h1 class="text-2xl font-bold text-text">Apertura de caja</h1>
      <p class="text-text-dim">Fondo de caja inicial (efectivo en gaveta)</p>

      <div
        class="monto flex h-16 w-80 items-center justify-center rounded-lg border-2 border-primary bg-surface text-3xl font-bold text-text"
      >
        {{ formatMoney(amount) }}
      </div>

      <TecladoNumerico @digito="digito" @borrar="borrar" @confirmar="abrir" />

      <p v-if="error" class="font-medium text-danger">{{ error }}</p>

      <BotonAccion grande :disabled="opening" @click="abrir">
        Abrir sesión y empezar a vender
      </BotonAccion>
    </main>
  </div>
</template>
