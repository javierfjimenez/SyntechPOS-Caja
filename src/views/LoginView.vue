<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";

import BarraEstado from "@/components/ui/BarraEstado.vue";
import TecladoNumerico from "@/components/ui/TecladoNumerico.vue";
import { useCashierStore } from "@/stores/cashier";

/**
 * Pantalla 2 — Login de cajero (ui-caja.md §3). El PIN identifica al cajero
 * (único por negocio): sin selección de usuario previa. 100% offline.
 */
const router = useRouter();
const cashier = useCashierStore();

const MAX_PIN = 6;
const MIN_PIN = 4;
const pin = ref("");
const error = ref<string | null>(null);
const verificando = ref(false);
const ahora = ref(Date.now());

let timer: ReturnType<typeof setInterval> | undefined;

const espera = computed(() => {
  void ahora.value; // reactividad del contador
  return cashier.cooldown(ahora.value);
});

function digito(d: string) {
  if (pin.value.length >= MAX_PIN || verificando.value) return;
  error.value = null;
  pin.value += d;
}

function borrar() {
  pin.value = pin.value.slice(0, -1);
}

async function confirmar() {
  if (pin.value.length < MIN_PIN || verificando.value || espera.value > 0) return;
  verificando.value = true;
  const ok = await cashier.loginWithPin(pin.value);
  verificando.value = false;
  pin.value = "";
  if (ok) {
    await router.replace({ name: "venta" });
  } else if (espera.value === 0) {
    error.value = "PIN incorrecto. Inténtalo de nuevo.";
  }
}

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

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  timer = setInterval(() => (ahora.value = Date.now()), 1000);
  void cashier.loadLock();
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  clearInterval(timer);
});
</script>

<template>
  <div class="flex h-screen flex-col bg-bg">
    <BarraEstado />

    <main class="flex flex-1 items-center justify-center gap-12">
      <div class="flex flex-col items-center gap-5">
        <h1 class="text-2xl font-bold text-text">Ingresa tu PIN</h1>

        <div class="flex gap-3" aria-label="PIN">
          <span
            v-for="i in MAX_PIN"
            :key="i"
            class="text-3xl"
            :class="i <= pin.length ? 'text-text' : 'text-border'"
            >●</span
          >
        </div>

        <p v-if="espera > 0" class="font-medium text-warning">
          Demasiados intentos. Espera {{ espera }} segundos.
        </p>
        <p v-else-if="error" class="font-medium text-danger">{{ error }}</p>
        <p v-else class="text-sm text-text-dim">&nbsp;</p>

        <TecladoNumerico @digito="digito" @borrar="borrar" @confirmar="confirmar" />
      </div>

      <p class="max-w-48 text-text-dim">
        El teclado físico también funciona: dígitos + Enter
      </p>
    </main>
  </div>
</template>
