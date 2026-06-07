<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";

import BarraEstado from "@/components/ui/BarraEstado.vue";
import BotonAccion from "@/components/ui/BotonAccion.vue";
import ModalBase from "@/components/ui/ModalBase.vue";
import TecladoNumerico from "@/components/ui/TecladoNumerico.vue";
import { getDb } from "@/db";
import { useCashierStore } from "@/stores/cashier";
import { useSessionStore } from "@/stores/session";

/**
 * Pantalla 2 — Login de cajero (ui-caja.md §3). El PIN identifica al cajero
 * (único por negocio): sin selección de usuario previa. 100% offline.
 */
const router = useRouter();
const cashier = useCashierStore();
const session = useSessionStore();

const MAX_PIN = 6;
const MIN_PIN = 4;
const pin = ref("");
const error = ref<string | null>(null);
const verificando = ref(false);
const ahora = ref(Date.now());
/** ui-caja §3: la sesión la abrió OTRO cajero — avisar antes de entrar */
const sesionAjena = ref<string | null>(null);

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
  if (!ok) {
    if (espera.value === 0) error.value = "PIN incorrecto. Inténtalo de nuevo.";
    return;
  }

  // Sesión abierta por OTRO cajero: aviso (las ventas registran al cajero
  // real; la sesión NO cambia de dueño — ui-caja §3)
  await session.load();
  if (session.isOpen && session.openedBy !== cashier.current!.id) {
    const db = await getDb();
    const rows = await db.select<{ name: string }[]>("SELECT name FROM users WHERE id = $1", [session.openedBy]);
    sesionAjena.value = rows[0]?.name ?? "otro cajero";
    return;
  }
  await router.replace({ name: "venta" });
}

async function continuarEnSesionAjena() {
  sesionAjena.value = null;
  await router.replace({ name: "venta" });
}

function cancelarSesionAjena() {
  sesionAjena.value = null;
  cashier.logout();
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

    <ModalBase v-if="sesionAjena !== null" @cerrar="cancelarSesionAjena">
      <div class="flex w-96 flex-col gap-4">
        <h2 class="text-lg font-bold text-text">Sesión de otro cajero</h2>
        <p class="text-text-dim">
          La sesión de caja la abrió <span class="font-semibold text-text">{{ sesionAjena }}</span
          >. ¿Continuar como
          <span class="font-semibold text-text">{{ cashier.current?.name }}</span
          >? Tus ventas quedarán a tu nombre; la sesión no cambia de dueño.
        </p>
        <div class="flex justify-end gap-2">
          <BotonAccion variante="secundario" @click="cancelarSesionAjena">Volver</BotonAccion>
          <BotonAccion @click="continuarEnSesionAjena">Continuar</BotonAccion>
        </div>
      </div>
    </ModalBase>
  </div>
</template>
