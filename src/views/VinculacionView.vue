<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";

import { ApiError } from "@/api/client";
import BotonAccion from "@/components/ui/BotonAccion.vue";
import {
  initialLockout,
  isLocked,
  registerFailure,
  remainingSeconds,
  type LockoutState,
} from "@/lib/lockout";
import { useTerminalStore } from "@/stores/terminal";

/**
 * Pantalla 1 — Vinculación (ui-caja.md §2). Una sola vez por terminal; el
 * ÚNICO flujo que exige internet. 5 códigos errados → espera de 1 minuto.
 * La descarga de catálogo con progreso llega con el delta-sync (4.2).
 */
const router = useRouter();
const terminal = useTerminalStore();

const CODE_LENGTH = 6;
const codigo = ref("");
const enviando = ref(false);
const error = ref<string | null>(null);
const lock = ref<LockoutState>(initialLockout);
const ahora = ref(Date.now());

let timer: ReturnType<typeof setInterval> | undefined;

const espera = computed(() => remainingSeconds(lock.value, ahora.value));
const completo = computed(() => codigo.value.length === CODE_LENGTH);

async function vincular() {
  if (!completo.value || enviando.value || isLocked(lock.value, Date.now())) return;
  enviando.value = true;
  error.value = null;
  try {
    await terminal.link(codigo.value);
    await router.replace({ name: "login" });
  } catch (e) {
    codigo.value = "";
    if (e instanceof ApiError && e.status === null) {
      error.value = "Sin conexión. Necesitas internet solo para este paso.";
    } else {
      error.value = e instanceof ApiError ? e.message : "Error inesperado. Intenta de nuevo.";
      lock.value = registerFailure(lock.value, Date.now());
    }
  } finally {
    enviando.value = false;
  }
}

// Teclado físico: dígitos + Backspace + Enter — sin campo visible que apuntar
function onKeydown(e: KeyboardEvent) {
  if (/^[0-9]$/.test(e.key) && codigo.value.length < CODE_LENGTH) {
    codigo.value += e.key;
    error.value = null;
  } else if (e.key === "Backspace") {
    codigo.value = codigo.value.slice(0, -1);
  } else if (e.key === "Enter") {
    void vincular();
  } else {
    return;
  }
  e.preventDefault();
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  timer = setInterval(() => (ahora.value = Date.now()), 1000);
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  clearInterval(timer);
});
</script>

<template>
  <main class="flex h-screen flex-col items-center justify-center gap-6 bg-bg px-8">
    <h1 class="text-4xl font-bold text-primary">SyntechPOS</h1>
    <p class="text-xl text-text">Vincula esta caja a tu negocio</p>

    <p class="text-center text-text-dim">
      Pide el código en el panel del negocio:<br />
      <span class="font-medium text-text">Configuración → Cajas → Vincular caja</span>
    </p>

    <div class="flex gap-3 py-4" aria-label="Código de vinculación">
      <span
        v-for="i in CODE_LENGTH"
        :key="i"
        class="monto flex h-16 w-12 items-center justify-center rounded-lg border-2 bg-surface text-3xl font-bold"
        :class="i === codigo.length + 1 ? 'border-primary' : 'border-border'"
      >
        {{ codigo[i - 1] ?? "" }}
      </span>
    </div>

    <p v-if="espera > 0" class="font-medium text-warning">
      Demasiados intentos. Espera {{ espera }} segundos.
    </p>
    <p v-else-if="error" class="font-medium text-danger">{{ error }}</p>

    <BotonAccion
      grande
      :disabled="!completo || enviando || espera > 0"
      @click="vincular"
    >
      {{ enviando ? "Vinculando…" : "Vincular caja" }}
    </BotonAccion>
  </main>
</template>
